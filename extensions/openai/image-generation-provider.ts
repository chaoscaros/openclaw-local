import type { OpenClawConfig } from "openclaw/plugin-sdk/config-runtime";
import type { ImageGenerationProvider } from "openclaw/plugin-sdk/image-generation";
import { resolveClosestSize } from "openclaw/plugin-sdk/media-generation-runtime";
import {
  ensureAuthProfileStore,
  isProviderApiKeyConfigured,
  listProfilesForProvider,
  type AuthProfileStore,
} from "openclaw/plugin-sdk/provider-auth";
import { resolveApiKeyForProvider } from "openclaw/plugin-sdk/provider-auth-runtime";
import {
  assertOkOrThrowHttpError,
  postJsonRequest,
  resolveProviderHttpRequestConfig,
} from "openclaw/plugin-sdk/provider-http";
import { canonicalizeCodexResponsesBaseUrl, OPENAI_CODEX_RESPONSES_BASE_URL } from "./base-url.js";
import { OPENAI_DEFAULT_IMAGE_MODEL as DEFAULT_OPENAI_IMAGE_MODEL } from "./default-models.js";
import { resolveConfiguredOpenAIBaseUrl, toOpenAIDataUrl } from "./shared.js";

const DEFAULT_OPENAI_IMAGE_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_CODEX_IMAGE_BASE_URL = OPENAI_CODEX_RESPONSES_BASE_URL;
const DEFAULT_OPENAI_CODEX_IMAGE_RESPONSES_MODEL = "gpt-5.5";
const OPENAI_CODEX_IMAGE_INSTRUCTIONS = "You are an image generation assistant.";
const DEFAULT_OUTPUT_MIME = "image/png";
const DEFAULT_SIZE = "1024x1024";
const OPENAI_SUPPORTED_SIZES = ["1024x1024", "1024x1536", "1536x1024", "1024x1792", "1792x1024"] as const;
const OPENAI_LEGACY_IMAGE_SIZES = ["1024x1024", "1536x1024", "1024x1536"] as const;
const OPENAI_MAX_INPUT_IMAGES = 5;
const MOCK_OPENAI_PROVIDER_ID = "mock-openai";

function shouldAllowPrivateImageEndpoint(req: {
  provider: string;
  cfg: OpenClawConfig | undefined;
}) {
  if (req.provider === MOCK_OPENAI_PROVIDER_ID) {
    return true;
  }
  const baseUrl = resolveConfiguredOpenAIBaseUrl(req.cfg);
  if (!baseUrl.startsWith("http://127.0.0.1:") && !baseUrl.startsWith("http://localhost:")) {
    return false;
  }
  return process.env.OPENCLAW_QA_ALLOW_LOCAL_IMAGE_PROVIDER === "1";
}

type OpenAIImageApiResponse = {
  data?: Array<{
    b64_json?: string;
    revised_prompt?: string;
  }>;
};

type OpenAICodexImageGenerationEvent = {
  type?: string;
  item?: {
    type?: string;
    result?: string;
    revised_prompt?: string;
  };
  response?: {
    output?: Array<{
      type?: string;
      result?: string;
      revised_prompt?: string;
    }>;
  };
  error?: {
    code?: string;
    message?: string;
  };
  message?: string;
};

function isPublicOpenAIImageBaseUrl(baseUrl: string): boolean {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    const pathName = parsed.pathname.replace(/\/+$/, "");
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.toLowerCase() === "api.openai.com" &&
      parsed.port === "" &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.search === "" &&
      parsed.hash === "" &&
      pathName === "/v1"
    );
  } catch {
    return false;
  }
}

function resolveRequestAuthStore(req: { authStore?: AuthProfileStore; agentDir?: string }): AuthProfileStore | undefined {
  if (req.authStore) {
    return req.authStore;
  }
  const agentDir = req.agentDir?.trim();
  if (!agentDir) {
    return undefined;
  }
  return ensureAuthProfileStore(agentDir, { allowKeychainPrompt: false });
}

function hasCodexOAuthProfileConfigured(req: { authStore?: AuthProfileStore; agentDir?: string }): boolean {
  const store = resolveRequestAuthStore(req);
  return Boolean(store && listProfilesForProvider(store, "openai-codex").length > 0);
}

function hasExplicitOpenAIDirectProviderConfig(cfg: OpenClawConfig | undefined): boolean {
  const providerConfig = cfg?.models?.providers?.openai;
  if (!providerConfig) {
    return false;
  }
  if (providerConfig.apiKey !== undefined || providerConfig.api !== undefined) {
    return true;
  }
  const configuredBaseUrl = resolveConfiguredOpenAIBaseUrl(cfg);
  return configuredBaseUrl.trim().length > 0 && !isPublicOpenAIImageBaseUrl(configuredBaseUrl);
}

async function resolveOptionalApiKeyForProvider(
  params: Parameters<typeof resolveApiKeyForProvider>[0],
) {
  try {
    return await resolveApiKeyForProvider(params);
  } catch (error) {
    const provider = params?.provider ?? "";
    const message = error instanceof Error ? error.message : "";
    if (!message.startsWith(`No API key found for provider "${provider}".`)) {
      throw error;
    }
    return null;
  }
}

