import { beforeEach, describe, expect, it, vi } from "vitest";

const configMocks = vi.hoisted(() => ({
  readConfigFileSnapshot: vi.fn(),
  validateConfigObjectWithPlugins: vi.fn(),
  writeConfigFile: vi.fn(async () => {}),
}));

const facadeMocks = vi.hoisted(() => ({
  buildOpenAICodexProvider: vi.fn(() => ({
    baseUrl: "https://chatgpt.com/backend-api",
    api: "openai-codex-responses",
    auth: "oauth",
    models: [],
  })),
  buildOpenAICodexProviderPlugin: vi.fn(() => ({
    resolveDynamicModel: vi.fn(() => ({
      id: "gpt-5.5-pro",
      name: "gpt-5.5-pro",
      baseUrl: "https://chatgpt.com/backend-api",
      reasoning: true,
      input: ["text", "image"] as const,
      cost: { input: 30, output: 180, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 1_000_000,
      maxTokens: 128_000,
    })),
  })),
}));

vi.mock("../../config/config.js", () => ({
  readConfigFileSnapshot: configMocks.readConfigFileSnapshot,
  validateConfigObjectWithPlugins: configMocks.validateConfigObjectWithPlugins,
  writeConfigFile: configMocks.writeConfigFile,
}));

vi.mock("../../plugin-sdk/facade-runtime.js", () => ({
  loadBundledPluginPublicSurfaceModuleSync: vi.fn(() => ({
    buildOpenAICodexProvider: facadeMocks.buildOpenAICodexProvider(),
    buildOpenAICodexProviderPlugin: facadeMocks.buildOpenAICodexProviderPlugin(),
  })),
  createLazyFacadeValue: (load: () => Record<string, unknown>, key: string) => {
    return () => load()[key];
  },
}));

import { addModelToConfig } from "./models-add.js";

describe("addModelToConfig", () => {
  beforeEach(() => {
    configMocks.readConfigFileSnapshot.mockReset();
    configMocks.validateConfigObjectWithPlugins.mockReset();
    configMocks.writeConfigFile.mockReset();
    configMocks.readConfigFileSnapshot.mockResolvedValue({
      valid: true,
      parsed: {
        commands: { text: true },
        agents: { defaults: { models: {} } },
      },
    });
    configMocks.validateConfigObjectWithPlugins.mockImplementation((cfg) => ({ ok: true, config: cfg }));
    configMocks.writeConfigFile.mockResolvedValue(undefined);
  });

  it("adds codex model metadata and allowlist entry", async () => {
    const result = await addModelToConfig({ provider: "openai-codex", modelId: "gpt-5.5-pro" });

    expect(result).toEqual({
      provider: "openai-codex",
      modelId: "gpt-5.5-pro",
      existed: false,
      allowlistAdded: true,
    });
    expect(configMocks.writeConfigFile).toHaveBeenCalledTimes(1);
    const written = configMocks.writeConfigFile.mock.calls[0][0];
    expect(written.models.providers["openai-codex"].models[0]).toMatchObject({
      id: "gpt-5.5-pro",
      api: "openai-codex-responses",
      reasoning: true,
      metadataSource: "models-add",
    });
    expect(written.agents.defaults.models["openai-codex/gpt-5.5-pro"]).toEqual({});
  });
});
