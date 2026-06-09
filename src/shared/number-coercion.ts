export const MAX_TIMER_TIMEOUT_MS = 2_147_483_647;
export const MAX_TIMER_TIMEOUT_SECONDS = Math.floor(MAX_TIMER_TIMEOUT_MS / 1000);

export function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function parseFiniteNumber(value: unknown): number | undefined {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : undefined;
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function asPositiveSafeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

export function clampTimerTimeoutMs(value: number): number {
  return Math.min(Math.floor(value), MAX_TIMER_TIMEOUT_MS);
}
