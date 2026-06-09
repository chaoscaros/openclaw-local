import { describe, expect, test } from "vitest";
import {
  asFiniteNumber,
  clampTimerTimeoutMs,
  MAX_TIMER_TIMEOUT_MS,
  parseFiniteNumber,
} from "./number-coercion.js";

describe("number-coercion", () => {
  test("asFiniteNumber accepts only finite numbers", () => {
    expect(asFiniteNumber(4)).toBe(4);
    expect(asFiniteNumber("4")).toBeUndefined();
    expect(asFiniteNumber(Number.NaN)).toBeUndefined();
    expect(asFiniteNumber(Number.POSITIVE_INFINITY)).toBeUndefined();
  });

  test("parseFiniteNumber accepts finite numbers and numeric strings", () => {
    expect(parseFiniteNumber(4)).toBe(4);
    expect(parseFiniteNumber("4.5ms")).toBe(4.5);
    expect(parseFiniteNumber("")).toBeUndefined();
    expect(parseFiniteNumber("nope")).toBeUndefined();
  });

  test("clampTimerTimeoutMs floors values and caps timer-unsafe delays", () => {
    expect(clampTimerTimeoutMs(12.8)).toBe(12);
    expect(clampTimerTimeoutMs(Number.MAX_SAFE_INTEGER)).toBe(MAX_TIMER_TIMEOUT_MS);
  });
});
