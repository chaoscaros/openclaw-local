import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHookRunner } from "./hooks.js";
import { addStaticTestHooks } from "./hooks.test-helpers.js";
import { createEmptyPluginRegistry, type PluginRegistry } from "./registry.js";
import type {
  PluginHookBeforeModelResolveResult,
  PluginHookBeforePromptBuildResult,
} from "./types.js";

describe("phase hooks merger", () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = createEmptyPluginRegistry();
  });

  async function runPhaseHook(params: {
    hookName: "before_model_resolve" | "before_prompt_build";
    hooks: ReadonlyArray<{
      pluginId: string;
      result: PluginHookBeforeModelResolveResult | PluginHookBeforePromptBuildResult;
      priority?: number;
    }>;
  }) {
    addStaticTestHooks(registry, {
      hookName: params.hookName,
      hooks: [...params.hooks],
    });
    const runner = createHookRunner(registry);
    if (params.hookName === "before_model_resolve") {
      return await runner.runBeforeModelResolve({ prompt: "test" }, {});
    }
    return await runner.runBeforePromptBuild({ prompt: "test", messages: [] }, {});
  }

  async function expectPhaseHookMerge(params: {
    hookName: "before_model_resolve" | "before_prompt_build";
    hooks: ReadonlyArray<{
      pluginId: string;
      result: PluginHookBeforeModelResolveResult | PluginHookBeforePromptBuildResult;
      priority?: number;
    }>;
    expected: Record<string, unknown>;
  }) {
    const result = await runPhaseHook(params);
    expect(result).toEqual(expect.objectContaining(params.expected));
  }

  it("before_prompt_build skips timed-out handlers and keeps later contributions", async () => {
    vi.useFakeTimers();
    try {
      const warn = vi.fn();
      const error = vi.fn();
      addStaticTestHooks(registry, {
        hookName: "before_prompt_build",
        hooks: [
          {
            pluginId: "slow",
            result: { prependContext: "slow" },
            priority: 10,
            handler: () => new Promise<PluginHookBeforePromptBuildResult>(() => {}),
          },
          {
            pluginId: "fast",
            result: { prependContext: "fast", systemPrompt: "system fast" },
            priority: 1,
          },
        ],
      });
      const runner = createHookRunner(registry, {
        logger: { warn, error },
        modifyingHookTimeoutMsByHook: { before_prompt_build: 5 },
      });

      const runPromise = runner.runBeforePromptBuild({ prompt: "test", messages: [] }, {});
      await vi.advanceTimersByTimeAsync(10);
      await expect(runPromise).resolves.toEqual(
        expect.objectContaining({ prependContext: "fast", systemPrompt: "system fast" }),
      );
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining("[hooks] before_prompt_build handler from slow failed: Error: timed out after 5ms"),
      );
      expect(warn).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    {
      name: "before_model_resolve keeps higher-priority override values",
      hookName: "before_model_resolve" as const,
      hooks: [
        { pluginId: "low", result: { modelOverride: "demo-low-priority-model" }, priority: 1 },
        {
          pluginId: "high",
          result: {
            modelOverride: "demo-high-priority-model",
            providerOverride: "demo-provider",
          },
          priority: 10,
        },
      ],
      expected: {
        modelOverride: "demo-high-priority-model",
        providerOverride: "demo-provider",
      },
    },
    {
      name: "before_prompt_build concatenates prependContext and preserves systemPrompt precedence",
      hookName: "before_prompt_build" as const,
      hooks: [
        {
          pluginId: "high",
          result: { prependContext: "context A", systemPrompt: "system A" },
          priority: 10,
        },
        {
          pluginId: "low",
          result: { prependContext: "context B", systemPrompt: "system B" },
          priority: 1,
        },
      ],
      expected: {
        prependContext: "context A\n\ncontext B",
        systemPrompt: "system A",
      },
    },
    {
      name: "before_prompt_build concatenates prependSystemContext and appendSystemContext",
      hookName: "before_prompt_build" as const,
      hooks: [
        {
          pluginId: "first",
          result: {
            prependSystemContext: "prepend A",
            appendSystemContext: "append A",
          },
          priority: 10,
        },
        {
          pluginId: "second",
          result: {
            prependSystemContext: "prepend B",
            appendSystemContext: "append B",
          },
          priority: 1,
        },
      ],
      expected: {
        prependSystemContext: "prepend A\n\nprepend B",
        appendSystemContext: "append A\n\nappend B",
      },
    },
  ] as const)("$name", async ({ hookName, hooks, expected }) => {
    await expectPhaseHookMerge({ hookName, hooks, expected });
  });
});
