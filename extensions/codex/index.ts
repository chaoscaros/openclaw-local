import { definePluginEntry, type OpenClawConfig } from "openclaw/plugin-sdk/plugin-entry";
import { createCodexAppServerAgentHarness } from "./harness.js";
import { buildCodexProvider } from "./provider.js";
import type { CodexPluginsConfigBlock } from "./src/command-plugins-management.js";
import { createCodexCommand } from "./src/commands.js";

export default definePluginEntry({
  id: "codex",
  name: "Codex",
  description: "Codex app-server harness and Codex-managed GPT model catalog.",
  register(api) {
    api.registerAgentHarness(createCodexAppServerAgentHarness({ pluginConfig: api.pluginConfig }));
    api.registerProvider(buildCodexProvider({ pluginConfig: api.pluginConfig }));
    api.registerCommand(
      createCodexCommand({
        pluginConfig: api.pluginConfig,
        deps: {
          codexPluginsManagementIo: {
            readConfig: () =>
              Promise.resolve(readCodexPluginsConfig(api.runtime.config.loadConfig())),
            mutate: async (update) => {
              const current = api.runtime.config.loadConfig();
              const next = cloneConfigObject(current);
              const block = ensureCodexPluginsConfig(next);
              update(block);
              await api.runtime.config.writeConfigFile(next);
            },
          },
        },
      }),
    );
  },
});

function readCodexPluginsConfig(config: OpenClawConfig): CodexPluginsConfigBlock {
  const codexPlugins = getCodexPluginsConfig(config);
  if (!codexPlugins) {
    return {};
  }
  const declared = codexPlugins.plugins;
  return {
    enabled: codexPlugins.enabled === true,
    ...(isRecord(declared) ? { plugins: declared as CodexPluginsConfigBlock["plugins"] } : {}),
  };
}

function ensureCodexPluginsConfig(config: OpenClawConfig): CodexPluginsConfigBlock {
  const root = config as Record<string, unknown>;
  root.plugins = isRecord(root.plugins) ? root.plugins : {};
  const plugins = root.plugins as Record<string, unknown>;
  plugins.entries = isRecord(plugins.entries) ? plugins.entries : {};
  const entries = plugins.entries as Record<string, unknown>;
  entries.codex = isRecord(entries.codex) ? entries.codex : {};
  const codexEntry = entries.codex as Record<string, unknown>;
  codexEntry.config = isRecord(codexEntry.config) ? codexEntry.config : {};
  const codexConfig = codexEntry.config as Record<string, unknown>;
  codexConfig.codexPlugins = isRecord(codexConfig.codexPlugins) ? codexConfig.codexPlugins : {};
  const codexPlugins = codexConfig.codexPlugins as Record<string, unknown>;
  codexPlugins.plugins = isRecord(codexPlugins.plugins) ? codexPlugins.plugins : {};
  return codexPlugins as CodexPluginsConfigBlock;
}

function getCodexPluginsConfig(config: OpenClawConfig): Record<string, unknown> | null {
  const plugins = readRecord(config, "plugins");
  const entries = plugins ? readRecord(plugins, "entries") : null;
  const codexEntry = entries ? readRecord(entries, "codex") : null;
  const codexConfig = codexEntry ? readRecord(codexEntry, "config") : null;
  return codexConfig ? readRecord(codexConfig, "codexPlugins") : null;
}

function readRecord(source: object, key: string): Record<string, unknown> | null {
  const value = (source as Record<string, unknown>)[key];
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneConfigObject(config: OpenClawConfig): OpenClawConfig {
  return JSON.parse(JSON.stringify(config)) as OpenClawConfig;
}
