import { describe, expect, it } from "vitest";
import {
  CRON_MAX_TIMER_TIMEOUT_MS,
  finiteSecondsToCronTimerSafeMilliseconds,
} from "./timer-safe-timeout.js";

describe("finiteSecondsToCronTimerSafeMilliseconds", () => {
  it("omits absent, non-finite, and non-positive values", () => {
    expect(finiteSecondsToCronTimerSafeMilliseconds(undefined)).toBeUndefined();
    expect(finiteSecondsToCronTimerSafeMilliseconds(Number.NaN)).toBeUndefined();
    expect(finiteSecondsToCronTimerSafeMilliseconds(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(finiteSecondsToCronTimerSafeMilliseconds(0)).toBeUndefined();
    expect(finiteSecondsToCronTimerSafeMilliseconds(-1)).toBeUndefined();
  });

  it("converts finite positive seconds and caps oversized values", () => {
    expect(finiteSecondsToCronTimerSafeMilliseconds(1.9)).toBe(1_900);
    expect(finiteSecondsToCronTimerSafeMilliseconds(Number.MAX_SAFE_INTEGER)).toBe(
      CRON_MAX_TIMER_TIMEOUT_MS,
    );
  });
});
