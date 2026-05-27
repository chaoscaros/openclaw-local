import { afterEach, describe, expect, it, vi } from "vitest";
import type { HealthSummary } from "../commands/health.js";
import type { ChatAbortControllerEntry } from "./chat-abort.js";

const cleanOldMediaMock = vi.fn(async () => {});
const markSessionRunTerminalMock = vi.fn(async () => ({ updated: true, sessionKey: "main" }));

vi.mock("../media/store.js", async () => {
  const actual = await vi.importActual<typeof import("../media/store.js")>("../media/store.js");
  return {
    ...actual,
    cleanOldMedia: cleanOldMediaMock,
  };
});

vi.mock("./session-run-terminal.js", () => ({
  markSessionRunTerminal: markSessionRunTerminalMock,
}));

const MEDIA_CLEANUP_TTL_MS = 24 * 60 * 60_000;
const ABORTED_RUN_TTL_MS = 60 * 60_000;

function createActiveRun(sessionKey: string): ChatAbortControllerEntry {
  const now = Date.now();
  return {
    controller: new AbortController(),
    sessionId: "sess-1",
    sessionKey,
    startedAtMs: now,
    expiresAtMs: now + ABORTED_RUN_TTL_MS,
    lastActivityAtMs: now,
    activityTimeoutMs: ABORTED_RUN_TTL_MS,
  };
}

function createMaintenanceTimerDeps() {
  return {
    broadcast: () => {},
    nodeSendToAllSubscribed: () => {},
    getPresenceVersion: () => 1,
    getHealthVersion: () => 1,
    refreshGatewayHealthSnapshot: async () => ({ ok: true }) as HealthSummary,
    logHealth: { error: () => {} },
    dedupe: new Map(),
    chatAbortControllers: new Map(),
    chatRunState: { abortedRuns: new Map() },
    chatRunBuffers: new Map(),
    chatDeltaSentAt: new Map(),
    chatDeltaLastBroadcastLen: new Map(),
    removeChatRun: () => undefined,
    agentRunSeq: new Map(),
    nodeSendToSession: () => {},
  };
}

function stopMaintenanceTimers(timers: {
  tickInterval: NodeJS.Timeout;
  healthInterval: NodeJS.Timeout;
  dedupeCleanup: NodeJS.Timeout;
  mediaCleanup: NodeJS.Timeout | null;
}) {
  clearInterval(timers.tickInterval);
  clearInterval(timers.healthInterval);
  clearInterval(timers.dedupeCleanup);
  if (timers.mediaCleanup) {
    clearInterval(timers.mediaCleanup);
  }
}

