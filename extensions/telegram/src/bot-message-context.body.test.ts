import { describe, expect, it, vi } from "vitest";
import { normalizeAllowFrom } from "./bot-access.js";

const { transcribeFirstAudioMock, triggerInternalHookMock } = vi.hoisted(() => ({
  transcribeFirstAudioMock: vi.fn(),
  triggerInternalHookMock: vi.fn<(event: unknown) => Promise<void>>(async () => undefined),
}));

vi.mock("./media-understanding.runtime.js", () => ({
  transcribeFirstAudio: (...args: unknown[]) => transcribeFirstAudioMock(...args),
}));

vi.mock("openclaw/plugin-sdk/hook-runtime", async () => {
  const actual = await vi.importActual<typeof import("openclaw/plugin-sdk/hook-runtime")>(
    "openclaw/plugin-sdk/hook-runtime",
  );
  return {
    ...actual,
    fireAndForgetHook: (promise: Promise<unknown>) => {
      void promise;
    },
    triggerInternalHook: (event: unknown) => triggerInternalHookMock(event),
  };
});

const { resolveTelegramInboundBody } = await import("./bot-message-context.body.js");

function transcribeCallContext() {
  return transcribeFirstAudioMock.mock.calls.at(-1)?.[0] as
    | { ctx?: Record<string, unknown> }
    | undefined;
}

