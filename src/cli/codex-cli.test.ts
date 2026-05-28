import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerCodexCli } from "./codex-cli.js";

const mocks = vi.hoisted(() => ({
  codexCleanCommand: vi.fn(),
  runtime: {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn(),
  },
}));

vi.mock("../runtime.js", () => ({
  defaultRuntime: mocks.runtime,
}));

vi.mock("./codex-clean.js", () => ({
  codexCleanCommand: mocks.codexCleanCommand,
}));

describe("codex cli", () => {
  async function runCli(args: string[]) {
    const program = new Command();
    registerCodexCli(program);
    await program.parseAsync(args, { from: "user" });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.codexCleanCommand.mockResolvedValue(undefined);
  });

  it("registers codex clean", () => {
    const program = new Command();
    registerCodexCli(program);

    const codex = program.commands.find((command) => command.name() === "codex");
    expect(codex).toBeDefined();
    expect(codex?.commands.map((command) => command.name())).toContain("clean");
  });

  it("forwards clean options", async () => {
    await runCli(["codex", "clean", "--dry-run", "--force", "--json"]);

    expect(mocks.codexCleanCommand).toHaveBeenCalledWith(
      {
        dryRun: true,
        force: true,
        json: true,
      },
      mocks.runtime,
    );
  });
});
