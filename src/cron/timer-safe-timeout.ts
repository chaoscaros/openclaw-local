export const CRON_MAX_TIMER_TIMEOUT_MS = 2_147_483_647;

export function finiteSecondsToCronTimerSafeMilliseconds(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.min(Math.floor(value * 1_000), CRON_MAX_TIMER_TIMEOUT_MS);
}
