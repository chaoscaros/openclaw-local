import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createOpenClawCodingTools } from "./pi-tools.js";

describe("createOpenClawCodingTools staged change review previews", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
    );
  });

  it("returns a staged preview for write without writing the file", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-change-review-write-"));
    tempDirs.push(workspaceDir);
    const filePath = path.join(workspaceDir, "supply_vue/.gitignore");
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, ".ai/\n", "utf-8");

    const tools = createOpenClawCodingTools({
      workspaceDir,
      changeReviewModeEnabled: true,
    });
    const writeTool = tools.find((tool) => tool.name === "write");
    expect(writeTool).toBeDefined();

    const result = await writeTool!.execute("tool-write-preview", {
      path: "supply_vue/.gitignore",
      content: ".ai/\n# staged-write\n",
    });

    const preview = (
      result?.details as { changeReviewPreview?: { files?: Array<Record<string, unknown>> } }
    )?.changeReviewPreview;
    expect(preview?.files?.[0]).toMatchObject({
      path: "supply_vue/.gitignore",
      changeType: "modified",
      afterContent: ".ai/\n# staged-write\n",
    });
    expect(await fs.readFile(filePath, "utf-8")).toBe(".ai/\n");
  });

  it("returns a staged preview for edit without mutating the file", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-change-review-edit-"));
    tempDirs.push(workspaceDir);
    const filePath = path.join(workspaceDir, "supply_vue/.gitignore");
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, ".ai/\n# old\n", "utf-8");

    const tools = createOpenClawCodingTools({
      workspaceDir,
      changeReviewModeEnabled: true,
    });
    const editTool = tools.find((tool) => tool.name === "edit");
    expect(editTool).toBeDefined();

    const result = await editTool!.execute("tool-edit-preview", {
      path: "supply_vue/.gitignore",
      edits: [{ oldText: "# old", newText: "# new" }],
    });

    const preview = (
      result?.details as { changeReviewPreview?: { files?: Array<Record<string, unknown>> } }
    )?.changeReviewPreview;
    expect(preview?.files?.[0]).toMatchObject({
      path: "supply_vue/.gitignore",
      changeType: "modified",
    });
    expect(preview?.files?.[0]?.afterContent).toBe(".ai/\n# new\n");
    expect(await fs.readFile(filePath, "utf-8")).toBe(".ai/\n# old\n");
  });
});
