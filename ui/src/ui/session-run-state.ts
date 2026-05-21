import type { SessionRunStatus } from "./types.ts";

type SessionRunState = {
  key?: string;
  sessionId?: string;
  hasActiveRun?: boolean;
  status?: SessionRunStatus;
  endedAt?: number | null;
};

export function isSessionRunActive(state: SessionRunState | null | undefined): boolean {
  if (!state || state.endedAt != null) {
    return false;
  }
  if (state.status) {
    return state.status === "running";
  }
  return state.hasActiveRun === true;
}

export function resolveSessionRunIndicatorId(
  currentRunId: string | null | undefined,
  state: SessionRunState | null | undefined,
): string | null {
  if (state?.status && !isSessionRunActive(state)) {
    return null;
  }
  if (state?.endedAt != null) {
    return null;
  }
  if (currentRunId) {
    return currentRunId;
  }
  if (!state) {
    return null;
  }
  if (!isSessionRunActive(state)) {
    return null;
  }
  return state.key?.trim() || state.sessionId?.trim() || null;
}
