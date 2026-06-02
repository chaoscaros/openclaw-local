import { describe, expect, it } from "vitest";
import { parseLogLine } from "./logs.ts";

describe("parseLogLine", () => {
  it("prefers the human-readable message field when structured data is stored in slot 1", () => {
    const line = JSON.stringify({
      0: '{"subsystem":"gateway/ws"}',
      1: {
        cause: "unauthorized",
        authReason: "password_missing",
      },
      2: "closed before connect conn=abc code=4008 reason=connect failed",
      _meta: {
        date: "2026-03-13T19:07:12.128Z",
        logLevelName: "WARN",
      },
      time: "2026-03-13T14:07:12.138-05:00",
    });

    expect(parseLogLine(line)).toEqual(
      expect.objectContaining({
        level: "warn",
        subsystem: "gateway/ws",
        message: "closed before connect conn=abc code=4008 reason=connect failed",
      }),
    );
  });

  it("strips ANSI escape sequences from rendered log fields", () => {
    const parsed = parseLogLine(
      JSON.stringify({
        "0": "\u001b[36mgateway\u001b[39m",
        "1": "\u001b[31mfailed\u001b[39m to start",
        _meta: { logLevelName: "error" },
      }),
    );

    expect(parsed.subsystem).toBe("gateway");
    expect(parsed.message).toBe("failed to start");
    expect(parsed.raw).toContain("\\u001b");
  });

  it("strips ANSI escape sequences from plain log lines", () => {
    expect(parseLogLine("\u001b[33mwarning\u001b[39m").message).toBe("warning");
  });

  it("strips OSC hyperlink escape payloads from displayed log fields", () => {
    const link = "\u001b]8;;https://example.test\u0007docs\u001b]8;;\u0007";

    expect(parseLogLine(`${link} ready`).message).toBe("docs ready");
  });
});
