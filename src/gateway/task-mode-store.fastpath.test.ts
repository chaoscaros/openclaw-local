import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { readSessionMessagesSpy, resolveAllAgentSessionStoreTargetsSyncSpy } = vi.hoisted(() => ({
  readSessionMessagesSpy: vi.fn(),
  resolveAllAgentSessionStoreTargetsSyncSpy: vi.fn(),
}));

vi.mock("../config/sessions.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/sessions.js")>();
  return {
    ...actual,
    resolveAllAgentSessionStoreTargetsSync: vi.fn(
      (...args: Parameters<typeof actual.resolveAllAgentSessionStoreTargetsSync>) => {
        resolveAllAgentSessionStoreTargetsSyncSpy(...args);
        return actual.resolveAllAgentSessionStoreTargetsSync(...args);
      },
    ),
  };
});

vi.mock("./session-utils.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./session-utils.js")>();
  return {
    ...actual,
    readSessionMessages: vi.fn((...args: Parameters<typeof actual.readSessionMessages>) => {
      readSessionMessagesSpy(...args);
      return actual.readSessionMessages(...args);
    }),
  };
});

import {
  resolveAllAgentSessionStoreTargetsSync,
  resolveDefaultSessionStorePath,
  resolveSessionTranscriptPath,
} from "../config/sessions.js";
import { createTaskModeTask, syncTaskModeTaskProgress } from "./task-mode-store.js";

function makeTempStateDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-taskmode-fastpath-"));
}

describe("task-mode-store fast path", () => {
  const previousStateDir = process.env.OPENCLAW_STATE_DIR;

  afterEach(() => {
    readSessionMessagesSpy.mockClear();
    resolveAllAgentSessionStoreTargetsSyncSpy.mockClear();
    vi.mocked(resolveAllAgentSessionStoreTargetsSync).mockClear();
    if (previousStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = previousStateDir;
    }
  });

  it("skips transcript reads when linked task sessions have not changed since last sync", async () => {
    process.env.OPENCLAW_STATE_DIR = makeTempStateDir();
    const now = Date.now();
    const sessionId = "session-fastpath";
    const storePath = resolveDefaultSessionStorePath();
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(
      storePath,
      JSON.stringify({
        main: {
          sessionId,
          updatedAt: now,
          taskId: "task-fastpath",
        },
      }),
    );
    const transcriptPath = resolveSessionTranscriptPath(sessionId);
    fs.mkdirSync(path.dirname(transcriptPath), { recursive: true });
    fs.writeFileSync(
      transcriptPath,
      [
        JSON.stringify({
          message: {
            role: "user",
            timestamp: now - 2_000,
            content: [{ type: "text", text: "继续完成 ui/src/ui/controllers/tasks.ts 并验证" }],
          },
        }),
        JSON.stringify({
          message: {
            role: "assistant",
            timestamp: now - 1_000,
            content: [{ type: "text", text: "已完成任务同步链路，并补充回归验证。" }],
          },
        }),
      ].join("\n"),
    );
    await createTaskModeTask({ id: "task-fastpath", title: "Fastpath task", sessionKey: "main" });

    const first = await syncTaskModeTaskProgress({ id: "task-fastpath", sessionKey: "main" });

    expect(first.synced).toBe(true);
    expect(readSessionMessagesSpy).toHaveBeenCalledTimes(1);
    expect(resolveAllAgentSessionStoreTargetsSyncSpy).toHaveBeenCalledTimes(1);

    readSessionMessagesSpy.mockClear();
    resolveAllAgentSessionStoreTargetsSyncSpy.mockClear();
    vi.mocked(resolveAllAgentSessionStoreTargetsSync).mockClear();

    const second = await syncTaskModeTaskProgress({ id: "task-fastpath", sessionKey: "main" });

    expect(second.synced).toBe(false);
    expect(second.task?.progressSummary).toContain("已完成任务同步链路");
    expect(readSessionMessagesSpy).not.toHaveBeenCalled();
    expect(resolveAllAgentSessionStoreTargetsSyncSpy).not.toHaveBeenCalled();
  });
});
