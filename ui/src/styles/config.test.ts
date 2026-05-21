import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readConfigCss(): string {
  const candidates = [
    resolve(process.cwd(), "src/styles/config.css"),
    resolve(process.cwd(), "ui/src/styles/config.css"),
  ];
  const cssPath = candidates.find((candidate) => existsSync(candidate));
  if (!cssPath) {
    throw new Error("config.css fixture not found");
  }
  return readFileSync(cssPath, "utf8");
}

describe("config styles", () => {
  it("keeps config inputs at iOS-safe text size on touch-primary devices", () => {
    const css = readConfigCss();

    expect(css).toContain("@media (hover: none) and (pointer: coarse)");
    expect(css).toContain(".config-search__input,");
    expect(css).toContain(".config-raw-field textarea,");
    expect(css).toContain(".cfg-number__input,");
    expect(css).toContain(".cfg-select {");
    expect(css).toContain("font-size: 16px;");
  });
});
