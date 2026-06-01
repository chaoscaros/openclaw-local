import { describe, expect, it } from "vitest";
import { includesSystemEventToken } from "./dreaming-shared.js";

const TOKEN = "__openclaw_memory_core_short_term_promotion_dream__";

describe("includesSystemEventToken", () => {
  it("matches the bare token", () => {
    expect(includesSystemEventToken(TOKEN, TOKEN)).toBe(true);
  });

  it("matches a token wrapped by an isolated-cron prefix", () => {
    expect(includesSystemEventToken(`[cron:abc-123] ${TOKEN}`, TOKEN)).toBe(true);
  });

  it("matches the token on its own line within multiline content", () => {
    expect(includesSystemEventToken(`leading text\n${TOKEN}\ntrailing`, TOKEN)).toBe(true);
  });

  it("does not match a user message that merely embeds the token mid-sentence", () => {
    expect(includesSystemEventToken(`please tell me about ${TOKEN} later`, TOKEN)).toBe(false);
  });

  it("does not match arbitrary wrappers the runtime does not produce", () => {
    expect(includesSystemEventToken(`[somewrap] ${TOKEN}`, TOKEN)).toBe(false);
  });

  it("returns false for empty inputs", () => {
    expect(includesSystemEventToken("", TOKEN)).toBe(false);
    expect(includesSystemEventToken(TOKEN, "")).toBe(false);
    expect(includesSystemEventToken("   ", TOKEN)).toBe(false);
  });
});
