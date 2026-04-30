import { describe, expect, it } from "vitest";
import { assertUniqueValues, BUNDLED_RUNTIME_SIDECAR_PATHS } from "./runtime-sidecar-paths.js";

describe("plugins/runtime-sidecar-paths", () => {
  it("exports unique bundled runtime sidecar paths", () => {
    expect(Array.isArray(BUNDLED_RUNTIME_SIDECAR_PATHS)).toBe(true);
    expect(BUNDLED_RUNTIME_SIDECAR_PATHS.length).toBeGreaterThan(0);
  });

  it("throws on duplicate runtime sidecar path inputs", () => {
    expect(() => assertUniqueValues(["a", "a"], "sidecar")).toThrow(/Duplicate sidecar/);
  });
});
