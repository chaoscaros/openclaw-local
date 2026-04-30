import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMemoryPluginState, registerMemoryFlushPlanResolver } from "../../plugins/memory-state.js";
import type { SessionEntry } from "../../config/sessions.js";
import {
  runMemoryFlushIfNeeded,
  runPreflightCompactionIfNeeded,
  setAgentRunnerMemoryTestDeps,
} from "./agent-runner-memory.js";
import type { FollowupRun } from "./queue.js";
import type { ReplyOperation } from "./reply-run-registry.js";

function createFollowupRun(): FollowupRun {
  return {
    prompt: "hello",
    summaryLine: "hello",
    enqueuedAt: Date.now(),
    run: {
      agentId: "main",
      agentDir: "/tmp/agent",
      sessionId: "session",
      sessionKey: "main",
      messageProvider: "webchat",
      sessionFile: "/tmp/session.jsonl",
      workspaceDir: "/tmp/workspace",
      config: {},
      skillsSnapshot: {},
      provider: "anthropic",
      model: "claude",
      thinkLevel: "low",
      timeoutMs: 1000,
      blockReplyBreak: "message_end",
    },
  } as unknown as FollowupRun;
}

function createReplyOperation(): ReplyOperation {
  return {
    key: "main",
    sessionId: "session",
    abortSignal: new AbortController().signal,
    resetTriggered: false,
    phase: "queued",
    result: null,
    setPhase: vi.fn(),
    updateSessionId: vi.fn(),
    attachBackend: vi.fn(),
    detachBackend: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
    abortByUser: vi.fn(),
    abortForRestart: vi.fn(),
  };
}

describe("agent-runner-memory fast path", () => {
  const compactEmbeddedPiSessionMock = vi.fn();
  const runEmbeddedPiAgentMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    clearMemoryPluginState();
    registerMemoryFlushPlanResolver(() => ({
      softThresholdTokens: 4000,
      forceFlushTranscriptBytes: 0,
      reserveTokensFloor: 20000,
      prompt: "flush",
      systemPrompt: "flush-system",
      relativePath: "memory/flush.md",
    }));
    setAgentRunnerMemoryTestDeps({
      compactEmbeddedPiSession: compactEmbeddedPiSessionMock,
      runEmbeddedPiAgent: runEmbeddedPiAgentMock,
    });
  });

  afterEach(() => {
    clearMemoryPluginState();
  });

  it("skips preflight transcript fallback for stale but safely low token snapshots", async () => {
    const entry = {
      sessionId: "session",
      totalTokens: 1200,
      totalTokensFresh: false,
      updatedAt: Date.now(),
    } as SessionEntry;

    const result = await runPreflightCompactionIfNeeded({
      cfg: {},
      followupRun: createFollowupRun(),
      promptForEstimate: "hello",
      defaultModel: "claude",
      sessionEntry: entry,
      sessionStore: { main: entry },
      sessionKey: "main",
      storePath: "/tmp/store.json",
      isHeartbeat: false,
      replyOperation: createReplyOperation(),
    });

    expect(result).toBe(entry);
    expect(compactEmbeddedPiSessionMock).not.toHaveBeenCalled();
  });

  it("skips memory flush transcript reads for stale but safely low token snapshots", async () => {
    const entry = {
      sessionId: "session",
      totalTokens: 1200,
      totalTokensFresh: false,
      compactionCount: 0,
      updatedAt: Date.now(),
    } as SessionEntry;

    const result = await runMemoryFlushIfNeeded({
      cfg: {},
      followupRun: createFollowupRun(),
      promptForEstimate: "hello",
      sessionCtx: { Provider: "webchat" } as never,
      defaultModel: "claude",
      resolvedVerboseLevel: "off",
      sessionEntry: entry,
      sessionStore: { main: entry },
      sessionKey: "main",
      storePath: "/tmp/store.json",
      isHeartbeat: false,
      replyOperation: createReplyOperation(),
    });

    expect(result).toBe(entry);
    expect(runEmbeddedPiAgentMock).not.toHaveBeenCalled();
  });
});
