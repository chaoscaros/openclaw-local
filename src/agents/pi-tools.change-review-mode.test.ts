import { describe, expect, it } from "vitest";
import { createOpenClawCodingTools } from "./pi-tools.js";

describe("createOpenClawCodingTools change review mode", () => {
  it("removes direct mutating gateway tools when change review mode is enabled", () => {
    const tools = createOpenClawCodingTools({
      workspaceDir: "/tmp/openclaw-change-review-mode",
      changeReviewModeEnabled: true,
    });
    const names = new Set(tools.map((tool) => tool.name));
    expect(names.has("write")).toBe(true);
    expect(names.has("edit")).toBe(true);
    expect(names.has("exec")).toBe(false);
    expect(names.has("process")).toBe(false);
    expect(names.has("apply_patch")).toBe(false);
  });
});
