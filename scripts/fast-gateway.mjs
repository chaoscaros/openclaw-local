#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  createFastGatewaySpawnSpec,
  resolveSignalExitCode,
  waitForFastGatewayChild,
} from "./lib/fast-gateway-lifecycle.mjs";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const repoRoot = path.resolve(currentDir, "..");
const openclawEntry = path.join(repoRoot, "openclaw.mjs");

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
