import type { OpenClawConfig } from "../config/types.openclaw.js";
import {
  loadPluginManifestRegistry,
  type PluginManifestContractListKey,
  type PluginManifestRecord,
} from "./manifest-registry.js";
import { loadPluginRegistrySnapshot } from "./plugin-registry.js";

export type ManifestContractRuntimePluginResolution = {
  pluginIds: string[];
  bundledCompatPluginIds: string[];
};

function hasManifestContractValue(
  plugin: PluginManifestRecord,
  contract: PluginManifestContractListKey,
  value?: string,
): boolean {
  const values = plugin.contracts?.[contract] ?? [];
  return values.length > 0 && (!value || values.includes(value));
}

export function resolveManifestContractRuntimePluginResolution(params: {
  cfg?: OpenClawConfig;
  contract: PluginManifestContractListKey;
  value?: string;
}): ManifestContractRuntimePluginResolution {
  const index = loadPluginRegistrySnapshot({
    config: params.cfg,
    env: process.env,
    preferPersisted: false,
  });
  const allContractPlugins = loadPluginManifestRegistry({
    config: params.cfg,
    env: process.env,
  }).plugins.filter((plugin) => hasManifestContractValue(plugin, params.contract, params.value));
  const bundledCompatPluginIds = allContractPlugins
    .filter((plugin) => plugin.origin === "bundled")
    .map((plugin) => plugin.id);
  const enabledPluginIds = new Set(
    index.plugins.filter((plugin) => plugin.enabled).map((plugin) => plugin.pluginId),
  );
  const pluginIds = allContractPlugins
    .filter((plugin) => plugin.origin === "bundled" || enabledPluginIds.has(plugin.id))
    .map((plugin) => plugin.id);
  return {
    pluginIds: [...new Set(pluginIds)].toSorted((left, right) => left.localeCompare(right)),
    bundledCompatPluginIds: [...new Set(bundledCompatPluginIds)].toSorted((left, right) =>
      left.localeCompare(right),
    ),
  };
}