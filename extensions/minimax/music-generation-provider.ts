import { extensionForMime } from "openclaw/plugin-sdk/media-mime";
import type {
  GeneratedMusicAsset,
  MusicGenerationProvider,
  MusicGenerationRequest,
} from "openclaw/plugin-sdk/music-generation";
import { isProviderApiKeyConfigured } from "openclaw/plugin-sdk/provider-auth";
import { resolveApiKeyForProvider } from "openclaw/plugin-sdk/provider-auth-runtime";
import {
  assertOkOrThrowHttpError,
  fetchProviderDownloadResponse,
  postJsonRequest,
  resolveProviderHttpRequestConfig,
} from "openclaw/plugin-sdk/provider-http";
import { readResponseWithLimit } from "openclaw/plugin-sdk/response-limit-runtime";
import { normalizeOptionalString } from "openclaw/plugin-sdk/string-coerce-runtime";

const DEFAULT_MINIMAX_MUSIC_BASE_URL = "https://api.minimax.io";
const DEFAULT_MINIMAX_MUSIC_MODEL = "music-2.6";
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_GENERATED_MUSIC_MAX_BYTES = 16 * 1024 * 1024;

type MinimaxBaseResp = {
  status_code?: number;
  status_msg?: string;
};

type MinimaxMusicCreateResponse = {
  task_id?: string;
  audio?: string;
  audio_url?: string;
  lyrics?: string;
  data?: {
    audio?: string;
    audio_url?: string;
    lyrics?: string;
  };
  base_resp?: MinimaxBaseResp;
};

function resolveMinimaxMusicBaseUrl(
  cfg: Parameters<typeof resolveApiKeyForProvider>[0]["cfg"],
  providerId: string,
): string {
  const direct = normalizeOptionalString(cfg?.models?.providers?.[providerId]?.baseUrl);
  if (!direct) {
    return DEFAULT_MINIMAX_MUSIC_BASE_URL;
  }
  try {
    return new URL(direct).origin;
  } catch {
    return DEFAULT_MINIMAX_MUSIC_BASE_URL;
  }
}

function assertMinimaxBaseResp(baseResp: MinimaxBaseResp | undefined, context: string): void {
  if (!baseResp || typeof baseResp.status_code !== "number" || baseResp.status_code === 0) {
    return;
  }
  throw new Error(
    `${context} (${baseResp.status_code}): ${baseResp.status_msg ?? "unknown error"}`,
  );
}

function createGeneratedMusicTooLargeError(maxBytes: number): Error {
  return new Error(`MiniMax generated music download exceeds ${maxBytes} bytes`);
}

