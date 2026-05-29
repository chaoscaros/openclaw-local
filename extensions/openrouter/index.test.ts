import { describe, expect, it, vi } from "vitest";
import { registerSingleProviderPlugin } from "../../test/helpers/plugins/plugin-registration.js";
import { expectPassthroughReplayPolicy } from "../../test/helpers/provider-replay-policy.ts";
import openrouterPlugin from "./index.js";

describe("openrouter provider hooks", () => {
  it("owns passthrough-gemini replay policy for Gemini-backed models", async () => {
    await expectPassthroughReplayPolicy({
      plugin: openrouterPlugin,
      providerId: "openrouter",
      modelId: "gemini-2.5-pro",
      sanitizeThoughtSignatures: true,
    });
    await expectPassthroughReplayPolicy({
      plugin: openrouterPlugin,
      providerId: "openrouter",
      modelId: "openai/gpt-5.4",
    });
  });

  it("owns native reasoning output mode", async () => {
    const provider = await registerSingleProviderPlugin(openrouterPlugin);

    expect(
      provider.resolveReasoningOutputMode?.({
        provider: "openrouter",
        modelApi: "openai-completions",
        modelId: "openai/gpt-5.4",
      } as never),
    ).toBe("native");
  });

  it("injects provider routing into compat before applying stream wrappers", async () => {
    const provider = await registerSingleProviderPlugin(openrouterPlugin);
    let capturedPayload: Record<string, unknown> | undefined;
    const baseStreamFn = vi.fn(
      (
        ...args: Parameters<import("@mariozechner/pi-agent-core").StreamFn>
      ): ReturnType<import("@mariozechner/pi-agent-core").StreamFn> => {
        const payload: Record<string, unknown> = {};
        void args[2]?.onPayload?.(payload, args[0]);
        capturedPayload = payload;
        return { async *[Symbol.asyncIterator]() {} } as never;
      },
    );

    const wrapped = provider.wrapStreamFn?.({
      provider: "openrouter",
      modelId: "openai/gpt-5.4",
      extraParams: {
        provider: {
          order: ["moonshot"],
        },
      },
      streamFn: baseStreamFn,
      thinkingLevel: "high",
    } as never);

    void wrapped?.(
      {
        provider: "openrouter",
        api: "openai-completions",
        id: "openai/gpt-5.4",
        compat: {},
      } as never,
      { messages: [] } as never,
      {},
    );

    expect(baseStreamFn).toHaveBeenCalledOnce();
    const firstCall = baseStreamFn.mock.calls[0];
    const firstModel = firstCall?.[0];
    expect(firstModel).toMatchObject({
      compat: {
        openRouterRouting: {
          order: ["moonshot"],
        },
      },
    });
    expect(capturedPayload?.provider).toEqual({
      order: ["moonshot"],
    });
  });

  it("merges resolved OpenRouter model params into transport params", async () => {
    const provider = await registerSingleProviderPlugin(openrouterPlugin);
    const patch = provider.prepareExtraParams?.({
      config: {
        models: {
          providers: {
            openrouter: {
              params: {
                provider: {
                  sort: "price",
                  data_collection: "deny",
                },
              },
            },
          },
        },
      },
      provider: "openrouter",
      modelId: "openai/gpt-5.4",
      extraParams: {
        provider: {
          sort: "latency",
          require_parameters: true,
        },
        temperature: 0.2,
      },
      model: {
        provider: "openrouter",
        api: "openai-completions",
        id: "openai/gpt-5.4",
        params: {
          responseCache: true,
          provider: {
            order: ["openai"],
            constructor: "ignored",
          },
        },
      },
    } as never);

    expect(patch?.responseCache).toBe(true);
    expect(patch?.temperature).toBe(0.2);
    expect(patch?.provider).toEqual({
      sort: "latency",
      data_collection: "deny",
      order: ["openai"],
      require_parameters: true,
    });
  });
});
