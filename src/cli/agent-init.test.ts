import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { readConfigFileSnapshot, replaceConfigFile } from "../config/config.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { agentsInitCommand, __testing } from "./agent-init.js";

type AgentsInitDeps = NonNullable<Parameters<typeof agentsInitCommand>[2]>;
type ReadConfigSnapshot = typeof readConfigFileSnapshot;
type ReplaceConfig = typeof replaceConfigFile;

function createRuntime() {
  return {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn((code: number) => {
      throw new Error(`exit:${code}`);
    }),
  };
}

function createTempHome() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-agent-init-"));
  const home = path.join(root, "home");
  const cwd = path.join(root, "project");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  return { root, home, cwd };
}

function writeEnv(home: string, content: string): string {
  const envPath = path.join(home, ".openclaw", ".env");
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  fs.writeFileSync(envPath, content, "utf8");
  return envPath;
}

function createSnapshot(
  config: OpenClawConfig,
  overrides: Partial<Awaited<ReturnType<typeof readConfigFileSnapshot>>> = {},
) {
  return {
    path: "/tmp/openclaw.json",
    exists: true,
    valid: true,
    hash: "hash-1",
    raw: JSON.stringify(config),
    parsed: config,
    config,
    sourceConfig: config,
    runtimeConfig: config,
    resolved: config,
    issues: [],
    legacyIssues: [],
    envSubstitutionWarnings: [],
    compatibilityNotices: [],
    ...overrides,
  } as Awaited<ReturnType<typeof readConfigFileSnapshot>>;
}

describe("agents init", () => {
  let temp: ReturnType<typeof createTempHome>;

  beforeEach(() => {
    temp = createTempHome();
  });

  afterEach(() => {
    fs.rmSync(temp.root, { recursive: true, force: true });
  });

  function deps(overrides: Partial<AgentsInitDeps> = {}) {
    const replaceConfig = vi.fn<ReplaceConfig>(async (params) => ({
      path: "/tmp/openclaw.json",
      previousHash: "hash-1",
      snapshot: createSnapshot(params.nextConfig),
      nextConfig: params.nextConfig,
    }));
    return {
      cwd: () => temp.cwd,
      env: {} as NodeJS.ProcessEnv,
      fsModule: fs,
      homedir: () => temp.home,
      readConfigSnapshot: vi.fn<ReadConfigSnapshot>(),
      replaceConfig,
      ...overrides,
    };
  }

  it("requires .env to exist", async () => {
    const runtime = createRuntime();

    await expect(agentsInitCommand({}, runtime, deps())).rejects.toThrow("exit:1");

    expect(runtime.error.mock.calls.map((call) => String(call[0])).join("\n")).toContain(
      "openclaw env init",
    );
  });

  it("requires OPENCLAW_STATE_DIR and OPENCLAW_CONFIG_PATH", async () => {
    writeEnv(temp.home, "OPENCLAW_GATEWAY_TOKEN=test-token\n");
    const runtime = createRuntime();

    await expect(agentsInitCommand({}, runtime, deps())).rejects.toThrow("exit:1");

    const errorText = runtime.error.mock.calls.map((call) => String(call[0])).join("\n");
    expect(errorText).toContain("OPENCLAW_STATE_DIR");
    expect(errorText).toContain("OPENCLAW_CONFIG_PATH");
  });

  it("asks the user to run config init when the configured config file is missing", async () => {
    const stateDir = path.join(temp.root, "state");
    const configPath = path.join(temp.root, "config", "openclaw.runtime.json5");
    writeEnv(
      temp.home,
      [`OPENCLAW_STATE_DIR=${stateDir}`, `OPENCLAW_CONFIG_PATH=${configPath}`].join("\n"),
    );
    const testDeps = deps({
      readConfigSnapshot: vi.fn(async () => createSnapshot({}, { exists: false })),
    });
    const runtime = createRuntime();

    await expect(agentsInitCommand({}, runtime, testDeps)).rejects.toThrow("exit:1");

    expect(runtime.error.mock.calls.map((call) => String(call[0])).join("\n")).toContain(
      "openclaw config init",
    );
    expect(testDeps.replaceConfig).not.toHaveBeenCalled();
  });

  it("creates the solo default agent and required directories", async () => {
    const stateDir = path.join(temp.root, "state");
    const configPath = path.join(temp.root, "config", "openclaw.runtime.json5");
    writeEnv(
      temp.home,
      [`OPENCLAW_STATE_DIR=${stateDir}`, `OPENCLAW_CONFIG_PATH=${configPath}`].join("\n"),
    );
    const testDeps = deps({
      readConfigSnapshot: vi.fn(async () =>
        createSnapshot({
          agents: {
            list: [{ id: "main", default: true, workspace: "/old" }],
          },
        }),
      ),
    });

    await agentsInitCommand({}, createRuntime(), testDeps);

    const nextConfig = vi.mocked(testDeps.replaceConfig).mock.calls[0]?.[0].nextConfig;
    expect(nextConfig?.agents?.list).toEqual([
      { id: "main", default: false, workspace: "/old" },
      {
        id: "solo",
        default: true,
        name: "Solo",
        workspace: temp.cwd,
        agentDir: path.join(stateDir, "agents", "solo", "agent"),
      },
    ]);
    expect(fs.existsSync(path.join(stateDir, "agents", "solo", "agent"))).toBe(true);
    expect(fs.existsSync(path.join(stateDir, "agents", "solo", "sessions"))).toBe(true);
  });

  it("preserves an existing solo agent unless --force is set", async () => {
    const stateDir = path.join(temp.root, "state");
    const configPath = path.join(temp.root, "config", "openclaw.json");
    const existingWorkspace = path.join(temp.root, "existing-workspace");
    writeEnv(
      temp.home,
      [`OPENCLAW_STATE_DIR=${stateDir}`, `OPENCLAW_CONFIG_PATH=${configPath}`].join("\n"),
    );
    const testDeps = deps({
      readConfigSnapshot: vi.fn(async () =>
        createSnapshot({
          agents: {
            list: [{ id: "solo", default: false, name: "Custom", workspace: existingWorkspace }],
          },
        }),
      ),
    });

    await agentsInitCommand({}, createRuntime(), testDeps);

    const nextConfig = vi.mocked(testDeps.replaceConfig).mock.calls[0]?.[0].nextConfig;
    expect(nextConfig?.agents?.list?.[0]).toMatchObject({
      id: "solo",
      default: true,
      name: "Custom",
      workspace: existingWorkspace,
    });
  });

  it("replaces an existing solo agent with --force", () => {
    const stateDir = path.join(temp.root, "state");
    const next = __testing.buildSoloAgentConfig(
      {
        agents: {
          list: [{ id: "solo", default: true, name: "Custom", workspace: "/old" }],
        },
      },
      {
        agentDir: path.join(stateDir, "agents", "solo", "agent"),
        force: true,
        workspace: temp.cwd,
      },
    );

    expect(next.agent).toEqual({
      id: "solo",
      default: true,
      name: "Solo",
      workspace: temp.cwd,
      agentDir: path.join(stateDir, "agents", "solo", "agent"),
    });
  });
});
