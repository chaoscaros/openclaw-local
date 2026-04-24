import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import { loadSessionStore, type SessionEntry } from "../../config/sessions.js";
import type { EmbeddedPiRunResult } from "../pi-embedded.js";
import { updateSessionStoreAfterAgentRun } from "./session-store.js";

describe("updateSessionStoreAfterAgentRun", () => {
  let tmpDir: string;
  let storePath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-session-store-"));
    storePath = path.join(tmpDir, "sessions.json");
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("persists claude-cli session bindings when the backend is configured", async () => {
    const cfg = {
      agents: {
        defaults: {
          cliBackends: {
            "claude-cli": {
              command: "claude",
            },
          },
        },
      },
    } as OpenClawConfig;
    const sessionKey = "agent:main:explicit:test-claude-cli";
    const sessionId = "test-openclaw-session";
    const sessionStore: Record<string, SessionEntry> = {
      [sessionKey]: {
        sessionId,
        updatedAt: 1,
      },
    };
    await fs.writeFile(storePath, JSON.stringify(sessionStore, null, 2));

    const result: EmbeddedPiRunResult = {
      meta: {
        durationMs: 1,
        agentMeta: {
          sessionId: "cli-session-123",
          provider: "claude-cli",
          model: "claude-sonnet-4-6",
          cliSessionBinding: {
            sessionId: "cli-session-123",
          },
        },
      },
    };

    await updateSessionStoreAfterAgentRun({
      cfg,
      sessionId,
      sessionKey,
      storePath,
      sessionStore,
      defaultProvider: "claude-cli",
      defaultModel: "claude-sonnet-4-6",
      result,
    });

    expect(sessionStore[sessionKey]?.cliSessionBindings?.["claude-cli"]).toEqual({
      sessionId: "cli-session-123",
    });
    expect(sessionStore[sessionKey]?.cliSessionIds?.["claude-cli"]).toBe("cli-session-123");
    expect(sessionStore[sessionKey]?.claudeCliSessionId).toBe("cli-session-123");

    const persisted = loadSessionStore(storePath);
    expect(persisted[sessionKey]?.cliSessionBindings?.["claude-cli"]).toEqual({
      sessionId: "cli-session-123",
    });
    expect(persisted[sessionKey]?.cliSessionIds?.["claude-cli"]).toBe("cli-session-123");
    expect(persisted[sessionKey]?.claudeCliSessionId).toBe("cli-session-123");
  });

  it("snapshots estimatedCostUsd instead of accumulating it", async () => {
    const cfg = {
      models: {
        providers: {
          openai: {
            baseUrl: "https://api.openai.com/v1",
            models: [
              {
                id: "gpt-5.4",
                name: "GPT 5.4",
                reasoning: true,
                input: ["text"],
                cost: { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0.5 },
                contextWindow: 200_000,
                maxTokens: 8_192,
              },
            ],
          },
        },
      },
    } as OpenClawConfig;
    const sessionKey = "agent:main:explicit:test-cost";
    const sessionId = "test-openclaw-session";
    const sessionStore: Record<string, SessionEntry> = {
      [sessionKey]: {
        sessionId,
        updatedAt: 1,
        estimatedCostUsd: 0.0015,
      },
    };
    await fs.writeFile(storePath, JSON.stringify(sessionStore, null, 2));

    const result: EmbeddedPiRunResult = {
      meta: {
        durationMs: 1,
        agentMeta: {
          sessionId: "embedded-session-1",
          provider: "openai",
          model: "gpt-5.4",
          usage: { input: 2_000, output: 500, cacheRead: 1_000, cacheWrite: 200 },
        },
      },
    };

    await updateSessionStoreAfterAgentRun({
      cfg,
      sessionId,
      sessionKey,
      storePath,
      sessionStore,
      defaultProvider: "openai",
      defaultModel: "gpt-5.4",
      result,
    });

    expect(sessionStore[sessionKey]?.estimatedCostUsd).toBeCloseTo(0.007725, 8);

    const persisted = loadSessionStore(storePath);
    expect(persisted[sessionKey]?.estimatedCostUsd).toBeCloseTo(0.007725, 8);
  });
});
