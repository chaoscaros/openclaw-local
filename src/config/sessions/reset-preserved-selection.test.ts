import { describe, expect, it } from "vitest";
import type { SessionEntry } from "./types.js";
import { resolveResetPreservedSelection } from "./reset-preserved-selection.js";

function makeEntry(overrides: Partial<SessionEntry> = {}): SessionEntry {
  return {
    sessionId: "s1",
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("resolveResetPreservedSelection", () => {
  it("preserves explicit user model and auth overrides across reset", () => {
    const entry = makeEntry({
      providerOverride: "openai",
      modelOverride: "gpt-5.4",
      modelOverrideSource: "user",
      authProfileOverride: "openai:default",
      authProfileOverrideSource: "user",
      authProfileOverrideCompactionCount: 3,
    });

    expect(resolveResetPreservedSelection({ entry })).toEqual({
      providerOverride: "openai",
      modelOverride: "gpt-5.4",
      modelOverrideSource: "user",
      authProfileOverride: "openai:default",
      authProfileOverrideSource: "user",
      authProfileOverrideCompactionCount: 3,
    });
  });

  it("drops auto-sourced overrides on reset", () => {
    const entry = makeEntry({
      providerOverride: "openai-codex",
      modelOverride: "gpt-5.5-mini",
      modelOverrideSource: "auto",
      authProfileOverride: "anthropic:rotated",
      authProfileOverrideSource: "auto",
    });

    expect(resolveResetPreservedSelection({ entry })).toEqual({});
  });

  it("preserves legacy model overrides without a source field", () => {
    const entry = makeEntry({
      providerOverride: "anthropic",
      modelOverride: "claude-sonnet-4",
    });

    expect(resolveResetPreservedSelection({ entry })).toEqual({
      providerOverride: "anthropic",
      modelOverride: "claude-sonnet-4",
      modelOverrideSource: "user",
    });
  });
});
