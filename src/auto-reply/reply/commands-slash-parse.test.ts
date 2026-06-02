import { describe, expect, it } from "vitest";
import { parseSlashCommandOrNull } from "./commands-slash-parse.js";

describe("parseSlashCommandOrNull", () => {
  const opts = { invalidMessage: "invalid" };

  it("returns null when the input does not start with the slash prefix", () => {
    expect(parseSlashCommandOrNull("hello world", "/config", opts)).toBeNull();
  });

  it("parses action and args when the input has a clean word boundary", () => {
    const result = parseSlashCommandOrNull("/config show enabled", "/config", opts);
    expect(result).toEqual({ ok: true, action: "show", args: "enabled" });
  });

  it("returns the default action on an empty body", () => {
    const result = parseSlashCommandOrNull("/config", "/config", {
      ...opts,
      defaultAction: "show",
    });
    expect(result).toEqual({ ok: true, action: "show", args: "" });
  });

  it("does not match a longer command name with a hyphen tail", () => {
    expect(parseSlashCommandOrNull("/config-check arg1 arg2", "/config", opts)).toBeNull();
  });

  it("does not match a longer command name with no whitespace after prefix", () => {
    expect(parseSlashCommandOrNull("/configfoo", "/config", opts)).toBeNull();
  });

  it("does not match when prefix sits in the middle of a longer word", () => {
    expect(parseSlashCommandOrNull("/modelsy", "/models", opts)).toBeNull();
  });

  it("still matches when the boundary is a colon", () => {
    const result = parseSlashCommandOrNull("/config:json", "/config", opts);
    expect(result?.ok).toBe(true);
  });

  it("still matches the exact prefix with leading whitespace", () => {
    const result = parseSlashCommandOrNull("  /config show ", "/config", opts);
    expect(result).toEqual({ ok: true, action: "show", args: "" });
  });
});
