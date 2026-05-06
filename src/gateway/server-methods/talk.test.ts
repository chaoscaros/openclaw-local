import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import { normalizeResolvedSecretInputString } from "../../config/types.secrets.js";
import { talkHandlers } from "./talk.js";

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn<() => OpenClawConfig>(),
  readConfigFileSnapshot: vi.fn(),
  canonicalizeSpeechProviderId: vi.fn((providerId: string | undefined) => providerId),
  getSpeechProvider: vi.fn(),
  synthesizeSpeech: vi.fn(),
}));

vi.mock("../../config/config.js", () => ({
  loadConfig: mocks.loadConfig,
  readConfigFileSnapshot: mocks.readConfigFileSnapshot,
}));

vi.mock("../../tts/provider-registry.js", () => ({
  canonicalizeSpeechProviderId: mocks.canonicalizeSpeechProviderId,
  getSpeechProvider: mocks.getSpeechProvider,
}));

vi.mock("../../tts/tts.js", () => ({
  synthesizeSpeech: mocks.synthesizeSpeech,
}));

function createTalkConfig(apiKey: unknown): OpenClawConfig {
  return {
    talk: {
      provider: "acme",
      providers: {
        acme: {
          apiKey,
          voiceId: "stub-default-voice",
        },
      },
    },
  } as OpenClawConfig;
}

describe("talk.speak handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the active runtime config snapshot instead of the raw config snapshot", async () => {
    const runtimeConfig = createTalkConfig("env-acme-key");
    const diskConfig = createTalkConfig({
      source: "env",
      provider: "default",
      id: "ACME_SPEECH_API_KEY",
    });

    mocks.loadConfig.mockReturnValue(runtimeConfig);
    mocks.readConfigFileSnapshot.mockResolvedValue({
      path: "/tmp/openclaw.json",
      hash: "test-hash",
      valid: true,
      config: diskConfig,
    });
    mocks.getSpeechProvider.mockReturnValue({
      id: "acme",
      label: "Acme Speech",
      resolveTalkConfig: ({
        talkProviderConfig,
      }: {
        talkProviderConfig: Record<string, unknown>;
      }) => talkProviderConfig,
    });
    mocks.synthesizeSpeech.mockImplementation(
      async ({ cfg }: { cfg: OpenClawConfig; text: string; disableFallback: boolean }) => {
        expect(cfg.messages?.tts?.provider).toBe("acme");
        expect(cfg.messages?.tts?.providers?.acme?.apiKey).toBe("env-acme-key");
        return {
          success: true,
          provider: "acme",
          audioBuffer: Buffer.from([1, 2, 3]),
          outputFormat: "mp3",
          voiceCompatible: false,
          fileExtension: ".mp3",
        };
      },
    );

    const respond = vi.fn();
    await talkHandlers["talk.speak"]({
      req: { type: "req", id: "1", method: "talk.speak" },
      params: { text: "Hello from talk mode." },
      client: null,
      isWebchatConnect: () => false,
      respond: respond as never,
      context: {} as never,
    });

    expect(mocks.loadConfig).toHaveBeenCalledTimes(1);
    expect(mocks.readConfigFileSnapshot).not.toHaveBeenCalled();
    expect(mocks.synthesizeSpeech).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Hello from talk mode.",
        disableFallback: true,
      }),
    );
    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        provider: "acme",
        audioBase64: Buffer.from([1, 2, 3]).toString("base64"),
        outputFormat: "mp3",
        mimeType: "audio/mpeg",
        fileExtension: ".mp3",
      }),
      undefined,
    );
  });
});

