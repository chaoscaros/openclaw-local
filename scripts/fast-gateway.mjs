#!/usr/bin/env node
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  createFastGatewayBuildInfoMismatchMessage,
  createFastGatewaySpawnSpec,
  resolveSignalExitCode,
  waitForFastGatewayChild,
} from "./lib/fast-gateway-lifecycle.mjs";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const repoRoot = path.resolve(currentDir, "..");
const openclawEntry = path.join(repoRoot, "openclaw.mjs");

function readCurrentGitHead() {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function readBuildInfoCommit() {
  const raw = readFileSync(path.join(repoRoot, "dist", "build-info.json"), "utf8");
  const parsed = JSON.parse(raw);
  return typeof parsed.commit === "string" ? parsed.commit : "";
}

if (process.env.OPENCLAW_FAST_ALLOW_STALE_DIST !== "1") {
  try {
    const mismatchMessage = createFastGatewayBuildInfoMismatchMessage({
      buildInfoCommit: readBuildInfoCommit(),
      headCommit: readCurrentGitHead(),
    });
    if (mismatchMessage) {
      console.error(mismatchMessage);
      process.exit(1);
    }
  } catch {
    // Let openclaw.mjs produce the canonical missing-dist or git-unavailable error.
  }
}

const spawnSpec = createFastGatewaySpawnSpec({
  execPath: process.execPath,
  openclawEntry,
  repoRoot,
  env: process.env,
});

const child = spawn(spawnSpec.command, spawnSpec.args, spawnSpec.options);

const result = await waitForFastGatewayChild(child, { process });
if (result.error) {
  const error = result.error;
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
if (result.forwardedSignal) {
  process.exit(resolveSignalExitCode(result.forwardedSignal));
}
if (result.signal) {
  process.exit(resolveSignalExitCode(result.signal));
}
process.exit(result.code ?? 0);
