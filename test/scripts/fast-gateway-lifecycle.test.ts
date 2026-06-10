import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  createFastGatewayBuildInfoMismatchMessage,
  createFastGatewaySpawnSpec,
  resolveSignalExitCode,
  stopFastGatewayChild,
  waitForFastGatewayChild,
} from "../../scripts/lib/fast-gateway-lifecycle.mjs";

class FakeChild extends EventEmitter {
  exitCode: number | null = null;
  killed = false;
  pid = 4242;
  kill = vi.fn();
}

class FakeProcess extends EventEmitter {
  platform: NodeJS.Platform;

  constructor(platform: NodeJS.Platform) {
    super();
    this.platform = platform;
  }

  off(eventName: string | symbol, listener: (...args: unknown[]) => void) {
    return super.off(eventName, listener);
  }
}

describe("fast gateway lifecycle", () => {
  it("does not warn when fast gateway build info matches git HEAD", () => {
    expect(
      createFastGatewayBuildInfoMismatchMessage({
        buildInfoCommit: "abc123",
        headCommit: "abc123",
      }),
    ).toBeNull();
  });

  it("warns when fast gateway would start stale dist output", () => {
    const message = createFastGatewayBuildInfoMismatchMessage({
      buildInfoCommit: "old-build",
      headCommit: "new-head",
    });

    expect(message).toContain("dist/build-info.json is stale");
    expect(message).toContain("old-build");
    expect(message).toContain("new-head");
    expect(message).toContain("pnpm build");
  });

  it("builds the foreground gateway spawn spec", () => {
    const spec = createFastGatewaySpawnSpec({
      execPath: "node",
      openclawEntry: "/repo/openclaw.mjs",
      repoRoot: "/repo",
      env: { EXISTING: "1" },
    });

    expect(spec.command).toBe("node");
    expect(spec.args).toEqual(["/repo/openclaw.mjs", "gateway", "--verbose"]);
    expect(spec.options).toMatchObject({
      cwd: "/repo",
      shell: false,
      stdio: "inherit",
    });
    expect(spec.options.env).toMatchObject({
      EXISTING: "1",
      OPENCLAW_SKIP_DIRTY_TREE_BUILD: "1",
    });
  });

  it("forwards Ctrl+C to the child and exits with shell interrupt code", async () => {
    const child = new FakeChild();
    const fakeProcess = new FakeProcess("darwin");

    const resultPromise = waitForFastGatewayChild(child, {
      process: fakeProcess,
    });

    fakeProcess.emit("SIGINT");
    child.emit("exit", null, "SIGTERM");

    await expect(resultPromise).resolves.toMatchObject({
      code: null,
      signal: "SIGTERM",
      forwardedSignal: "SIGINT",
    });
    expect(child.kill).toHaveBeenCalledWith("SIGINT");
    expect(fakeProcess.listenerCount("SIGINT")).toBe(0);
    expect(fakeProcess.listenerCount("SIGTERM")).toBe(0);
    expect(resolveSignalExitCode("SIGINT")).toBe(130);
  });

  it("falls back to taskkill for a stuck Windows child process tree", () => {
    const child = new FakeChild();
    const spawnSyncImpl = vi.fn();
    const setTimeoutImpl = vi.fn((callback: () => void) => {
      callback();
      return { unref: vi.fn() };
    });

    stopFastGatewayChild({
      child,
      platform: "win32",
      signal: "SIGTERM",
      spawnSyncImpl,
      setTimeoutImpl,
      windowsKillDelayMs: 1,
    });

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(spawnSyncImpl).toHaveBeenCalledWith(
      "C:\\Windows\\System32\\taskkill.exe",
      ["/T", "/F", "/PID", "4242"],
      expect.objectContaining({ stdio: "ignore", windowsHide: true, timeout: 5000 }),
    );
  });
});
