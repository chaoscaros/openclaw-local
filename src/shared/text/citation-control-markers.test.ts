import { describe, expect, it } from "vitest";
import { stripUnsupportedCitationControlMarkers } from "./citation-control-markers.js";

describe("stripUnsupportedCitationControlMarkers", () => {
  it("strips unsupported citation control markers", () => {
    expect(stripUnsupportedCitationControlMarkers("Answer citeturn1search0 with proof")).toBe(
      "Answer  with proof",
    );
  });

  it("strips trailing citation markers without leaving line padding", () => {
    expect(
      stripUnsupportedCitationControlMarkers(
        "First line citeturn1search0\nSecond line citeturn2search3",
      ),
    ).toBe("First line\nSecond line");
  });
});
