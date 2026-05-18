/**
 * Layer 1: Hook Merger Tests for before_agent_start
 *
 * Validates that modelOverride and providerOverride fields are correctly
 * propagated through the hook merger, including priority ordering and
 * backward compatibility.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHookRunner } from "./hooks.js";
import { addStaticTestHooks, addTestHook, TEST_PLUGIN_AGENT_CTX } from "./hooks.test-helpers.js";
import { createEmptyPluginRegistry, type PluginRegistry } from "./registry.js";
import type { PluginHookBeforeAgentStartResult, PluginHookRegistration } from "./types.js";

function addBeforeAgentStartHook(
  registry: PluginRegistry,
  pluginId: string,
  handler: () => PluginHookBeforeAgentStartResult | Promise<PluginHookBeforeAgentStartResult>,
  priority?: number,
) {
  addTestHook({
    registry,
    pluginId,
    hookName: "before_agent_start",
    handler: handler as PluginHookRegistration["handler"],
    priority,
  });
}

const stubCtx = TEST_PLUGIN_AGENT_CTX;

describe("before_agent_start hook merger", () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = createEmptyPluginRegistry();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const runWithSingleHook = async (result: PluginHookBeforeAgentStartResult, priority?: number) => {
    addBeforeAgentStartHook(registry, "plugin-a", () => result, priority);
    const runner = createHookRunner(registry);
    return await runner.runBeforeAgentStart({ prompt: "hello" }, stubCtx);
  };

  const expectSingleModelOverride = async (modelOverride: string) => {
    const result = await runWithSingleHook({ modelOverride });
    expect(result?.modelOverride).toBe(modelOverride);
    return result;
  };

  const expectMergedBeforeAgentStart = async (
    hooks: Array<{
      pluginId: string;
      result: PluginHookBeforeAgentStartResult;
      priority?: number;
    }>,
    expected: Partial<PluginHookBeforeAgentStartResult>,
  ) => {
    const result = await runWithHooks(hooks);
    expect(result).toEqual(expect.objectContaining(expected));
    return result;
  };

  const runWithHooks = async (
    hooks: Array<{
      pluginId: string;
      result: PluginHookBeforeAgentStartResult;
      priority?: number;
    }>,
  ) => {
    addStaticTestHooks(registry, {
      hookName: "before_agent_start",
      hooks,
    });
    const runner = createHookRunner(registry);
    return await runner.runBeforeAgentStart({ prompt: "hello" }, stubCtx);
  };

  it.each([
    [
      "returns modelOverride from a single plugin",
      { modelOverride: "llama3.3:8b" },
      {
        modelOverride: "llama3.3:8b",
      },
    ],
    [
      "returns providerOverride from a single plugin",
      { providerOverride: "ollama" },
      {
        providerOverride: "ollama",
      },
    ],
    [
      "returns both modelOverride and providerOverride together",
      {
        modelOverride: "llama3.3:8b",
        providerOverride: "ollama",
      },
      {
        modelOverride: "llama3.3:8b",
        providerOverride: "ollama",
      },
    ],
    [
      "systemPrompt merges correctly alongside model overrides",
      {
        systemPrompt: "You are a helpful assistant",
        modelOverride: "llama3.3:8b",
        providerOverride: "ollama",
      },
      {
        systemPrompt: "You are a helpful assistant",
        modelOverride: "llama3.3:8b",
        providerOverride: "ollama",
      },
    ],
  ] as const)("%s", async (_name, hookResult, expected) => {
    await expectMergedBeforeAgentStart([{ pluginId: "plugin-a", result: hookResult }], expected);
  });

  it("higher-priority plugin wins for modelOverride", async () => {
    const result = await expectMergedBeforeAgentStart(
      [
        { pluginId: "low-priority", result: { modelOverride: "gpt-5.4" }, priority: 1 },
        { pluginId: "high-priority", result: { modelOverride: "llama3.3:8b" }, priority: 10 },
      ],
      { modelOverride: "llama3.3:8b" },
    );
    expect(result?.modelOverride).toBe("llama3.3:8b");
  });

  it("lower-priority plugin does not overwrite if it returns undefined", async () => {
    const result = await runWithHooks([
      {
        pluginId: "high-priority",
        result: { modelOverride: "llama3.3:8b", providerOverride: "ollama" },
        priority: 10,
      },
      {
        pluginId: "low-priority",
        result: { prependContext: "some context" },
        priority: 1,
      },
    ]);

    // High-priority ran first (priority 10), low-priority ran second (priority 1).
    // Low-priority didn't return modelOverride, so ?? falls back to acc's value.
    expect(result?.modelOverride).toBe("llama3.3:8b");
    expect(result?.providerOverride).toBe("ollama");
    expect(result?.prependContext).toBe("some context");
  });

  it("prependContext still concatenates when modelOverride is present", async () => {
    const result = await runWithHooks([
      {
        pluginId: "plugin-a",
        result: { prependContext: "context A", modelOverride: "llama3.3:8b" },
        priority: 10,
      },
      {
        pluginId: "plugin-b",
        result: { prependContext: "context B" },
        priority: 1,
      },
    ]);

    expect(result?.prependContext).toBe("context A\n\ncontext B");
    expect(result?.modelOverride).toBe("llama3.3:8b");
  });

  it("backward compat: plugin returning only prependContext produces no modelOverride", async () => {
    const result = await runWithSingleHook({ prependContext: "legacy context" });

    expect(result?.prependContext).toBe("legacy context");
    expect(result?.modelOverride).toBeUndefined();
    expect(result?.providerOverride).toBeUndefined();
  });

  it("modelOverride without providerOverride leaves provider undefined", async () => {
    const result = await expectSingleModelOverride("llama3.3:8b");
    expect(result?.providerOverride).toBeUndefined();
  });

  it("returns undefined when no hooks are registered", async () => {
    const runner = createHookRunner(registry);
    const result = await runner.runBeforeAgentStart({ prompt: "hello" }, stubCtx);

    expect(result).toBeUndefined();
  });

  it("passes runId through the agent context to hook handlers", async () => {
    const registry = createEmptyPluginRegistry();
    let capturedCtx: typeof stubCtx | undefined;
    addTestHook({
      registry,
      pluginId: "ctx-spy",
      hookName: "before_agent_start",
      handler: ((_event: unknown, ctx: typeof stubCtx) => {
        capturedCtx = ctx;
        return {};
      }) as PluginHookRegistration["handler"],
    });

    const runner = createHookRunner(registry);
    await runner.runBeforeAgentStart({ prompt: "test" }, stubCtx);

    expect(capturedCtx).toBeDefined();
    expect(capturedCtx?.runId).toBe("test-run-id");
  });

  it("fails open with the default timeout when a handler hangs", async () => {
    vi.useFakeTimers();
    const error = vi.fn();
    addBeforeAgentStartHook(
      registry,
      "hanging-plugin",
      () => new Promise<PluginHookBeforeAgentStartResult>(() => {}),
      10,
    );
    const runner = createHookRunner(registry, { logger: { warn: vi.fn(), error } });

    const resultPromise = runner.runBeforeAgentStart({ prompt: "hello" }, stubCtx);
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(resultPromise).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      "[hooks] before_agent_start handler from hanging-plugin failed: Error: timed out after 15000ms",
    );
  });

  it("keeps later before_agent_start contributions after a timed-out handler", async () => {
    vi.useFakeTimers();
    const error = vi.fn();
    addBeforeAgentStartHook(
      registry,
      "hanging-plugin",
      () => new Promise<PluginHookBeforeAgentStartResult>(() => {}),
      10,
    );
    addBeforeAgentStartHook(
      registry,
      "fast-plugin",
      () => ({ modelOverride: "fallback-model", prependContext: "fast context" }),
      1,
    );
    const runner = createHookRunner(registry, { logger: { warn: vi.fn(), error } });

    const resultPromise = runner.runBeforeAgentStart({ prompt: "hello" }, stubCtx);
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(resultPromise).resolves.toEqual(
      expect.objectContaining({
        modelOverride: "fallback-model",
        prependContext: "fast context",
      }),
    );
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("before_agent_start handler from hanging-plugin failed"),
    );
  });
});
