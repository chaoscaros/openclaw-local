const changeReviewRunModeByRunId = new Map<string, { enabled: boolean; sessionKey?: string }>();

export function setChangeReviewRunMode(params: {
  runId: string;
  enabled: boolean;
  sessionKey?: string;
}) {
  const runId = params.runId.trim();
  if (!runId) {
    return;
  }
  changeReviewRunModeByRunId.set(runId, {
    enabled: params.enabled,
    ...(params.sessionKey ? { sessionKey: params.sessionKey } : {}),
  });
}

export function isChangeReviewRunModeEnabled(runId: string | undefined | null): boolean {
  const normalized = runId?.trim() ?? "";
  if (!normalized) {
    return false;
  }
  return changeReviewRunModeByRunId.get(normalized)?.enabled === true;
}

export function clearChangeReviewRunMode(runId: string | undefined | null) {
  const normalized = runId?.trim() ?? "";
  if (!normalized) {
    return;
  }
  changeReviewRunModeByRunId.delete(normalized);
}

export function resetChangeReviewRunModeForTest() {
  changeReviewRunModeByRunId.clear();
}
