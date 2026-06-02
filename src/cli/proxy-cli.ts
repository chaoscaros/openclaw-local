import { InvalidArgumentError, type Command } from "commander";
import type { CaptureQueryPreset } from "../proxy-capture/types.js";

type ProxyCliRuntime = typeof import("./proxy-cli.runtime.js");

let proxyCliRuntimePromise: Promise<ProxyCliRuntime> | undefined;

async function loadProxyCliRuntime(): Promise<ProxyCliRuntime> {
  proxyCliRuntimePromise ??= import("./proxy-cli.runtime.js");
  return await proxyCliRuntimePromise;
}

function parseIntegerOption(value: string | undefined, flag: string): number {
  const trimmed = value?.trim() ?? "";
  if (!/^\d+$/u.test(trimmed)) {
    throw new InvalidArgumentError(`${flag} must be an integer.`);
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed)) {
    throw new InvalidArgumentError(`${flag} must be a safe integer.`);
  }
  return parsed;
}

function parsePortOption(value: string | undefined): number {
  const parsed = parseIntegerOption(value, "--port");
  if (parsed > 65_535) {
    throw new InvalidArgumentError("--port must be between 0 and 65535.");
  }
  return parsed;
}

function parsePositiveIntegerOption(value: string | undefined, flag: string): number {
  const parsed = parseIntegerOption(value, flag);
  if (parsed <= 0) {
    throw new InvalidArgumentError(`${flag} must be a positive integer.`);
  }
  return parsed;
}

export function registerProxyCli(program: Command) {
  const proxy = program
    .command("proxy")
    .description("Run the OpenClaw debug proxy and inspect captured traffic");

  proxy
    .command("start")
    .description("Start the local explicit debug proxy")
    .option("--host <host>", "Bind host", "127.0.0.1")
    .option("--port <port>", "Bind port", parsePortOption)
    .action(async (opts: { host?: string; port?: number }) => {
      const runtime = await loadProxyCliRuntime();
      await runtime.runDebugProxyStartCommand(opts);
    });

  proxy
    .command("run")
    .description("Run a child command with OpenClaw debug proxy capture enabled")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .option("--host <host>", "Bind host", "127.0.0.1")
    .option("--port <port>", "Bind port", parsePortOption)
    .argument("[cmd...]", "Command to run after --")
    .action(async (cmd: string[], opts: { host?: string; port?: number }) => {
      const runtime = await loadProxyCliRuntime();
      await runtime.runDebugProxyRunCommand({
        host: opts.host,
        port: opts.port,
        commandArgs: cmd,
      });
    });

  proxy
    .command("coverage")
    .description("Report current debug proxy transport coverage and remaining gaps")
    .action(async () => {
      const runtime = await loadProxyCliRuntime();
      await runtime.runDebugProxyCoverageCommand();
    });

  proxy
    .command("sessions")
    .description("List recent capture sessions")
    .option("--limit <count>", "Maximum sessions to show", (value) =>
      parsePositiveIntegerOption(value, "--limit"),
    )
    .action(async (opts: { limit?: number }) => {
      const runtime = await loadProxyCliRuntime();
      await runtime.runDebugProxySessionsCommand(opts);
    });

  proxy
    .command("query")
    .description("Run a built-in query preset against captured traffic")
    .requiredOption(
      "--preset <name>",
      "Query preset: double-sends, retry-storms, cache-busting, ws-duplicate-frames, missing-ack, error-bursts",
    )
    .option("--session <id>", "Restrict to a capture session id")
    .action(async (opts: { preset: CaptureQueryPreset; session?: string }) => {
      const runtime = await loadProxyCliRuntime();
      await runtime.runDebugProxyQueryCommand({
        preset: opts.preset,
        sessionId: opts.session,
      });
    });

  proxy
    .command("blob")
    .description("Read a captured payload blob by id")
    .requiredOption("--id <blobId>", "Blob id")
    .action(async (opts: { id: string }) => {
      const runtime = await loadProxyCliRuntime();
      await runtime.readDebugProxyBlobCommand({ blobId: opts.id });
    });

  proxy
    .command("purge")
    .description("Delete all captured traffic metadata and blobs")
    .action(async () => {
      const runtime = await loadProxyCliRuntime();
      await runtime.runDebugProxyPurgeCommand();
    });
}
