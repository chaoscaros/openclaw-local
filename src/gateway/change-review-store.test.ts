import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyReviewBundle,
  beginToolMutationCapture,
  createVirtualReviewBundle,
  finishToolMutationCapture,
  getFreshPendingReviewBySession,
  getPendingReviewBySession,
  resetChangeReviewStoreForTest,
} from "./change-review-store.js";

describe("change-review-store hunk aggregation", () => {
  it("merges contiguous added lines into a single hunk instead of one line per block", () => {
    resetChangeReviewStoreForTest();

    const beforeContent = [
      "export function existing() {",
      "  return requestMd5({});",
      "}",
      "",
    ].join("\n");
    const afterContent = [
      "export function existing() {",
      "  return requestMd5({});",
      "}",
      "",
      "// 移库",
      "export function move_inventory(params) {",
      "  return requestMd5({",
      '    url: "/inventory/move-inventory",',
      '    method: "post",',
      "    data: params,",
      "  });",
      "}",
    ].join("\n");

    const bundle = createVirtualReviewBundle({
      sessionKey: "session-1",
      runId: "run-1",
      workspaceDir: "/tmp/workspace",
      repoRoot: "/tmp/workspace",
      files: [
        {
          path: "src/api/warehouse/warehouseNow.js",
          absolutePath: "/tmp/workspace/src/api/warehouse/warehouseNow.js",
          changeType: "modified",
          beforeContent,
          afterContent,
          diffText: "",
        },
      ],
    });

    expect(bundle).toBeTruthy();
    const file = bundle?.files[0];
    expect(file?.hunks).toHaveLength(1);
    expect(file?.hunks[0]).toMatchObject({
      changeType: "added",
      afterStartLine: 4,
      afterEndLine: 12,
      beforeStartLine: 0,
      beforeEndLine: 0,
    });
    expect(file?.hunks[0]?.afterLines).toEqual([
      "",
      "// 移库",
      "export function move_inventory(params) {",
      "  return requestMd5({",
      '    url: "/inventory/move-inventory",',
      '    method: "post",',
      "    data: params,",
      "  });",
      "}",
    ]);
    expect(file?.groups).toHaveLength(1);
    expect(file?.groups[0]?.hunkCount).toBe(1);
  });
});

describe("change-review-store stale review handling", () => {
  let tempDir: string;

  beforeEach(async () => {
    resetChangeReviewStoreForTest();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-change-review-"));
  });

  afterEach(async () => {
    resetChangeReviewStoreForTest();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("clears stale non-staged pending reviews when the file no longer matches the capture", async () => {
    const filePath = path.join(tempDir, "pages/tabar/shopcart.vue");
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "before\n", "utf-8");

    await beginToolMutationCapture({
      sessionKey: "session-1",
      runId: "run-1",
      toolCallId: "tool-1",
      workspaceDir: tempDir,
      repoRoot: tempDir,
      filePaths: [filePath],
    });
    await fs.writeFile(filePath, "after\n", "utf-8");
    const bundle = await finishToolMutationCapture({
      sessionKey: "session-1",
      runId: "run-1",
      toolCallId: "tool-1",
    });

    expect(bundle?.stagedOnly).toBe(false);
    expect(getPendingReviewBySession("session-1")?.reviewId).toBe(bundle?.reviewId);

    await fs.writeFile(filePath, "before\n", "utf-8");

    await expect(getFreshPendingReviewBySession("session-1")).resolves.toBeNull();
    expect(getPendingReviewBySession("session-1")).toBeNull();
  });

  it("rejects applying a stale non-staged review instead of silently accepting it", async () => {
    const filePath = path.join(tempDir, "pages/tabar/shopcart.vue");
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "before\n", "utf-8");

    await beginToolMutationCapture({
      sessionKey: "session-1",
      runId: "run-1",
      toolCallId: "tool-1",
      workspaceDir: tempDir,
      repoRoot: tempDir,
      filePaths: [filePath],
    });
    await fs.writeFile(filePath, "after\n", "utf-8");
    const bundle = await finishToolMutationCapture({
      sessionKey: "session-1",
      runId: "run-1",
      toolCallId: "tool-1",
    });
    expect(bundle).toBeTruthy();

    await fs.writeFile(filePath, "before\n", "utf-8");

    await expect(applyReviewBundle(bundle!.reviewId)).rejects.toThrow(
      "file changed after review capture: pages/tabar/shopcart.vue",
    );
    expect(getPendingReviewBySession("session-1")).toBeNull();
    await expect(fs.readFile(filePath, "utf-8")).resolves.toBe("before\n");
  });
});