describe("startGatewayMaintenanceTimers", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("does not schedule recursive media cleanup unless ttl is configured", async () => {
    vi.useFakeTimers();
    const { startGatewayMaintenanceTimers } = await import("./server-maintenance.js");

    const timers = startGatewayMaintenanceTimers({
      ...createMaintenanceTimerDeps(),
    });

    expect(cleanOldMediaMock).not.toHaveBeenCalled();
    expect(timers.mediaCleanup).toBeNull();

    stopMaintenanceTimers(timers);
  });

  it("runs startup media cleanup and repeats it hourly", async () => {
    vi.useFakeTimers();
    const { startGatewayMaintenanceTimers } = await import("./server-maintenance.js");

    const timers = startGatewayMaintenanceTimers({
      ...createMaintenanceTimerDeps(),
      mediaCleanupTtlMs: MEDIA_CLEANUP_TTL_MS,
    });

    expect(cleanOldMediaMock).toHaveBeenCalledWith(MEDIA_CLEANUP_TTL_MS, {
      recursive: true,
      pruneEmptyDirs: true,
    });

    cleanOldMediaMock.mockClear();
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(cleanOldMediaMock).toHaveBeenCalledWith(MEDIA_CLEANUP_TTL_MS, {
      recursive: true,
      pruneEmptyDirs: true,
    });

    stopMaintenanceTimers(timers);
  });

  it("broadcasts tick keepalives without dropIfSlow", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-12T00:00:00Z"));
    const { startGatewayMaintenanceTimers } = await import("./server-maintenance.js");
    const broadcast = vi.fn();

    const timers = startGatewayMaintenanceTimers({
      ...createMaintenanceTimerDeps(),
      broadcast,
    });

    broadcast.mockClear();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(broadcast).toHaveBeenCalledWith("tick", { ts: Date.now() });

    stopMaintenanceTimers(timers);
  });

  it("skips overlapping media cleanup runs", async () => {
    vi.useFakeTimers();
    let resolveCleanup = () => {};
    let cleanupReady = false;
    cleanOldMediaMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCleanup = resolve;
          cleanupReady = true;
        }),
    );
    const { startGatewayMaintenanceTimers } = await import("./server-maintenance.js");

    const timers = startGatewayMaintenanceTimers({
      ...createMaintenanceTimerDeps(),
      mediaCleanupTtlMs: MEDIA_CLEANUP_TTL_MS,
    });

    expect(cleanOldMediaMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(cleanOldMediaMock).toHaveBeenCalledTimes(1);

    if (cleanupReady) {
      resolveCleanup();
    }
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(cleanOldMediaMock).toHaveBeenCalledTimes(2);

    stopMaintenanceTimers(timers);
  });

  it("keeps stale buffers for active runs that still have abort controllers", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-22T00:00:00Z"));
    const { startGatewayMaintenanceTimers } = await import("./server-maintenance.js");
    const deps = createMaintenanceTimerDeps();
    const runId = "run-active";
    deps.chatAbortControllers.set(runId, createActiveRun("main"));
    deps.chatRunBuffers.set(runId, "buffer");
    deps.chatDeltaSentAt.set(runId, Date.now() - ABORTED_RUN_TTL_MS - 1);
    deps.chatDeltaLastBroadcastLen.set(runId, 6);

    const timers = startGatewayMaintenanceTimers(deps);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(deps.chatRunBuffers.get(runId)).toBe("buffer");
    expect(deps.chatDeltaSentAt.has(runId)).toBe(true);
    expect(deps.chatDeltaLastBroadcastLen.get(runId)).toBe(6);

    stopMaintenanceTimers(timers);
  });

  it("marks expired active runs terminal before clearing their lock state", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-22T00:00:00Z"));
    const { startGatewayMaintenanceTimers } = await import("./server-maintenance.js");
    const deps = createMaintenanceTimerDeps();
    const broadcast = vi.fn();
    const nodeSendToSession = vi.fn();
    const removeChatRun = vi.fn();
    const runId = "run-timeout";
    const activeRun = createActiveRun("main");
    activeRun.expiresAtMs = Date.now() - 1;
    deps.chatAbortControllers.set(runId, activeRun);
    deps.chatRunBuffers.set(runId, "buffer");
    deps.chatDeltaSentAt.set(runId, Date.now() - ABORTED_RUN_TTL_MS - 1);
    deps.chatDeltaLastBroadcastLen.set(runId, 6);

    const timers = startGatewayMaintenanceTimers({
      ...deps,
      broadcast,
      nodeSendToSession,
      removeChatRun,
    });

    await vi.advanceTimersByTimeAsync(60_000);

    expect(markSessionRunTerminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey: "main",
        reason: "timeout",
        runId,
      }),
    );
    expect(deps.chatAbortControllers.has(runId)).toBe(false);
    expect(deps.chatRunBuffers.has(runId)).toBe(false);
    expect(removeChatRun).toHaveBeenCalledWith(runId, runId, "main");
    expect(nodeSendToSession).toHaveBeenCalledWith(
      "main",
      "chat",
      expect.objectContaining({ runId, state: "aborted", stopReason: "timeout" }),
    );
    expect(broadcast).toHaveBeenCalledWith(
      "sessions.changed",
      expect.objectContaining({ sessionKey: "main", reason: "run-timeout" }),
    );

    stopMaintenanceTimers(timers);
  });

  it("sweeps orphaned stale buffers once the abort controller is gone", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-22T00:00:00Z"));
    const { startGatewayMaintenanceTimers } = await import("./server-maintenance.js");
    const deps = createMaintenanceTimerDeps();
    const runId = "run-orphaned";
    deps.chatRunBuffers.set(runId, "buffer");
    deps.chatDeltaSentAt.set(runId, Date.now() - ABORTED_RUN_TTL_MS - 1);
    deps.chatDeltaLastBroadcastLen.set(runId, 6);

    const timers = startGatewayMaintenanceTimers(deps);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(deps.chatRunBuffers.has(runId)).toBe(false);
    expect(deps.chatDeltaSentAt.has(runId)).toBe(false);
    expect(deps.chatDeltaLastBroadcastLen.has(runId)).toBe(false);

    stopMaintenanceTimers(timers);
  });

  it("clears deltaLastBroadcastLen when aborted runs age out", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-22T00:00:00Z"));
    const { startGatewayMaintenanceTimers } = await import("./server-maintenance.js");
    const deps = createMaintenanceTimerDeps();
    const runId = "run-aborted";
    deps.chatRunState.abortedRuns.set(runId, Date.now() - ABORTED_RUN_TTL_MS - 1);
    deps.chatRunBuffers.set(runId, "buffer");
    deps.chatDeltaSentAt.set(runId, Date.now() - ABORTED_RUN_TTL_MS - 1);
    deps.chatDeltaLastBroadcastLen.set(runId, 6);

    const timers = startGatewayMaintenanceTimers(deps);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(deps.chatRunState.abortedRuns.has(runId)).toBe(false);
    expect(deps.chatRunBuffers.has(runId)).toBe(false);
    expect(deps.chatDeltaSentAt.has(runId)).toBe(false);
    expect(deps.chatDeltaLastBroadcastLen.has(runId)).toBe(false);

    stopMaintenanceTimers(timers);
  });
});
