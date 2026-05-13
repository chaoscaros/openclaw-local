import { describe, expect, it } from "vitest";
import { createVirtualReviewBundle, resetChangeReviewStoreForTest } from "./change-review-store.js";

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