function resolveNativeOpenAIImageSizesForModel(model: string): readonly string[] {
  switch (model) {
    case "gpt-image-1":
    case "gpt-image-1-mini":
      return OPENAI_LEGACY_IMAGE_SIZES;
    default:
      return OPENAI_SUPPORTED_SIZES;
  }
}

function resolveOpenAIImageRequestSize(params: {
  model: string;
  requestedSize?: string;
  applyNativeLimits: boolean;
}): {
  size: string;
  metadata?: Record<string, string>;
} {
  const requestedSize = params.requestedSize ?? DEFAULT_SIZE;
  if (!params.applyNativeLimits) {
    return { size: requestedSize };
  }
  const supportedSizes = resolveNativeOpenAIImageSizesForModel(params.model);
  const size =
    resolveClosestSize({
      requestedSize,
      supportedSizes,
    }) ?? DEFAULT_SIZE;
  if (size === requestedSize) {
    return { size };
  }
  return {
    size,
    metadata: {
      requestedSize,
      normalizedSize: size,
    },
  };
}

function extractCodexImageGenerationResult(body: string, model: string) {
  const events: OpenAICodexImageGenerationEvent[] = [];
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith("data: ")) {
      continue;
    }
    const data = line.slice(6).trim();
    if (!data || data === "[DONE]") {
      continue;
    }
    try {
      events.push(JSON.parse(data) as OpenAICodexImageGenerationEvent);
    } catch {
      continue;
    }
  }
  const failure = events.find((event) => event.type === "response.failed" || event.type === "error");
  if (failure) {
    throw new Error(failure.error?.message ?? failure.message ?? "OpenAI Codex image generation failed");
  }
  const outputItemImages = events
    .filter(
      (event) =>
        event.type === "response.output_item.done" &&
        event.item?.type === "image_generation_call" &&
        typeof event.item.result === "string" &&
        event.item.result.length > 0,
    )
    .map((event, index) => ({
      buffer: Buffer.from(event.item?.result ?? "", "base64"),
      mimeType: DEFAULT_OUTPUT_MIME,
      fileName: `image-${index + 1}.png`,
      ...(event.item?.revised_prompt ? { revisedPrompt: event.item.revised_prompt } : {}),
    }));
  const completedResponse = events.find((event) => event.type === "response.completed");
  const completedOutputImages = (completedResponse?.response?.output ?? [])
    .filter((entry) => entry.type === "image_generation_call" && typeof entry.result === "string")
    .map((entry, index) => ({
      buffer: Buffer.from(entry.result ?? "", "base64"),
      mimeType: DEFAULT_OUTPUT_MIME,
      fileName: `image-${index + 1}.png`,
      ...(entry.revised_prompt ? { revisedPrompt: entry.revised_prompt } : {}),
    }));
  const images = outputItemImages.length > 0 ? outputItemImages : completedOutputImages;
  return { images, model };
}

async function generateOpenAICodexImage(req: Parameters<ImageGenerationProvider["generateImage"]>[0], apiKey: string) {
  const model = req.model || DEFAULT_OPENAI_IMAGE_MODEL;
  const count = req.count ?? 1;
  const sizeResolution = resolveOpenAIImageRequestSize({
    model,
    requestedSize: req.size,
    applyNativeLimits: true,
  });
  const size = sizeResolution.size;
  const { baseUrl, allowPrivateNetwork, headers, dispatcherPolicy } =
    resolveProviderHttpRequestConfig({
      baseUrl: canonicalizeCodexResponsesBaseUrl(req.cfg?.models?.providers?.["openai-codex"]?.baseUrl),
      defaultBaseUrl: DEFAULT_OPENAI_CODEX_IMAGE_BASE_URL,
      defaultHeaders: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "text/event-stream",
      },
      provider: "openai-codex",
      api: "openai-codex-responses",
      capability: "image",
      transport: "http",
    });
  headers.set("Content-Type", "application/json");
  const content = [{ type: "input_text", text: req.prompt }];
  const results = [] as Array<{ images: Array<{ buffer: Buffer; mimeType: string; fileName: string; revisedPrompt?: string }>; model: string }>;
  for (let index = 0; index < count; index += 1) {
    const requestResult = await postJsonRequest({
      url: `${baseUrl}/responses`,
      headers,
      body: {
        model: DEFAULT_OPENAI_CODEX_IMAGE_RESPONSES_MODEL,
        input: [{ role: "user", content }],
        instructions: OPENAI_CODEX_IMAGE_INSTRUCTIONS,
        tools: [{ type: "image_generation", model, size }],
        tool_choice: { type: "image_generation" },
        stream: true,
        store: false,
      },
      timeoutMs: req.timeoutMs,
      fetchFn: fetch,
      allowPrivateNetwork,
      dispatcherPolicy,
    });
    const { response, release } = requestResult;
    try {
      await assertOkOrThrowHttpError(response, "OpenAI Codex image generation failed");
      results.push(extractCodexImageGenerationResult(await response.text(), model));
    } finally {
      await release();
    }
  }
  return {
    images: results.flatMap((result) => result.images),
    model,
    ...(sizeResolution.metadata ? { metadata: sizeResolution.metadata } : {}),
  };
}

