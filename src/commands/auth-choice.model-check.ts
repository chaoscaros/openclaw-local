import { ensureAuthProfileStore, listProfilesForProvider } from "../agents/auth-profiles.js";
import { hasUsableCustomProviderApiKey, resolveEnvApiKey } from "../agents/model-auth.js";
import { loadModelCatalog } from "../agents/model-catalog.js";
import { resolveDefaultModelForAgent } from "../agents/model-selection.js";
import { findNormalizedProviderValue, normalizeProviderId } from "../agents/provider-id.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { buildProviderAuthRecoveryHint } from "./provider-auth-guidance.js";

const OPENAI_PROVIDER_ID = "openai";
const OPENAI_CODEX_PROVIDER_ID = "openai-codex";

function uniqueProviders(providers: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const provider of providers) {
    const trimmed = provider.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function isOfficialOpenAIBaseUrl(baseUrl: unknown): boolean {
  if (typeof baseUrl !== "string" || !baseUrl.trim()) {
    return true;
  }
  try {
    const url = new URL(baseUrl.trim());
    return (
      url.protocol === "https:" &&
      url.hostname.toLowerCase() === "api.openai.com" &&
      (url.pathname === "" ||
        url.pathname === "/" ||
        url.pathname === "/v1" ||
        url.pathname === "/v1/")
    );
  } catch {
    return false;
  }
}

function openAIProviderUsesCustomBaseUrl(config: OpenClawConfig | undefined): boolean {
  const providerConfig = findNormalizedProviderValue(config?.models?.providers, OPENAI_PROVIDER_ID);
  return !isOfficialOpenAIBaseUrl(providerConfig?.baseUrl);
}

function resolveAuthProviderCandidates(params: {
  config: OpenClawConfig;
  provider: string;
}): string[] {
  if (normalizeProviderId(params.provider) !== OPENAI_PROVIDER_ID) {
    return [params.provider];
  }
  if (openAIProviderUsesCustomBaseUrl(params.config)) {
    return [params.provider];
  }
  return uniqueProviders([params.provider, OPENAI_CODEX_PROVIDER_ID]);
}

export async function warnIfModelConfigLooksOff(
  config: OpenClawConfig,
  prompter: WizardPrompter,
  options?: { agentId?: string; agentDir?: string; validateCatalog?: boolean },
) {
  const ref = resolveDefaultModelForAgent({
    cfg: config,
    agentId: options?.agentId,
  });
  const warnings: string[] = [];
  if (options?.validateCatalog !== false) {
    const catalog = await loadModelCatalog({
      config,
      useCache: false,
    });
    if (catalog.length > 0) {
      const known = catalog.some(
        (entry) => entry.provider === ref.provider && entry.id === ref.model,
      );
      if (!known) {
        warnings.push(
          `Model not found: ${ref.provider}/${ref.model}. Update agents.defaults.model or run /models list.`,
        );
      }
    }
  }

  const store = ensureAuthProfileStore(options?.agentDir);
  const authProviders = resolveAuthProviderCandidates({
    config,
    provider: ref.provider,
  });
  const hasAuth =
    authProviders.some((provider) => listProfilesForProvider(store, provider).length > 0) ||
    authProviders.some((provider) => resolveEnvApiKey(provider)) ||
    authProviders.some((provider) => hasUsableCustomProviderApiKey(config, provider));
  if (!hasAuth) {
    warnings.push(
      `No auth configured for provider "${ref.provider}". The agent may fail until credentials are added. ${buildProviderAuthRecoveryHint(
        {
          provider: ref.provider,
          config,
          includeEnvVar: true,
        },
      )}`,
    );
  }

  if (warnings.length > 0) {
    await prompter.note(warnings.join("\n"), "Model check");
  }
}
