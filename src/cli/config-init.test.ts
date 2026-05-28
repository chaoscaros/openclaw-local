import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { __testing } from "./config-init.js";

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-config-init-"));
  const home = path.join(root, "home");
  fs.mkdirSync(home, { recursive: true });
  return { root, home };
}

function writeEnv(home: string, content: string): string {
  const envPath = path.join(home, ".openclaw", ".env");
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  fs.writeFileSync(envPath, content, "utf8");
  return envPath;
}

describe("config init", () => {
  let temp: ReturnType<typeof createTempHome>;

  beforeEach(() => {
    temp = createTempHome();
  });

  afterEach(() => {
    fs.rmSync(temp.root, { recursive: true, force: true });
  });

  function deps(overrides: Partial<Parameters<typeof __testing.configInitCommand>[2]> = {}) {
    return {
      env: {} as NodeJS.ProcessEnv,
      fsModule: fs,
      homedir: () => temp.home,
      platform: "darwin" as NodeJS.Platform,
      writeConfig: vi.fn(async (config: OpenClawConfig): Promise<void> => {
        const configPath = process.env.OPENCLAW_CONFIG_PATH;
        if (!configPath) {
          throw new Error("OPENCLAW_CONFIG_PATH missing");
        }
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
      }),
      ...overrides,
    };
  }

  it("requires .env to exist", async () => {
    const runtime = createRuntime();

    await expect(__testing.configInitCommand(runtime, {}, deps())).rejects.toThrow("exit:1");

    expect(runtime.error.mock.calls.map((call) => String(call[0])).join("\n")).toContain(
      "openclaw env init",
    );
  });

  it("requires OPENCLAW_STATE_DIR and OPENCLAW_CONFIG_PATH", async () => {
    writeEnv(temp.home, "OPENCLAW_GATEWAY_TOKEN=test-token\n");
    const runtime = createRuntime();

    await expect(__testing.configInitCommand(runtime, {}, deps())).rejects.toThrow("exit:1");

    const errorText = runtime.error.mock.calls.map((call) => String(call[0])).join("\n");
    expect(errorText).toContain("OPENCLAW_STATE_DIR");
    expect(errorText).toContain("OPENCLAW_CONFIG_PATH");
  });

  it("rejects macOS-style paths on Windows", async () => {
    writeEnv(
      temp.home,
      [
        "OPENCLAW_STATE_DIR=/Users/example/.openclaw-state",
        "OPENCLAW_CONFIG_PATH=/Users/example/openclaw/config/openclaw.runtime.json5",
      ].join("\n"),
    );
    const runtime = createRuntime();

    await expect(
      __testing.configInitCommand(runtime, {}, deps({ platform: "win32" })),
    ).rejects.toThrow("exit:1");

    expect(runtime.error.mock.calls.map((call) => String(call[0])).join("\n")).toContain(
      "Windows paths",
    );
  });

  it("creates state dir and config parent then writes default config", async () => {
    const stateDir = path.join(temp.root, "state");
    const configPath = path.join(temp.root, "config", "openclaw.runtime.json5");
    writeEnv(
      temp.home,
      [`OPENCLAW_STATE_DIR=${stateDir}`, `OPENCLAW_CONFIG_PATH=${configPath}`].join("\n"),
    );
    const runtime = createRuntime();

    await __testing.configInitCommand(runtime, {}, deps());

    expect(fs.existsSync(stateDir)).toBe(true);
    expect(fs.existsSync(path.dirname(configPath))).toBe(true);
    const written = JSON.parse(fs.readFileSync(configPath, "utf8"));
    expect(written).toMatchObject({
      gateway: {
        mode: "local",
        bind: "loopback",
        auth: {
          mode: "token",
          token: {
            source: "env",
            provider: "default",
            id: "OPENCLAW_GATEWAY_TOKEN",
          },
        },
      },
    });
  });

  it("does not overwrite an existing config without --force", async () => {
    const stateDir = path.join(temp.root, "state");
    const configPath = path.join(temp.root, "config", "openclaw.json");
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, "existing", "utf8");
    writeEnv(
      temp.home,
      [`OPENCLAW_STATE_DIR=${stateDir}`, `OPENCLAW_CONFIG_PATH=${configPath}`].join("\n"),
    );
    const runtime = createRuntime();
    const testDeps = deps();

    await expect(__testing.configInitCommand(runtime, {}, testDeps)).rejects.toThrow("exit:1");

    expect(fs.readFileSync(configPath, "utf8")).toBe("existing");
    expect(testDeps.writeConfig).not.toHaveBeenCalled();
    expect(runtime.error.mock.calls.map((call) => String(call[0])).join("\n")).toContain("--force");
  });

  it("overwrites an existing config with --force", async () => {
    const stateDir = path.join(temp.root, "state");
    const configPath = path.join(temp.root, "config", "openclaw.json");
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, "existing", "utf8");
    writeEnv(
      temp.home,
      [`OPENCLAW_STATE_DIR=${stateDir}`, `OPENCLAW_CONFIG_PATH=${configPath}`].join("\n"),
    );
    const testDeps = deps();

    await __testing.configInitCommand(createRuntime(), { force: true }, testDeps);

    expect(testDeps.writeConfig).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync(configPath, "utf8")).toContain("OPENCLAW_GATEWAY_TOKEN");
  });
});
