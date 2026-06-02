export function isBlockedLivenessState(value: unknown): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "blocked";
}

export function formatBlockedLivenessError(error: unknown): string {
  return typeof error === "string" && error.trim()
    ? error
    : "Agent run became blocked before producing a successful completion.";
}

export function normalizeBlockedLivenessWaitStatus<TStatus extends string>(params: {
  status: TStatus;
  livenessState?: unknown;
  error?: unknown;
}): { status: TStatus | "error"; error?: string } {
  if (!isBlockedLivenessState(params.livenessState)) {
    return {
      status: params.status,
      error: typeof params.error === "string" ? params.error : undefined,
    };
  }
  return {
    status: "error",
    error: formatBlockedLivenessError(params.error),
  };
}
