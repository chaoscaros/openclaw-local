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

describe("logs styles", () => {
  it("keeps the log stream responsive to the viewport", () => {
    const css = readComponentsCss();

    expect(css).toContain("max-height: calc(100vh - 280px);");
    expect(css).toContain("min-height: 200px;");
    expect(css).not.toContain("max-height: 500px;");
  });

  it("allows fill-height log cards to hand scrolling to the log stream", () => {
    const css = readComponentsCss();

    expect(css).toContain(".card--fill-height {");
    expect(css).toContain(".card--fill-height .log-stream {");
    expect(css).toMatch(/\.card--fill-height \.log-stream \{[\s\S]*max-height:\s*none;/);
  });
});

describe("field input styles", () => {
  it("keeps shared form controls at iOS-safe text size on touch-primary devices", () => {
    const css = readComponentsCss();

    expect(css).toContain("@media (hover: none) and (pointer: coarse)");
    expect(css).toContain(".field input,\n  .field textarea,\n  .field select");
    expect(css).toContain("font-size: 16px;");
  });
});

describe("sessions table styles", () => {
  it("preserves key-column spacing without wrapping rows", () => {
    const css = readComponentsCss();

    expect(css).toContain(
      ".session-key-cell .session-link,\n.session-key-display-name {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;",
    );
    expect(css).toContain(".sessions-table {\n  min-width: 1480px;");
    expect(css).toContain(".sessions-table tbody tr.session-data-row > td {");
    expect(css).toContain("scrollbar-gutter: stable both-edges;");
  });
});
