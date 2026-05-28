import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __testing } from "./codex-clean.js";

function createRuntime() {
  return {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn((code: number) => {
      throw new Error(`exit:${code}`);
    }),
    writeJson: vi.fn(),
    writeStdout: vi.fn(),
  };
}

function createTempHome() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-codex-clean-"));
  const home = path.join(root, "home");
  const stateDir = path.join(root, "state");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  return { root, home, stateDir };
}

function writeEnv(home: string, stateDir: string, configPath?: string): void {
  const envPath = path.join(home, ".openclaw", ".env");
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  fs.writeFileSync(
    envPath,
    [
      `OPENCLAW_STATE_DIR=${stateDir}`,
      configPath ? `OPENCLAW_CONFIG_PATH=${configPath}` : undefined,
    ]
      .filter(Boolean)
      .join("\n")
      .concat("\n"),
    "utf8",
  );
}

function writeJsonFile(pathname: string, value: unknown): void {
  fs.mkdirSync(path.dirname(pathname), { recursive: true });
  fs.writeFileSync(pathname, JSON.stringify(value, null, 2), "utf8");
}

function readJsonFile(pathname: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(pathname, "utf8")) as Record<string, unknown>;
}

describe("codex clean", () => {
  let temp: ReturnType<typeof createTempHome>;

  beforeEach(() => {
    temp = createTempHome();
    writeEnv(temp.home, temp.stateDir);
  });

  afterEach(() => {
    fs.rmSync(temp.root, { recursive: true, force: true });
  });

  function deps(confirm = vi.fn(async () => true)) {
    return {
      confirm,
      env: {} as NodeJS.ProcessEnv,
      fsModule: fs,
      homedir: () => temp.home,
    };
  }

  it("removes only openai-codex profiles and provider state with --force", async () => {
    const authPath = path.join(temp.stateDir, "agents", "solo", "agent", "auth-profiles.json");
    writeJsonFile(authPath, {
      version: 1,
      profiles: {
        "openai-codex:old@example.com": {
          type: "oauth",
          provider: "openai-codex",
          managedBy: "codex-cli",
        },
        "openai:default": { type: "api_key", provider: "openai", key: "sk-test" },
      },
      order: {
        "openai-codex": ["openai-codex:old@example.com"],
        openai: ["openai:default"],
      },
      lastGood: {
        "openai-codex": "openai-codex:old@example.com",
        openai: "openai:default",
      },
      usageStats: {
        "openai-codex:old@example.com": { errorCount: 2 },
        "openai:default": { errorCount: 1 },
      },
    });

    await __testing.codexCleanCommand({ force: true }, createRuntime(), deps());

    expect(readJsonFile(authPath)).toMatchObject({
      version: 1,
      profiles: {
        "openai:default": { type: "api_key", provider: "openai", key: "sk-test" },
      },
      order: {
        openai: ["openai:default"],
      },
      lastGood: {
        openai: "openai:default",
      },
      usageStats: {
        "openai:default": { errorCount: 1 },
      },
    });
  });

  it("cleans auth profiles from agentDir entries in the configured config file", async () => {
    const configPath = path.join(temp.root, "config", "openclaw.runtime.json5");
    const agentDir = path.join(temp.root, "crews", "solo", "agent");
    writeEnv(temp.home, temp.stateDir, configPath);
    writeJsonFile(configPath, {
      agents: {
        list: [{ id: "solo", agentDir }],
      },
    });
    const authPath = path.join(agentDir, "auth-profiles.json");
    writeJsonFile(authPath, {
      version: 1,
      profiles: {
        "openai-codex:old@example.com": { type: "oauth", provider: "openai-codex" },
        "anthropic:manual": { type: "api_key", provider: "anthropic" },
      },
    });

    await __testing.codexCleanCommand({ force: true }, createRuntime(), deps());

    expect(readJsonFile(authPath)).toMatchObject({
      profiles: {
        "anthropic:manual": { type: "api_key", provider: "anthropic" },
      },
    });
  });

  it("clears Codex auth profile overrides from configured session metadata", async () => {
    const configPath = path.join(temp.root, "config", "openclaw.runtime.json5");
    const agentDir = path.join(temp.root, "crews", "solo", "agent");
    writeEnv(temp.home, temp.stateDir, configPath);
    writeJsonFile(configPath, {
      agents: {
        list: [{ id: "solo", agentDir }],
      },
    });
    const sessionPath = path.join(temp.root, "crews", "solo", "sessions", "sessions.json");
    writeJsonFile(sessionPath, {
      chat: {
        authProfileOverride: "openai-codex:old@example.com",
        authProfileOverrideSource: "user",
        authProfileOverrideCompactionCount: 3,
        providerOverride: "openai-codex",
      },
      other: {
        authProfileOverride: "anthropic:manual",
        authProfileOverrideSource: "user",
      },
    });

    await __testing.codexCleanCommand({ force: true }, createRuntime(), deps());

    expect(readJsonFile(sessionPath)).toEqual({
      chat: {
        providerOverride: "openai-codex",
      },
      other: {
        authProfileOverride: "anthropic:manual",
        authProfileOverrideSource: "user",
      },
    });
  });

  it("does not write files in dry-run mode", async () => {
    const authPath = path.join(temp.stateDir, "agents", "main", "agent", "auth-state.json");
    const original = {
      version: 1,
      order: { "openai-codex": ["openai-codex:codex-cli"] },
      lastGood: { "openai-codex": "openai-codex:codex-cli" },
    };
    writeJsonFile(authPath, original);

    await __testing.codexCleanCommand({ dryRun: true }, createRuntime(), deps());

    expect(readJsonFile(authPath)).toEqual(original);
  });

  it("prompts before cleaning unless --force is set", async () => {
    const authPath = path.join(temp.stateDir, "agents", "main", "agent", "auth-profiles.json");
    writeJsonFile(authPath, {
      version: 1,
      profiles: {
        "openai-codex:codex-cli": { type: "oauth", provider: "openai-codex" },
      },
    });
    const confirm = vi.fn(async () => false);

    await __testing.codexCleanCommand({}, createRuntime(), deps(confirm));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(readJsonFile(authPath)).toMatchObject({
      profiles: {
        "openai-codex:codex-cli": { type: "oauth", provider: "openai-codex" },
      },
    });
  });

  it("reports JSON without requiring a confirmation for dry-run", async () => {
    const authPath = path.join(temp.stateDir, "agents", "main", "agent", "auth-profiles.json");
    writeJsonFile(authPath, {
      version: 1,
      profiles: {
        "openai-codex:codex-cli": { type: "oauth", provider: "openai-codex" },
      },
    });
    const runtime = createRuntime();
    const confirm = vi.fn(async () => true);

    await __testing.codexCleanCommand({ dryRun: true, json: true }, runtime, deps(confirm));

    expect(confirm).not.toHaveBeenCalled();
    expect(runtime.writeJson).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai-codex",
        dryRun: true,
        removedProfileCount: 1,
      }),
      2,
    );
  });
});