export function buildOpenAIImageGenerationProvider(): ImageGenerationProvider {
  return {
    id: "openai",
    label: "OpenAI",
    defaultModel: DEFAULT_OPENAI_IMAGE_MODEL,
    models: [DEFAULT_OPENAI_IMAGE_MODEL],
    isConfigured: ({ agentDir, cfg, authStore }) => {
      if (
        isProviderApiKeyConfigured({
          provider: "openai",
          agentDir,
        })
      ) {
        return true;
      }
      if (hasExplicitOpenAIDirectProviderConfig(cfg)) {
        return false;
      }
      return hasCodexOAuthProfileConfigured({ authStore, agentDir });
    },
    capabilities: {
      generate: {
        maxCount: 4,
        supportsSize: true,
        supportsAspectRatio: false,
        supportsResolution: false,
      },
      edit: {
        enabled: true,
        maxCount: 4,
        maxInputImages: OPENAI_MAX_INPUT_IMAGES,
        supportsSize: true,
        supportsAspectRatio: false,
        supportsResolution: false,
      },
      geometry: {
        sizes: [...OPENAI_SUPPORTED_SIZES],
      },
    },
    async generateImage(req) {
      const inputImages = req.inputImages ?? [];
      const isEdit = inputImages.length > 0;
      const directAuth = await resolveOptionalApiKeyForProvider({
        provider: "openai",
        cfg: req.cfg,
        agentDir: req.agentDir,
        store: req.authStore,
      });
      const directApiKey = directAuth?.apiKey?.trim();
      if (!directApiKey && !hasExplicitOpenAIDirectProviderConfig(req.cfg)) {
        const codexAuth = await resolveOptionalApiKeyForProvider({
          provider: "openai-codex",
          cfg: req.cfg,
          agentDir: req.agentDir,
          store: req.authStore,
        });
        if (codexAuth?.apiKey) {
          return generateOpenAICodexImage(req, codexAuth.apiKey);
        }
      }
      if (!directApiKey) {
        throw new Error("OpenAI API key missing");
      }
      const { baseUrl, allowPrivateNetwork, headers, dispatcherPolicy } =
        resolveProviderHttpRequestConfig({
          baseUrl: resolveConfiguredOpenAIBaseUrl(req.cfg),
          defaultBaseUrl: DEFAULT_OPENAI_IMAGE_BASE_URL,
          allowPrivateNetwork: shouldAllowPrivateImageEndpoint(req),
          defaultHeaders: {
            Authorization: `Bearer ${directApiKey}`,
          },
          provider: "openai",
          capability: "image",
          transport: "http",
        });

      const model = req.model || DEFAULT_OPENAI_IMAGE_MODEL;
      const count = req.count ?? 1;
      const sizeResolution = resolveOpenAIImageRequestSize({
        model,
        requestedSize: req.size,
        applyNativeLimits: isPublicOpenAIImageBaseUrl(baseUrl),
      });
      const size = sizeResolution.size;
      const requestResult = isEdit
        ? await (() => {
            const jsonHeaders = new Headers(headers);
            jsonHeaders.set("Content-Type", "application/json");
            return postJsonRequest({
              url: `${baseUrl}/images/edits`,
              headers: jsonHeaders,
              body: {
                model,
                prompt: req.prompt,
                n: count,
                size,
                images: inputImages.map((image) => ({
                  image_url: toOpenAIDataUrl(
                    image.buffer,
                    image.mimeType?.trim() || DEFAULT_OUTPUT_MIME,
                  ),
                })),
              },
              timeoutMs: req.timeoutMs,
              fetchFn: fetch,
              allowPrivateNetwork,
              dispatcherPolicy,
            });
          })()
        : await (() => {
            const jsonHeaders = new Headers(headers);
            jsonHeaders.set("Content-Type", "application/json");
            return postJsonRequest({
              url: `${baseUrl}/images/generations`,
              headers: jsonHeaders,
              body: {
                model,
                prompt: req.prompt,
                n: count,
                size,
              },
              timeoutMs: req.timeoutMs,
              fetchFn: fetch,
              allowPrivateNetwork,
              dispatcherPolicy,
            });
          })();
      const { response, release } = requestResult;
      try {
        await assertOkOrThrowHttpError(
          response,
          isEdit ? "OpenAI image edit failed" : "OpenAI image generation failed",
        );

        const data = (await response.json()) as OpenAIImageApiResponse;
        const images = (data.data ?? [])
          .map((entry, index) => {
            if (!entry.b64_json) {
              return null;
            }
            return {
              buffer: Buffer.from(entry.b64_json, "base64"),
              mimeType: DEFAULT_OUTPUT_MIME,
              fileName: `image-${index + 1}.png`,
              ...(entry.revised_prompt ? { revisedPrompt: entry.revised_prompt } : {}),
            };
          })
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

        return {
          images,
          model,
          ...(sizeResolution.metadata ? { metadata: sizeResolution.metadata } : {}),
        };
      } finally {
        await release();
      }
    },
  };
}
