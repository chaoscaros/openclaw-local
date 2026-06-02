export type AgentRunTimeoutPhase = "provider" | "runner" | "gateway" | "unknown";

export function normalizeAgentRunTimeoutPhase(value: unknown): AgentRunTimeoutPhase | undefined {
  if (value === "provider" || value === "runner" || value === "gateway" || value === "unknown") {
    return value;
  }
  return undefined;
}

export function normalizeProviderStarted(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
