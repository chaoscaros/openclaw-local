import { describe, expect, it, vi } from "vitest";
import { GatewayRequestError } from "../gateway.ts";
import {
  abortChatRun,
  handleChatEvent,
  loadChatHistory,
  sendChatMessage,
  type ChatEventPayload,
  type ChatState,
} from "./chat.ts";

function createState(overrides: Partial<ChatState> = {}): ChatState {
  return {
    chatAttachments: [],
    chatLoading: false,
    chatMessage: "",
    chatMessages: [],
    chatRunId: null,
    chatSending: false,
    chatStream: null,
    chatStreamStartedAt: null,
    chatThinkingLevel: null,
    client: null,
    connected: true,
    dreamingAssistApplied: null,
    dreamingAssistReason: null,
    planModeEnabled: false,
    devSpecFirstEnabled: false,
    lastError: null,
    sessionKey: "main",
    ...overrides,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createActiveStreamingState() {
  return createState({
    sessionKey: "main",
    chatRunId: "run-user",
    chatStream: "Working...",
    chatStreamStartedAt: 123,
  });
}

function createOtherRunNoReplyFinalPayload(): ChatEventPayload {
  return {
    runId: "run-announce",
    sessionKey: "main",
    state: "final",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "NO_REPLY" }],
    },
  };
}