describe("resolveTelegramInboundBody", () => {
  it("keeps the media marker when a captioned video has no downloaded media", async () => {
    const result = await resolveTelegramInboundBody({
      cfg: {
        channels: { telegram: {} },
      } as never,
      primaryCtx: {
        me: { id: 7, username: "bot" },
      } as never,
      msg: {
        message_id: 0,
        date: 1_700_000_000,
        chat: { id: 42, type: "private", first_name: "Pat" },
        from: { id: 42, first_name: "Pat" },
        caption: "episode caption",
        video: {
          file_id: "video-1",
          file_unique_id: "video-u1",
          duration: 10,
          width: 320,
          height: 240,
        },
      } as never,
      allMedia: [],
      isGroup: false,
      chatId: 42,
      senderId: "42",
      senderUsername: "",
      routeAgentId: undefined,
      effectiveGroupAllow: normalizeAllowFrom([]),
      effectiveDmAllow: normalizeAllowFrom([]),
      groupConfig: undefined,
      topicConfig: undefined,
      requireMention: false,
      options: undefined,
      groupHistories: new Map(),
      historyLimit: 0,
      logger: { info: vi.fn() },
    });

    expect(result).toMatchObject({
      rawBody: "episode caption",
      bodyText: "<media:video> [file_id:video-1]\nepisode caption",
    });
  });

  it("lets catch-all mention patterns activate captionless group photos", async () => {
    const logger = { info: vi.fn() };

    const result = await resolveTelegramInboundBody({
      cfg: {
        channels: { telegram: {} },
        messages: { groupChat: { mentionPatterns: [".*"] } },
      } as never,
      primaryCtx: {
        me: { id: 7, username: "bot" },
      } as never,
      msg: {
        message_id: 6,
        date: 1_700_000_006,
        chat: { id: -1001234567890, type: "supergroup", title: "Test Group" },
        from: { id: 46, first_name: "Eve" },
        photo: [{ file_id: "photo-4", file_unique_id: "photo-u4", width: 120, height: 80 }],
        entities: [],
      } as never,
      allMedia: [{ path: "/tmp/photo.webp", contentType: "image/webp" }],
      isGroup: true,
      chatId: -1001234567890,
      senderId: "46",
      senderUsername: "",
      routeAgentId: undefined,
      effectiveGroupAllow: normalizeAllowFrom([]),
      effectiveDmAllow: normalizeAllowFrom([]),
      groupConfig: { requireMention: true } as never,
      topicConfig: undefined,
      requireMention: true,
      options: undefined,
      groupHistories: new Map(),
      historyLimit: 0,
      logger,
    });

    expect(logger.info).not.toHaveBeenCalled();
    expect(result?.rawBody).toBe("<media:image>");
    expect(result?.bodyText).toBe("<media:image>");
    expect(result?.effectiveWasMentioned).toBe(true);
  });

  it("keeps captionless group photos quiet for nonmatching mention patterns", async () => {
    const logger = { info: vi.fn() };

    const result = await resolveTelegramInboundBody({
      cfg: {
        channels: { telegram: {} },
        messages: { groupChat: { mentionPatterns: ["\\bbot\\b"] } },
      } as never,
      primaryCtx: {
        me: { id: 7, username: "bot" },
      } as never,
      msg: {
        message_id: 7,
        date: 1_700_000_007,
        chat: { id: -1001234567890, type: "supergroup", title: "Test Group" },
        from: { id: 46, first_name: "Eve" },
        photo: [{ file_id: "photo-5", file_unique_id: "photo-u5", width: 120, height: 80 }],
        entities: [],
      } as never,
      allMedia: [{ path: "/tmp/photo.webp", contentType: "image/webp" }],
      isGroup: true,
      chatId: -1001234567890,
      senderId: "46",
      senderUsername: "",
      routeAgentId: undefined,
      effectiveGroupAllow: normalizeAllowFrom([]),
      effectiveDmAllow: normalizeAllowFrom([]),
      groupConfig: { requireMention: true } as never,
      topicConfig: undefined,
      requireMention: true,
      options: undefined,
      groupHistories: new Map(),
      historyLimit: 0,
      logger,
    });

    expect(logger.info).toHaveBeenCalledWith(
      { chatId: -1001234567890, reason: "no-mention" },
      "skipping group message",
    );
    expect(result).toBeNull();
  });

  it("does not transcribe group audio for unauthorized senders", async () => {
    transcribeFirstAudioMock.mockReset();
    const logger = { info: vi.fn() };

    const result = await resolveTelegramInboundBody({
      cfg: {
        channels: { telegram: {} },
        messages: { groupChat: { mentionPatterns: ["\\bbot\\b"] } },
      } as never,
      primaryCtx: {
        me: { id: 7, username: "bot" },
      } as never,
      msg: {
        message_id: 1,
        date: 1_700_000_000,
        chat: { id: -1001234567890, type: "supergroup", title: "Test Group" },
        from: { id: 46, first_name: "Eve" },
        voice: { file_id: "voice-1" },
        entities: [],
      } as never,
      allMedia: [{ path: "/tmp/voice.ogg", contentType: "audio/ogg" }],
      isGroup: true,
      chatId: -1001234567890,
      senderId: "46",
      senderUsername: "",
      routeAgentId: undefined,
      effectiveGroupAllow: normalizeAllowFrom(["999"]),
      effectiveDmAllow: normalizeAllowFrom([]),
      groupConfig: { requireMention: true } as never,
      topicConfig: undefined,
      requireMention: true,
      options: undefined,
      groupHistories: new Map(),
      historyLimit: 0,
      logger,
    });

    expect(transcribeFirstAudioMock).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      { chatId: -1001234567890, reason: "no-mention" },
      "skipping group message",
    );
    expect(result).toBeNull();
  });

  it("still transcribes when commands.useAccessGroups is false", async () => {
    transcribeFirstAudioMock.mockReset();
    transcribeFirstAudioMock.mockResolvedValueOnce("hey bot please help");

    const result = await resolveTelegramInboundBody({
      cfg: {
        channels: { telegram: {} },
        commands: { useAccessGroups: false },
        messages: { groupChat: { mentionPatterns: ["\\bbot\\b"] } },
        tools: { media: { audio: { enabled: true } } },
      } as never,
      primaryCtx: {
        me: { id: 7, username: "bot" },
      } as never,
      msg: {
        message_id: 2,
        date: 1_700_000_001,
        chat: { id: -1001234567891, type: "supergroup", title: "Test Group" },
        from: { id: 46, first_name: "Eve" },
        voice: { file_id: "voice-2" },
        entities: [],
      } as never,
      allMedia: [{ path: "/tmp/voice-2.ogg", contentType: "audio/ogg" }],
      isGroup: true,
      chatId: -1001234567891,
      senderId: "46",
      senderUsername: "",
      routeAgentId: undefined,
      effectiveGroupAllow: normalizeAllowFrom(["999"]),
      effectiveDmAllow: normalizeAllowFrom([]),
      groupConfig: { requireMention: true } as never,
      topicConfig: undefined,
      requireMention: true,
      options: undefined,
      groupHistories: new Map(),
      historyLimit: 0,
      logger: { info: vi.fn() },
    });

    expect(transcribeFirstAudioMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      bodyText: "hey bot please help",
      effectiveWasMentioned: true,
    });
  });

  it("transcribes DM voice notes via preflight (not only groups)", async () => {
    transcribeFirstAudioMock.mockReset();
    transcribeFirstAudioMock.mockResolvedValueOnce("hello from a voice note");

    const result = await resolveTelegramInboundBody({
      cfg: {
        channels: { telegram: {} },
        tools: { media: { audio: { enabled: true } } },
      } as never,
      primaryCtx: {
        me: { id: 7, username: "bot" },
      } as never,
      msg: {
        message_id: 10,
        date: 1_700_000_010,
        chat: { id: 42, type: "private", first_name: "Pat" },
        from: { id: 42, first_name: "Pat" },
        voice: { file_id: "voice-dm-1" },
        entities: [],
      } as never,
      allMedia: [{ path: "/tmp/voice-dm.ogg", contentType: "audio/ogg" }],
      isGroup: false,
      chatId: 42,
      senderId: "42",
      senderUsername: "",
      routeAgentId: undefined,
      effectiveGroupAllow: normalizeAllowFrom([]),
      effectiveDmAllow: normalizeAllowFrom([]),
      groupConfig: undefined,
      topicConfig: undefined,
      requireMention: false,
      options: undefined,
      groupHistories: new Map(),
      historyLimit: 0,
      logger: { info: vi.fn() },
    });

    expect(transcribeFirstAudioMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      bodyText: "hello from a voice note",
    });
    expect(result?.bodyText).not.toContain("<media:audio>");
  });

  it("preserves forum topic origin targets in audio preflight context", async () => {
    transcribeFirstAudioMock.mockReset();
    transcribeFirstAudioMock.mockResolvedValueOnce("topic audio");

    await resolveTelegramInboundBody({
      cfg: {
        channels: { telegram: {} },
        commands: { useAccessGroups: false },
        messages: { groupChat: { mentionPatterns: ["\\bbot\\b"] } },
        tools: { media: { audio: { enabled: true, echoTranscript: true } } },
      } as never,
      primaryCtx: {
        me: { id: 7, username: "bot" },
      } as never,
      msg: {
        message_id: 13,
        message_thread_id: 99,
        date: 1_700_000_013,
        chat: { id: -1001234567890, type: "supergroup", title: "Test Forum", is_forum: true },
        from: { id: 46, first_name: "Eve" },
        voice: { file_id: "voice-forum-topic-1" },
        entities: [],
      } as never,
      allMedia: [{ path: "/tmp/voice-forum-topic.ogg", contentType: "audio/ogg" }],
      isGroup: true,
      chatId: -1001234567890,
      accountId: "primary",
      senderId: "46",
      senderUsername: "",
      resolvedThreadId: 99,
      replyThreadId: 99,
      originatingTo: "telegram:-1001234567890:topic:99",
      routeAgentId: undefined,
      effectiveGroupAllow: normalizeAllowFrom([]),
      effectiveDmAllow: normalizeAllowFrom([]),
      groupConfig: { requireMention: true } as never,
      topicConfig: undefined,
      requireMention: true,
      options: undefined,
      groupHistories: new Map(),
      historyLimit: 0,
      logger: { info: vi.fn() },
    });

    const call = transcribeCallContext();
    expect(call?.ctx?.OriginatingTo).toBe("telegram:-1001234567890:topic:99");
    expect(call?.ctx?.MessageThreadId).toBe(99);
  });

  it("preserves forum topic origin targets for skipped-message hooks", async () => {
    triggerInternalHookMock.mockClear();

    const result = await resolveTelegramInboundBody({
      cfg: {
        channels: { telegram: {} },
        messages: { groupChat: { mentionPatterns: ["\\bbot\\b"] } },
      } as never,
      primaryCtx: {
        me: { id: 7, username: "bot" },
      } as never,
      msg: {
        message_id: 14,
        message_thread_id: 99,
        date: 1_700_000_014,
        chat: { id: -1001234567890, type: "supergroup", title: "Test Forum", is_forum: true },
        from: { id: 46, first_name: "Eve" },
        text: "ambient chatter",
        entities: [],
      } as never,
      allMedia: [],
      isGroup: true,
      chatId: -1001234567890,
      accountId: "primary",
      senderId: "46",
      senderUsername: "",
      sessionKey: "agent:main:telegram:group:-1001234567890:topic:99",
      resolvedThreadId: 99,
      replyThreadId: 99,
      originatingTo: "telegram:-1001234567890:topic:99",
      routeAgentId: undefined,
      effectiveGroupAllow: normalizeAllowFrom([]),
      effectiveDmAllow: normalizeAllowFrom([]),
      groupConfig: { requireMention: true } as never,
      topicConfig: { ingest: true } as never,
      requireMention: true,
      options: undefined,
      groupHistories: new Map(),
      historyLimit: 0,
      logger: { info: vi.fn() },
    });

    expect(result).toBeNull();
    const event = triggerInternalHookMock.mock.calls[0]?.[0] as
      | { context?: { conversationId?: string; metadata?: Record<string, unknown> } }
      | undefined;
    expect(event?.context).toEqual(
      expect.objectContaining({
        conversationId: "telegram:-1001234567890:topic:99",
      }),
    );
    expect(event?.context?.metadata).toEqual(
      expect.objectContaining({
        threadId: 99,
        to: "telegram:-1001234567890:topic:99",
      }),
    );
    expect(triggerInternalHookMock).toHaveBeenCalledOnce();
  });
});
