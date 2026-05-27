import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHookRunner } from "./hooks.js";
import { addTestHook, TEST_PLUGIN_AGENT_CTX } from "./hooks.test-helpers.js";
import { createEmptyPluginRegistry, type PluginRegistry } from "./registry.js";
import type { PluginHookRegistration } from "./types.js";

const DEFAULT_COMPACTION_HOOK_TIMEOUT_MS = 30_000;

describe("compaction hook default timeouts", () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = createEmptyPluginRegistry();
  });

  it("bounds a never-settling before_compaction handler with the default timeout", async () => {
    vi.useFakeTimers();
    try {
      const handler = vi.fn(() => new Promise<void>(() => {}));
      addTestHook({
        registry,
        pluginId: "plugin-a",
        hookName: "before_compaction",
        handler: handler as PluginHookRegistration["handler"],
      });
      const logger = {
        error: vi.fn(),
        warn: vi.fn(),
      };

      const runner = createHookRunner(registry, { logger });
      const run = runner.runBeforeCompaction({ messageCount: 3 }, TEST_PLUGIN_AGENT_CTX);

      await vi.advanceTimersByTimeAsync(DEFAULT_COMPACTION_HOOK_TIMEOUT_MS);

      await expect(run).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(
        `[hooks] before_compaction handler from plugin-a failed: Error: timed out after ${DEFAULT_COMPACTION_HOOK_TIMEOUT_MS}ms`,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("bounds a never-settling after_compaction handler with the default timeout", async () => {
    vi.useFakeTimers();
    try {
      const handler = vi.fn(() => new Promise<void>(() => {}));
      addTestHook({
        registry,
        pluginId: "plugin-a",
        hookName: "after_compaction",
        handler: handler as PluginHookRegistration["handler"],
      });
      const logger = {
        error: vi.fn(),
        warn: vi.fn(),
      };

      const runner = createHookRunner(registry, { logger });
      const run = runner.runAfterCompaction(
        { messageCount: 2, compactedCount: 1 },
        TEST_PLUGIN_AGENT_CTX,
      );

      await vi.advanceTimersByTimeAsync(DEFAULT_COMPACTION_HOOK_TIMEOUT_MS);

      await expect(run).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(
        `[hooks] after_compaction handler from plugin-a failed: Error: timed out after ${DEFAULT_COMPACTION_HOOK_TIMEOUT_MS}ms`,
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