describe("handleChatEvent", () => {
  it("returns null when payload is missing", () => {
    const state = createState();
    expect(handleChatEvent(state, undefined)).toBe(null);
  });

  it("returns null when sessionKey does not match", () => {
    const state = createState({ sessionKey: "main" });
    const payload: ChatEventPayload = {
      runId: "run-1",
      sessionKey: "other",
      state: "final",
    };
    expect(handleChatEvent(state, payload)).toBe(null);
  });

  it("accepts equivalent agent/main session keys", () => {
    const state = createState({ sessionKey: "agent:solo:main", chatRunId: "run-1" });
    const payload: ChatEventPayload = {
      runId: "run-1",
      sessionKey: "main",
      state: "final",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Done" }],
      },
    };
    expect(handleChatEvent(state, payload)).toBe("final");
    expect(state.chatMessages).toHaveLength(1);
  });

  it("returns null for delta from another run", () => {
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-user",
      chatStream: "Hello",
    });
    const payload: ChatEventPayload = {
      runId: "run-announce",
      sessionKey: "main",
      state: "delta",
      message: { role: "assistant", content: [{ type: "text", text: "Done" }] },
    };
    expect(handleChatEvent(state, payload)).toBe(null);
    expect(state.chatRunId).toBe("run-user");
    expect(state.chatStream).toBe("Hello");
  });

  it("ignores NO_REPLY delta updates", () => {
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-1",
      chatStream: "Hello",
    });
    const payload: ChatEventPayload = {
      runId: "run-1",
      sessionKey: "main",
      state: "delta",
      message: { role: "assistant", content: [{ type: "text", text: "NO_REPLY" }] },
    };

    expect(handleChatEvent(state, payload)).toBe("delta");
    expect(state.chatStream).toBe("Hello");
  });

  it("appends final payload from another run without clearing active stream", () => {
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-user",
      chatStream: "Working...",
      chatStreamStartedAt: 123,
    });
    const payload: ChatEventPayload = {
      runId: "run-announce",
      sessionKey: "main",
      state: "final",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Sub-agent findings" }],
      },
    };
    expect(handleChatEvent(state, payload)).toBe(null);
    expect(state.chatRunId).toBe("run-user");
    expect(state.chatStream).toBe("Working...");
    expect(state.chatStreamStartedAt).toBe(123);
    expect(state.chatMessages).toHaveLength(1);
    expect(state.chatMessages[0]).toEqual(payload.message);
  });

  it("drops NO_REPLY final payload from another run without clearing active stream", () => {
    const state = createActiveStreamingState();
    const payload = createOtherRunNoReplyFinalPayload();

    expect(handleChatEvent(state, payload)).toBe("final");
    expect(state.chatRunId).toBe("run-user");
    expect(state.chatStream).toBe("Working...");
    expect(state.chatStreamStartedAt).toBe(123);
    expect(state.chatMessages).toEqual([]);
  });

  it("replaces the stream when a delta snapshot gets shorter", () => {
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-1",
      chatStream: "Alpha beta",
    });
    const payload: ChatEventPayload = {
      runId: "run-1",
      sessionKey: "main",
      state: "delta",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Alpha" }],
      },
    };
    expect(handleChatEvent(state, payload)).toBe("delta");
    expect(state.chatStream).toBe("Alpha");
  });

  it("returns final for another run when payload has no message", () => {
    const state = createActiveStreamingState();
    const payload: ChatEventPayload = {
      runId: "run-announce",
      sessionKey: "main",
      state: "final",
    };
    expect(handleChatEvent(state, payload)).toBe("final");
    expect(state.chatRunId).toBe("run-user");
    expect(state.chatMessages).toEqual([]);
  });

  it("persists streamed text when final event carries no message", () => {
    const existingMessage = {
      role: "user",
      content: [{ type: "text", text: "Hi" }],
      timestamp: 1,
    };
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-1",
      chatStream: "Here is my reply",
      chatStreamStartedAt: 100,
      chatMessages: [existingMessage],
    });
    const payload: ChatEventPayload = {
      runId: "run-1",
      sessionKey: "main",
      state: "final",
    };
    expect(handleChatEvent(state, payload)).toBe("final");
    expect(state.chatRunId).toBe(null);
    expect(state.chatStream).toBe(null);
    expect(state.chatStreamStartedAt).toBe(null);
    expect(state.chatMessages).toHaveLength(2);
    expect(state.chatMessages[0]).toEqual(existingMessage);
    expect(state.chatMessages[1]).toMatchObject({
      role: "assistant",
      content: [{ type: "text", text: "Here is my reply" }],
    });
  });

  it("does not persist empty or whitespace-only stream on final", () => {
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-1",
      chatStream: "   ",
      chatStreamStartedAt: 100,
    });
    const payload: ChatEventPayload = {
      runId: "run-1",
      sessionKey: "main",
      state: "final",
    };
    expect(handleChatEvent(state, payload)).toBe("final");
    expect(state.chatRunId).toBe(null);
    expect(state.chatStream).toBe(null);
    expect(state.chatMessages).toEqual([]);
  });

  it("does not persist null stream on final with no message", () => {
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-1",
      chatStream: null,
      chatStreamStartedAt: 100,
    });
    const payload: ChatEventPayload = {
      runId: "run-1",
      sessionKey: "main",
      state: "final",
    };
    expect(handleChatEvent(state, payload)).toBe("final");
    expect(state.chatMessages).toEqual([]);
  });

  it("prefers final payload message over streamed text", () => {
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-1",
      chatStream: "Streamed partial",
      chatStreamStartedAt: 100,
    });
    const finalMsg = {
      role: "assistant",
      content: [{ type: "text", text: "Complete reply" }],
      timestamp: 101,
    };
    const payload: ChatEventPayload = {
      runId: "run-1",
      sessionKey: "main",
      state: "final",
      message: finalMsg,
    };
    expect(handleChatEvent(state, payload)).toBe("final");
    expect(state.chatMessages).toEqual([finalMsg]);
    expect(state.chatStream).toBe(null);
  });

  it("appends final payload message from own run before clearing stream state", () => {
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-1",
      chatStream: "Reply",
      chatStreamStartedAt: 100,
      dreamingAssistApplied: false,
      dreamingAssistReason: "expired",
    });
    const payload: ChatEventPayload = {
      runId: "run-1",
      sessionKey: "main",
      state: "final",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Reply" }],
        timestamp: 101,
      },
    };
    expect(handleChatEvent(state, payload)).toBe("final");
    expect(state.chatMessages).toEqual([payload.message]);
    expect(state.chatRunId).toBe(null);
    expect(state.chatStream).toBe(null);
    expect(state.chatStreamStartedAt).toBe(null);
    expect(state.dreamingAssistApplied).toBe(null);
    expect(state.dreamingAssistReason).toBe(null);
  });

  it("processes aborted from own run and keeps partial assistant message", () => {
    const existingMessage = {
      role: "user",
      content: [{ type: "text", text: "Hi" }],
      timestamp: 1,
    };
    const partialMessage = {
      role: "assistant",
      content: [{ type: "text", text: "Partial reply" }],
      timestamp: 2,
    };
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-1",
      chatStream: "Partial reply",
      chatStreamStartedAt: 100,
      chatMessages: [existingMessage],
    });
    const payload: ChatEventPayload = {
      runId: "run-1",
      sessionKey: "main",
      state: "aborted",
      message: partialMessage,
    };

    expect(handleChatEvent(state, payload)).toBe("aborted");
    expect(state.chatRunId).toBe(null);
    expect(state.chatStream).toBe(null);
    expect(state.chatStreamStartedAt).toBe(null);
    expect(state.dreamingAssistApplied).toBe(null);
    expect(state.dreamingAssistReason).toBe(null);
    expect(state.chatMessages).toEqual([existingMessage, partialMessage]);
  });

  it("falls back to streamed partial when aborted payload message is invalid", () => {
    const existingMessage = {
      role: "user",
      content: [{ type: "text", text: "Hi" }],
      timestamp: 1,
    };
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-1",
      chatStream: "Partial reply",
      chatStreamStartedAt: 100,
      chatMessages: [existingMessage],
    });
    const payload = {
      runId: "run-1",
      sessionKey: "main",
      state: "aborted",
      message: "not-an-assistant-message",
    } as unknown as ChatEventPayload;

    expect(handleChatEvent(state, payload)).toBe("aborted");
    expect(state.chatRunId).toBe(null);
    expect(state.chatStream).toBe(null);
    expect(state.chatStreamStartedAt).toBe(null);
    expect(state.chatMessages).toHaveLength(2);
    expect(state.chatMessages[0]).toEqual(existingMessage);
    expect(state.chatMessages[1]).toMatchObject({
      role: "assistant",
      content: [{ type: "text", text: "Partial reply" }],
    });
  });

  it("falls back to streamed partial when aborted payload has non-assistant role", () => {
    const existingMessage = {
      role: "user",
      content: [{ type: "text", text: "Hi" }],
      timestamp: 1,
    };
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-1",
      chatStream: "Partial reply",
      chatStreamStartedAt: 100,
      chatMessages: [existingMessage],
    });
    const payload: ChatEventPayload = {
      runId: "run-1",
      sessionKey: "main",
      state: "aborted",
      message: {
        role: "user",
        content: [{ type: "text", text: "unexpected" }],
      },
    };

    expect(handleChatEvent(state, payload)).toBe("aborted");
    expect(state.dreamingAssistApplied).toBe(null);
    expect(state.dreamingAssistReason).toBe(null);
    expect(state.chatMessages).toHaveLength(2);
    expect(state.chatMessages[1]).toMatchObject({
      role: "assistant",
      content: [{ type: "text", text: "Partial reply" }],
    });
  });

  it("processes aborted from own run without message and empty stream", () => {
    const existingMessage = {
      role: "user",
      content: [{ type: "text", text: "Hi" }],
      timestamp: 1,
    };
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-1",
      chatStream: "",
      chatStreamStartedAt: 100,
      chatMessages: [existingMessage],
    });
    const payload: ChatEventPayload = {
      runId: "run-1",
      sessionKey: "main",
      state: "aborted",
    };

    expect(handleChatEvent(state, payload)).toBe("aborted");
    expect(state.chatRunId).toBe(null);
    expect(state.chatStream).toBe(null);
    expect(state.chatStreamStartedAt).toBe(null);
    expect(state.chatMessages).toEqual([existingMessage]);
  });

  it("drops NO_REPLY final payload from another run", () => {
    const state = createActiveStreamingState();
    const payload = createOtherRunNoReplyFinalPayload();

    expect(handleChatEvent(state, payload)).toBe("final");
    expect(state.chatMessages).toEqual([]);
    expect(state.chatRunId).toBe("run-user");
    expect(state.chatStream).toBe("Working...");
  });

  it("drops NO_REPLY final payload from own run", () => {
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-1",
      chatStream: "NO_REPLY",
      chatStreamStartedAt: 100,
    });
    const payload: ChatEventPayload = {
      runId: "run-1",
      sessionKey: "main",
      state: "final",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "NO_REPLY" }],
      },
    };

    expect(handleChatEvent(state, payload)).toBe("final");
    expect(state.chatMessages).toEqual([]);
    expect(state.chatRunId).toBe(null);
    expect(state.chatStream).toBe(null);
  });

  it("does not persist NO_REPLY stream text on final without message", () => {
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-1",
      chatStream: "NO_REPLY",
      chatStreamStartedAt: 100,
    });
    const payload: ChatEventPayload = {
      runId: "run-1",
      sessionKey: "main",
      state: "final",
    };

    expect(handleChatEvent(state, payload)).toBe("final");
    expect(state.chatMessages).toEqual([]);
  });

  it("does not persist NO_REPLY stream text on abort", () => {
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-1",
      chatStream: "NO_REPLY",
      chatStreamStartedAt: 100,
    });
    const payload = {
      runId: "run-1",
      sessionKey: "main",
      state: "aborted",
      message: "not-an-assistant-message",
    } as unknown as ChatEventPayload;

    expect(handleChatEvent(state, payload)).toBe("aborted");
    expect(state.chatMessages).toEqual([]);
  });

  it("keeps user messages containing NO_REPLY text", () => {
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-user",
      chatStream: "Working...",
      chatStreamStartedAt: 123,
    });
    const payload: ChatEventPayload = {
      runId: "run-announce",
      sessionKey: "main",
      state: "final",
      message: {
        role: "user",
        content: [{ type: "text", text: "NO_REPLY" }],
      },
    };

    // User messages with NO_REPLY text should NOT be filtered — only assistant messages.
    // normalizeFinalAssistantMessage returns null for user role, so this falls through.
    expect(handleChatEvent(state, payload)).toBe("final");
  });

  it("keeps assistant message when text field has real reply but content is NO_REPLY", () => {
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-1",
      chatStream: "",
      chatStreamStartedAt: 100,
    });
    const payload: ChatEventPayload = {
      runId: "run-1",
      sessionKey: "main",
      state: "final",
      message: {
        role: "assistant",
        text: "real reply",
        content: "NO_REPLY",
      },
    };

    // entry.text takes precedence — "real reply" is NOT silent, so the message is kept.
    expect(handleChatEvent(state, payload)).toBe("final");
    expect(state.chatMessages).toHaveLength(1);
  });
});

