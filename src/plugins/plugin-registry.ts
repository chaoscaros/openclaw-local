import type { OpenClawConfig } from "../config/types.openclaw.js";
import { normalizePluginsConfig, resolveEffectivePluginActivationState } from "./config-state.js";
import { loadPluginManifestRegistry } from "./manifest-registry.js";

export type PluginRegistrySnapshot = {
  plugins: Array<{
    pluginId: string;
    origin: string;
    enabled: boolean;
    enabledByDefault?: boolean;
  }>;
  diagnostics: ReturnType<typeof loadPluginManifestRegistry>["diagnostics"];
};

export function loadPluginRegistrySnapshot(params: {
  config?: OpenClawConfig;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
  cache?: boolean;
  preferPersisted?: boolean;
} = {}): PluginRegistrySnapshot {
  const registry = loadPluginManifestRegistry({
    config: params.config,
    workspaceDir: params.workspaceDir,
    env: params.env,
    cache: params.cache,
  });
  const normalizedConfig = normalizePluginsConfig(params.config?.plugins);
  return {
    plugins: registry.plugins.map((plugin) => ({
      pluginId: plugin.id,
      origin: plugin.origin,
      enabled: resolveEffectivePluginActivationState({
        id: plugin.id,
        origin: plugin.origin,
        config: normalizedConfig,
        rootConfig: params.config,
        enabledByDefault: plugin.enabledByDefault,
      }).enabled,
      enabledByDefault: plugin.enabledByDefault,
    })),
    diagnostics: registry.diagnostics,
  };
}