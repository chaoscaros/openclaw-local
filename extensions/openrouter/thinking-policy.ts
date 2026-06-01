import { isOpenRouterDeepSeekV4ModelId } from "./models.js";

type ProviderThinkingProfile = {
  levels: Array<{ id: string }>;
  defaultLevel: string;
};

const OPENROUTER_DEEPSEEK_V4_THINKING_LEVEL_IDS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

const OPENROUTER_DEEPSEEK_V4_THINKING_PROFILE: ProviderThinkingProfile = {
  levels: OPENROUTER_DEEPSEEK_V4_THINKING_LEVEL_IDS.map((id) => ({ id })),
  defaultLevel: "high",
};

export function supportsOpenRouterXHighThinking(modelId: string): boolean {
  return isOpenRouterDeepSeekV4ModelId(modelId);
}

export function resolveOpenRouterThinkingProfile(
  modelId: string,
): ProviderThinkingProfile | undefined {
  return isOpenRouterDeepSeekV4ModelId(modelId)
    ? OPENROUTER_DEEPSEEK_V4_THINKING_PROFILE
    : undefined;
}
