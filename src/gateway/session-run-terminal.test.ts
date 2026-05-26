import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionEntry } from "../config/sessions.js";

const mocks = vi.hoisted(() => ({
  loadSessionEntry: vi.fn(),
  updateSessionStoreEntry: vi.fn(),
}));

vi.mock("./session-utils.js", () => ({
  loadSessionEntry: mocks.loadSessionEntry,
}));

vi.mock("../config/sessions.js", async () => {
  const actual =
    await vi.importActual<typeof import("../config/sessions.js")>("../config/sessions.js");
  return {
    ...actual,
    updateSessionStoreEntry: mocks.updateSessionStoreEntry,
  };
});

const { markSessionRunTerminal } = await import("./session-run-terminal.js");

afterEach(() => {
  vi.clearAllMocks();
});

describe("markSessionRunTerminal", () => {
  it("marks a running session as timed out", async () => {
    const entry: SessionEntry = {
      sessionId: "sid-main",
      updatedAt: 100,
      startedAt: 100,
      status: "running",
    };
    mocks.loadSessionEntry.mockReturnValue({
      storePath: "/tmp/sessions.json",
      entry,
      canonicalKey: "main",
    });
    mocks.updateSessionStoreEntry.mockImplementation(async ({ update }) => {
      const patch = await update(entry);
      return { ...entry, ...patch };
    });

    const result = await markSessionRunTerminal({
      sessionKey: "main",
      reason: "timeout",
      endedAt: 700,
      runId: "run-timeout",
    });

    expect(result).toEqual({ updated: true, sessionKey: "main" });
    expect(mocks.updateSessionStoreEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        storePath: "/tmp/sessions.json",
        sessionKey: "main",
      }),
    );
    const update = mocks.updateSessionStoreEntry.mock.calls[0]?.[0]?.update;
    await expect(update(entry)).resolves.toMatchObject({
      status: "timeout",
      startedAt: 100,
      endedAt: 700,
      runtimeMs: 600,
      abortedLastRun: false,
    });
  });

  it("does not rewrite an already terminal session", async () => {
    mocks.loadSessionEntry.mockReturnValue({
      storePath: "/tmp/sessions.json",
      entry: {
        sessionId: "sid-main",
        updatedAt: 100,
        status: "done",
        endedAt: 100,
      },
      canonicalKey: "main",
    });

    const result = await markSessionRunTerminal({
      sessionKey: "main",
      reason: "timeout",
      endedAt: 700,
    });

    expect(result).toEqual({ updated: false, sessionKey: "main" });
    expect(mocks.updateSessionStoreEntry).not.toHaveBeenCalled();
  });
});
