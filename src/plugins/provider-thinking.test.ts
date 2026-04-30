import { afterEach, describe, expect, it } from "vitest";
import {
  resolveProviderBinaryThinking,
  resolveProviderDefaultThinkingLevel,
  resolveProviderThinkingProfile,
  resolveProviderXHighThinking,
} from "./provider-thinking.js";

const STATE_KEY = Symbol.for("openclaw.pluginRegistryState");

afterEach(() => {
  delete (globalThis as typeof globalThis & Record<PropertyKey, unknown>)[STATE_KEY];
});

describe("plugins/provider-thinking", () => {
  it("resolves provider thinking hooks through aliases", () => {
    (globalThis as typeof globalThis & Record<PropertyKey, unknown>)[STATE_KEY] = {
      activeRegistry: {
        providers: [
          {
            provider: {
              id: "openai-codex",
              aliases: ["openai"],
              isBinaryThinking: () => true,
              supportsXHighThinking: () => false,
              resolveThinkingProfile: () => ({ levels: [{ id: "high" }], defaultLevel: "high" }),
              resolveDefaultThinkingLevel: () => "high",
            },
          },
        ],
      },
    };

    expect(
      resolveProviderBinaryThinking({
        provider: "openai",
        context: { provider: "openai", modelId: "gpt-5.5" },
      }),
    ).toBe(true);
    expect(
      resolveProviderXHighThinking({
        provider: "openai",
        context: { provider: "openai", modelId: "gpt-5.5" },
      }),
    ).toBe(false);
    expect(
      resolveProviderThinkingProfile({
        provider: "openai",
        context: { provider: "openai", modelId: "gpt-5.5", reasoning: true },
      }),
    ).toEqual({ levels: [{ id: "high" }], defaultLevel: "high" });
    expect(
      resolveProviderDefaultThinkingLevel({
        provider: "openai",
        context: { provider: "openai", modelId: "gpt-5.5", reasoning: true },
      }),
    ).toBe("high");
  });

  it("returns undefined when no active provider matches", () => {
    expect(
      resolveProviderThinkingProfile({
        provider: "missing",
        context: { provider: "missing", modelId: "x", reasoning: false },
      }),
    ).toBeUndefined();
  });
});
