import type { StreamFn } from "@mariozechner/pi-agent-core";
import type { ProviderWrapStreamFnContext } from "openclaw/plugin-sdk/plugin-entry";
import { buildProviderStreamFamilyHooks } from "openclaw/plugin-sdk/provider-stream-family";
import { streamWithPayloadPatch } from "openclaw/plugin-sdk/provider-stream-shared";
import { createSubsystemLogger } from "openclaw/plugin-sdk/runtime-env";

const OPENROUTER_THINKING_STREAM_HOOKS = buildProviderStreamFamilyHooks("openrouter-thinking");
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const log = createSubsystemLogger("openrouter-stream");

type StreamOptionsWithPayload = Parameters<StreamFn>[2] & {
  onPayload?: (payload: Record<string, unknown>, model: Parameters<StreamFn>[0]) => unknown;
};

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function normalizeOpenRouterBaseUrl(baseUrl: unknown): string | undefined {
  const raw = readString(baseUrl);
  if (!raw) {
    return undefined;
  }
  return raw.replace(/\/+$/, "") === "https://openrouter.ai/v1" ? OPENROUTER_BASE_URL : raw;
}

function isVerifiedOpenRouterRoute(model: Parameters<StreamFn>[0]): boolean {
  const baseUrl = normalizeOpenRouterBaseUrl(model.baseUrl);
  if (baseUrl) {
    return baseUrl === OPENROUTER_BASE_URL;
  }
  return readString(model.provider)?.toLowerCase() === "openrouter";
}

function shouldPatchOpenRouterRoutingPayload(model: Parameters<StreamFn>[0]): boolean {
  const api = readString(model.api);
  return (api === undefined || api === "openai-completions") && isVerifiedOpenRouterRoute(model);
}

function isOpenRouterAnthropicModelId(modelId: unknown): boolean {
  const normalized = readString(modelId)?.toLowerCase();
  return (
    normalized?.startsWith("anthropic/") === true ||
    normalized?.startsWith("openrouter/anthropic/") === true
  );
}

function shouldPatchAnthropicOpenRouterPayload(model: Parameters<StreamFn>[0]): boolean {
  const api = readString(model.api);
  return (
    (api === undefined || api === "openai-completions") &&
    isOpenRouterAnthropicModelId(model.id) &&
    isVerifiedOpenRouterRoute(model)
  );
}

function isEnabledReasoningValue(value: unknown): boolean {
  if (value === undefined || value === null || value === false) {
    return false;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized !== "" && normalized !== "off" && normalized !== "none";
  }
  return true;
}

function isOpenRouterReasoningPayloadEnabled(payload: Record<string, unknown>): boolean {
  return (
    isEnabledReasoningValue(payload.reasoning) || isEnabledReasoningValue(payload.reasoning_effort)
  );
}

function assistantMessageHasOpenAIToolCalls(message: Record<string, unknown>): boolean {
  return Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
}

function isAnthropicToolCallContentBlock(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    ((value as { type?: unknown }).type === "tool_use" ||
      (value as { type?: unknown }).type === "toolCall")
  );
}

function assistantMessageHasAnthropicToolUse(message: Record<string, unknown>): boolean {
  const content = message.content;
  return Array.isArray(content) && content.some(isAnthropicToolCallContentBlock);
}

function shouldStripOpenRouterTrailingMessage(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const message = value as Record<string, unknown>;
  return (
    message.role === "assistant" &&
    !assistantMessageHasOpenAIToolCalls(message) &&
    !assistantMessageHasAnthropicToolUse(message)
  );
}

function stripTrailingOpenRouterAssistantPrefillMessages(payload: Record<string, unknown>): number {
  const messages = payload.messages;
  if (!Array.isArray(messages)) {
    return 0;
  }

  let keep = messages.length;
  while (keep > 0 && shouldStripOpenRouterTrailingMessage(messages[keep - 1])) {
    keep -= 1;
  }
  if (keep === messages.length) {
    return 0;
  }
  const stripped = messages.length - keep;
  messages.splice(keep);
  return stripped;
}

function injectOpenRouterRouting(
  baseStreamFn: StreamFn | undefined,
  providerRouting?: Record<string, unknown>,
): StreamFn | undefined {
  if (!providerRouting) {
    return baseStreamFn;
  }
  return (model, context, options) => {
    const streamFn =
      baseStreamFn ??
      ((nextModel) => {
        throw new Error(
          `OpenRouter routing wrapper requires an underlying streamFn for ${nextModel.id}.`,
        );
      });
    const routedOptions = shouldPatchOpenRouterRoutingPayload(model)
      ? ({
          ...options,
          onPayload: (payload: Record<string, unknown>, payloadModel: Parameters<StreamFn>[0]) => {
            if (payload.provider === undefined) {
              payload.provider = providerRouting;
            }
            return (options as StreamOptionsWithPayload | undefined)?.onPayload?.(
              payload,
              payloadModel,
            );
          },
        } as Parameters<StreamFn>[2])
      : options;
    return streamFn(
      {
        ...model,
        compat: { ...model.compat, openRouterRouting: providerRouting },
      } as typeof model,
      context,
      routedOptions,
    );
  };
}

function createOpenRouterAnthropicPrefillWrapper(baseStreamFn: StreamFn | undefined): StreamFn {
  const underlying =
    baseStreamFn ??
    ((nextModel) => {
      throw new Error(
        `OpenRouter prefill wrapper requires an underlying streamFn for ${nextModel.id}.`,
      );
    });
  return (model, context, options) => {
    if (!shouldPatchAnthropicOpenRouterPayload(model)) {
      return underlying(model, context, options);
    }
    return streamWithPayloadPatch(underlying, model, context, options, (payload) => {
      if (!isOpenRouterReasoningPayloadEnabled(payload)) {
        return;
      }
      const stripped = stripTrailingOpenRouterAssistantPrefillMessages(payload);
      if (stripped > 0) {
        log.warn(
          `removed ${stripped} trailing assistant prefill message${stripped === 1 ? "" : "s"} because OpenRouter-routed Anthropic reasoning requires conversations to end with a user turn`,
        );
      }
    });
  };
}

export function wrapOpenRouterProviderStream(
  ctx: ProviderWrapStreamFnContext,
): StreamFn | null | undefined {
  const providerRouting =
    ctx.extraParams?.provider != null && typeof ctx.extraParams.provider === "object"
      ? (ctx.extraParams.provider as Record<string, unknown>)
      : undefined;
  const routedStreamFn = providerRouting
    ? injectOpenRouterRouting(ctx.streamFn, providerRouting)
    : ctx.streamFn;
  const wrapStreamFn = OPENROUTER_THINKING_STREAM_HOOKS.wrapStreamFn ?? undefined;
  if (!wrapStreamFn) {
    return createOpenRouterAnthropicPrefillWrapper(routedStreamFn);
  }
  const wrappedStreamFn =
    wrapStreamFn({
      ...ctx,
      streamFn: routedStreamFn,
    }) ?? undefined;
  return createOpenRouterAnthropicPrefillWrapper(wrappedStreamFn);
}
