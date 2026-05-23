import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { formatErrorMessage } from "openclaw/plugin-sdk/error-runtime";
import type { RuntimeEnv } from "../runtime-api.js";

const REQUIRED_MATRIX_PACKAGES = [
  "matrix-js-sdk",
  "@matrix-org/matrix-sdk-crypto-nodejs",
  "@matrix-org/matrix-sdk-crypto-wasm",
];

type MatrixCryptoRuntimeDeps = {
  requireFn?: (id: string) => unknown;
  runCommand?: (params: {
    argv: string[];
    cwd: string;
    timeoutMs: number;
    env?: NodeJS.ProcessEnv;
  }) => Promise<CommandResult>;
  resolveFn?: (id: string) => string;
  nodeExecutable?: string;
  log?: (message: string) => void;
};

function resolveMissingMatrixPackages(resolveFn?: (id: string) => string): string[] {
  const resolve = resolveFn ?? defaultResolveFn;
  return REQUIRED_MATRIX_PACKAGES.filter((pkg) => {
    try {
      resolve(pkg);
      return false;
    } catch {
      return true;
    }
  });
}

export function isMatrixSdkAvailable(): boolean {
  return resolveMissingMatrixPackages().length === 0;
}

function buildMatrixDepsMissingMessage(missing: string[]): string {
  return [
    `Matrix plugin dependencies are missing: ${missing.join(", ")}.`,
    "Repair this plugin with `openclaw plugins update matrix` or run `openclaw doctor --fix`.",
  ].join(" ");
}

type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

async function runFixedCommandWithTimeout(params: {
  argv: string[];
  cwd: string;
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
}): Promise<CommandResult> {
  return await new Promise((resolve) => {
    const [command, ...args] = params.argv;
    if (!command) {
      resolve({
        code: 1,
        stdout: "",
        stderr: "command is required",
      });
      return;
    }

    const proc = spawn(command, args, {
      cwd: params.cwd,
      env: { ...process.env, ...params.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer: NodeJS.Timeout | null = null;

    const finalize = (result: CommandResult) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      resolve(result);
    };

    proc.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    proc.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    timer = setTimeout(() => {
      proc.kill("SIGKILL");
      finalize({
        code: 124,
        stdout,
        stderr: stderr || `command timed out after ${params.timeoutMs}ms`,
      });
    }, params.timeoutMs);

    proc.on("error", (err) => {
      finalize({
        code: 1,
        stdout,
        stderr: err.message,
      });
    });

    proc.on("close", (code) => {
      finalize({
        code: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

function defaultRequireFn(id: string): unknown {
  return createRequire(import.meta.url)(id);
}

function defaultResolveFn(id: string): string {
  return createRequire(import.meta.url).resolve(id);
}

function isMissingMatrixCryptoRuntimeError(error: unknown): boolean {
  const message = formatErrorMessage(error);
  return (
    message.includes("@matrix-org/matrix-sdk-crypto-nodejs-") ||
    message.includes("matrix-sdk-crypto-nodejs") ||
    message.includes("download-lib.js")
  );
}

export async function ensureMatrixCryptoRuntime(
  params: MatrixCryptoRuntimeDeps = {},
): Promise<void> {
  const requireFn = params.requireFn ?? defaultRequireFn;
  try {
    requireFn("@matrix-org/matrix-sdk-crypto-nodejs");
    return;
  } catch (err) {
    if (!isMissingMatrixCryptoRuntimeError(err)) {
      throw err;
    }
  }

  const resolveFn = params.resolveFn ?? defaultResolveFn;
  const scriptPath = resolveFn("@matrix-org/matrix-sdk-crypto-nodejs/download-lib.js");
  params.log?.("matrix: bootstrapping native crypto runtime");
  const runCommand = params.runCommand ?? runFixedCommandWithTimeout;
  const nodeExecutable = params.nodeExecutable ?? process.execPath;
  const result = await runCommand({
    argv: [nodeExecutable, scriptPath],
    cwd: path.dirname(scriptPath),
    timeoutMs: 300_000,
    env: { COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
  });
  if (result.code !== 0) {
    throw new Error(
      result.stderr.trim() || result.stdout.trim() || "Matrix crypto runtime bootstrap failed.",
    );
  }

  requireFn("@matrix-org/matrix-sdk-crypto-nodejs");
}

export async function ensureMatrixSdkInstalled(params?: {
  runtime?: RuntimeEnv;
  confirm?: (message: string) => Promise<boolean>;
  resolveFn?: (id: string) => string;
}): Promise<void> {
  const missing = resolveMissingMatrixPackages(params?.resolveFn);
  if (missing.length === 0) {
    return;
  }
  throw new Error(buildMatrixDepsMissingMessage(missing));
}
