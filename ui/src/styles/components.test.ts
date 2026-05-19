import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readComponentsCss(): string {
  const candidates = [
    resolve(process.cwd(), "src/styles/components.css"),
    resolve(process.cwd(), "ui/src/styles/components.css"),
  ];
  const cssPath = candidates.find((candidate) => existsSync(candidate));
  if (!cssPath) {
    throw new Error("components.css fixture not found");
  }
  return readFileSync(cssPath, "utf8");
}

describe("code block highlight styles", () => {
  it("targets the markdown renderer's generated code block wrapper", () => {
    const css = readComponentsCss();

    expect(css).toContain(":is(.code-block .hljs, .code-block-wrapper pre code.hljs)");
    expect(css).toContain(":is(.code-block, .code-block-wrapper pre code.hljs) .hljs-keyword");
    expect(css).toContain(
      ':root[data-theme-mode="light"] :is(.code-block, .code-block-wrapper pre code.hljs) .hljs-string',
    );
  });
});
