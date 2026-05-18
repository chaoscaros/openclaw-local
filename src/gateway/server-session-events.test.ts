import { describe, expect, it, vi } from "vitest";

vi.mock("./session-utils.js", () => ({
  attachOpenClawTranscriptMeta: (message: unknown, meta: Record<string, unknown>) => {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      return message;
    }
    return { ...message, __openclaw: meta };
  },
  loadGatewaySessionRow: () => ({
    sessionId: "sess-hidden-runtime",
    updatedAt: 1,
  }),
  loadSessionEntry: () => ({
    entry: {
      sessionId: "sess-hidden-runtime",
    },
    storePath: "/tmp/openclaw-sessions.json",
  }),
  readSessionMessages: () => [
    {
      role: "custom",
      customType: "openclaw.runtime-context",
      content: "secret runtime context",
      display: false,
    },
  ],
}));

const { createTranscriptUpdateBroadcastHandler } = await import("./server-session-events.js");

describe("createTranscriptUpdateBroadcastHandler", () => {
  it("does not broadcast hidden runtime-context custom messages as live chat messages", () => {
    const broadcastToConnIds = vi.fn();
    const handler = createTranscriptUpdateBroadcastHandler({
      broadcastToConnIds,
      sessionEventSubscribers: {
        getAll: () => new Set(["operator"]),
      },
      sessionMessageSubscribers: {
        get: () => new Set(["chat"]),
      },
    });

    handler({
      sessionFile: "/tmp/sess-hidden-runtime.jsonl",
      sessionKey: "agent:main:hidden-runtime",
      messageId: "runtime-context-1",
      message: {
        role: "custom",
        customType: "openclaw.runtime-context",
        content: "secret runtime context",
        display: false,
      },
    });

    expect(broadcastToConnIds).toHaveBeenCalledTimes(1);
    expect(broadcastToConnIds.mock.calls[0]?.[0]).toBe("sessions.changed");
    expect(broadcastToConnIds.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        sessionKey: "agent:main:hidden-runtime",
        phase: "message",
        messageId: "runtime-context-1",
        messageSeq: 1,
      }),
    );
  });
});
