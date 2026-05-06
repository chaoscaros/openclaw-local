import { describe, expect, it } from "vitest";
import {
  buildRuntimeConfigOptionPairs,
  buildRuntimeControlSignature,
  inferRuntimeOptionPatchFromConfigOption,
  mergeRuntimeOptions,
  normalizeRuntimeOptions,
  validateRuntimeOptionPatch,
} from "./runtime-options.js";

describe("acp/control-plane/runtime-options", () => {
  it("accepts thinking in runtime option patches", () => {
    expect(validateRuntimeOptionPatch({ thinking: "high" })).toEqual({ thinking: "high" });
  });

  it("normalizes and merges thinking like other kernel runtime options", () => {
    expect(
      mergeRuntimeOptions({
        current: { model: "gpt-5", thinking: "low" },
        patch: { thinking: "high" },
      }),
    ).toEqual({ model: "gpt-5", thinking: "high" });

    expect(normalizeRuntimeOptions({ thinking: "  medium  " })).toEqual({ thinking: "medium" });
  });

  it("includes thinking in runtime control signatures and config option pairs", () => {
    expect(
      buildRuntimeControlSignature({ model: "gpt-5", thinking: "high", timeoutSeconds: 30 }),
    ).toContain('"thinking":"high"');

    expect(buildRuntimeConfigOptionPairs({ thinking: "high" })).toEqual([["thinking", "high"]]);
  });

  it("maps thinking aliases from config options into runtime option patches", () => {
    expect(inferRuntimeOptionPatchFromConfigOption("thinking", "high")).toEqual({ thinking: "high" });
    expect(inferRuntimeOptionPatchFromConfigOption("thought_level", "adaptive")).toEqual({
      thinking: "adaptive",
    });
    expect(inferRuntimeOptionPatchFromConfigOption("reasoning_effort", "medium")).toEqual({
      thinking: "medium",
    });
  });
});
