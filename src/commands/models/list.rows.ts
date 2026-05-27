import type { Api, Model } from "@mariozechner/pi-ai";
import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
import type { AuthProfileStore } from "../../agents/auth-profiles/types.js";
import { shouldSuppressBuiltInModel } from "../../agents/model-suppression.js";
import { normalizeProviderId } from "../../agents/provider-id.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import type { ProviderRuntimeModel } from "../../plugins/provider-runtime-model.types.js";
import { normalizeProviderResolvedModelWithPlugin } from "../../plugins/provider-runtime.js";
import { loadModelRegistry, toModelRow } from "./list.registry.js";
import { loadModelCatalog, resolveModelWithRegistry } from "./list.runtime.js";
import type { ConfiguredEntry, ModelRow } from "./list.types.js";
import { isLocalBaseUrl, modelKey } from "./shared.js";

type ConfiguredByKey = Map<string, ConfiguredEntry>;

type RowFilter = {
  provider?: string;
  local?: boolean;
};

type RowBuilderContext = {
  cfg: OpenClawConfig;
  authStore: AuthProfileStore;
  availableKeys?: Set<string>;
  configuredByKey: ConfiguredByKey;
  discoveredKeys: Set<string>;
  filter: RowFilter;
};

function matchesRowFilter(filter: RowFilter, model: { provider: string; baseUrl?: string }) {
  if (filter.provider && normalizeProviderId(model.provider) !== filter.provider) {
    return false;
  }
  if (filter.local && !isLocalBaseUrl(model.baseUrl ?? "")) {
    return false;
  }
  return true;
}

function buildRow(params: {
  model: Model<Api>;
  key: string;
  context: RowBuilderContext;
  allowProviderAvailabilityFallback?: boolean;
}): ModelRow {
  const configured = params.context.configuredByKey.get(params.key);
  return toModelRow({
    model: params.model,
    key: params.key,
    tags: configured ? Array.from(configured.tags) : [],
    aliases: configured?.aliases ?? [],
    availableKeys: params.context.availableKeys,
    cfg: params.context.cfg,
    authStore: params.context.authStore,
    allowProviderAvailabilityFallback: params.allowProviderAvailabilityFallback ?? false,
  });
}

function normalizeListModelWithProviderPlugin(params: {
  model: Model<Api>;
  context: RowBuilderContext;
}): Model<Api> {
  const normalized = normalizeProviderResolvedModelWithPlugin({
    provider: params.model.provider,
    config: params.context.cfg,
    context: {
      config: params.context.cfg,
      provider: params.model.provider,
      modelId: params.model.id,
      model: params.model as ProviderRuntimeModel,
    },
  });
  return (normalized as Model<Api> | undefined) ?? params.model;
}

export async function loadListModelRegistry(
  cfg: OpenClawConfig,
  opts?: { sourceConfig?: OpenClawConfig },
) {
  const loaded = await loadModelRegistry(cfg, opts);
  return {
    ...loaded,
    discoveredKeys: new Set(loaded.models.map((model) => modelKey(model.provider, model.id))),
  };
}

export function appendDiscoveredRows(params: {
  rows: ModelRow[];
  models: Model<Api>[];
  context: RowBuilderContext;
}): Set<string> {
  const seenKeys = new Set<string>();
  const sorted = [...params.models].toSorted((a, b) => {
    const providerCompare = a.provider.localeCompare(b.provider);
    if (providerCompare !== 0) {
      return providerCompare;
    }
    return a.id.localeCompare(b.id);
  });

  for (const model of sorted) {
    const normalizedModel = normalizeListModelWithProviderPlugin({
      model,
      context: params.context,
    });
    if (
      shouldSuppressBuiltInModel({
        provider: normalizedModel.provider,
        id: normalizedModel.id,
        baseUrl: normalizedModel.baseUrl,
        config: params.context.cfg,
      })
    ) {
      continue;
    }
    if (!matchesRowFilter(params.context.filter, normalizedModel)) {
      continue;
    }
    const key = modelKey(normalizedModel.provider, normalizedModel.id);
    params.rows.push(
      buildRow({
        model: normalizedModel,
        key,
        context: params.context,
      }),
    );
    seenKeys.add(key);
  }

  return seenKeys;
}

export async function appendCatalogSupplementRows(params: {
  rows: ModelRow[];
  modelRegistry: ModelRegistry;
  context: RowBuilderContext;
  seenKeys: Set<string>;
}): Promise<void> {
  const catalog = await loadModelCatalog({ config: params.context.cfg });
  for (const entry of catalog) {
    if (
      params.context.filter.provider &&
      normalizeProviderId(entry.provider) !== params.context.filter.provider
    ) {
      continue;
    }
    const key = modelKey(entry.provider, entry.id);
    if (params.seenKeys.has(key)) {
      continue;
    }
    const model = resolveModelWithRegistry({
      provider: entry.provider,
      modelId: entry.id,
      modelRegistry: params.modelRegistry,
      cfg: params.context.cfg,
    });
    if (!model || !matchesRowFilter(params.context.filter, model)) {
      continue;
    }
    const normalizedModel = normalizeListModelWithProviderPlugin({
      model,
      context: params.context,
    });
    if (!matchesRowFilter(params.context.filter, normalizedModel)) {
      continue;
    }
    if (
      shouldSuppressBuiltInModel({
        provider: normalizedModel.provider,
        id: normalizedModel.id,
        baseUrl: normalizedModel.baseUrl,
        config: params.context.cfg,
      })
    ) {
      continue;
    }
    params.rows.push(
      buildRow({
        model: normalizedModel,
        key,
        context: params.context,
        allowProviderAvailabilityFallback: !params.context.discoveredKeys.has(key),
      }),
    );
    params.seenKeys.add(key);
  }
}

export function appendConfiguredRows(params: {
  rows: ModelRow[];
  entries: ConfiguredEntry[];
  modelRegistry: ModelRegistry;
  context: RowBuilderContext;
}) {
  for (const entry of params.entries) {
    if (
      params.context.filter.provider &&
      normalizeProviderId(entry.ref.provider) !== params.context.filter.provider
    ) {
      continue;
    }
    const model = resolveModelWithRegistry({
      provider: entry.ref.provider,
      modelId: entry.ref.model,
      modelRegistry: params.modelRegistry,
      cfg: params.context.cfg,
    });
    if (params.context.filter.local && model && !isLocalBaseUrl(model.baseUrl ?? "")) {
      continue;
    }
    if (params.context.filter.local && !model) {
      continue;
    }
    const normalizedModel = model
      ? normalizeListModelWithProviderPlugin({ model, context: params.context })
      : undefined;
    if (
      normalizedModel &&
      shouldSuppressBuiltInModel({
        provider: normalizedModel.provider,
        id: normalizedModel.id,
        baseUrl: normalizedModel.baseUrl,
        config: params.context.cfg,
      })
    ) {
      continue;
    }
    params.rows.push(
      toModelRow({
        model: normalizedModel,
        key: entry.key,
        tags: Array.from(entry.tags),
        aliases: entry.aliases,
        availableKeys: params.context.availableKeys,
        cfg: params.context.cfg,
        authStore: params.context.authStore,
        allowProviderAvailabilityFallback: normalizedModel
          ? !params.context.discoveredKeys.has(
              modelKey(normalizedModel.provider, normalizedModel.id),
            )
          : false,
      }),
    );
  }
}
