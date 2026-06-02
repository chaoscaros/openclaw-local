import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { hasProviderAuthForTool } from "./model-config.helpers.js";

describe("hasProviderAuthForTool", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts config-backed custom provider auth", () => {
    const cfg = {
      models: {
        providers: {
          hatchery: {
            baseUrl: "https://example.com/v1",
            apiKey: "sk-configured", // pragma: allowlist secret
            models: [],
          },
        },
      },
    } as OpenClawConfig;

    expect(hasProviderAuthForTool({ provider: "hatchery", cfg })).toBe(true);
  });

  it("rejects providers without config or environment auth", () => {
    expect(hasProviderAuthForTool({ provider: "unconfigured-provider" })).toBe(false);
  });
});
