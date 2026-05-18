import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const refreshOpenAICodexTokenMock = vi.hoisted(() => vi.fn());
const loginOpenAICodexOAuthMock = vi.hoisted(() => vi.fn());
const readOpenAICodexCliOAuthProfileMock = vi.hoisted(() => vi.fn());

vi.mock("./openai-codex-provider.runtime.js", () => ({
  refreshOpenAICodexToken: refreshOpenAICodexTokenMock,
}));

vi.mock("openclaw/plugin-sdk/provider-auth-login", () => ({
  loginOpenAICodexOAuth: loginOpenAICodexOAuthMock,
}));

vi.mock("./openai-codex-cli-auth.js", async () => {
  const actual = await vi.importActual<typeof import("./openai-codex-cli-auth.js")>(
    "./openai-codex-cli-auth.js",
  );
  return {
    ...actual,
    readOpenAICodexCliOAuthProfile: readOpenAICodexCliOAuthProfileMock,
  };
});

let buildOpenAICodexProviderPlugin: typeof import("./openai-codex-provider.js").buildOpenAICodexProviderPlugin;

describe("openai codex provider", () => {
  beforeAll(async () => {
    ({ buildOpenAICodexProviderPlugin } = await import("./openai-codex-provider.js"));
  });

  beforeEach(() => {
    refreshOpenAICodexTokenMock.mockReset();
    loginOpenAICodexOAuthMock.mockReset();
    readOpenAICodexCliOAuthProfileMock.mockReset();
  });

  it("falls back to the cached credential when accountId extraction fails", async () => {
    const provider = buildOpenAICodexProviderPlugin();
    const credential = {
      type: "oauth" as const,
      provider: "openai-codex",
      access: "cached-access-token",
      refresh: "refresh-token",
      expires: Date.now() - 60_000,
    };
    refreshOpenAICodexTokenMock.mockRejectedValueOnce(
      new Error("Failed to extract accountId from token"),
    );

    await expect(provider.refreshOAuth?.(credential)).resolves.toEqual(credential);
  });

  it("rethrows unrelated refresh failures", async () => {
    const provider = buildOpenAICodexProviderPlugin();
    const credential = {
      type: "oauth" as const,
      provider: "openai-codex",
      access: "cached-access-token",
      refresh: "refresh-token",
      expires: Date.now() - 60_000,
    };
    refreshOpenAICodexTokenMock.mockRejectedValueOnce(new Error("invalid_grant"));

    await expect(provider.refreshOAuth?.(credential)).rejects.toThrow("invalid_grant");
  });

  it("merges refreshed oauth credentials", async () => {
    const provider = buildOpenAICodexProviderPlugin();
    const credential = {
      type: "oauth" as const,
      provider: "openai-codex",
      access: "cached-access-token",
      refresh: "refresh-token",
      expires: Date.now() - 60_000,
      email: "user@example.com",
      displayName: "User",
    };
    refreshOpenAICodexTokenMock.mockResolvedValueOnce({
      access: "next-access",
      refresh: "next-refresh",
      expires: Date.now() + 60_000,
    });

    await expect(provider.refreshOAuth?.(credential)).resolves.toEqual({
      ...credential,
      access: "next-access",
      refresh: "next-refresh",
      expires: expect.any(Number),
    });
  });

  it("returns deprecated-profile doctor guidance for legacy Codex CLI ids", () => {
    const provider = buildOpenAICodexProviderPlugin();

    expect(
      provider.buildAuthDoctorHint?.({
        provider: "openai-codex",
        profileId: "openai-codex:codex-cli",
        config: undefined,
        store: { version: 1, profiles: {} },
      }),
    ).toBe(
      "Deprecated profile. Run `openclaw models auth login --provider openai-codex` or `openclaw configure`.",
    );
  });

  it("falls back to the existing Codex CLI auth file when OAuth login fails", async () => {
    const provider = buildOpenAICodexProviderPlugin();
    loginOpenAICodexOAuthMock.mockRejectedValueOnce(new Error("Token exchange failed"));
    readOpenAICodexCliOAuthProfileMock.mockReturnValueOnce({
      profileId: "openai-codex:default",
      credential: {
        type: "oauth",
        provider: "openai-codex",
        access: "cli-access",
        refresh: "cli-refresh",
        expires: Date.now() + 60_000,
        email: "cli@example.com",
      },
    });

    const prompter = { note: vi.fn(async () => {}) };
    const result = await provider.auth[0]?.run({
      agentDir: "/tmp/agent",
      env: process.env,
      prompter,
      runtime: { log: vi.fn(), error: vi.fn(), exit: vi.fn() },
      isRemote: false,
      openUrl: async () => {},
    } as never);

    expect(result).toMatchObject({
      defaultModel: "openai/gpt-5.5",
      profiles: [
        {
          profileId: "openai-codex:default",
          credential: expect.objectContaining({ access: "cli-access", refresh: "cli-refresh" }),
        },
      ],
    });
    expect(prompter.note).toHaveBeenCalledWith(
      expect.stringContaining("~/.codex/auth.json"),
      "OpenAI Codex fallback",
    );
  });

  it("falls back to the Codex CLI auth file when returned OAuth credentials cannot be persisted", async () => {
    const provider = buildOpenAICodexProviderPlugin();
    loginOpenAICodexOAuthMock.mockResolvedValueOnce({
      access: undefined,
      refresh: "oauth-refresh",
      expires: Date.now() + 60_000,
    });
    readOpenAICodexCliOAuthProfileMock.mockReturnValueOnce({
      profileId: "openai-codex:default",
      credential: {
        type: "oauth",
        provider: "openai-codex",
        access: "cli-access",
        refresh: "cli-refresh",
        expires: Date.now() + 60_000,
        email: "cli@example.com",
      },
    });

    const prompter = { note: vi.fn(async () => {}) };
    const runtime = { log: vi.fn(), error: vi.fn(), exit: vi.fn() };
    const result = await provider.auth[0]?.run({
      agentDir: "/tmp/agent",
      env: process.env,
      prompter,
      runtime,
      isRemote: false,
      openUrl: async () => {},
    } as never);

    expect(result).toMatchObject({
      defaultModel: "openai/gpt-5.5",
      profiles: [
        {
          profileId: "openai-codex:default",
          credential: expect.objectContaining({ access: "cli-access", refresh: "cli-refresh" }),
        },
      ],
    });
    expect(runtime.error).toHaveBeenCalledWith(
      expect.stringContaining("could not persist the returned credentials"),
    );
    expect(prompter.note).toHaveBeenCalledWith(
      expect.stringContaining("credential persistence failed"),
      "OpenAI Codex fallback",
    );
  });

  it("owns native reasoning output mode for Codex responses", () => {
    const provider = buildOpenAICodexProviderPlugin();

    expect(
      provider.resolveReasoningOutputMode?.({
        provider: "openai-codex",
        modelApi: "openai-codex-responses",
        modelId: "gpt-5.4",
      } as never),
    ).toBe("native");
  });

  it("resolves gpt-5.5 with Codex runtime context caps", () => {
    const provider = buildOpenAICodexProviderPlugin();

    const model = provider.resolveDynamicModel?.({
      provider: "openai-codex",
      modelId: "gpt-5.5",
      modelRegistry: {
        find: () => undefined,
      } as never,
    } as never);

    expect(model).toMatchObject({
      id: "gpt-5.5",
      api: "openai-codex-responses",
      baseUrl: "https://chatgpt.com/backend-api",
      contextWindow: 400_000,
      contextTokens: 272_000,
      maxTokens: 128_000,
    });
  });

  it("resolves gpt-5.5-pro with pro pricing and native context", () => {
    const provider = buildOpenAICodexProviderPlugin();

    const model = provider.resolveDynamicModel?.({
      provider: "openai-codex",
      modelId: "gpt-5.5-pro",
      modelRegistry: {
        find: (providerId: string, modelId: string) => {
          if (providerId === "openai-codex" && modelId === "gpt-5.4") {
            return {
              id: "gpt-5.4",
              name: "gpt-5.4",
              provider: "openai-codex",
              api: "openai-codex-responses",
              baseUrl: "https://chatgpt.com/backend-api",
              reasoning: true,
              input: ["text", "image"] as const,
              cost: { input: 2.5, output: 15, cacheRead: 0.25, cacheWrite: 0 },
              contextWindow: 1_050_000,
              contextTokens: 272_000,
              maxTokens: 128_000,
            };
          }
          return undefined;
        },
      } as never,
    });

    expect(model).toMatchObject({
      id: "gpt-5.5-pro",
      contextWindow: 1_000_000,
      contextTokens: 272_000,
      maxTokens: 128_000,
      cost: { input: 30, output: 180, cacheRead: 0, cacheWrite: 0 },
    });
  });

  it("does not synthesize the removed gpt-5.3-codex-spark model", () => {
    const provider = buildOpenAICodexProviderPlugin();

    const model = provider.resolveDynamicModel?.({
      provider: "openai-codex",
      modelId: "gpt-5.3-codex-spark",
      modelRegistry: {
        find: () => undefined,
      } as never,
    } as never);

    expect(model).toBeUndefined();
  });

  it("resolves gpt-5.4 with native contextWindow plus default contextTokens cap", () => {
    const provider = buildOpenAICodexProviderPlugin();

    const model = provider.resolveDynamicModel?.({
      provider: "openai-codex",
      modelId: "gpt-5.4",
      modelRegistry: {
        find: (providerId: string, modelId: string) => {
          if (providerId === "openai-codex" && modelId === "gpt-5.3-codex") {
            return {
              id: "gpt-5.3-codex",
              name: "gpt-5.3-codex",
              provider: "openai-codex",
              api: "openai-codex-responses",
              baseUrl: "https://chatgpt.com/backend-api",
              reasoning: true,
              input: ["text", "image"] as const,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              contextWindow: 272_000,
              maxTokens: 128_000,
            };
          }
          return undefined;
        },
      } as never,
    });

    expect(model).toMatchObject({
      id: "gpt-5.4",
      contextWindow: 1_050_000,
      contextTokens: 272_000,
      maxTokens: 128_000,
    });
  });

  it("resolves gpt-5.4-pro with pro pricing and codex-sized limits", () => {
    const provider = buildOpenAICodexProviderPlugin();

    const model = provider.resolveDynamicModel?.({
      provider: "openai-codex",
      modelId: "gpt-5.4-pro",
      modelRegistry: {
        find: (providerId: string, modelId: string) => {
          if (providerId === "openai-codex" && modelId === "gpt-5.3-codex") {
            return {
              id: "gpt-5.3-codex",
              name: "gpt-5.3-codex",
              provider: "openai-codex",
              api: "openai-codex-responses",
              baseUrl: "https://chatgpt.com/backend-api",
              reasoning: true,
              input: ["text", "image"] as const,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              contextWindow: 272_000,
              maxTokens: 128_000,
            };
          }
          return undefined;
        },
      } as never,
    });

    expect(model).toMatchObject({
      id: "gpt-5.4-pro",
      contextWindow: 1_050_000,
      contextTokens: 272_000,
      maxTokens: 128_000,
      cost: { input: 30, output: 180, cacheRead: 0, cacheWrite: 0 },
    });
  });

  it("resolves gpt-5.4-pro from a gpt-5.4 runtime template when legacy codex rows are absent", () => {
    const provider = buildOpenAICodexProviderPlugin();

    const model = provider.resolveDynamicModel?.({
      provider: "openai-codex",
      modelId: "gpt-5.4-pro",
      modelRegistry: {
        find: (providerId: string, modelId: string) => {
          if (providerId === "openai-codex" && modelId === "gpt-5.4") {
            return {
              id: "gpt-5.4",
              name: "gpt-5.4",
              provider: "openai-codex",
              api: "openai-codex-responses",
              baseUrl: "https://chatgpt.com/backend-api",
              reasoning: true,
              input: ["text", "image"] as const,
              cost: { input: 2.5, output: 15, cacheRead: 0.25, cacheWrite: 0 },
              contextWindow: 1_050_000,
              contextTokens: 272_000,
              maxTokens: 128_000,
            };
          }
          return undefined;
        },
      } as never,
    });

    expect(model).toMatchObject({
      id: "gpt-5.4-pro",
      api: "openai-codex-responses",
      baseUrl: "https://chatgpt.com/backend-api",
      contextWindow: 1_050_000,
      contextTokens: 272_000,
      maxTokens: 128_000,
      cost: { input: 30, output: 180, cacheRead: 0, cacheWrite: 0 },
    });
  });

  it("resolves the legacy gpt-5.4-codex alias to canonical gpt-5.4", () => {
    const provider = buildOpenAICodexProviderPlugin();

    const model = provider.resolveDynamicModel?.({
      provider: "openai-codex",
      modelId: "gpt-5.4-codex",
      modelRegistry: {
        find: (providerId: string, modelId: string) => {
          if (providerId === "openai-codex" && modelId === "gpt-5.3-codex") {
            return {
              id: "gpt-5.3-codex",
              name: "gpt-5.3-codex",
              provider: "openai-codex",
              api: "openai-codex-responses",
              baseUrl: "https://chatgpt.com/backend-api",
              reasoning: true,
              input: ["text", "image"] as const,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              contextWindow: 272_000,
              maxTokens: 128_000,
            };
          }
          return undefined;
        },
      } as never,
    });

    expect(model).toMatchObject({
      id: "gpt-5.4",
      name: "gpt-5.4",
      contextWindow: 1_050_000,
      contextTokens: 272_000,
      maxTokens: 128_000,
    });
  });

  it("resolves gpt-5.4-mini from gpt-5.4 runtime templates with native runtime caps", () => {
    const provider = buildOpenAICodexProviderPlugin();

    const model = provider.resolveDynamicModel?.({
      provider: "openai-codex",
      modelId: "gpt-5.4-mini",
      modelRegistry: {
        find: (providerId: string, modelId: string) => {
          if (providerId === "openai-codex" && modelId === "gpt-5.4") {
            return {
              id: "gpt-5.4",
              name: "gpt-5.4",
              provider: "openai-codex",
              api: "openai-codex-responses",
              baseUrl: "https://chatgpt.com/backend-api",
              reasoning: true,
              input: ["text", "image"] as const,
              cost: { input: 2.5, output: 15, cacheRead: 0.25, cacheWrite: 0 },
              contextWindow: 1_050_000,
              contextTokens: 272_000,
              maxTokens: 128_000,
            };
          }
          return null;
        },
      } as never,
    } as never);

    expect(model).toMatchObject({
      id: "gpt-5.4-mini",
      api: "openai-codex-responses",
      baseUrl: "https://chatgpt.com/backend-api",
      contextWindow: 400_000,
      contextTokens: 272_000,
      maxTokens: 128_000,
      cost: { input: 0.75, output: 4.5, cacheRead: 0.075, cacheWrite: 0 },
    });
  });

  it("augments catalog with gpt-5.4 native contextWindow and runtime cap", () => {
    const provider = buildOpenAICodexProviderPlugin();

    const entries = provider.augmentModelCatalog?.({
      env: process.env,
      entries: [
        {
          id: "gpt-5.3-codex",
          name: "gpt-5.3-codex",
          provider: "openai-codex",
          reasoning: true,
          input: ["text", "image"],
          contextWindow: 272_000,
        },
      ],
    } as never);

    expect(entries).toContainEqual(
      expect.objectContaining({
        id: "gpt-5.5-pro",
        contextWindow: 1_000_000,
        contextTokens: 272_000,
        cost: { input: 30, output: 180, cacheRead: 0, cacheWrite: 0 },
      }),
    );
    expect(entries).toContainEqual(
      expect.objectContaining({
        id: "gpt-5.4",
        contextWindow: 1_050_000,
        contextTokens: 272_000,
        cost: { input: 2.5, output: 15, cacheRead: 0.25, cacheWrite: 0 },
      }),
    );
    expect(entries).toContainEqual(
      expect.objectContaining({
        id: "gpt-5.4-pro",
        contextWindow: 1_050_000,
        contextTokens: 272_000,
        cost: { input: 30, output: 180, cacheRead: 0, cacheWrite: 0 },
      }),
    );
    expect(entries).toContainEqual(
      expect.objectContaining({
        id: "gpt-5.4-mini",
        contextWindow: 400_000,
        contextTokens: 272_000,
        cost: { input: 0.75, output: 4.5, cacheRead: 0.075, cacheWrite: 0 },
      }),
    );
    expect(entries).not.toContainEqual(
      expect.objectContaining({
        id: "gpt-5.3-codex-spark",
      }),
    );
  });

  it("augments gpt-5.4-pro from catalog gpt-5.4 when legacy codex rows are absent", () => {
    const provider = buildOpenAICodexProviderPlugin();

    const entries = provider.augmentModelCatalog?.({
      env: process.env,
      entries: [
        {
          id: "gpt-5.4",
          name: "gpt-5.4",
          provider: "openai-codex",
          reasoning: true,
          input: ["text", "image"],
          contextWindow: 272_000,
        },
      ],
    } as never);

    expect(entries).toContainEqual(
      expect.objectContaining({
        id: "gpt-5.4-pro",
        contextWindow: 1_050_000,
        contextTokens: 272_000,
        cost: { input: 30, output: 180, cacheRead: 0, cacheWrite: 0 },
      }),
    );
  });

  it("canonicalizes legacy gpt-5.4-codex models during resolved-model normalization", () => {
    const provider = buildOpenAICodexProviderPlugin();

    const model = provider.normalizeResolvedModel?.({
      provider: "openai-codex",
      model: {
        id: "gpt-5.4-codex",
        name: "gpt-5.4-codex",
        provider: "openai-codex",
        api: "openai-codex-responses",
        baseUrl: "https://chatgpt.com/backend-api",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1_050_000,
        contextTokens: 272_000,
        maxTokens: 128_000,
      },
    } as never);

    expect(model).toMatchObject({
      id: "gpt-5.4",
      name: "gpt-5.4",
    });
  });
});