function estimateBase64DecodedBytes(value: string): number {
  const normalized = value.replace(/\s+/gu, "");
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

function decodePossibleBinaryWithLimit(data: string, maxBytes: number): Buffer {
  const trimmed = data.trim();
  if (/^[0-9a-f]+$/iu.test(trimmed) && trimmed.length % 2 === 0) {
    if (trimmed.length / 2 > maxBytes) {
      throw createGeneratedMusicTooLargeError(maxBytes);
    }
    return Buffer.from(trimmed, "hex");
  }
  if (estimateBase64DecodedBytes(trimmed) > maxBytes) {
    throw createGeneratedMusicTooLargeError(maxBytes);
  }
  return Buffer.from(trimmed, "base64");
}

function decodePossibleText(data: string): string {
  const trimmed = data.trim();
  if (!trimmed) {
    return "";
  }
  if (/^[0-9a-f]+$/iu.test(trimmed) && trimmed.length % 2 === 0) {
    return Buffer.from(trimmed, "hex").toString("utf8").trim();
  }
  return trimmed;
}

function isLikelyRemoteUrl(value: string | undefined): boolean {
  const trimmed = normalizeOptionalString(value);
  return Boolean(trimmed && /^https?:\/\//iu.test(trimmed));
}

function resolveGeneratedMusicMaxBytes(req: MusicGenerationRequest): number {
  const configured = req.cfg.agents?.defaults?.mediaMaxMb;
  if (typeof configured === "number" && Number.isFinite(configured) && configured > 0) {
    return Math.floor(configured * 1024 * 1024);
  }
  return DEFAULT_GENERATED_MUSIC_MAX_BYTES;
}

async function downloadTrackFromUrl(params: {
  url: string;
  timeoutMs?: number;
  fetchFn: typeof fetch;
  maxBytes: number;
}): Promise<GeneratedMusicAsset> {
  const response = await fetchProviderDownloadResponse({
    url: params.url,
    init: { method: "GET" },
    timeoutMs: params.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    fetchFn: params.fetchFn,
    provider: "minimax",
    requestFailedMessage: "MiniMax generated music download failed",
  });
  const mimeType = normalizeOptionalString(response.headers.get("content-type")) ?? "audio/mpeg";
  const ext = extensionForMime(mimeType)?.replace(/^\./u, "") || "mp3";
  return {
    buffer: await readResponseWithLimit(response, params.maxBytes, {
      onOverflow: ({ maxBytes }) => createGeneratedMusicTooLargeError(maxBytes),
    }),
    mimeType,
    fileName: `track-1.${ext}`,
  };
}

function resolveMinimaxMusicModel(model: string | undefined): string {
  const trimmed = normalizeOptionalString(model);
  if (!trimmed) {
    return DEFAULT_MINIMAX_MUSIC_MODEL;
  }
  return trimmed;
}

function buildMinimaxMusicProvider(providerId: string): MusicGenerationProvider {
  return {
    id: providerId,
    label: "MiniMax",
    defaultModel: DEFAULT_MINIMAX_MUSIC_MODEL,
    models: [DEFAULT_MINIMAX_MUSIC_MODEL, "music-2.6-free", "music-cover", "music-cover-free"],
    isConfigured: ({ agentDir }) =>
      isProviderApiKeyConfigured({
        provider: providerId,
        agentDir,
      }),
    capabilities: {
      generate: {
        maxTracks: 1,
        supportsLyrics: true,
        supportsInstrumental: true,
        supportsFormat: true,
        supportedFormats: ["mp3"],
      },
      edit: {
        enabled: false,
      },
    },
    async generateMusic(req) {
      if ((req.inputImages?.length ?? 0) > 0) {
        throw new Error("MiniMax music generation does not support image reference inputs.");
      }
      if (req.instrumental === true && normalizeOptionalString(req.lyrics)) {
        throw new Error("MiniMax music generation cannot use lyrics when instrumental=true.");
      }
      if (req.format && req.format !== "mp3") {
        throw new Error("MiniMax music generation currently supports mp3 output only.");
      }

      const auth = await resolveApiKeyForProvider({
        provider: providerId,
        cfg: req.cfg,
        agentDir: req.agentDir,
        store: req.authStore,
      });
      if (!auth.apiKey) {
        throw new Error("MiniMax API key missing");
      }

      const fetchFn = fetch;
      const { baseUrl, allowPrivateNetwork, headers, dispatcherPolicy } =
        resolveProviderHttpRequestConfig({
          baseUrl: resolveMinimaxMusicBaseUrl(req.cfg, providerId),
          defaultBaseUrl: DEFAULT_MINIMAX_MUSIC_BASE_URL,
          allowPrivateNetwork: false,
          defaultHeaders: {
            Authorization: `Bearer ${auth.apiKey}`,
          },
          provider: providerId,
          capability: "audio",
          transport: "http",
        });
      const jsonHeaders = new Headers(headers);
      jsonHeaders.set("Content-Type", "application/json");

      const model = resolveMinimaxMusicModel(req.model);
      const lyrics = normalizeOptionalString(req.lyrics);
      const body = {
        model,
        prompt: req.prompt.trim(),
        ...(req.instrumental === true ? { is_instrumental: true } : {}),
        ...(lyrics ? { lyrics } : req.instrumental === true ? {} : { lyrics_optimizer: true }),
        output_format: "url",
        audio_setting: {
          sample_rate: 44_100,
          bitrate: 256_000,
          format: "mp3",
        },
      };

      const { response: res, release } = await postJsonRequest({
        url: `${baseUrl}/v1/music_generation`,
        headers: jsonHeaders,
        body,
        timeoutMs: req.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        fetchFn,
        pinDns: false,
        allowPrivateNetwork,
        dispatcherPolicy,
      });

      try {
        await assertOkOrThrowHttpError(res, "MiniMax music generation failed");
        const payload = (await res.json()) as MinimaxMusicCreateResponse;
        assertMinimaxBaseResp(payload.base_resp, "MiniMax music generation failed");

        const audioCandidate =
          normalizeOptionalString(payload.audio) ?? normalizeOptionalString(payload.data?.audio);
        const audioUrl =
          normalizeOptionalString(payload.audio_url) ||
          normalizeOptionalString(payload.data?.audio_url) ||
          (isLikelyRemoteUrl(audioCandidate) ? audioCandidate : undefined);
        const inlineAudio = isLikelyRemoteUrl(audioCandidate) ? undefined : audioCandidate;
        const lyrics = decodePossibleText(payload.lyrics ?? payload.data?.lyrics ?? "");
        const maxGeneratedMusicBytes = resolveGeneratedMusicMaxBytes(req);

        const track = audioUrl
          ? await downloadTrackFromUrl({
              url: audioUrl,
              timeoutMs: req.timeoutMs,
              fetchFn,
              maxBytes: maxGeneratedMusicBytes,
            })
          : inlineAudio
            ? {
                buffer: decodePossibleBinaryWithLimit(inlineAudio, maxGeneratedMusicBytes),
                mimeType: "audio/mpeg",
                fileName: "track-1.mp3",
              }
            : null;
        if (!track) {
          throw new Error("MiniMax music generation response missing audio output");
        }

        return {
          tracks: [track],
          ...(lyrics ? { lyrics: [lyrics] } : {}),
          model,
          metadata: {
            ...(normalizeOptionalString(payload.task_id)
              ? { taskId: normalizeOptionalString(payload.task_id) }
              : {}),
            ...(audioUrl ? { audioUrl } : {}),
            instrumental: req.instrumental === true,
            ...(lyrics ? { requestedLyrics: true } : {}),
          },
        };
      } finally {
        await release();
      }
    },
  };
}

export function buildMinimaxMusicGenerationProvider(): MusicGenerationProvider {
  return buildMinimaxMusicProvider("minimax");
}

export function buildMinimaxPortalMusicGenerationProvider(): MusicGenerationProvider {
  return buildMinimaxMusicProvider("minimax-portal");
}
