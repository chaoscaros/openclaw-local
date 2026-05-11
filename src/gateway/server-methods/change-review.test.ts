import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyReviewBundle,
  beginToolMutationCapture,
  createVirtualReviewBundle,
  finishToolMutationCapture,
  revertReviewBundle,
  resetChangeReviewStoreForTest,
} from "../change-review-store.js";
import { changeReviewHandlers } from "./change-review.js";
import type { RespondFn } from "./types.js";

async function createWorkspace() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-change-review-"));
  await fs.mkdir(path.join(dir, "supply_vue"), { recursive: true });
  await fs.writeFile(path.join(dir, "supply_vue/.gitignore"), ".ai/\n", "utf-8");
  await fs.writeFile(path.join(dir, "old-supply-shop_vue.txt"), "legacy\n", "utf-8");
  return dir;
}

describe("changeReviewHandlers V2", () => {
  beforeEach(() => {
    resetChangeReviewStoreForTest();
  });

  it("captures only the current run bundle instead of repo-wide dirty state", async () => {
    const workspace = await createWorkspace();
    const gitignorePath = path.join(workspace, "supply_vue/.gitignore");

    await beginToolMutationCapture({
      sessionKey: "agent:solo:main",
      runId: "run-1",
      toolCallId: "tool-1",
      workspaceDir: workspace,
      repoRoot: workspace,
      filePaths: ["supply_vue/.gitignore"],
    });
    await fs.writeFile(gitignorePath, ".ai/\n# change-review-test-1\n", "utf-8");
    await finishToolMutationCapture({
      sessionKey: "agent:solo:main",
      runId: "run-1",
      toolCallId: "tool-1",
      fileStatuses: [{ path: "supply_vue/.gitignore", changeType: "modified" }],
    });

    const respond = ((ok: boolean, result?: unknown) => {
      expect(ok).toBe(true);
      expect(result).toMatchObject({
        pending: true,
        sessionKey: "agent:solo:main",
        sourceRunId: "run-1",
        files: [{ path: "supply_vue/.gitignore", status: "modified" }],
      });
      expect(JSON.stringify(result)).not.toContain("old-supply-shop_vue");
    }) as unknown as RespondFn;

    await changeReviewHandlers["changeReview.capture"]({
      req: { id: "req-1" } as never,
      params: { sessionKey: "agent:solo:main", runId: "run-1" },
      respond,
      context: {} as never,
      client: null,
      isWebchatConnect: () => false,
    });
  });

  it("serializes only the changed hunk so unrelated existing lines are not shown as this-run additions", async () => {
    const workspace = await createWorkspace();
    const gitignorePath = path.join(workspace, "supply_vue/.gitignore");
    await fs.writeFile(gitignorePath, ".idea\n.vscode\n.ai/\n", "utf-8");

    await beginToolMutationCapture({
      sessionKey: "agent:solo:main",
      runId: "run-hunk",
      toolCallId: "tool-hunk",
      workspaceDir: workspace,
      repoRoot: workspace,
      filePaths: ["supply_vue/.gitignore"],
    });
    await fs.writeFile(gitignorePath, ".idea\n.vscode\n.ai/\n# this-run-only\n", "utf-8");
    await finishToolMutationCapture({
      sessionKey: "agent:solo:main",
      runId: "run-hunk",
      toolCallId: "tool-hunk",
      fileStatuses: [{ path: "supply_vue/.gitignore", changeType: "modified" }],
    });

    await changeReviewHandlers["changeReview.capture"]({
      req: { id: "req-hunk" } as never,
      params: { sessionKey: "agent:solo:main", runId: "run-hunk" },
      respond: ((ok: boolean, result?: { diffText?: string }) => {
        expect(ok).toBe(true);
        expect(result?.diffText).toContain("+# this-run-only");
        expect(result?.diffText).not.toContain("+.idea");
        expect(result?.diffText).not.toContain("+.vscode");
      }) as unknown as RespondFn,
      context: {} as never,
      client: null,
      isWebchatConnect: () => false,
    });
  });

  it("does not return stale previous-run changes when a new run has no bundle", async () => {
    const workspace = await createWorkspace();
    const gitignorePath = path.join(workspace, "supply_vue/.gitignore");

    await beginToolMutationCapture({
      sessionKey: "agent:solo:main",
      runId: "run-old",
      toolCallId: "tool-old",
      workspaceDir: workspace,
      repoRoot: workspace,
      filePaths: ["supply_vue/.gitignore"],
    });
    await fs.writeFile(gitignorePath, ".ai/\n# old-change\n", "utf-8");
    await finishToolMutationCapture({
      sessionKey: "agent:solo:main",
      runId: "run-old",
      toolCallId: "tool-old",
      fileStatuses: [{ path: "supply_vue/.gitignore", changeType: "modified" }],
    });

    const respond = ((ok: boolean, result?: unknown) => {
      expect(ok).toBe(true);
      expect(result).toEqual({ pending: false });
    }) as unknown as RespondFn;

    await changeReviewHandlers["changeReview.capture"]({
      req: { id: "req-2" } as never,
      params: { sessionKey: "agent:solo:main", runId: "run-new" },
      respond,
      context: {} as never,
      client: null,
      isWebchatConnect: () => false,
    });
  });

  it("does not create a pending review when the captured file content did not actually change", async () => {
    const workspace = await createWorkspace();

    await beginToolMutationCapture({
      sessionKey: "agent:solo:main",
      runId: "run-noop",
      toolCallId: "tool-noop",
      workspaceDir: workspace,
      repoRoot: workspace,
      filePaths: ["supply_vue/.gitignore"],
    });
    await finishToolMutationCapture({
      sessionKey: "agent:solo:main",
      runId: "run-noop",
      toolCallId: "tool-noop",
      fileStatuses: [{ path: "supply_vue/.gitignore", changeType: "modified" }],
    });

    await changeReviewHandlers["changeReview.capture"]({
      req: { id: "req-2b" } as never,
      params: { sessionKey: "agent:solo:main", runId: "run-noop" },
      respond: ((ok: boolean, result?: unknown) => {
        expect(ok).toBe(true);
        expect(result).toEqual({ pending: false });
      }) as unknown as RespondFn,
      context: {} as never,
      client: null,
      isWebchatConnect: () => false,
    });
  });

  it("reverts the current run bundle using stored before/after content", async () => {
    const workspace = await createWorkspace();
    const gitignorePath = path.join(workspace, "supply_vue/.gitignore");

    await beginToolMutationCapture({
      sessionKey: "agent:solo:main",
      runId: "run-2",
      toolCallId: "tool-2",
      workspaceDir: workspace,
      repoRoot: workspace,
      filePaths: ["supply_vue/.gitignore"],
    });
    await fs.writeFile(gitignorePath, ".ai/\n# change-review-test-2\n", "utf-8");
    await finishToolMutationCapture({
      sessionKey: "agent:solo:main",
      runId: "run-2",
      toolCallId: "tool-2",
      fileStatuses: [{ path: "supply_vue/.gitignore", changeType: "modified" }],
    });

    let reviewId = "";
    await changeReviewHandlers["changeReview.capture"]({
      req: { id: "req-3" } as never,
      params: { sessionKey: "agent:solo:main", runId: "run-2" },
      respond: ((ok: boolean, result?: { id?: string }) => {
        expect(ok).toBe(true);
        reviewId = result?.id ?? "";
      }) as unknown as RespondFn,
      context: {} as never,
      client: null,
      isWebchatConnect: () => false,
    });

    await changeReviewHandlers["changeReview.revert"]({
      req: { id: "req-4" } as never,
      params: { id: reviewId },
      respond: ((ok: boolean, result?: unknown) => {
        expect(ok).toBe(true);
        expect(result).toEqual({ ok: true, reverted: true });
      }) as unknown as RespondFn,
      context: {} as never,
      client: null,
      isWebchatConnect: () => false,
    });

    expect(await fs.readFile(gitignorePath, "utf-8")).toBe(".ai/\n");
  });

  it("applies and reverts staged-only review bundles without pre-writing files", async () => {
    const workspace = await createWorkspace();
    const filePath = path.join(workspace, "supply_vue/.gitignore");
    const bundle = createVirtualReviewBundle({
      sessionKey: "agent:solo:main",
      runId: "run-staged",
      workspaceDir: workspace,
      repoRoot: workspace,
      files: [
        {
          path: "supply_vue/.gitignore",
          absolutePath: filePath,
          changeType: "modified",
          beforeContent: ".ai/\n",
          afterContent: ".ai/\n# staged\n",
          diffText: "diff --git a/supply_vue/.gitignore b/supply_vue/.gitignore",
        },
      ],
    });
    expect(bundle?.stagedOnly).toBe(true);
    expect(bundle && "stagedOnly" in bundle ? bundle.stagedOnly : undefined).toBe(true);
    expect(await fs.readFile(filePath, "utf-8")).toBe(".ai/\n");

    await revertReviewBundle(bundle!.reviewId);
    expect(await fs.readFile(filePath, "utf-8")).toBe(".ai/\n");

    const bundle2 = createVirtualReviewBundle({
      sessionKey: "agent:solo:main",
      runId: "run-staged-apply",
      workspaceDir: workspace,
      repoRoot: workspace,
      files: [
        {
          path: "supply_vue/.gitignore",
          absolutePath: filePath,
          changeType: "modified",
          beforeContent: ".ai/\n",
          afterContent: ".ai/\n# applied\n",
          diffText: "diff --git a/supply_vue/.gitignore b/supply_vue/.gitignore",
        },
      ],
    });

    await applyReviewBundle(bundle2!.reviewId);
    expect(await fs.readFile(filePath, "utf-8")).toBe(".ai/\n# applied\n");
  });

  it("applies a single file without clearing the rest of the review bundle", async () => {
    const workspace = await createWorkspace();
    const fileA = path.join(workspace, "supply_vue/.gitignore");
    const fileB = path.join(workspace, "supply_vue/review.txt");
    await fs.writeFile(fileB, "old\n", "utf-8");
    const bundle = createVirtualReviewBundle({
      sessionKey: "agent:solo:main",
      runId: "run-file-ops",
      workspaceDir: workspace,
      repoRoot: workspace,
      files: [
        {
          path: "supply_vue/.gitignore",
          absolutePath: fileA,
          changeType: "modified",
          beforeContent: ".ai/\n",
          afterContent: ".ai/\n# apply-a\n",
          diffText: "diff --git a/supply_vue/.gitignore b/supply_vue/.gitignore",
        },
        {
          path: "supply_vue/review.txt",
          absolutePath: fileB,
          changeType: "modified",
          beforeContent: "old\n",
          afterContent: "new\n",
          diffText: "diff --git a/supply_vue/review.txt b/supply_vue/review.txt",
        },
      ],
    });

    await changeReviewHandlers["changeReview.apply"]({
      req: { id: "req-file-apply" } as never,
      params: { id: bundle!.reviewId, path: "supply_vue/.gitignore" },
      respond: ((ok: boolean, result?: unknown) => {
        expect(ok).toBe(true);
        expect(result).toEqual({ ok: true, applied: true });
      }) as unknown as RespondFn,
      context: {} as never,
      client: null,
      isWebchatConnect: () => false,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(await fs.readFile(fileA, "utf-8")).toBe(".ai/\n# apply-a\n");
    await changeReviewHandlers["changeReview.status"]({
      req: { id: "req-file-status" } as never,
      params: { sessionKey: "agent:solo:main" },
      respond: ((ok: boolean, result?: { files?: Array<{ path: string }> }) => {
        expect(ok).toBe(true);
        expect(result?.files).toHaveLength(1);
        expect(result?.files?.[0]).toMatchObject({ path: "supply_vue/review.txt" });
      }) as unknown as RespondFn,
      context: {} as never,
      client: null,
      isWebchatConnect: () => false,
    });
  });
});
