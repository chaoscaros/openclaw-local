import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  runChannelPluginStartupMaintenance: vi.fn(async () => undefined),
  runStartupSessionMigration: vi.fn(async () => undefined),
  initSubagentRegistry: vi.fn(),
  applyPluginAutoEnable: vi.fn(({ config }: { config: unknown }) => ({ config })),
  resolveConfiguredDeferredChannelPluginIds: vi.fn(() => ["telegram"]),
  resolveGatewayStartupPluginIds: vi.fn(() => ["alpha-plugin"]),
  listGatewayMethods: vi.fn(() => ["chat.send", "chat.history"]),
  loadGatewayStartupPlugins: vi.fn(() => ({
    pluginRegistry: { plugins: ["alpha-plugin"] },
    gatewayMethods: ["chat.send", "chat.history", "plugin.alpha"],
  })),
  getActivePluginRegistry: vi.fn(() => null),
  setActivePluginRegistry: vi.fn(),
  createEmptyPluginRegistry: vi.fn(() => ({ plugins: [] })),
}));

vi.mock("../agents/agent-scope.js", () => ({
  resolveDefaultAgentId: vi.fn(() => "main"),
  resolveAgentWorkspaceDir: vi.fn(() => "/tmp/workspace"),
}));

vi.mock("../agents/subagent-registry.js", () => ({
  initSubagentRegistry: hoisted.initSubagentRegistry,
}));

vi.mock("../channels/plugins/lifecycle-startup.js", () => ({
  runChannelPluginStartupMaintenance: hoisted.runChannelPluginStartupMaintenance,
}));

vi.mock("../config/plugin-auto-enable.js", () => ({
  applyPluginAutoEnable: hoisted.applyPluginAutoEnable,
}));

vi.mock("../plugins/channel-plugin-ids.js", () => ({
  resolveConfiguredDeferredChannelPluginIds: hoisted.resolveConfiguredDeferredChannelPluginIds,
  resolveGatewayStartupPluginIds: hoisted.resolveGatewayStartupPluginIds,
}));

vi.mock("../plugins/registry.js", () => ({
  createEmptyPluginRegistry: hoisted.createEmptyPluginRegistry,
}));

vi.mock("../plugins/runtime.js", () => ({
  getActivePluginRegistry: hoisted.getActivePluginRegistry,
  setActivePluginRegistry: hoisted.setActivePluginRegistry,
}));

vi.mock("./server-methods-list.js", () => ({
  listGatewayMethods: hoisted.listGatewayMethods,
}));

vi.mock("./server-methods.js", () => ({
  coreGatewayHandlers: {},
}));

vi.mock("./server-plugin-bootstrap.js", () => ({
  loadGatewayStartupPlugins: hoisted.loadGatewayStartupPlugins,
}));

vi.mock("./server-startup-session-migration.js", () => ({
  runStartupSessionMigration: hoisted.runStartupSessionMigration,
}));

const { prepareGatewayPluginBootstrap } = await import("./server-startup-plugins.js");

describe("prepareGatewayPluginBootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.listGatewayMethods.mockReturnValue(["chat.send", "chat.history"]);
    hoisted.createEmptyPluginRegistry.mockReturnValue({ plugins: [] });
    hoisted.getActivePluginRegistry.mockReturnValue(null);
    hoisted.resolveConfiguredDeferredChannelPluginIds.mockReturnValue(["telegram"]);
    hoisted.resolveGatewayStartupPluginIds.mockReturnValue(["alpha-plugin"]);
    hoisted.loadGatewayStartupPlugins.mockReturnValue({
      pluginRegistry: { plugins: ["alpha-plugin"] },
      gatewayMethods: ["chat.send", "chat.history", "plugin.alpha"],
    });
  });

  it("skips startup plugin graph warming when plugins are globally disabled", async () => {
    const result = await prepareGatewayPluginBootstrap({
      cfgAtStart: { plugins: { enabled: false } },
      startupRuntimeConfig: {},
      minimalTestGateway: false,
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
    });

    expect(hoisted.resolveConfiguredDeferredChannelPluginIds).not.toHaveBeenCalled();
    expect(hoisted.resolveGatewayStartupPluginIds).not.toHaveBeenCalled();
    expect(hoisted.loadGatewayStartupPlugins).not.toHaveBeenCalled();
    expect(hoisted.setActivePluginRegistry).toHaveBeenCalledWith({ plugins: [] });
    expect(result.startupPluginIds).toEqual([]);
    expect(result.deferredConfiguredChannelPluginIds).toEqual([]);
    expect(result.pluginRegistry).toEqual({ plugins: [] });
  });
});
