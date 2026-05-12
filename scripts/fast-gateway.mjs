#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const openclawEntry = path.join(repoRoot, "openclaw.mjs");

const child = spawn(process.execPath, [openclawEntry, "gateway", "--verbose"], {
  cwd: repoRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    OPENCLAW_SKIP_DIRTY_TREE_BUILD: "1",
  },
  shell: false,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