describe("loadChatHistory", () => {
  it("filters NO_REPLY assistant messages from history", async () => {
    const messages = [
      { role: "user", content: [{ type: "text", text: "Hello" }] },
      { role: "assistant", content: [{ type: "text", text: "NO_REPLY" }] },
      { role: "assistant", content: [{ type: "text", text: "Real answer" }] },
      { role: "assistant", text: "  NO_REPLY  " },
    ];
    const mockClient = {
      request: vi.fn().mockResolvedValue({ messages, thinkingLevel: "low" }),
    };
    const state = createState({
      client: mockClient as unknown as ChatState["client"],
      connected: true,
    });

    await loadChatHistory(state);

    expect(state.chatMessages).toHaveLength(2);
    expect(state.chatMessages[0]).toEqual(messages[0]);
    expect(state.chatMessages[1]).toEqual(messages[2]);
    expect(state.chatThinkingLevel).toBe("low");
    expect(state.chatLoading).toBe(false);
  });

  it("dedupes repeated user echo messages from reconnect history", async () => {
    const messages = [
      {
        role: "user",
        content: [{ type: "text", text: "update order description" }],
        timestamp: 1_000,
        idempotencyKey: "run-1",
      },
      {
        role: "user",
        content: [{ type: "text", text: "update order description" }],
        timestamp: 1_100,
        idempotencyKey: "run-1",
      },
      {
        role: "user",
        content: [{ type: "text", text: "update order description" }],
        timestamp: 1_200,
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "done" }],
        timestamp: 1_300,
      },
      {
        role: "user",
        content: [{ type: "text", text: "update order description" }],
        timestamp: 1_400,
      },
    ];
    const mockClient = {
      request: vi.fn().mockResolvedValue({ messages }),
    };
    const state = createState({
      client: mockClient as unknown as ChatState["client"],
      connected: true,
    });

    await loadChatHistory(state);

    expect(state.chatMessages).toEqual([messages[0], messages[3], messages[4]]);
  });

  it("keeps assistant message when text field has real content but content is NO_REPLY", async () => {
    const messages = [{ role: "assistant", text: "real reply", content: "NO_REPLY" }];
    const mockClient = {
      request: vi.fn().mockResolvedValue({ messages }),
    };
    const state = createState({
      client: mockClient as unknown as ChatState["client"],
      connected: true,
    });

    await loadChatHistory(state);

    // text takes precedence — "real reply" is NOT silent, so message is kept.
    expect(state.chatMessages).toHaveLength(1);
  });

  it("filters the synthetic transcript-repair tool result from history", async () => {
    const messages = [
      { role: "user", content: [{ type: "text", text: "hello" }] },
      {
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "unknown",
        isError: true,
        content: [
          {
            type: "text",
            text: "[openclaw] missing tool result in session history; inserted synthetic error result for transcript repair.",
          },
        ],
      },
      {
        role: "toolResult",
        toolCallId: "call_2",
        toolName: "shell",
        content: [{ type: "text", text: "real tool output" }],
      },
    ];
    const mockClient = {
      request: vi.fn().mockResolvedValue({ messages }),
    };
    const state = createState({
      client: mockClient as unknown as ChatState["client"],
      connected: true,
    });

    await loadChatHistory(state);

    expect(state.chatMessages).toEqual([messages[0], messages[2]]);
  });

  it("keeps a user message even if it matches the synthetic repair text", async () => {
    const messages = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "[openclaw] missing tool result in session history; inserted synthetic error result for transcript repair.",
          },
        ],
      },
    ];
    const mockClient = {
      request: vi.fn().mockResolvedValue({ messages }),
    };
    const state = createState({
      client: mockClient as unknown as ChatState["client"],
      connected: true,
    });

    await loadChatHistory(state);

    expect(state.chatMessages).toEqual(messages);
  });

  it("keeps optimistic local user messages during an active run when history is stale", async () => {
    const mockClient = {
      request: vi.fn().mockResolvedValue({
        messages: [
          {
            role: "assistant",
            content: [{ type: "text", text: "Older persisted reply" }],
            timestamp: 1,
          },
        ],
        thinkingLevel: null,
      }),
    };
    const state = createState({
      client: mockClient as unknown as ChatState["client"],
      connected: true,
      sessionKey: "main",
      chatRunId: "run-1",
      chatMessages: [
        {
          role: "user",
          content: [{ type: "text", text: "fresh local send" }],
          timestamp: 2,
          __openclawOptimistic: true,
          __openclawRunId: "run-1",
        },
      ],
    });

    await loadChatHistory(state);

    expect(state.chatMessages).toEqual([
      expect.objectContaining({ role: "assistant" }),
      expect.objectContaining({
        role: "user",
        __openclawOptimistic: true,
        content: [{ type: "text", text: "fresh local send" }],
      }),
    ]);
    expect(state.chatLoading).toBe(false);
  });

  it("keeps pending stream state during an active run when history is stale", async () => {
    const mockClient = {
      request: vi.fn().mockResolvedValue({
        messages: [],
        thinkingLevel: null,
      }),
    };
    const state = createState({
      client: mockClient as unknown as ChatState["client"],
      connected: true,
      sessionKey: "main",
      chatRunId: "run-1",
      chatStream: "",
      chatStreamStartedAt: 123,
    });

    await loadChatHistory(state);

    expect(state.chatRunId).toBe("run-1");
    expect(state.chatStream).toBe("");
    expect(state.chatStreamStartedAt).toBe(123);
    expect(state.chatLoading).toBe(false);
  });

  it("clears pending run state when history already contains the assistant reply", async () => {
    const messages = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "[Current task binding for this turn]\n[Thu 2026-05-21 15:40 GMT+8] 记一下这个流程",
          },
        ],
        timestamp: 1_004,
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "记好了。" }],
        timestamp: 1_010,
      },
    ];
    const mockClient = {
      request: vi.fn().mockResolvedValue({ messages, thinkingLevel: null }),
    };
    const requestUpdate = vi.fn();
    const state = createState({
      client: mockClient as unknown as ChatState["client"],
      connected: true,
      sessionKey: "main",
      chatRunId: "run-1",
      chatStream: "",
      chatStreamStartedAt: 1_000,
      requestUpdate,
      sessionsResult: {
        ts: 1,
        path: "/tmp/sessions.json",
        count: 1,
        defaults: { modelProvider: null, model: null, contextTokens: null },
        sessions: [
          {
            key: "main",
            kind: "direct",
            updatedAt: 1,
            status: "running",
          },
        ],
      },
      chatMessages: [
        {
          role: "user",
          content: [{ type: "text", text: "记一下这个流程" }],
          timestamp: 1_000,
          __openclawOptimistic: true,
          __openclawRunId: "run-1",
        },
      ],
    });

    await loadChatHistory(state);

    expect(state.chatMessages).toEqual(messages);
    expect(state.chatRunId).toBeNull();
    expect(state.chatStream).toBeNull();
    expect(state.chatStreamStartedAt).toBeNull();
    expect(state.sessionsResult?.sessions[0]).toEqual(
      expect.objectContaining({
        status: "done",
        endedAt: expect.any(Number),
      }),
    );
    expect(state.sessionRunTerminalOverrides?.main).toEqual(
      expect.objectContaining({
        status: "done",
        endedAt: expect.any(Number),
      }),
    );
    expect(requestUpdate).toHaveBeenCalled();
    expect(state.chatLoading).toBe(false);
  });

  it("keeps pending run state when the matching history turn is older than the local send", async () => {
    const messages = [
      {
        role: "user",
        content: [{ type: "text", text: "same request" }],
        timestamp: 1_000,
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "old reply" }],
        timestamp: 1_010,
      },
    ];
    const mockClient = {
      request: vi.fn().mockResolvedValue({ messages, thinkingLevel: null }),
    };
    const state = createState({
      client: mockClient as unknown as ChatState["client"],
      connected: true,
      sessionKey: "main",
      chatRunId: "run-1",
      chatStream: "",
      chatStreamStartedAt: 10_000,
      sessionsResult: {
        ts: 1,
        path: "/tmp/sessions.json",
        count: 1,
        defaults: { modelProvider: null, model: null, contextTokens: null },
        sessions: [
          {
            key: "main",
            kind: "direct",
            updatedAt: 1,
            status: "running",
          },
        ],
      },
      chatMessages: [
        {
          role: "user",
          content: [{ type: "text", text: "same request" }],
          timestamp: 10_000,
          __openclawOptimistic: true,
          __openclawRunId: "run-1",
        },
      ],
    });

    await loadChatHistory(state);

    expect(state.chatRunId).toBe("run-1");
    expect(state.chatStream).toBe("");
    expect(state.chatStreamStartedAt).toBe(10_000);
    expect(state.chatMessages).toEqual(messages);
    expect(state.sessionsResult?.sessions[0]?.status).toBe("running");
  });
});

