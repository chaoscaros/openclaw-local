import { doSessionKeysMatch } from "./session-key.ts";
import type { SessionRunStatus, SessionsListResult } from "./types.ts";

type TerminalSessionRunStatus = Exclude<SessionRunStatus, "running">;

export type SessionRunTerminalOverride = {
  status: TerminalSessionRunStatus;
  endedAt: number;
};

export type SessionRunTerminalOverrideHost = {
  sessionRunTerminalOverrides?: Record<string, SessionRunTerminalOverride>;
};

function findOverrideKey(
  overrides: Record<string, SessionRunTerminalOverride>,
  sessionKey: string,
): string | null {
  if (overrides[sessionKey]) {
    return sessionKey;
  }
  return Object.keys(overrides).find((key) => doSessionKeysMatch(key, sessionKey)) ?? null;
}

export function recordSessionRunTerminalOverride(
  host: SessionRunTerminalOverrideHost,
  sessionKey: string | undefined | null,
  status: TerminalSessionRunStatus,
  endedAt = Date.now(),
) {
  const key = sessionKey?.trim();
  if (!key) {
    return;
  }
  host.sessionRunTerminalOverrides = {
    ...host.sessionRunTerminalOverrides,
    [key]: { status, endedAt },
  };
}

export function clearSessionRunTerminalOverride(
  host: SessionRunTerminalOverrideHost,
  sessionKey: string | undefined | null,
) {
  const key = sessionKey?.trim();
  const overrides = host.sessionRunTerminalOverrides;
  if (!key || !overrides) {
    return;
  }
  const overrideKey = findOverrideKey(overrides, key);
  if (!overrideKey) {
    return;
  }
  const next = { ...overrides };
  delete next[overrideKey];
  host.sessionRunTerminalOverrides = Object.keys(next).length > 0 ? next : undefined;
}

export function hasSessionRunTerminalOverride(
  host: SessionRunTerminalOverrideHost,
  sessionKey: string | undefined | null,
): boolean {
  const key = sessionKey?.trim();
  const overrides = host.sessionRunTerminalOverrides;
  if (!key || !overrides) {
    return false;
  }
  return findOverrideKey(overrides, key) != null;
}

export function applySessionRunTerminalOverrides(
  host: SessionRunTerminalOverrideHost,
  result: SessionsListResult,
): SessionsListResult {
  const overrides = host.sessionRunTerminalOverrides;
  if (!overrides || Object.keys(overrides).length === 0) {
    return result;
  }
  let changed = false;
  let overridesChanged = false;
  const nextOverrides = { ...overrides };
  const sessions = result.sessions.map((row) => {
    const overrideKey = findOverrideKey(nextOverrides, row.key);
    if (!overrideKey) {
      return row;
    }
    const override = nextOverrides[overrideKey];
    if (!override) {
      return row;
    }
    if (row.endedAt != null || (row.status && row.status !== "running")) {
      delete nextOverrides[overrideKey];
      overridesChanged = true;
      return row;
    }
    changed = true;
    return {
      ...row,
      hasActiveRun: false,
      status: override.status,
      endedAt: override.endedAt,
    };
  });
  if (overridesChanged) {
    host.sessionRunTerminalOverrides =
      Object.keys(nextOverrides).length > 0 ? nextOverrides : undefined;
  }
  return changed ? { ...result, sessions } : result;
}
