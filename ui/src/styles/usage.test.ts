import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readUsageCss(): string {
  const candidates = [
    resolve(process.cwd(), "src/styles/usage.css"),
    resolve(process.cwd(), "ui/src/styles/usage.css"),
  ];
  const cssPath = candidates.find((candidate) => existsSync(candidate));
  if (!cssPath) {
    throw new Error("usage.css fixture not found");
  }
  return readFileSync(cssPath, "utf8");
}

describe("usage styles", () => {
  it("keeps usage filters at iOS-safe text size on touch-primary devices", () => {
    const css = readUsageCss();

    expect(css).toContain("@media (hover: none) and (pointer: coarse)");
    expect(css).toContain(".usage-date-input,");
    expect(css).toContain(".usage-query-input,");
    expect(css).toContain('.usage-filters-inline input[type="text"]');
    expect(css).toContain("font-size: 16px;");
  });
});
