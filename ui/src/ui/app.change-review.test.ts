/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loadChatHistoryMock } = vi.hoisted(() => ({
  loadChatHistoryMock: vi.fn(async () => undefined),
}));

vi.mock("./controllers/chat.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./controllers/chat.ts")>();
  return {
    ...actual,
    loadChatHistory: loadChatHistoryMock,
  };
});

import { OpenClawApp } from "./app.ts";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("OpenClawApp change review methods", () => {
  beforeEach(() => {
    loadChatHistoryMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loadChangeReviewStatus clears the card when disconnected", async () => {
    const host = {
      client: null,
      connected: false,
      sessionKey: "main",
      chatChangeReview: {
        pending: true,
        id: "review-old",
      },
    } as unknown as OpenClawApp;

    await OpenClawApp.prototype.loadChangeReviewStatus.call(host, "main");

    expect((host as unknown as { chatChangeReview: unknown }).chatChangeReview).toBeNull();
  });

  it("loadChangeReviewStatus clears the card without requesting when change review mode is disabled", async () => {
    const request = vi.fn().mockResolvedValue({ pending: true, id: "review-1" });
    const host = {
      client: { request },
      connected: true,
      settings: { changeReviewModeEnabled: false },
      sessionKey: "main",
      chatChangeReviewOpen: true,
      chatChangeReviewSelectedPath: "src/demo.ts",
      chatChangeReviewAction: { type: "apply", path: null },
      chatChangeReview: {
        pending: true,
        id: "review-old",
      },
    } as unknown as OpenClawApp;

    await OpenClawApp.prototype.loadChangeReviewStatus.call(host, "main");

    expect(request).not.toHaveBeenCalled();
    expect((host as unknown as { chatChangeReview: unknown }).chatChangeReview).toBeNull();
    expect((host as unknown as { chatChangeReviewOpen: boolean }).chatChangeReviewOpen).toBe(false);
    expect(
      (host as unknown as { chatChangeReviewSelectedPath: string | null })
        .chatChangeReviewSelectedPath,
    ).toBeNull();
    expect(
      (host as unknown as { chatChangeReviewAction: unknown }).chatChangeReviewAction,
    ).toBeNull();
  });

  it("loadChangeReviewStatus updates the card for the active session", async () => {
    const request = vi.fn().mockResolvedValue({
      pending: true,
      id: "review-1",
      files: [{ path: "src/demo.ts", status: "M" }],
      diffText: "diff --git a/src/demo.ts b/src/demo.ts",
    });
    const host = {
      client: { request },
      connected: true,
      sessionKey: "main",
      chatChangeReview: null,
    } as unknown as OpenClawApp;

    await OpenClawApp.prototype.loadChangeReviewStatus.call(host, "main");

    expect(request).toHaveBeenCalledWith("changeReview.status", { sessionKey: "main" });
    expect(
      (host as unknown as { chatChangeReview: { id?: string } | null }).chatChangeReview?.id,
    ).toBe("review-1");
  });

  it("loadChangeReviewStatus ignores stale responses after a session switch", async () => {
    const deferred = createDeferred<{
      pending?: boolean;
      id?: string;
      files?: Array<{ path: string; status: string }>;
      diffText?: string;
    }>();
    const request = vi.fn().mockReturnValue(deferred.promise);
    const host = {
      client: { request },
      connected: true,
      sessionKey: "main",
      chatChangeReview: {
        pending: true,
        id: "review-existing",
      },
    } as unknown as OpenClawApp;

    const pending = OpenClawApp.prototype.loadChangeReviewStatus.call(host, "main");
    (host as unknown as { sessionKey: string }).sessionKey = "other";
    deferred.resolve({
      pending: true,
      id: "review-stale",
      files: [{ path: "src/stale.ts", status: "M" }],
      diffText: "diff --git a/src/stale.ts b/src/stale.ts",
    });
    await pending;

    expect(
      (host as unknown as { chatChangeReview: { id?: string } | null }).chatChangeReview?.id,
    ).toBe("review-existing");
  });

  it("captureChangeReview retries once for run-scoped capture when the first attempt returns empty", async () => {
    vi.useFakeTimers();
    const request = vi
      .fn()
      .mockResolvedValueOnce({ pending: false })
      .mockResolvedValueOnce({
        pending: true,
        id: "review-retry",
        files: [{ path: "src/demo.ts", status: "M" }],
        diffText: "diff --git a/src/demo.ts b/src/demo.ts",
        sourceRunId: "run-1",
      });
    const host = {
      client: { request },
      connected: true,
      sessionKey: "main",
      chatChangeReview: null,
    } as unknown as OpenClawApp;

    const pending = OpenClawApp.prototype.captureChangeReview.call(host, "main", "run-1");
    await vi.advanceTimersByTimeAsync(250);
    await pending;

    expect(request).toHaveBeenNthCalledWith(1, "changeReview.capture", {
      sessionKey: "main",
      runId: "run-1",
    });
    expect(request).toHaveBeenNthCalledWith(2, "changeReview.capture", {
      sessionKey: "main",
      runId: "run-1",
    });
    expect(
      (host as unknown as { chatChangeReview: { id?: string } | null }).chatChangeReview?.id,
    ).toBe("review-retry");
  });

  it("captureChangeReview clears the card when mode is disabled while a retry is waiting", async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockResolvedValue({ pending: false });
    const host = {
      client: { request },
      connected: true,
      settings: { changeReviewModeEnabled: true },
      sessionKey: "main",
      chatChangeReviewOpen: true,
      chatChangeReviewSelectedPath: "src/demo.ts",
      chatChangeReviewAction: null,
      chatChangeReview: {
        pending: true,
        id: "review-old",
      },
    } as unknown as OpenClawApp;

    const pending = OpenClawApp.prototype.captureChangeReview.call(host, "main", "run-1");
    await Promise.resolve();
    (
      host as unknown as { settings: { changeReviewModeEnabled: boolean } }
    ).settings.changeReviewModeEnabled = false;
    await vi.advanceTimersByTimeAsync(250);
    await pending;

    expect(request).toHaveBeenCalledTimes(1);
    expect((host as unknown as { chatChangeReview: unknown }).chatChangeReview).toBeNull();
    expect((host as unknown as { chatChangeReviewOpen: boolean }).chatChangeReviewOpen).toBe(false);
  });

  it("captureChangeReview ignores stale responses after a session switch", async () => {
    const deferred = createDeferred<{
      pending?: boolean;
      id?: string;
      files?: Array<{ path: string; status: string }>;
      diffText?: string;
      sourceRunId?: string;
    }>();
    const request = vi.fn().mockReturnValue(deferred.promise);
    const host = {
      client: { request },
      connected: true,
      sessionKey: "main",
      chatChangeReview: {
        pending: true,
        id: "review-existing",
      },
    } as unknown as OpenClawApp;

    const pending = OpenClawApp.prototype.captureChangeReview.call(host, "main", "run-1");
    (host as unknown as { sessionKey: string }).sessionKey = "other";
    deferred.resolve({
      pending: true,
      id: "review-stale",
      files: [{ path: "src/stale.ts", status: "M" }],
      diffText: "diff --git a/src/stale.ts b/src/stale.ts",
      sourceRunId: "run-1",
    });
    await pending;

    expect(request).toHaveBeenCalledWith("changeReview.capture", {
      sessionKey: "main",
      runId: "run-1",
    });
    expect(
      (host as unknown as { chatChangeReview: { id?: string } | null }).chatChangeReview?.id,
    ).toBe("review-existing");
  });

  it("applyChangeReview clears the pending card after a successful apply request", async () => {
    const deferred = createDeferred<{ ok: true; applied: true }>();
    const request = vi.fn().mockReturnValue(deferred.promise);
    const host = {
      client: { request },
      connected: true,
      sessionKey: "main",
      lastError: "old-error",
      chatChangeReviewAction: null,
      chatChangeReview: {
        pending: true,
        id: "review-1",
        files: [{ path: "src/demo.ts", status: "M" }],
        diffText: "diff --git a/src/demo.ts b/src/demo.ts",
      },
    } as unknown as OpenClawApp;

    const pending = OpenClawApp.prototype.applyChangeReview.call(host, "review-1");
    expect(
      (host as unknown as { chatChangeReviewAction: { type: string } | null })
        .chatChangeReviewAction,
    ).toEqual({ type: "apply", path: null });
    deferred.resolve({ ok: true, applied: true });
    await pending;

    expect(request).toHaveBeenCalledWith("changeReview.apply", { id: "review-1" });
    expect((host as unknown as { chatChangeReview: unknown }).chatChangeReview).toBeNull();
    expect(
      (host as unknown as { chatChangeReviewAction: { type: string } | null })
        .chatChangeReviewAction,
    ).toBeNull();
    expect((host as unknown as { lastError: string | null }).lastError).toBeNull();
    expect(loadChatHistoryMock).not.toHaveBeenCalled();
  });

  it("revertChangeReview clears the pending card and reloads chat history", async () => {
    const deferred = createDeferred<{ ok: true; reverted: true }>();
    const request = vi.fn().mockReturnValue(deferred.promise);
    const host = {
      client: { request },
      connected: true,
      sessionKey: "main",
      lastError: "old-error",
      chatChangeReviewAction: null,
      chatChangeReview: {
        pending: true,
        id: "review-1",
        files: [{ path: "src/demo.ts", status: "M" }],
        diffText: "diff --git a/src/demo.ts b/src/demo.ts",
      },
    } as unknown as OpenClawApp;

    const pending = OpenClawApp.prototype.revertChangeReview.call(host, "review-1");
    expect(
      (host as unknown as { chatChangeReviewAction: { type: string } | null })
        .chatChangeReviewAction,
    ).toEqual({ type: "revert", path: null });
    deferred.resolve({ ok: true, reverted: true });
    await pending;

    expect(request).toHaveBeenCalledWith("changeReview.revert", { id: "review-1" });
    expect((host as unknown as { chatChangeReview: unknown }).chatChangeReview).toBeNull();
    expect(
      (host as unknown as { chatChangeReviewAction: { type: string } | null })
        .chatChangeReviewAction,
    ).toBeNull();
    expect((host as unknown as { lastError: string | null }).lastError).toBeNull();
    expect(loadChatHistoryMock).toHaveBeenCalledWith(host);
  });

  it("revertChangeReview surfaces errors and reloads review status", async () => {
    const request = vi.fn().mockRejectedValue(new Error("unknown id"));
    const loadChangeReviewStatus = vi.fn().mockResolvedValue(undefined);
    const host = {
      client: { request },
      connected: true,
      sessionKey: "main",
      lastError: null,
      loadChangeReviewStatus,
      chatChangeReview: {
        pending: true,
        id: "review-1",
        files: [{ path: "src/demo.ts", status: "M" }],
        diffText: "diff --git a/src/demo.ts b/src/demo.ts",
      },
    } as unknown as OpenClawApp;

    await OpenClawApp.prototype.revertChangeReview.call(host, "review-1");

    expect((host as unknown as { lastError: string | null }).lastError).toContain(
      "还原待确认改动失败",
    );
    expect(loadChangeReviewStatus).toHaveBeenCalledTimes(1);
  });

  it("applyChangeReviewHunk sends the hunk request and refreshes review status", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, applied: true });
    const loadChangeReviewStatus = vi.fn().mockResolvedValue(undefined);
    const host = {
      client: { request },
      connected: true,
      sessionKey: "main",
      lastError: null,
      loadChangeReviewStatus,
      chatChangeReviewAction: null,
    } as unknown as OpenClawApp;

    await OpenClawApp.prototype.applyChangeReviewHunk.call(
      host,
      "review-1",
      "src/demo.ts",
      "hunk-1-1-1",
    );

    expect(request).toHaveBeenCalledWith("changeReview.applyHunk", {
      id: "review-1",
      path: "src/demo.ts",
      hunkId: "hunk-1-1-1",
    });
    expect(loadChangeReviewStatus).toHaveBeenCalledTimes(1);
    expect(
      (host as unknown as { chatChangeReviewAction: unknown }).chatChangeReviewAction,
    ).toBeNull();
  });

  it("revertChangeReviewHunk reloads chat history after reverting a hunk", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, reverted: true });
    const loadChangeReviewStatus = vi.fn().mockResolvedValue(undefined);
    const host = {
      client: { request },
      connected: true,
      sessionKey: "main",
      lastError: null,
      loadChangeReviewStatus,
      chatChangeReviewAction: null,
    } as unknown as OpenClawApp;

    await OpenClawApp.prototype.revertChangeReviewHunk.call(
      host,
      "review-1",
      "src/demo.ts",
      "hunk-1-1-1",
    );

    expect(request).toHaveBeenCalledWith("changeReview.revertHunk", {
      id: "review-1",
      path: "src/demo.ts",
      hunkId: "hunk-1-1-1",
    });
    expect(loadChangeReviewStatus).toHaveBeenCalledTimes(1);
    expect(loadChatHistoryMock).toHaveBeenCalledWith(host);
  });
});
