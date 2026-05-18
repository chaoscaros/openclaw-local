import { describe, expect, it } from "vitest";
import {
  resolveTelegramRequestTimeoutMs,
  resolveTelegramStartupProbeTimeoutMs,
} from "./request-timeouts.js";

describe("resolveTelegramRequestTimeoutMs", () => {
  it("bounds Telegram startup control-plane methods", () => {
    expect(resolveTelegramRequestTimeoutMs("deletemycommands")).toBe(15_000);
    expect(resolveTelegramRequestTimeoutMs("deletewebhook")).toBe(15_000);
    expect(resolveTelegramRequestTimeoutMs("editforumtopic")).toBe(15_000);
    expect(resolveTelegramRequestTimeoutMs("getme")).toBe(15_000);
    expect(resolveTelegramRequestTimeoutMs("pinchatmessage")).toBe(15_000);
    expect(resolveTelegramRequestTimeoutMs("setmycommands")).toBe(15_000);
    expect(resolveTelegramRequestTimeoutMs("setwebhook")).toBe(15_000);
  });

  it("keeps the longer polling timeout for getUpdates", () => {
    expect(resolveTelegramRequestTimeoutMs("getupdates")).toBe(45_000);
  });

  it("does not assign hard timeouts to unrelated Telegram methods", () => {
    expect(resolveTelegramRequestTimeoutMs("answercallbackquery")).toBeUndefined();
    expect(resolveTelegramRequestTimeoutMs(null)).toBeUndefined();
  });

  it("honors configured outbound timeouts without shortening safe defaults", () => {
    expect(resolveTelegramRequestTimeoutMs("sendmessage", 10)).toBe(60_000);
    expect(resolveTelegramRequestTimeoutMs("sendmessage", 90)).toBe(90_000);
    expect(resolveTelegramRequestTimeoutMs("sendmessagedraft", 10)).toBe(60_000);
  });

  it("uses the longer configured timeout for startup probes", () => {
    expect(resolveTelegramStartupProbeTimeoutMs(undefined)).toBe(15_000);
    expect(resolveTelegramStartupProbeTimeoutMs(2)).toBe(15_000);
    expect(resolveTelegramStartupProbeTimeoutMs(30)).toBe(30_000);
  });
});
