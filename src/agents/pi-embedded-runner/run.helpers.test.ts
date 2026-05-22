import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import { resolveMaxRunRetryIterations } from "./run/helpers.js";

describe("run helper retry limits", () => {
  it("keeps the default scaled guard when no config is provided", () => {
    expect(resolveMaxRunRetryIterations(1)).toBe(32);
    expect(resolveMaxRunRetryIterations(20)).toBe(160);
  });

  it("uses default runRetries boundaries from config", () => {
    const cfg = {
      agents: {
        defaults: {
          runRetries: {
            base: 2,
            perProfile: 3,
            min: 4,
            max: 20,
          },
        },
      },
    } as OpenClawConfig;

    expect(resolveMaxRunRetryIterations(2, cfg, "main")).toBe(8);
  });

  it("merges per-agent runRetries with default boundaries", () => {
    const cfg = {
      agents: {
        defaults: {
          runRetries: {
            base: 24,
            perProfile: 8,
            min: 32,
            max: 160,
          },
        },
        list: [
          {
            id: "research",
            runRetries: {
              max: 40,
            },
          },
        ],
      },
    } as OpenClawConfig;

    expect(resolveMaxRunRetryIterations(5, cfg, "research")).toBe(40);
  });
});
