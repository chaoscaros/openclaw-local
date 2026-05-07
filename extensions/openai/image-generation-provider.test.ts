import { afterEach, describe, expect, it, vi } from "vitest";
import { buildOpenAIImageGenerationProvider } from "./image-generation-provider.js";

const {
  ensureAuthProfileStoreMock,
  isProviderApiKeyConfiguredMock,
  listProfilesForProviderMock,
  resolveApiKeyForProviderMock,
  postJsonRequestMock,
  assertOkOrThrowHttpErrorMock,
  resolveProviderHttpRequestConfigMock,
} = vi.hoisted(() => ({
  ensureAuthProfileStoreMock: vi.fn(() => ({ version: 1, profiles: {} })),
  isProviderApiKeyConfiguredMock: vi.fn<(params?: { provider?: string; agentDir?: string }) => boolean>(() => false),
  listProfilesForProviderMock: vi.fn(
    (store: { profiles?: Record<string, { provider?: string }> }, provider: string) =>
      Object.entries(store.profiles ?? {})
        .filter(([, profile]) => profile.provider === provider)
        .map(([profileId]) => profileId),
  ),
  resolveApiKeyForProviderMock: vi.fn(async () => ({ apiKey: "openai-key" })),
  postJsonRequestMock: vi.fn(),
  assertOkOrThrowHttpErrorMock: vi.fn(async () => {}),
  resolveProviderHttpRequestConfigMock: vi.fn((params) => ({
    baseUrl: params.baseUrl ?? params.defaultBaseUrl,
    allowPrivateNetwork: Boolean(params.allowPrivateNetwork),
    headers: new Headers(params.defaultHeaders),
    dispatcherPolicy: undefined,
  })),
}));

vi.mock("openclaw/plugin-sdk/provider-auth", () => ({
  ensureAuthProfileStore: ensureAuthProfileStoreMock,
  isProviderApiKeyConfigured: isProviderApiKeyConfiguredMock,
  listProfilesForProvider: listProfilesForProviderMock,
}));

vi.mock("openclaw/plugin-sdk/provider-auth-runtime", () => ({
  resolveApiKeyForProvider: resolveApiKeyForProviderMock,
}));

vi.mock("openclaw/plugin-sdk/provider-http", () => ({
  assertOkOrThrowHttpError: assertOkOrThrowHttpErrorMock,
  postJsonRequest: postJsonRequestMock,
  resolveProviderHttpRequestConfig: resolveProviderHttpRequestConfigMock,
}));

function mockCodexAuthOnly() {
  resolveApiKeyForProviderMock.mockImplementation(async (params?: { provider?: string }) => {
    if (params?.provider === "openai-codex") {
      return { apiKey: "codex-key", source: "profile:openai-codex:default", mode: "oauth" };
    }
    throw new Error('No API key found for provider "openai".');
  });
}

function createCodexOAuthAuthStore() {
  return {
    version: 1 as const,
    profiles: {
      "openai-codex:default": {
        type: "oauth" as const,
        provider: "openai-codex",
        access: "codex-access",
        refresh: "codex-refresh",
        expires: Date.now() + 60_000,
      },
    },
  };
}

