import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  handleAgentEvent,
  handleSessionOperationEvent,
  type FallbackStatus,
  type ToolStreamEntry,
} from "./app-tool-stream.ts";

type ToolStreamHost = Parameters<typeof handleAgentEvent>[0];
type MutableHost = ToolStreamHost & {
  hello?: {
    snapshot?: {
      sessionDefaults?: {
        defaultAgentId?: string;
        mainKey?: string;
        mainSessionKey?: string;
      };
    };
  } | null;
  compactionStatus?: unknown;
  compactionClearTimer?: number | null;
  fallbackStatus?: FallbackStatus | null;
  fallbackClearTimer?: number | null;
};

function createHost(overrides?: Partial<MutableHost>): MutableHost {
  return {
    sessionKey: "main",
    chatRunId: null,
    chatStream: null,
    chatStreamStartedAt: null,
    chatStreamSegments: [],
    toolStreamById: new Map<string, ToolStreamEntry>(),
    toolStreamOrder: [],
    chatToolMessages: [],
    toolStreamSyncTimer: null,
    compactionStatus: null,
    compactionClearTimer: null,
    fallbackStatus: null,
    fallbackClearTimer: null,
    ...overrides,
  };
}

describe("app-tool-stream fallback lifecycle handling", () => {
  beforeAll(() => {
    const globalWithWindow = globalThis as typeof globalThis & {
      window?: Window & typeof globalThis;
    };
    if (!globalWithWindow.window) {
      globalWithWindow.window = globalThis as unknown as Window & typeof globalThis;
    }
  });

  it("accepts session-scoped fallback lifecycle events when no run is active", () => {
    vi.useFakeTimers();
    const host = createHost();

    handleAgentEvent(host, {
      runId: "run-1",
      seq: 1,
      stream: "lifecycle",
      ts: Date.now(),
      sessionKey: "main",
      data: {
        phase: "fallback",
        selectedProvider: "fireworks",
        selectedModel: "fireworks/accounts/fireworks/routers/kimi-k2p5-turbo",
        activeProvider: "deepinfra",
        activeModel: "moonshotai/Kimi-K2.5",
        reasonSummary: "rate limit",
      },
    });

    expect(host.fallbackStatus?.selected).toBe(
      "fireworks/accounts/fireworks/routers/kimi-k2p5-turbo",
    );
    expect(host.fallbackStatus?.active).toBe("deepinfra/moonshotai/Kimi-K2.5");
    expect(host.fallbackStatus?.reason).toBe("rate limit");
    vi.useRealTimers();
  });

  it("rejects idle fallback lifecycle events for other sessions", () => {
    vi.useFakeTimers();
    const host = createHost();

    handleAgentEvent(host, {
      runId: "run-1",
      seq: 1,
      stream: "lifecycle",
      ts: Date.now(),
      sessionKey: "agent:other:main",
      data: {
        phase: "fallback",
        selectedProvider: "fireworks",
        selectedModel: "fireworks/accounts/fireworks/routers/kimi-k2p5-turbo",
        activeProvider: "deepinfra",
        activeModel: "moonshotai/Kimi-K2.5",
      },
    });

    expect(host.fallbackStatus).toBeNull();
    vi.useRealTimers();
  });

  it("auto-clears fallback status after toast duration", () => {
    vi.useFakeTimers();
    const host = createHost();

    handleAgentEvent(host, {
      runId: "run-1",
      seq: 1,
      stream: "lifecycle",
      ts: Date.now(),
      sessionKey: "main",
      data: {
        phase: "fallback",
        selectedProvider: "fireworks",
        selectedModel: "fireworks/accounts/fireworks/routers/kimi-k2p5-turbo",
        activeProvider: "deepinfra",
        activeModel: "moonshotai/Kimi-K2.5",
      },
    });

    expect(host.fallbackStatus).not.toBeNull();
    vi.advanceTimersByTime(7_999);
    expect(host.fallbackStatus).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(host.fallbackStatus).toBeNull();
    vi.useRealTimers();
  });

  it("builds previous fallback label from provider + model on fallback_cleared", () => {
    vi.useFakeTimers();
    const host = createHost();

    handleAgentEvent(host, {
      runId: "run-1",
      seq: 1,
      stream: "lifecycle",
      ts: Date.now(),
      sessionKey: "main",
      data: {
        phase: "fallback_cleared",
        selectedProvider: "fireworks",
        selectedModel: "fireworks/accounts/fireworks/routers/kimi-k2p5-turbo",
        activeProvider: "fireworks",
        activeModel: "fireworks/accounts/fireworks/routers/kimi-k2p5-turbo",
        previousActiveProvider: "deepinfra",
        previousActiveModel: "moonshotai/Kimi-K2.5",
      },
    });

    expect(host.fallbackStatus?.phase).toBe("cleared");
    expect(host.fallbackStatus?.previous).toBe("deepinfra/moonshotai/Kimi-K2.5");
    vi.useRealTimers();
  });

  it("shows manual session operation compaction progress while idle", () => {
    vi.useFakeTimers();
    vi.setSystemTime(123_000);
    const host = createHost({
      sessionKey: "main",
      hello: {
        snapshot: {
          sessionDefaults: {
            defaultAgentId: "main",
            mainKey: "main",
            mainSessionKey: "agent:main:main",
          },
        },
      },
    });

    handleSessionOperationEvent(host, {
      operationId: "operation-1",
      operation: "compact",
      phase: "start",
      sessionKey: "agent:main:main",
      ts: 123_000,
    });

    expect(host.compactionStatus).toEqual({
      phase: "active",
      runId: "operation-1",
      startedAt: 123_000,
      completedAt: null,
    });

    handleSessionOperationEvent(host, {
      operationId: "operation-1",
      operation: "compact",
      phase: "end",
      sessionKey: "agent:main:main",
      ts: 123_000,
      completed: true,
    });

    expect(host.compactionStatus).toEqual({
      phase: "complete",
      runId: "operation-1",
      startedAt: 123_000,
      completedAt: 123_000,
    });

    vi.useRealTimers();
  });

  it("ignores manual session operation compaction for other sessions", () => {
    vi.useFakeTimers();
    const host = createHost({ sessionKey: "agent:main:main" });

    handleSessionOperationEvent(host, {
      operationId: "operation-1",
      operation: "compact",
      phase: "start",
      sessionKey: "agent:other:main",
      ts: Date.now(),
    });

    expect(host.compactionStatus).toBeNull();
    expect(host.compactionClearTimer).toBeNull();

    vi.useRealTimers();
  });

  it("ignores stale manual session operation completion after a newer start", () => {
    vi.useFakeTimers();
    vi.setSystemTime(123_000);
    const host = createHost({ sessionKey: "agent:main:main" });

    handleSessionOperationEvent(host, {
      operationId: "operation-1",
      operation: "compact",
      phase: "start",
      sessionKey: "agent:main:main",
      ts: 123_000,
    });
    handleSessionOperationEvent(host, {
      operationId: "operation-2",
      operation: "compact",
      phase: "start",
      sessionKey: "agent:main:main",
      ts: 123_000,
    });
    handleSessionOperationEvent(host, {
      operationId: "operation-1",
      operation: "compact",
      phase: "end",
      sessionKey: "agent:main:main",
      ts: 123_000,
      completed: true,
    });

    expect(host.compactionStatus).toEqual({
      phase: "active",
      runId: "operation-2",
      startedAt: 123_000,
      completedAt: null,
    });
    vi.advanceTimersByTime(5 * 60_000);
    expect(host.compactionStatus).toBeNull();
    expect(host.compactionClearTimer).toBeNull();

    vi.useRealTimers();
  });

  it("keeps compaction in retry-pending state until the matching lifecycle end", () => {
    vi.useFakeTimers();
    const host = createHost();

    handleAgentEvent(host, {
      runId: "run-1",
      seq: 1,
      stream: "compaction",
      ts: Date.now(),
      sessionKey: "main",
      data: { phase: "start" },
    });

    expect(host.compactionStatus).toEqual({
      phase: "active",
      runId: "run-1",
      startedAt: expect.any(Number),
      completedAt: null,
    });

    handleAgentEvent(host, {
      runId: "run-1",
      seq: 2,
      stream: "compaction",
      ts: Date.now(),
      sessionKey: "main",
      data: { phase: "end", willRetry: true, completed: true },
    });

    expect(host.compactionStatus).toEqual({
      phase: "retrying",
      runId: "run-1",
      startedAt: expect.any(Number),
      completedAt: null,
    });
    expect(host.compactionClearTimer).toBeNull();

    handleAgentEvent(host, {
      runId: "run-2",
      seq: 3,
      stream: "lifecycle",
      ts: Date.now(),
      sessionKey: "main",
      data: { phase: "end" },
    });

    expect(host.compactionStatus).toEqual({
      phase: "retrying",
      runId: "run-1",
      startedAt: expect.any(Number),
      completedAt: null,
    });

    handleAgentEvent(host, {
      runId: "run-1",
      seq: 4,
      stream: "lifecycle",
      ts: Date.now(),
      sessionKey: "main",
      data: { phase: "end" },
    });

    expect(host.compactionStatus).toEqual({
      phase: "complete",
      runId: "run-1",
      startedAt: expect.any(Number),
      completedAt: expect.any(Number),
    });
    expect(host.compactionClearTimer).not.toBeNull();

    vi.advanceTimersByTime(5_000);
    expect(host.compactionStatus).toBeNull();
    expect(host.compactionClearTimer).toBeNull();

    vi.useRealTimers();
  });

  it("treats lifecycle error as terminal for retry-pending compaction", () => {
    vi.useFakeTimers();
    const host = createHost();

    handleAgentEvent(host, {
      runId: "run-1",
      seq: 1,
      stream: "compaction",
      ts: Date.now(),
      sessionKey: "main",
      data: { phase: "start" },
    });

    handleAgentEvent(host, {
      runId: "run-1",
      seq: 2,
      stream: "compaction",
      ts: Date.now(),
      sessionKey: "main",
      data: { phase: "end", willRetry: true, completed: true },
    });

    expect(host.compactionStatus).toEqual({
      phase: "retrying",
      runId: "run-1",
      startedAt: expect.any(Number),
      completedAt: null,
    });

    handleAgentEvent(host, {
      runId: "run-1",
      seq: 3,
      stream: "lifecycle",
      ts: Date.now(),
      sessionKey: "main",
      data: { phase: "error", error: "boom" },
    });

    expect(host.compactionStatus).toEqual({
      phase: "complete",
      runId: "run-1",
      startedAt: expect.any(Number),
      completedAt: expect.any(Number),
    });
    expect(host.compactionClearTimer).not.toBeNull();

    vi.advanceTimersByTime(5_000);
    expect(host.compactionStatus).toBeNull();
    expect(host.compactionClearTimer).toBeNull();

    vi.useRealTimers();
  });

  it("does not surface retrying or complete when retry compaction failed", () => {
    vi.useFakeTimers();
    const host = createHost();

    handleAgentEvent(host, {
      runId: "run-1",
      seq: 1,
      stream: "compaction",
      ts: Date.now(),
      sessionKey: "main",
      data: { phase: "start" },
    });

    handleAgentEvent(host, {
      runId: "run-1",
      seq: 2,
      stream: "compaction",
      ts: Date.now(),
      sessionKey: "main",
      data: { phase: "end", willRetry: true, completed: false },
    });

    expect(host.compactionStatus).toBeNull();
    expect(host.compactionClearTimer).toBeNull();

    handleAgentEvent(host, {
      runId: "run-1",
      seq: 3,
      stream: "lifecycle",
      ts: Date.now(),
      sessionKey: "main",
      data: { phase: "error", error: "boom" },
    });

    expect(host.compactionStatus).toBeNull();
    expect(host.compactionClearTimer).toBeNull();

    vi.useRealTimers();
  });
});
