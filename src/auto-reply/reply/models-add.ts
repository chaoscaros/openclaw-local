import { normalizeProviderId } from "../../agents/model-selection.js";
import {
  readConfigFileSnapshot,
  validateConfigObjectWithPlugins,
  writeConfigFile,
} from "../../config/config.js";
import type { ModelDefinitionConfig, ModelProviderConfig } from "../../config/types.models.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { loadBundledPluginPublicSurfaceModuleSync } from "../../plugin-sdk/facade-loader.js";
import { normalizeOptionalString } from "../../shared/string-coerce.js";

type AddModelOutcome = {
  provider: string;
  modelId: string;
  existed: boolean;
  allowlistAdded: boolean;
};

export type ValidateAddProviderResult =
  | { ok: true; provider: string }
  | { ok: false; providers: string[]; knownProvider?: string };

type OpenAIApiFacade = {
  buildOpenAICodexProvider: () => ModelProviderConfig;
  buildOpenAICodexProviderPlugin: () => {
    resolveDynamicModel?: (ctx: {
      provider: string;
      modelId: string;
      modelRegistry: { find: () => null };
    }) =>
      | {
          id: string;
          name: string;
          api?: string;
          baseUrl?: string;
          reasoning: boolean;
          input: Array<"text" | "image">;
          cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
          contextWindow: number;
          contextTokens?: number;
          maxTokens: number;
          headers?: Record<string, string>;
          compat?: ModelDefinitionConfig["compat"];
        }
      | null
      | undefined;
  };
};

function loadOpenAIApiFacade(): OpenAIApiFacade {
  return loadBundledPluginPublicSurfaceModuleSync<OpenAIApiFacade>({
    dirName: "openai",
    artifactBasename: "api.js",
  });
}

function buildOpenAICodexProvider(): ModelProviderConfig {
  return loadOpenAIApiFacade().buildOpenAICodexProvider();
}

function buildOpenAICodexProviderPlugin() {
  return loadOpenAIApiFacade().buildOpenAICodexProviderPlugin();
}

function buildOpenAICodexModelDefinition(modelId: string): ModelDefinitionConfig {
  const dynamicModel = buildOpenAICodexProviderPlugin().resolveDynamicModel?.({
    provider: "openai-codex",
    modelId,
    modelRegistry: { find: () => null },
  });
  if (dynamicModel) {
    return {
      id: dynamicModel.id,
      name: dynamicModel.name,
      api: "openai-codex-responses",
      reasoning: dynamicModel.reasoning,
      input: [...dynamicModel.input],
      cost: dynamicModel.cost,
      contextWindow: dynamicModel.contextWindow,
      ...(dynamicModel.contextTokens ? { contextTokens: dynamicModel.contextTokens } : {}),
      maxTokens: dynamicModel.maxTokens,
      ...(dynamicModel.headers ? { headers: dynamicModel.headers } : {}),
      ...(dynamicModel.compat ? { compat: dynamicModel.compat } : {}),
      metadataSource: "models-add",
    };
  }
  return {
    id: modelId,
    name: modelId,
    api: "openai-codex-responses",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200_000,
    maxTokens: 200_000,
    metadataSource: "models-add",
  };
}

export function listAddableProviders(): string[] {
  return ["openai-codex"];
}

export function validateAddProvider(provider?: string): ValidateAddProviderResult {
  const providers = listAddableProviders();
  const normalized = normalizeProviderId(provider ?? "");
  if (normalized === "openai-codex") {
    return { ok: true, provider: normalized };
  }
  return { ok: false, providers, ...(provider ? { knownProvider: normalized } : {}) };
}

export async function addModelToConfig(params: {
  provider: string;
  modelId: string;
}): Promise<AddModelOutcome> {
  const snapshot = await readConfigFileSnapshot();
  if (!snapshot.valid || !snapshot.parsed || typeof snapshot.parsed !== "object") {
    throw new Error("Config file is invalid; fix it before using /models add.");
  }
  const cfg = structuredClone(snapshot.parsed as OpenClawConfig);
  const provider = normalizeProviderId(params.provider);
  const modelId = normalizeOptionalString(params.modelId);
  if (!modelId) {
    throw new Error("Model id is required.");
  }
  cfg.models ??= {};
  cfg.models.providers ??= {};
  const existingProvider = cfg.models.providers[provider];
  const providerConfig: ModelProviderConfig = existingProvider
    ? { ...existingProvider, models: [...(existingProvider.models ?? [])] }
    : { ...buildOpenAICodexProvider(), models: [] };

  const nextModel = buildOpenAICodexModelDefinition(modelId);
  const existingIndex = providerConfig.models.findIndex(
    (entry) => normalizeOptionalString(entry.id) === nextModel.id,
  );
  const existed = existingIndex >= 0;
  if (existed) {
    providerConfig.models[existingIndex] = nextModel;
  } else {
    providerConfig.models.push(nextModel);
  }
  cfg.models.providers[provider] = providerConfig;

  const allowlistKey = `${provider}/${nextModel.id}`;
  cfg.agents ??= {};
  cfg.agents.defaults ??= {};
  cfg.agents.defaults.models ??= {};
  const allowlistAdded = !(allowlistKey in cfg.agents.defaults.models);
  cfg.agents.defaults.models[allowlistKey] ??= {};

  const validated = validateConfigObjectWithPlugins(cfg);
  if (!validated.ok) {
    const issue = validated.issues[0];
    throw new Error(`Config invalid after /models add (${issue.path}: ${issue.message}).`);
  }
  await writeConfigFile(validated.config);
  return {
    provider,
    modelId: nextModel.id,
    existed,
    allowlistAdded,
  };
}