describe("openai image generation provider", () => {
  afterEach(() => {
    ensureAuthProfileStoreMock.mockReset();
    ensureAuthProfileStoreMock.mockReturnValue({ version: 1, profiles: {} });
    isProviderApiKeyConfiguredMock.mockReset();
    isProviderApiKeyConfiguredMock.mockReturnValue(false);
    listProfilesForProviderMock.mockClear();
    resolveApiKeyForProviderMock.mockReset();
    resolveApiKeyForProviderMock.mockResolvedValue({ apiKey: "openai-key" });
    postJsonRequestMock.mockReset();
    assertOkOrThrowHttpErrorMock.mockClear();
    resolveProviderHttpRequestConfigMock.mockClear();
    vi.unstubAllEnvs();
  });

  it("reports configured when either OpenAI API key auth or Codex OAuth auth is available", () => {
    const provider = buildOpenAIImageGenerationProvider();

    isProviderApiKeyConfiguredMock.mockImplementation((params?: { provider?: string }) => {
      return params?.provider === "openai";
    });
    expect(provider.isConfigured?.({ agentDir: "/tmp/agent" })).toBe(true);

    isProviderApiKeyConfiguredMock.mockClear();
    ensureAuthProfileStoreMock.mockReturnValue(createCodexOAuthAuthStore());
    expect(provider.isConfigured?.({ agentDir: "/tmp/agent" })).toBe(true);

    isProviderApiKeyConfiguredMock.mockReturnValue(false);
    ensureAuthProfileStoreMock.mockReturnValue({ version: 1, profiles: {} });
    expect(provider.isConfigured?.({ agentDir: "/tmp/agent" })).toBe(false);
  });

  it("does not report Codex OAuth image auth as configured for custom OpenAI endpoints", () => {
    const provider = buildOpenAIImageGenerationProvider();

    isProviderApiKeyConfiguredMock.mockImplementation((params?: { provider?: string }) => {
      return params?.provider === "openai-codex";
    });

    expect(
      provider.isConfigured?.({
        agentDir: "/tmp/agent",
        cfg: {
          models: {
            providers: {
              openai: {
                baseUrl: "https://openai-compatible.example.test/v1",
                models: [],
              },
            },
          },
        },
      }),
    ).toBe(false);
  });

  it("does not auto-allow local baseUrl overrides for image requests", async () => {
    postJsonRequestMock.mockResolvedValue({
      response: {
        json: async () => ({
          data: [{ b64_json: Buffer.from("png-bytes").toString("base64") }],
        }),
      },
      release: vi.fn(async () => {}),
    });

    const provider = buildOpenAIImageGenerationProvider();
    const result = await provider.generateImage({
      provider: "openai",
      model: "gpt-image-2",
      prompt: "Draw a QA lighthouse",
      cfg: {
        models: {
          providers: {
            openai: {
              baseUrl: "http://127.0.0.1:44080/v1",
              models: [],
            },
          },
        },
      },
    });

    expect(resolveProviderHttpRequestConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "http://127.0.0.1:44080/v1",
      }),
    );
    expect(postJsonRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "http://127.0.0.1:44080/v1/images/generations",
        allowPrivateNetwork: false,
      }),
    );
    expect(result.images).toHaveLength(1);
  });

  it("allows loopback image requests for the synthetic mock-openai provider", async () => {
    postJsonRequestMock.mockResolvedValue({
      response: {
        json: async () => ({
          data: [{ b64_json: Buffer.from("png-bytes").toString("base64") }],
        }),
      },
      release: vi.fn(async () => {}),
    });

    const provider = buildOpenAIImageGenerationProvider();
    const result = await provider.generateImage({
      provider: "mock-openai",
      model: "gpt-image-2",
      prompt: "Draw a QA lighthouse",
      cfg: {
        models: {
          providers: {
            openai: {
              baseUrl: "http://127.0.0.1:44080/v1",
              models: [],
            },
          },
        },
      },
    });

    expect(resolveProviderHttpRequestConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({
        allowPrivateNetwork: true,
      }),
    );
    expect(postJsonRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "http://127.0.0.1:44080/v1/images/generations",
        allowPrivateNetwork: true,
      }),
    );
    expect(result.images).toHaveLength(1);
  });

  it("allows loopback image requests for openai only inside the QA harness envelope", async () => {
    postJsonRequestMock.mockResolvedValue({
      response: {
        json: async () => ({
          data: [{ b64_json: Buffer.from("png-bytes").toString("base64") }],
        }),
      },
      release: vi.fn(async () => {}),
    });
    vi.stubEnv("OPENCLAW_QA_ALLOW_LOCAL_IMAGE_PROVIDER", "1");

    const provider = buildOpenAIImageGenerationProvider();
    const result = await provider.generateImage({
      provider: "openai",
      model: "gpt-image-2",
      prompt: "Draw a QA lighthouse",
      cfg: {
        models: {
          providers: {
            openai: {
              baseUrl: "http://127.0.0.1:44080/v1",
              models: [],
            },
          },
        },
      },
    });

    expect(resolveProviderHttpRequestConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({
        allowPrivateNetwork: true,
      }),
    );
    expect(postJsonRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        allowPrivateNetwork: true,
      }),
    );
    expect(result.images).toHaveLength(1);
  });

  it("uses Codex OAuth image auth when direct OpenAI auth is unavailable", async () => {
    postJsonRequestMock.mockResolvedValue({
      response: new Response(
        'data: {"type":"response.output_item.done","item":{"type":"image_generation_call","result":"Y29kZXgtcG5nLWJ5dGVz"}}\n\n' +
          'data: {"type":"response.completed","response":{}}\n\n',
      ),
      release: vi.fn(async () => {}),
    });
    mockCodexAuthOnly();

    const provider = buildOpenAIImageGenerationProvider();
    const result = await provider.generateImage({
      provider: "openai",
      model: "gpt-image-2",
      prompt: "Draw a codex-auth image",
      cfg: {},
      authStore: createCodexOAuthAuthStore(),
    });

    expect(resolveApiKeyForProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "openai-codex" }),
    );
    expect(postJsonRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://chatgpt.com/backend-api/codex/responses",
        body: expect.objectContaining({
          model: "gpt-5.5",
          tool_choice: { type: "image_generation" },
          stream: true,
          store: false,
        }),
      }),
    );
    expect(result.images).toHaveLength(1);
  });

  it.each([
    "https://chatgpt.com/backend-api",
    "https://chatgpt.com/backend-api/",
    "https://chatgpt.com/backend-api/v1",
    "https://chatgpt.com/backend-api/codex/v1",
  ])("canonicalizes configured Codex OAuth image baseUrl %s", async (configuredBaseUrl) => {
    postJsonRequestMock.mockResolvedValue({
      response: new Response(
        'data: {"type":"response.output_item.done","item":{"type":"image_generation_call","result":"Y29kZXgtcG5nLWJ5dGVz"}}\n\n' +
          'data: {"type":"response.completed","response":{}}\n\n',
      ),
      release: vi.fn(async () => {}),
    });
    mockCodexAuthOnly();

    const provider = buildOpenAIImageGenerationProvider();
    await provider.generateImage({
      provider: "openai",
      model: "gpt-image-2",
      prompt: "Draw through a legacy configured Codex endpoint",
      cfg: {
        models: {
          providers: {
            "openai-codex": {
              baseUrl: configuredBaseUrl,
              api: "openai-codex-responses",
              models: [],
            },
          },
        },
      },
      authStore: createCodexOAuthAuthStore(),
    });

    expect(resolveProviderHttpRequestConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://chatgpt.com/backend-api/codex",
        provider: "openai-codex",
        api: "openai-codex-responses",
        capability: "image",
      }),
    );
    expect(postJsonRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://chatgpt.com/backend-api/codex/responses",
      }),
    );
  });

  it("normalizes legacy gpt-image-1 sizes before native OpenAI generation", async () => {
    postJsonRequestMock.mockResolvedValue({
      response: {
        json: async () => ({
          data: [{ b64_json: Buffer.from("png-bytes").toString("base64") }],
        }),
      },
      release: vi.fn(async () => {}),
    });

    const provider = buildOpenAIImageGenerationProvider();
    const result = await provider.generateImage({
      provider: "openai",
      model: "gpt-image-1",
      prompt: "Create a wide Matrix QA image",
      cfg: {},
      size: "2048x1152",
    });

    expect(postJsonRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://api.openai.com/v1/images/generations",
        body: expect.objectContaining({
          model: "gpt-image-1",
          size: "1536x1024",
        }),
      }),
    );
    expect(result.metadata).toEqual({
      requestedSize: "2048x1152",
      normalizedSize: "1536x1024",
    });
  });

  it("does not normalize model-specific sizes for custom OpenAI-compatible endpoints", async () => {
    postJsonRequestMock.mockResolvedValue({
      response: {
        json: async () => ({
          data: [{ b64_json: Buffer.from("png-bytes").toString("base64") }],
        }),
      },
      release: vi.fn(async () => {}),
    });

    const provider = buildOpenAIImageGenerationProvider();
    const result = await provider.generateImage({
      provider: "openai",
      model: "gpt-image-1",
      prompt: "Create a wide local-provider image",
      cfg: {
        models: {
          providers: {
            openai: {
              baseUrl: "https://openai-compatible.example.com/v1",
              models: [],
            },
          },
        },
      },
      size: "2048x1152",
    });

    expect(postJsonRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://openai-compatible.example.com/v1/images/generations",
        body: expect.objectContaining({
          model: "gpt-image-1",
          size: "2048x1152",
        }),
      }),
    );
    expect(result.metadata).toBeUndefined();
  });

  it("uses JSON image_url edits for input-image requests", async () => {
    postJsonRequestMock.mockResolvedValue({
      response: {
        json: async () => ({
          data: [{ b64_json: Buffer.from("png-bytes").toString("base64") }],
        }),
      },
      release: vi.fn(async () => {}),
    });

    const provider = buildOpenAIImageGenerationProvider();
    const result = await provider.generateImage({
      provider: "openai",
      model: "gpt-image-2",
      prompt: "Change only the background to pale blue",
      cfg: {},
      inputImages: [
        {
          buffer: Buffer.from("png-bytes"),
          mimeType: "image/png",
          fileName: "reference.png",
        },
      ],
    });

    expect(postJsonRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://api.openai.com/v1/images/edits",
        body: expect.objectContaining({
          model: "gpt-image-2",
          prompt: "Change only the background to pale blue",
          images: [
            {
              image_url: "data:image/png;base64,cG5nLWJ5dGVz",
            },
          ],
        }),
      }),
    );
    expect(result.images).toHaveLength(1);
  });
});
