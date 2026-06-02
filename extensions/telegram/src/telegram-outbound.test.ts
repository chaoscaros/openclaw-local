import { chunkMarkdownText } from "openclaw/plugin-sdk/reply-runtime";
import { describe, expect, it } from "vitest";
import { telegramOutbound } from "./outbound-adapter.js";
import { telegramOutboundBaseAdapter } from "./outbound-base.js";
import { clearTelegramRuntime } from "./runtime.js";

describe("telegramPlugin outbound", () => {
  it("uses static chunking when Telegram runtime is uninitialized", () => {
    clearTelegramRuntime();
    const text = `${"hello\n".repeat(1200)}tail`;
    const expected = chunkMarkdownText(text, 4000);

    expect(telegramOutboundBaseAdapter.chunker(text, 4000)).toEqual(expected);
    expect(telegramOutboundBaseAdapter.deliveryMode).toBe("direct");
    expect(telegramOutboundBaseAdapter.chunkerMode).toBe("markdown");
    expect(telegramOutboundBaseAdapter.textChunkLimit).toBe(4000);
  });

  it("passes markdown table mode to the outbound markdown chunker", () => {
    clearTelegramRuntime();
    const text = ["| Name | Value |", "|------|-------|", "| A | 1 |"].join("\n");

    const chunks = telegramOutbound.chunker?.(text, 4000, {
      formatting: { tableMode: "bullets" },
    });

    expect(chunks?.join("\n")).toContain("Value: 1");
    expect(chunks?.join("\n")).not.toContain("| Name | Value |");
  });
});
