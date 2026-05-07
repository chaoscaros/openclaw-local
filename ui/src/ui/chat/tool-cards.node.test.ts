import { describe, expect, it } from "vitest";
import { extractToolCards } from "./tool-cards.ts";

describe("tool-card extraction", () => {
  it("extracts tool result output from text block content arrays", () => {
    const cards = extractToolCards(
      {
        role: "assistant",
        content: [
          {
            type: "toolcall",
            id: "call-read",
            name: "read",
            input: { path: "README.md" },
          },
          {
            type: "tool_result",
            id: "call-read",
            name: "read",
            content: [
              { type: "text", text: "# Heading" },
              { type: "text", text: "file body" },
            ],
          },
        ],
      },
      "msg:read",
    );

    expect(cards).toHaveLength(1);
    expect(cards[0]?.outputText).toBe("# Heading\nfile body");
  });
});
