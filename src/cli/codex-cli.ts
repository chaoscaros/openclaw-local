import type { Command } from "commander";
import { defaultRuntime } from "../runtime.js";
import { runCommandWithRuntime } from "./cli-utils.js";
import { codexCleanCommand } from "./codex-clean.js";

export function registerCodexCli(program: Command) {
  const codex = program.command("codex").description("Codex account helpers for OpenClaw");

  codex
    .command("clean")
    .description("Remove OpenAI Codex auth profiles saved by OpenClaw")
    .option("--dry-run", "Preview matching OpenClaw auth entries without writing files", false)
    .option("--force", "Skip confirmation", false)
    .option("--json", "Output JSON summary", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await codexCleanCommand(
          {
            dryRun: Boolean(opts.dryRun),
            force: Boolean(opts.force),
            json: Boolean(opts.json),
          },
          defaultRuntime,
        );
      });
    });
}