describe("sendChatMessage", () => {
  it("does not start a second chat.send while the first send is awaiting ack", async () => {
    let resolveSent: ((value: unknown) => void) | undefined;
    const sent = new Promise((resolve) => {
      resolveSent = resolve;
    });
    const request = vi.fn(() => sent);
    const state = createState({
      connected: true,
      client: { request } as unknown as ChatState["client"],
    });

    const first = sendChatMessage(state, "hello");
    const activeRunId = state.chatRunId;
    const second = sendChatMessage(state, "hello");

    expect(request).toHaveBeenCalledTimes(1);
    expect(state.chatMessages).toHaveLength(1);
    await expect(second).resolves.toBe(activeRunId);

    resolveSent?.({ runId: activeRunId, status: "started" });
    await expect(first).resolves.toBe(activeRunId);
    expect(request).toHaveBeenCalledTimes(1);
    expect(state.chatMessages).toHaveLength(1);
  });

  it("requests a render as soon as the local pending run is staged", async () => {
    const sent = createDeferred<unknown>();
    const request = vi.fn(() => sent.promise);
    const requestUpdate = vi.fn();
    const state = createState({
      connected: true,
      client: { request } as unknown as ChatState["client"],
      requestUpdate,
    });

    const pending = sendChatMessage(state, "hello");

    expect(state.chatRunId).toBeTruthy();
    expect(state.chatSending).toBe(true);
    expect(state.chatStream).toBe("");
    expect(requestUpdate).toHaveBeenCalledTimes(1);

    sent.resolve({ runId: state.chatRunId, status: "started" });
    await pending;

    expect(requestUpdate).toHaveBeenCalledTimes(2);
  });

  it("sends resumeDevExecute when the session has one carried-over dev execute turn", async () => {
    const request = vi.fn().mockResolvedValue({});
    const consumeResumedDevExecuteForSession = vi.fn().mockReturnValue(true);
    const state = createState({
      connected: true,
      client: { request } as unknown as ChatState["client"],
      changeReviewModeEnabled: true,
      consumeResumedDevExecuteForSession,
    });

    await sendChatMessage(state, "继续修这个问题");

    expect(consumeResumedDevExecuteForSession).toHaveBeenCalledWith("main", "继续修这个问题");
    expect(request).toHaveBeenCalledWith(
      "chat.send",
      expect.objectContaining({
        changeReviewModeEnabled: true,
        resumeDevExecute: true,
      }),
    );
  });

  it("does not consume or send resumed dev-execute when change review mode is off", async () => {
    const request = vi.fn().mockResolvedValue({});
    const consumeResumedDevExecuteForSession = vi.fn().mockReturnValue(true);
    const state = createState({
      connected: true,
      client: { request } as unknown as ChatState["client"],
      changeReviewModeEnabled: false,
      consumeResumedDevExecuteForSession,
    });

    await sendChatMessage(state, "继续修这个问题");

    expect(consumeResumedDevExecuteForSession).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith(
      "chat.send",
      expect.objectContaining({
        changeReviewModeEnabled: false,
        resumeDevExecute: false,
      }),
    );
  });

  it("stores whether dreaming assistance was applied from chat.send ack", async () => {
    const request = vi.fn().mockResolvedValue({ dreamingAssistApplied: true });
    const state = createState({
      connected: true,
      client: { request } as unknown as ChatState["client"],
      dreamingAssistEnabled: true,
      planModeEnabled: true,
      devSpecFirstEnabled: true,
      changeReviewModeEnabled: true,
    });

    const result = await sendChatMessage(state, "hello");

    expect(result).not.toBeNull();
    expect(state.dreamingAssistApplied).toBe(true);
    expect(state.dreamingAssistReason).toBeNull();
    expect(request).toHaveBeenCalledWith(
      "chat.send",
      expect.objectContaining({
        applyDreamingAssist: true,
        planModeEnabled: true,
        devSpecFirstEnabled: true,
        changeReviewModeEnabled: true,
      }),
    );
  });

  it("stores the dreaming assist reason when chat.send reports that no strategy was applied", async () => {
    const request = vi.fn().mockResolvedValue({
      dreamingAssistApplied: false,
      dreamingAssistReason: "no_strategy",
    });
    const state = createState({
      connected: true,
      client: { request } as unknown as ChatState["client"],
      dreamingAssistEnabled: true,
    });

    const result = await sendChatMessage(state, "hello");

    expect(result).not.toBeNull();
    expect(state.dreamingAssistApplied).toBe(false);
    expect(state.dreamingAssistReason).toBe("no_strategy");
  });

  it("keeps inline image data URLs out of optimistic chat messages", async () => {
    const request = vi.fn().mockResolvedValue({ runId: "run-1", status: "started" });
    const state = createState({
      connected: true,
      client: { request } as unknown as ChatState["client"],
    });
    const imageBase64 = "A".repeat(1024 * 1024);
    const imageDataUrl = `data:image/png;base64,${imageBase64}`;

    const result = await sendChatMessage(state, "", [
      {
        id: "att-image",
        dataUrl: imageDataUrl,
        mimeType: "image/png",
        fileName: "photo.png",
      },
    ]);

    expect(typeof result).toBe("string");
    expect(request).toHaveBeenCalledTimes(1);
    const firstCall = request.mock.calls[0];
    expect(firstCall?.[0]).toBe("chat.send");
    const sendParams = firstCall?.[1] as Record<string, unknown>;
    expect(sendParams.message).toBe("");
    expect(sendParams.attachments).toEqual([
      {
        type: "image",
        mimeType: "image/png",
        fileName: "photo.png",
        content: imageBase64,
      },
    ]);
    expect(state.chatMessages).toEqual([
      expect.objectContaining({
        role: "user",
        content: [{ type: "text", text: "Attached image: photo.png" }],
        timestamp: expect.any(Number),
        __openclawOptimistic: true,
      }),
    ]);
    expect(JSON.stringify(state.chatMessages)).not.toContain("data:image/png;base64");

    const captionedRequest = vi.fn().mockResolvedValue({ runId: "run-2", status: "started" });
    const captionedState = createState({
      connected: true,
      client: { request: captionedRequest } as unknown as ChatState["client"],
    });

    await expect(
      sendChatMessage(captionedState, "describe", [
        {
          id: "att-captioned-image",
          dataUrl: imageDataUrl,
          mimeType: "image/png",
          fileName: "photo.png",
        },
      ]),
    ).resolves.toEqual(expect.any(String));
    expect(captionedState.chatMessages).toEqual([
      expect.objectContaining({
        role: "user",
        content: [
          { type: "text", text: "describe" },
          { type: "text", text: "Attached image: photo.png" },
        ],
        timestamp: expect.any(Number),
      }),
    ]);
    expect(JSON.stringify(captionedState.chatMessages)).not.toContain("data:image/png;base64");
  });

  it("formats structured non-auth connect failures for chat send", async () => {
    const request = vi.fn().mockRejectedValue(
      new GatewayRequestError({
        code: "INVALID_REQUEST",
        message: "Fetch failed",
        details: { code: "CONTROL_UI_ORIGIN_NOT_ALLOWED" },
      }),
    );
    const state = createState({
      connected: true,
      client: { request } as unknown as ChatState["client"],
    });

    const result = await sendChatMessage(state, "hello");

    expect(result).toBeNull();
    expect(state.lastError).toContain("origin not allowed");
    expect(state.chatMessages.at(-1)).toMatchObject({
      role: "assistant",
      content: [
        {
          type: "text",
          text: expect.stringContaining("origin not allowed"),
        },
      ],
    });
  });
});

