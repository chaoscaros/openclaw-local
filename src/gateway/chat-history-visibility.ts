import { OPENCLAW_RUNTIME_CONTEXT_CUSTOM_TYPE } from "../agents/internal-runtime-context.js";

export function isDisplayHiddenChatHistoryMessage(message: unknown): boolean {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return false;
  }
  const entry = message as Record<string, unknown>;
  if (entry.display === false) {
    return true;
  }
  return entry.role === "custom" && entry.customType === OPENCLAW_RUNTIME_CONTEXT_CUSTOM_TYPE;
}