describe("talk.config handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function invokeTalkConfig(params: {
    sourceConfig: OpenClawConfig;
    runtimeConfig: OpenClawConfig;
    resolveTalkConfig: (args: {
      baseTtsConfig: Record<string, unknown>;
      talkProviderConfig: Record<string, unknown>;
      timeoutMs: number;
    }) => Record<string, unknown>;
  }) {
    mocks.readConfigFileSnapshot.mockResolvedValue({
      path: "/tmp/openclaw.json",
      hash: "test-hash",
      valid: true,
      config: params.sourceConfig,
    });
    mocks.getSpeechProvider.mockReturnValue({
      id: "acme",
      label: "Acme Strict Speech",
      resolveTalkConfig: params.resolveTalkConfig,
    });

    const respond = vi.fn();
    await talkHandlers["talk.config"]({
      req: { type: "req", id: "1", method: "talk.config" },
      params: {},
      client: { connect: { scopes: ["operator.read"] } } as never,
      isWebchatConnect: () => false,
      respond: respond as never,
      context: { getRuntimeConfig: () => params.runtimeConfig } as never,
    });
    return respond;
  }

  it("passes runtime-resolved messages.tts provider secrets to strict provider resolvers", async () => {
    const sourceConfig = {
      talk: {
        provider: "acme",
        providers: {
          acme: {
            voiceId: "voice-from-talk-config",
          },
        },
      },
      messages: {
        tts: {
          provider: "acme",
          timeoutMs: 12_345,
          providers: {
            acme: {
              apiKey: { source: "env", provider: "default", id: "ACME_SPEECH_API_KEY" },
            },
          },
        },
      },
    } as OpenClawConfig;
    const runtimeConfig = {
      ...sourceConfig,
      messages: {
        tts: {
          provider: "acme",
          timeoutMs: 54_321,
          providers: {
            acme: {
              apiKey: "env-acme-key",
            },
          },
        },
      },
    } as OpenClawConfig;

    const respond = await invokeTalkConfig({
      sourceConfig,
      runtimeConfig,
      resolveTalkConfig: ({
        baseTtsConfig,
        talkProviderConfig,
        timeoutMs,
      }: {
        baseTtsConfig: Record<string, unknown>;
        talkProviderConfig: Record<string, unknown>;
        timeoutMs: number;
      }) => {
        const providers = (baseTtsConfig.providers ?? {}) as Record<string, unknown>;
        const providerConfig = (providers.acme ?? {}) as Record<string, unknown>;
        const apiKey = normalizeResolvedSecretInputString({
          value: providerConfig.apiKey,
          path: "messages.tts.providers.acme.apiKey",
        });
        expect(apiKey).toBe("env-acme-key");
        expect(timeoutMs).toBe(54_321);
        return {
          ...talkProviderConfig,
          ...(apiKey === undefined ? {} : { apiKey }),
        };
      },
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      {
        config: {
          talk: expect.objectContaining({
            provider: "acme",
            resolved: {
              provider: "acme",
              config: expect.objectContaining({
                apiKey: "__OPENCLAW_REDACTED__",
              }),
            },
          }),
        },
      },
      undefined,
    );
  });

  it("strips unresolved token SecretRefs from source messages.tts provider configs", async () => {
    const sourceConfig = {
      talk: {
        provider: "acme",
        providers: {
          acme: {
            voiceId: "voice-from-talk-config",
          },
        },
      },
      messages: {
        tts: {
          provider: "acme",
          providers: {
            acme: {
              token: { source: "env", provider: "default", id: "ACME_SPEECH_TOKEN" },
            },
          },
        },
      },
    } as OpenClawConfig;

    const respond = await invokeTalkConfig({
      sourceConfig,
      runtimeConfig: {
        ...sourceConfig,
        messages: {
          tts: {},
        },
      } as OpenClawConfig,
      resolveTalkConfig: ({ baseTtsConfig, talkProviderConfig, timeoutMs }) => {
        const providers = (baseTtsConfig.providers ?? {}) as Record<string, unknown>;
        const providerConfig = (providers.acme ?? {}) as Record<string, unknown>;
        expect(providerConfig.token).toBeUndefined();
        expect(timeoutMs).toBe(30_000);
        return { ...talkProviderConfig };
      },
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      {
        config: {
          talk: expect.objectContaining({
            provider: "acme",
            resolved: {
              provider: "acme",
              config: expect.any(Object),
            },
          }),
        },
      },
      undefined,
    );
  });

  it("hardens base TTS provider cleanup against __proto__ provider keys", async () => {
    const providers = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(providers, "__proto__", {
      value: {
        token: { source: "env", provider: "default", id: "PROTO_TOKEN" },
      },
      enumerable: true,
      configurable: true,
      writable: true,
    });
    providers.acme = {
      apiKey: { source: "env", provider: "default", id: "ACME_SPEECH_API_KEY" },
    };

    const sourceConfig = {
      talk: {
        provider: "acme",
        providers: {
          acme: {
            voiceId: "voice-from-talk-config",
          },
        },
      },
      messages: {
        tts: {
          provider: "acme",
          providers,
        },
      },
    } as OpenClawConfig;

    await invokeTalkConfig({
      sourceConfig,
      runtimeConfig: {
        ...sourceConfig,
        messages: {
          tts: {},
        },
      } as OpenClawConfig,
      resolveTalkConfig: ({ baseTtsConfig, talkProviderConfig }) => {
        const providers = (baseTtsConfig.providers ?? {}) as Record<string, unknown>;
        expect(Object.getPrototypeOf(providers)).toBeNull();
        expect(({} as { token?: unknown }).token).toBeUndefined();
        expect(Object.prototype.hasOwnProperty.call(providers, "__proto__")).toBe(true);
        expect((providers.__proto__ as Record<string, unknown>).token).toBeUndefined();
        return { ...talkProviderConfig };
      },
    });
  });
});
