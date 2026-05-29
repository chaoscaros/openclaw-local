import { describe, expect, it } from "vitest";
import { shouldApplyReplayToolCallIdSanitizer } from "./attempt.tool-call-normalization.js";

describe("shouldApplyReplayToolCallIdSanitizer", () => {
  it("respects provider replay policies that opt out of tool call id sanitization", () => {
    expect(
      shouldApplyReplayToolCallIdSanitizer({
        sanitizeToolCallIds: false,
        toolCallIdMode: "strict",
        isOpenAIResponsesApi: false,
      }),
    ).toBe(false);
  });

  it("keeps strict replay sanitization for non-responses APIs when enabled", () => {
    expect(
      shouldApplyReplayToolCallIdSanitizer({
        sanitizeToolCallIds: true,
        toolCallIdMode: "strict",
        isOpenAIResponsesApi: false,
      }),
    ).toBe(true);
  });
});
