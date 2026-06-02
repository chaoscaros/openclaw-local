import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CodexAppServerClient } from "./client.js";
import { maybeCompactCodexAppServerSession, __testing } from "./compact.js";
import type { CodexServerNotification } from "./protocol.js";
import { writeCodexAppServerBinding } from "./session-binding.js";

let tempDir: string;

describe("maybeCompactCodexAppServerSession", () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-codex-compact-"));
  });

  afterEach(async () => {
    __testing.resetCodexAppServerClientFactoryForTests();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("waits for native app-server compaction before reporting success", async () => {
    const fake = createFakeCodexClient();
    __testing.setCodexAppServerClientFactoryForTests(async () => fake.client);
    const sessionFile = path.join(tempDir, "session.jsonl");
    await writeCodexAppServerBinding(sessionFile, {
      threadId: "thread-1",
      cwd: tempDir,
    });

    const pendingResult = maybeCompactCodexAppServerSession({
      sessionId: "session-1",
      sessionKey: "agent:main:session-1",
      sessionFile,
      workspaceDir: tempDir,
      currentTokenCount: 123,
    });
    await vi.waitFor(() => {
      expect(fake.request).toHaveBeenCalledWith("thread/compact/start", { threadId: "thread-1" });
    });

    let settled = false;
    void pendingResult.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    fake.emit({
      method: "thread/compacted",
      params: { threadId: "thread-1", turnId: "turn-1" },
    });
    const result = await pendingResult;

    expect(result).toMatchObject({
      ok: true,
      compacted: true,
      result: {
        tokensBefore: 123,
        details: {
          backend: "codex-app-server",
          threadId: "thread-1",
          signal: "thread/compacted",
          turnId: "turn-1",
        },
      },
    });
  });

  it("accepts native context-compaction item completion as success", async () => {
    const fake = createFakeCodexClient();
    __testing.setCodexAppServerClientFactoryForTests(async () => fake.client);
    const sessionFile = path.join(tempDir, "session.jsonl");
    await writeCodexAppServerBinding(sessionFile, {
      threadId: "thread-1",
      cwd: tempDir,
    });

    const pendingResult = maybeCompactCodexAppServerSession({
      sessionId: "session-1",
      sessionKey: "agent:main:session-1",
      sessionFile,
      workspaceDir: tempDir,
    });
    await vi.waitFor(() => {
      expect(fake.request).toHaveBeenCalledWith("thread/compact/start", { threadId: "thread-1" });
    });
    fake.emit({
      method: "item/completed",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        item: { type: "contextCompaction", id: "compact-1" },
      },
    });

    await expect(pendingResult).resolves.toMatchObject({
      ok: true,
      compacted: true,
      result: {
        details: {
          signal: "item/completed",
          itemId: "compact-1",
        },
      },
    });
  });

  it("restarts the app-server and retries when native compaction times out", async () => {
    const previousTimeout = process.env.OPENCLAW_CODEX_COMPACTION_WAIT_TIMEOUT_MS;
    process.env.OPENCLAW_CODEX_COMPACTION_WAIT_TIMEOUT_MS = "100";
    const first = createFakeCodexClient();
    const second = createFakeCodexClient();
    let factoryCalls = 0;
    __testing.setCodexAppServerClientFactoryForTests(async () => {
      factoryCalls += 1;
      return factoryCalls === 1 ? first.client : second.client;
    });
    try {
      const sessionFile = path.join(tempDir, "session.jsonl");
      await writeCodexAppServerBinding(sessionFile, {
        threadId: "thread-1",
        cwd: tempDir,
      });

      const pendingResult = maybeCompactCodexAppServerSession({
        sessionId: "session-1",
        sessionKey: "agent:main:session-1",
        sessionFile,
        workspaceDir: tempDir,
        currentTokenCount: 456,
      });
      await vi.waitFor(() => {
        expect(first.request).toHaveBeenCalledWith("thread/compact/start", {
          threadId: "thread-1",
        });
      });
      await vi.waitFor(() => {
        expect(first.close).toHaveBeenCalledTimes(1);
        expect(second.request).toHaveBeenCalledWith("thread/compact/start", {
          threadId: "thread-1",
        });
      });
      second.emit({
        method: "item/completed",
        params: {
          threadId: "thread-1",
          turnId: "turn-2",
          item: { type: "contextCompaction", id: "compact-2" },
        },
      });

      await expect(pendingResult).resolves.toMatchObject({
        ok: true,
        compacted: true,
        result: {
          details: {
            signal: "item/completed",
            itemId: "compact-2",
            compactionAttempts: 2,
            recoveredAfterAppServerRestart: true,
          },
        },
      });
      expect(second.close).not.toHaveBeenCalled();
    } finally {
      if (previousTimeout === undefined) {
        delete process.env.OPENCLAW_CODEX_COMPACTION_WAIT_TIMEOUT_MS;
      } else {
        process.env.OPENCLAW_CODEX_COMPACTION_WAIT_TIMEOUT_MS = previousTimeout;
      }
    }
  });
});

function createFakeCodexClient(): {
  client: CodexAppServerClient;
  request: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  emit: (notification: CodexServerNotification) => void;
} {
  const handlers = new Set<(notification: CodexServerNotification) => void>();
  const request = vi.fn(async () => ({}));
  const close = vi.fn();
  return {
    client: {
      request,
      close,
      addNotificationHandler(handler: (notification: CodexServerNotification) => void) {
        handlers.add(handler);
        return () => handlers.delete(handler);
      },
    } as unknown as CodexAppServerClient,
    request,
    close,
    emit(notification: CodexServerNotification): void {
      for (const handler of handlers) {
        handler(notification);
      }
    },
  };
}