describe("abortChatRun", () => {
  it("uses session abort when only the refreshed session row shows an active run", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, status: "aborted" });
    const state = createState({
      connected: true,
      chatRunId: null,
      client: { request } as unknown as ChatState["client"],
    });

    const result = await abortChatRun(state);

    expect(result).toBe(true);
    expect(request).toHaveBeenCalledWith("sessions.abort", { key: "main" });
  });

  it("falls back to session abort when the local run id is already gone", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, aborted: false, runIds: [] })
      .mockResolvedValueOnce({ ok: true, status: "aborted" });
    const state = createState({
      connected: true,
      chatRunId: "run-1",
      client: { request } as unknown as ChatState["client"],
    });

    const result = await abortChatRun(state);

    expect(result).toBe(true);
    expect(request).toHaveBeenNthCalledWith(1, "chat.abort", {
      sessionKey: "main",
      runId: "run-1",
    });
    expect(request).toHaveBeenNthCalledWith(2, "sessions.abort", {
      key: "main",
      runId: "run-1",
    });
  });

  it("formats structured non-auth connect failures for chat abort", async () => {
    // Abort now shares the same structured connect-error formatter as send.
    const request = vi.fn().mockRejectedValue(
      new GatewayRequestError({
        code: "INVALID_REQUEST",
        message: "Fetch failed",
        details: { code: "CONTROL_UI_DEVICE_IDENTITY_REQUIRED" },
      }),
    );
    const state = createState({
      connected: true,
      chatRunId: "run-1",
      client: { request } as unknown as ChatState["client"],
    });

    const result = await abortChatRun(state);

    expect(result).toBe(false);
    expect(request).toHaveBeenCalledWith("chat.abort", {
      sessionKey: "main",
      runId: "run-1",
    });
    expect(state.lastError).toContain("device identity required");
  });
});

