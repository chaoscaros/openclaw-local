import { describe, expect, it } from "vitest";
import {
  createBlockReplyContentKey,
  createBlockReplyPayloadKey,
  createBlockReplyPipeline,
} from "./block-reply-pipeline.js";

describe("createBlockReplyPayloadKey", () => {
  it("produces different keys for payloads differing only by replyToId", () => {
    const a = createBlockReplyPayloadKey({ text: "hello world", replyToId: "post-1" });
    const b = createBlockReplyPayloadKey({ text: "hello world", replyToId: "post-2" });
    const c = createBlockReplyPayloadKey({ text: "hello world" });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it("produces different keys for payloads with different text", () => {
    const a = createBlockReplyPayloadKey({ text: "hello" });
    const b = createBlockReplyPayloadKey({ text: "world" });
    expect(a).not.toBe(b);
  });

  it("produces different keys for payloads with different media", () => {
    const a = createBlockReplyPayloadKey({ text: "hello", mediaUrl: "file:///a.png" });
    const b = createBlockReplyPayloadKey({ text: "hello", mediaUrl: "file:///b.png" });
    expect(a).not.toBe(b);
  });

  it("produces different keys for payloads with different rich content", () => {
    const a = createBlockReplyPayloadKey({
      interactive: {
        blocks: [{ type: "buttons", buttons: [{ label: "Approve", value: "approve" }] }],
      },
    });
    const b = createBlockReplyPayloadKey({
      interactive: {
        blocks: [{ type: "buttons", buttons: [{ label: "Reject", value: "reject" }] }],
      },
    });
    expect(a).not.toBe(b);
  });

  it("trims whitespace from text for key comparison", () => {
    const a = createBlockReplyPayloadKey({ text: "  hello  " });
    const b = createBlockReplyPayloadKey({ text: "hello" });
    expect(a).toBe(b);
  });

  it("produces different keys for status notices and answer content", () => {
    const status = createBlockReplyPayloadKey({ text: "working", isStatusNotice: true });
    const answer = createBlockReplyPayloadKey({ text: "working" });
    expect(status).not.toBe(answer);
  });
});

describe("createBlockReplyContentKey", () => {
  it("produces the same key for payloads differing only by replyToId", () => {
    const a = createBlockReplyContentKey({ text: "hello world", replyToId: "post-1" });
    const b = createBlockReplyContentKey({ text: "hello world", replyToId: "post-2" });
    const c = createBlockReplyContentKey({ text: "hello world" });
    expect(a).toBe(b);
    expect(a).toBe(c);
  });
});

describe("createBlockReplyPipeline dedup with threading", () => {
  it("keeps separate deliveries for same text with different replyToId", async () => {
    const sent: Array<{ text?: string; replyToId?: string }> = [];
    const pipeline = createBlockReplyPipeline({
      onBlockReply: async (payload) => {
        sent.push({ text: payload.text, replyToId: payload.replyToId });
      },
      timeoutMs: 5000,
    });

    pipeline.enqueue({ text: "response text", replyToId: "thread-root-1" });
    pipeline.enqueue({ text: "response text", replyToId: undefined });
    await pipeline.flush();

    expect(sent).toEqual([
      { text: "response text", replyToId: "thread-root-1" },
      { text: "response text", replyToId: undefined },
    ]);
  });

  it("hasSentPayload matches regardless of replyToId", async () => {
    const pipeline = createBlockReplyPipeline({
      onBlockReply: async () => {},
      timeoutMs: 5000,
    });

    pipeline.enqueue({ text: "response text", replyToId: "thread-root-1" });
    await pipeline.flush();

    // Final payload with no replyToId should be recognized as already sent
    expect(pipeline.hasSentPayload({ text: "response text" })).toBe(true);
    expect(pipeline.hasSentPayload({ text: "response text", replyToId: "other-id" })).toBe(true);
  });

  it("bypasses text coalescing for rich-only payloads", async () => {
    const sent: Array<{ interactive?: unknown }> = [];
    const pipeline = createBlockReplyPipeline({
      onBlockReply: async (payload) => {
        sent.push({ interactive: payload.interactive });
      },
      timeoutMs: 5000,
      coalescing: {
        minChars: 1,
        maxChars: 200,
        idleMs: 0,
        joiner: "\n\n",
      },
    });

    const interactive = {
      blocks: [{ type: "buttons" as const, buttons: [{ label: "Open", value: "open" }] }],
    };

    pipeline.enqueue({ interactive });
    await pipeline.flush({ force: true });

    expect(sent).toEqual([{ interactive }]);
  });

  it("does not treat status notices as streamed answer content", async () => {
    const sent: Array<{ text?: string; isStatusNotice?: boolean }> = [];
    const pipeline = createBlockReplyPipeline({
      onBlockReply: async (payload) => {
        sent.push({ text: payload.text, isStatusNotice: payload.isStatusNotice });
      },
      timeoutMs: 5000,
    });

    pipeline.enqueue({ text: "working", isStatusNotice: true });
    await pipeline.flush();

    expect(sent).toEqual([{ text: "working", isStatusNotice: true }]);
    expect(pipeline.didStream()).toBe(false);
    expect(pipeline.hasSentPayload({ text: "working" })).toBe(false);
  });

  it("keeps status notices separate from answer text during coalescing", async () => {
    const sent: Array<{ text?: string; isStatusNotice?: boolean }> = [];
    const pipeline = createBlockReplyPipeline({
      onBlockReply: async (payload) => {
        sent.push({ text: payload.text, isStatusNotice: payload.isStatusNotice });
      },
      timeoutMs: 5000,
      coalescing: {
        minChars: 1,
        maxChars: 200,
        idleMs: 0,
        joiner: "\n",
      },
    });

    pipeline.enqueue({ text: "working", isStatusNotice: true });
    pipeline.enqueue({ text: "final answer" });
    await pipeline.flush({ force: true });

    expect(sent).toEqual([
      { text: "working", isStatusNotice: true },
      { text: "final answer", isStatusNotice: undefined },
    ]);
    expect(pipeline.didStream()).toBe(true);
    expect(pipeline.hasSentPayload({ text: "final answer" })).toBe(true);
  });
});
