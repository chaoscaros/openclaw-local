import type { PluginChannelRegistration, PluginRegistry } from "../../plugins/registry-types.js";
import { getActivePluginChannelRegistry, getActivePluginRegistry } from "../../plugins/runtime.js";
import type { ChannelId } from "./channel-id.types.js";

type ChannelRegistryValueResolver<TValue> = (
  entry: PluginChannelRegistration,
) => TValue | undefined;

export function createChannelRegistryLoader<TValue>(
  resolveValue: ChannelRegistryValueResolver<TValue>,
): (id: ChannelId) => Promise<TValue | undefined> {
  const cache = new Map<ChannelId, TValue>();
  let lastChannelRegistry: PluginRegistry | null = null;
  let lastActiveRegistry: PluginRegistry | null = null;

  return async (id: ChannelId): Promise<TValue | undefined> => {
    const channelRegistry = getActivePluginChannelRegistry();
    const activeRegistry = getActivePluginRegistry();
    if (channelRegistry !== lastChannelRegistry || activeRegistry !== lastActiveRegistry) {
      cache.clear();
      lastChannelRegistry = channelRegistry;
      lastActiveRegistry = activeRegistry;
    }
    if (cache.has(id)) {
      return cache.get(id);
    }

    const resolveFromRegistry = (registry: PluginRegistry | null): TValue | undefined => {
      const pluginEntry = registry?.channels.find((entry) => entry.plugin.id === id);
      return pluginEntry ? resolveValue(pluginEntry) : undefined;
    };

    const channelValue = resolveFromRegistry(channelRegistry);
    const resolved =
      channelValue ??
      (activeRegistry && activeRegistry !== channelRegistry
        ? resolveFromRegistry(activeRegistry)
        : undefined);

    if (resolved !== undefined) {
      cache.set(id, resolved);
    }
    return resolved;
  };
}
