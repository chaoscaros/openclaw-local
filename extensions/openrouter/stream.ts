import type { StreamFn } from "@mariozechner/pi-agent-core";
import type { ProviderWrapStreamFnContext } from "openclaw/plugin-sdk/plugin-entry";
import { buildProviderStreamFamilyHooks } from "openclaw/plugin-sdk/provider-stream-family";

const OPENROUTER_THINKING_STREAM_HOOKS = buildProviderStreamFamilyHooks("openrouter-thinking");

type StreamOptionsWithPayload = Parameters<StreamFn>[2] & {
  onPayload?: (payload: Record<string, unknown>, model: Parameters<StreamFn>[0]) => unknown;
};

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
    const optionsWithPayload = options as StreamOptionsWithPayload | undefined;
    const routedOptions = {
      ...options,
      onPayload: (payload: Record<string, unknown>, payloadModel: Parameters<StreamFn>[0]) => {
        if (payload.provider === undefined) {
          payload.provider = providerRouting;
        }
        return optionsWithPayload?.onPayload?.(payload, payloadModel);
      },
    } as Parameters<StreamFn>[2];
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
    return routedStreamFn;
  }
  return (
    wrapStreamFn({
      ...ctx,
      streamFn: routedStreamFn,
    }) ?? undefined
  );
}
