import { spawnSync } from "node:child_process";

const EXIT_CODES_BY_SIGNAL = {
  SIGINT: 130,
  SIGTERM: 143,
};

const WINDOWS_TASKKILL = "C:\\Windows\\System32\\taskkill.exe";

export function resolveSignalExitCode(signal) {
  return EXIT_CODES_BY_SIGNAL[signal] ?? 1;
}

export function createFastGatewaySpawnSpec(params) {
  return {
    command: params.execPath,
    args: [params.openclawEntry, "gateway", "--verbose"],
    options: {
      cwd: params.repoRoot,
      stdio: "inherit",
      env: {
        ...params.env,
        OPENCLAW_SKIP_DIRTY_TREE_BUILD: "1",
      },
      shell: false,
    },
  };
}

function taskkillProcessTree(pid, spawnSyncImpl) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return;
  }
  spawnSyncImpl(WINDOWS_TASKKILL, ["/T", "/F", "/PID", String(pid)], {
    stdio: "ignore",
    windowsHide: true,
    timeout: 5000,
  });
}

export function stopFastGatewayChild(params) {
  const { child, platform, signal } = params;
  if (!child || child.exitCode !== null || child.killed) {
    return;
  }

  try {
    child.kill?.(signal);
  } catch {
    // Best effort. Windows gets a process-tree fallback below.
  }

  if (platform !== "win32") {
    return;
  }

  const timeoutImpl = params.setTimeoutImpl ?? setTimeout;
  const fallback = timeoutImpl(() => {
    taskkillProcessTree(child.pid, params.spawnSyncImpl ?? spawnSync);
  }, params.windowsKillDelayMs ?? 1500);
  fallback?.unref?.();
}

export function waitForFastGatewayChild(child, deps) {
  let forwardedSignal = null;

  const cleanup = () => {
    deps.process.off("SIGINT", onSigInt);
    deps.process.off("SIGTERM", onSigTerm);
  };

  const forwardSignal = (signal) => {
    if (forwardedSignal) {
      return;
    }
    forwardedSignal = signal;
    stopFastGatewayChild({
      child,
      signal,
      platform: deps.process.platform,
      spawnSyncImpl: deps.spawnSync,
      setTimeoutImpl: deps.setTimeout,
    });
  };

  const onSigInt = () => forwardSignal("SIGINT");
  const onSigTerm = () => forwardSignal("SIGTERM");

  deps.process.on("SIGINT", onSigInt);
  deps.process.on("SIGTERM", onSigTerm);

  return new Promise((resolve) => {
    let settled = false;
    const settle = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve({ ...result, forwardedSignal });
    };

    child.on("exit", (code, signal) => {
      settle({ code, signal, error: null });
    });
    child.on("error", (error) => {
      settle({ code: 1, signal: null, error });
    });
  });
}
