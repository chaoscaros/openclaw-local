#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import process from "node:process";

const TARGET_PORT = process.env.OPENCLAW_GATEWAY_PORT || "18789";
const TARGET_MARKERS = [
  "openclaw-gateway",
  "scripts/run-node.mjs gateway",
  "pnpm fast",
  "pnpm openclaw gateway",
  "OPENCLAW_SKIP_DIRTY_TREE_BUILD=1 pnpm openclaw gateway --verbose",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const run = (command, args) => {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const stdout = typeof error?.stdout === "string" ? error.stdout.trim() : "";
    if (stdout) {
      return stdout;
    }
    return "";
  }
};

const parsePidList = (text) =>
  text
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

const readProcessTable = () => {
  const output = run("ps", ["-axo", "pid=,ppid=,command="]);
  const table = new Map();
  for (const line of output.split("\n")) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (!match) {
      continue;
    }
    const [, pidRaw, ppidRaw, command] = match;
    const pid = Number(pidRaw);
    const ppid = Number(ppidRaw);
    table.set(pid, { pid, ppid, command: command.trim() });
  }
  return table;
};

const isTargetCommand = (command) => TARGET_MARKERS.some((marker) => command.includes(marker));

const collectAncestorChain = (startPid, table) => {
  const collected = [];
  let currentPid = startPid;
  while (currentPid > 1) {
    const proc = table.get(currentPid);
    if (!proc) {
      break;
    }
    collected.push(proc);
    const parent = table.get(proc.ppid);
    if (!parent || !isTargetCommand(parent.command)) {
      break;
    }
    currentPid = parent.pid;
  }
  return collected;
};

const listListeningPids = () => parsePidList(run("lsof", ["-n", "-P", "-t", `-iTCP:${TARGET_PORT}`, "-sTCP:LISTEN"]));

const uniqueByPid = (processes) => {
  const map = new Map();
  for (const proc of processes) {
    map.set(proc.pid, proc);
  }
  return [...map.values()];
};

const isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const sendSignal = (pid, signal) => {
  try {
    process.kill(pid, signal);
    return true;
  } catch {
    return false;
  }
};

const formatProc = (proc) => `${proc.pid}\t${proc.command}`;

const main = async () => {
  const table = readProcessTable();
  const listeningPids = listListeningPids();

  const matchedProcesses = [...table.values()].filter((proc) => isTargetCommand(proc.command));
  const targeted = uniqueByPid([
    ...matchedProcesses,
    ...listeningPids.flatMap((pid) => collectAncestorChain(pid, table)),
  ]);

  if (targeted.length === 0) {
    console.log(`[stop-fast] No OpenClaw fast/gateway process found. Port ${TARGET_PORT} is already free.`);
    return;
  }

  const sorted = [...targeted].toSorted((a, b) => b.pid - a.pid);
  const terminated = [];
  for (const proc of sorted) {
    if (sendSignal(proc.pid, "SIGTERM")) {
      terminated.push(proc);
    }
  }

  await sleep(1200);

  const forceKilled = [];
  const remainingListeners = listListeningPids();
  if (remainingListeners.length > 0) {
    const refreshed = readProcessTable();
    const stubborn = uniqueByPid(remainingListeners.flatMap((pid) => collectAncestorChain(pid, refreshed)));
    for (const proc of stubborn.toSorted((a, b) => b.pid - a.pid)) {
      if (isAlive(proc.pid) && sendSignal(proc.pid, "SIGKILL")) {
        forceKilled.push(proc);
      }
    }
    await sleep(300);
  }

  const finalListeners = listListeningPids();

  console.log(`[stop-fast] Target port: ${TARGET_PORT}`);
  if (terminated.length > 0) {
    console.log("[stop-fast] SIGTERM sent to:");
    for (const proc of terminated) {
      console.log(`  ${formatProc(proc)}`);
    }
  }
  if (forceKilled.length > 0) {
    console.log("[stop-fast] SIGKILL sent to stubborn processes:");
    for (const proc of forceKilled) {
      console.log(`  ${formatProc(proc)}`);
    }
  }

  if (finalListeners.length === 0) {
    console.log(`[stop-fast] Port ${TARGET_PORT} is now free.`);
    process.exitCode = 0;
    return;
  }

  console.log(`[stop-fast] Port ${TARGET_PORT} is still in use by PID(s): ${finalListeners.join(", ")}`);
  process.exitCode = 1;
};

await main();