describe("loadChatHistory", () => {
  it("retries retryable startup unavailability before showing history", async () => {
    vi.useFakeTimers();
    try {
      const request = vi
        .fn()
        .mockRejectedValueOnce(
          new GatewayRequestError({
            code: "UNAVAILABLE",
            message: "chat.history unavailable during gateway startup",
            details: { method: "chat.history" },
            retryable: true,
            retryAfterMs: 250,
          }),
        )
        .mockResolvedValueOnce({
          messages: [{ role: "assistant", content: [{ type: "text", text: "awake" }] }],
          thinkingLevel: "low",
        });
      const state = createState({
        connected: true,
        client: { request } as unknown as ChatState["client"],
      });

      const load = loadChatHistory(state);
      await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
      expect(state.chatLoading).toBe(true);
      expect(state.lastError).toBeNull();

      await vi.advanceTimersByTimeAsync(250);
      await load;

      expect(request).toHaveBeenCalledTimes(2);
      expect(state.chatMessages).toEqual([
        { role: "assistant", content: [{ type: "text", text: "awake" }] },
      ]);
      expect(state.chatThinkingLevel).toBe("low");
      expect(state.chatLoading).toBe(false);
      expect(state.lastError).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("filters assistant NO_REPLY messages and keeps user NO_REPLY messages", async () => {
    const request = vi.fn().mockResolvedValue({
      messages: [
        { role: "assistant", content: [{ type: "text", text: "NO_REPLY" }] },
        { role: "assistant", content: [{ type: "text", text: "visible answer" }] },
        { role: "user", content: [{ type: "text", text: "NO_REPLY" }] },
      ],
      thinkingLevel: "low",
    });
    const state = createState({
      connected: true,
      client: { request } as unknown as ChatState["client"],
    });

    await loadChatHistory(state);

    expect(request).toHaveBeenCalledWith("chat.history", {
      sessionKey: "main",
      limit: 200,
    });
    expect(state.chatMessages).toEqual([
      { role: "assistant", content: [{ type: "text", text: "visible answer" }] },
      { role: "user", content: [{ type: "text", text: "NO_REPLY" }] },
    ]);
    expect(state.chatThinkingLevel).toBe("low");
    expect(state.chatLoading).toBe(false);
    expect(state.lastError).toBeNull();
  });

  it("shows a targeted message when chat history is unauthorized", async () => {
    const request = vi.fn().mockRejectedValue(
      new GatewayRequestError({
        code: "PERMISSION_DENIED",
        message: "not allowed",
        details: { code: "AUTH_UNAUTHORIZED" },
      }),
    );
    const state = createState({
      connected: true,
      client: { request } as unknown as ChatState["client"],
      chatMessages: [{ role: "assistant", content: [{ type: "text", text: "old" }] }],
      chatThinkingLevel: "high",
    });

    await loadChatHistory(state);

    expect(state.chatMessages).toEqual([]);
    expect(state.chatThinkingLevel).toBeNull();
    expect(state.lastError).toContain("operator.read");
    expect(state.chatLoading).toBe(false);
  });

  it("ignores stale history responses after switching sessions", async () => {
    const mainRequest = createDeferred<{ messages: Array<unknown>; thinkingLevel?: string }>();
    const otherRequest = createDeferred<{ messages: Array<unknown>; thinkingLevel?: string }>();
    const request = vi.fn((_method: string, params?: { sessionKey?: string }) => {
      if (params?.sessionKey === "main") {
        return mainRequest.promise;
      }
      if (params?.sessionKey === "other") {
        return otherRequest.promise;
      }
      throw new Error(`Unexpected sessionKey: ${String(params?.sessionKey)}`);
    });
    const state = createState({
      connected: true,
      client: { request } as unknown as ChatState["client"],
      chatMessages: [{ role: "assistant", content: [{ type: "text", text: "visible old" }] }],
    });

    const firstLoad = loadChatHistory(state);
    state.sessionKey = "other";
    const secondLoad = loadChatHistory(state);

    mainRequest.resolve({
      messages: [{ role: "assistant", content: [{ type: "text", text: "main history" }] }],
      thinkingLevel: "high",
    });
    await firstLoad;

    expect(state.chatLoading).toBe(true);
    expect(state.chatMessages).toEqual([
      { role: "assistant", content: [{ type: "text", text: "visible old" }] },
    ]);
    expect(state.chatThinkingLevel).toBeNull();

    otherRequest.resolve({
      messages: [{ role: "assistant", content: [{ type: "text", text: "other history" }] }],
      thinkingLevel: "low",
    });
    await secondLoad;

    expect(state.chatLoading).toBe(false);
    expect(state.chatMessages).toEqual([
      { role: "assistant", content: [{ type: "text", text: "other history" }] },
    ]);
    expect(state.chatThinkingLevel).toBe("low");
  });

  it("refreshes change review status after loading history for the active session", async () => {
    const request = vi.fn().mockResolvedValue({
      messages: [{ role: "assistant", content: [{ type: "text", text: "history" }] }],
      thinkingLevel: "low",
    });
    const loadChangeReviewStatus = vi.fn().mockResolvedValue(undefined);
    const state = createState({
      connected: true,
      client: { request } as unknown as ChatState["client"],
      loadChangeReviewStatus,
    });

    await loadChatHistory(state);

    expect(loadChangeReviewStatus).toHaveBeenCalledWith("main");
  });
});
