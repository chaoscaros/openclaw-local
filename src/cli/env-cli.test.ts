import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerEnvCli, __testing } from "./env-cli.js";

function createRuntime() {
  return {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn((code: number) => {
      throw new Error(`exit:${code}`);
    }),
  };
}

function createTempProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-env-cli-"));
  const home = path.join(root, "home");
  const project = path.join(root, "project");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(
    path.join(project, ".env.example"),
    [
      "# example",
      "OPENCLAW_GATEWAY_TOKEN=",
      "# OPENCLAW_STATE_DIR=~/.openclaw",
      "# OPENCLAW_CONFIG_PATH=~/.openclaw/openclaw.json",
      "",
    ].join("\n"),
    "utf8",
  );
  return { root, home, project };
}

function envDeps(temp: ReturnType<typeof createTempProject>, token = "generated-token") {
  return {
    cwd: () => temp.project,
    fsModule: fs,
    homedir: () => temp.home,
    packageRoot: () => null,
    token: () => token,
  };
}

describe("env cli", () => {
  let temp: ReturnType<typeof createTempProject>;

  beforeEach(() => {
    temp = createTempProject();
  });

  afterEach(() => {
    fs.rmSync(temp.root, { recursive: true, force: true });
  });

  it("creates ~/.openclaw/.env from .env.example with a generated gateway token", async () => {
    const runtime = createRuntime();

    await __testing.envInitCommand(runtime, {}, envDeps(temp));

    const envPath = path.join(temp.home, ".openclaw", ".env");
    expect(fs.readFileSync(envPath, "utf8")).toContain("OPENCLAW_GATEWAY_TOKEN=generated-token");
    expect(fs.readFileSync(envPath, "utf8")).toContain("# OPENCLAW_STATE_DIR=~/.openclaw");
    expect(runtime.log.mock.calls.map((call) => String(call[0])).join("\n")).toContain("Created");
  });

  it("falls back to the package .env.example when cwd has no template", async () => {
    const runtime = createRuntime();
    const packageRoot = path.join(temp.root, "package");
    fs.mkdirSync(packageRoot, { recursive: true });
    fs.writeFileSync(
      path.join(packageRoot, ".env.example"),
      ["# package template", "OPENCLAW_GATEWAY_TOKEN=", ""].join("\n"),
      "utf8",
    );
    fs.rmSync(path.join(temp.project, ".env.example"));

    await __testing.envInitCommand(
      runtime,
      {},
      {
        ...envDeps(temp, "package-token"),
        packageRoot: () => packageRoot,
      },
    );

    const envPath = path.join(temp.home, ".openclaw", ".env");
    expect(fs.readFileSync(envPath, "utf8")).toContain("# package template");
    expect(fs.readFileSync(envPath, "utf8")).toContain("OPENCLAW_GATEWAY_TOKEN=package-token");
    expect(runtime.log.mock.calls.map((call) => String(call[0])).join("\n")).toContain(
      path.join(packageRoot, ".env.example"),
    );
  });

  it("refuses to overwrite an existing .env without --force", async () => {
    const envPath = path.join(temp.home, ".openclaw", ".env");
    fs.mkdirSync(path.dirname(envPath), { recursive: true });
    fs.writeFileSync(envPath, "OPENCLAW_GATEWAY_TOKEN=existing-token\n", "utf8");
    const runtime = createRuntime();

    await expect(__testing.envInitCommand(runtime, {}, envDeps(temp, "new-token"))).rejects.toThrow(
      "exit:1",
    );

    expect(fs.readFileSync(envPath, "utf8")).toBe("OPENCLAW_GATEWAY_TOKEN=existing-token\n");
    expect(runtime.error.mock.calls.map((call) => String(call[0])).join("\n")).toContain("--force");
  });

  it("overwrites an existing .env with --force", async () => {
    const envPath = path.join(temp.home, ".openclaw", ".env");
    fs.mkdirSync(path.dirname(envPath), { recursive: true });
    fs.writeFileSync(envPath, "OPENCLAW_GATEWAY_TOKEN=existing-token\n", "utf8");

    await __testing.envInitCommand(
      createRuntime(),
      { force: true },
      envDeps(temp, "replacement-token"),
    );

    expect(fs.readFileSync(envPath, "utf8")).toContain("OPENCLAW_GATEWAY_TOKEN=replacement-token");
  });

  it("appends the gateway token when the template has no token line", () => {
    expect(__testing.applyGatewayToken("# example\n", "generated-token")).toBe(
      "# example\nOPENCLAW_GATEWAY_TOKEN=generated-token\n",
    );
  });

  it("updates only OPENCLAW_GATEWAY_TOKEN in an existing .env", async () => {
    const envPath = path.join(temp.home, ".openclaw", ".env");
    fs.mkdirSync(path.dirname(envPath), { recursive: true });
    fs.writeFileSync(
      envPath,
      [
        "OPENCLAW_STATE_DIR=/tmp/state",
        "OPENCLAW_GATEWAY_TOKEN=old-token",
        "OPENCLAW_GATEWAY_TOKEN=older-duplicate",
        "OPENCLAW_CONFIG_PATH=/tmp/config/openclaw.json",
        "",
      ].join("\n"),
      "utf8",
    );

    await __testing.envTokenCommand(createRuntime(), {}, envDeps(temp, "rotated-token"));

    expect(fs.readFileSync(envPath, "utf8")).toBe(
      [
        "OPENCLAW_STATE_DIR=/tmp/state",
        "OPENCLAW_GATEWAY_TOKEN=rotated-token",
        "OPENCLAW_CONFIG_PATH=/tmp/config/openclaw.json",
        "",
      ].join("\n"),
    );
  });

  it("appends OPENCLAW_GATEWAY_TOKEN when updating an .env without a token line", async () => {
    const envPath = path.join(temp.home, ".openclaw", ".env");
    fs.mkdirSync(path.dirname(envPath), { recursive: true });
    fs.writeFileSync(envPath, "OPENCLAW_STATE_DIR=/tmp/state\n", "utf8");

    await __testing.envTokenCommand(createRuntime(), {}, envDeps(temp, "new-token"));

    expect(fs.readFileSync(envPath, "utf8")).toBe(
      "OPENCLAW_STATE_DIR=/tmp/state\nOPENCLAW_GATEWAY_TOKEN=new-token\n",
    );
  });

  it("fails token rotation when .env does not exist", async () => {
    const runtime = createRuntime();

    await expect(
      __testing.envTokenCommand(runtime, {}, envDeps(temp, "new-token")),
    ).rejects.toThrow("exit:1");

    expect(runtime.error.mock.calls.map((call) => String(call[0])).join("\n")).toContain(
      "openclaw env init",
    );
  });

  it("prints the generated token only when requested", async () => {
    const envPath = path.join(temp.home, ".openclaw", ".env");
    fs.mkdirSync(path.dirname(envPath), { recursive: true });
    fs.writeFileSync(envPath, "OPENCLAW_GATEWAY_TOKEN=old-token\n", "utf8");
    const runtime = createRuntime();

    await __testing.envTokenCommand(runtime, { print: true }, envDeps(temp, "printed-token"));

    expect(runtime.log.mock.calls.map((call) => String(call[0]))).toContain("printed-token");
  });

  it("registers env init and token", () => {
    const program = new Command();
    registerEnvCli(program);

    expect(program.commands.map((command) => command.name())).toContain("env");
    const envCommand = program.commands.find((command) => command.name() === "env");
    expect(envCommand?.commands.map((command) => command.name())).toEqual(["init", "token"]);
  });
});
