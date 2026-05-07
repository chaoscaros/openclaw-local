import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCanonicalFixtureSkill } from "../../agents/skills.test-helpers.js";
import { hydrateResolvedSkills } from "../../auto-reply/reply/session-updates.js";
import type { SessionEntry, SessionSkillSnapshot } from "./types.js";

vi.mock("../config.js", async () => ({
  ...(await vi.importActual<typeof import("../config.js")>("../config.js")),
  getRuntimeConfig: vi.fn().mockReturnValue({}),
}));

import { clearSessionStoreCacheForTest, loadSessionStore, saveSessionStore, updateSessionStore } from "./store.js";

const tempDirs = new Set<string>();

function makeFixtureSkill(name: string, bodySize = 256): NonNullable<SessionSkillSnapshot["resolvedSkills"]>[number] {
  const source = `# ${name}\n\n${"x".repeat(bodySize)}`;
  return createCanonicalFixtureSkill({
    name,
    description: `${name} skill description`,
    filePath: `/skills/${name}/SKILL.md`,
    baseDir: `/skills/${name}`,
    source,
  });
}

function makeSnapshot(skillCount: number): SessionSkillSnapshot {
  const resolved = Array.from({ length: skillCount }, (_, i) => makeFixtureSkill(`skill-${i}`));
  return {
    prompt: "<available_skills>...</available_skills>",
    skills: resolved.map((s) => ({ name: s.name })),
    resolvedSkills: resolved,
    version: 1,
  };
}

function makeEntry(sessionId: string, snapshot?: SessionSkillSnapshot): SessionEntry {
  return {
    sessionId,
    updatedAt: Date.now(),
    skillsSnapshot: snapshot,
  };
}

async function makeStorePath(testName: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(process.cwd(), `.tmp-sessions-${testName}-`));
  tempDirs.add(dir);
  return path.join(dir, "sessions.json");
}

afterEach(async () => {
  clearSessionStoreCacheForTest();
  delete process.env.OPENCLAW_SESSION_CACHE_TTL_MS;
  await Promise.all([...tempDirs].map(async (dir) => await fs.rm(dir, { recursive: true, force: true })));
  tempDirs.clear();
});

describe("session store strips resolvedSkills from persistence", () => {
  it("does not write resolvedSkills to disk", async () => {
    process.env.OPENCLAW_SESSION_CACHE_TTL_MS = "0";
    const storePath = await makeStorePath("disk-strip");
    const store = {
      "agent:main:test:1": makeEntry("session-1", makeSnapshot(3)),
    };

    await saveSessionStore(storePath, store, { skipMaintenance: true });

    const raw = await fs.readFile(storePath, "utf-8");
    expect(raw).not.toContain("resolvedSkills");
    expect(raw).not.toContain("skill-0 skill description");
    const parsed = JSON.parse(raw) as Record<string, SessionEntry>;
    expect(parsed["agent:main:test:1"]?.skillsSnapshot?.resolvedSkills).toBeUndefined();
  });

  it("strips resolvedSkills from legacy files on load and mutator save", async () => {
    process.env.OPENCLAW_SESSION_CACHE_TTL_MS = "0";
    const storePath = await makeStorePath("legacy-strip");
    const legacy = {
      "agent:main:test:1": makeEntry("session-1", makeSnapshot(2)),
    };
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    await fs.writeFile(storePath, JSON.stringify(legacy, null, 2), "utf-8");

    const loaded = loadSessionStore(storePath, { skipCache: true });
    expect(loaded["agent:main:test:1"]?.skillsSnapshot?.resolvedSkills).toBeUndefined();

    await updateSessionStore(
      storePath,
      (store) => {
        store["agent:main:test:2"] = makeEntry("session-2", makeSnapshot(2));
      },
      { skipMaintenance: true },
    );
    const raw = await fs.readFile(storePath, "utf-8");
    expect(raw).not.toContain("resolvedSkills");
  });
});

describe("hydrateResolvedSkills", () => {
  it("preserves persisted fields while restoring runtime-only resolvedSkills", () => {
    const stripped: SessionSkillSnapshot = {
      prompt: "original-prompt",
      skills: [{ name: "x" }],
      skillFilter: ["x"],
      version: 7,
    };
    const rebuiltSkills = [makeFixtureSkill("x", 128)];
    let buildCalls = 0;

    const result = hydrateResolvedSkills(stripped, () => {
      buildCalls += 1;
      return {
        prompt: "DIFFERENT-PROMPT",
        skills: [{ name: "y" }],
        resolvedSkills: rebuiltSkills,
        version: 99,
      };
    });

    expect(buildCalls).toBe(1);
    expect(result.prompt).toBe("original-prompt");
    expect(result.skills).toEqual([{ name: "x" }]);
    expect(result.skillFilter).toEqual(["x"]);
    expect(result.version).toBe(7);
    expect(result.resolvedSkills).toBe(rebuiltSkills);
  });

  it("treats an empty resolvedSkills cache as already populated", () => {
    const snapshot: SessionSkillSnapshot = {
      prompt: "",
      skills: [],
      resolvedSkills: [],
      version: 1,
    };
    let buildCalls = 0;

    const result = hydrateResolvedSkills(snapshot, () => {
      buildCalls += 1;
      return { prompt: "", skills: [], resolvedSkills: [makeFixtureSkill("x")], version: 1 };
    });

    expect(result).toBe(snapshot);
    expect(buildCalls).toBe(0);
  });
}
);
