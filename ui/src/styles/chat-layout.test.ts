import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readCss(relativePath: string): string {
  const candidates = [
    resolve(process.cwd(), relativePath),
    resolve(process.cwd(), "ui", relativePath),
  ];
  const cssPath = candidates.find((candidate) => existsSync(candidate));
  if (!cssPath) {
    throw new Error(`${relativePath} fixture not found`);
  }
  return readFileSync(cssPath, "utf8");
}

function readChatLayoutCss(): string {
  return readCss("src/styles/chat/layout.css");
}

describe("chat layout styles", () => {
  it("keeps mobile PWA composer controls above under-reported safe areas", () => {
    const css = readChatLayoutCss();

    expect(css).toContain("margin: 0 8px calc(14px + var(--safe-area-bottom));");
    expect(css).toContain("@media (display-mode: standalone) and (max-width: 768px)");
    expect(css).toContain("margin-bottom: calc(14px + max(var(--safe-area-bottom), 34px));");
  });

  it("keeps desktop chat header controls on a compact aligned rhythm", () => {
    const chatCss = readChatLayoutCss();
    const layoutCss = readCss("src/styles/layout.css");

    expect(layoutCss).toContain("grid-template-columns: minmax(0, 1fr) max-content;");
    expect(layoutCss).toContain("min-height: 44px;");
    expect(layoutCss).toContain("max-height: none;");
    expect(layoutCss).toContain(".content--chat .content-header .chat-controls__session-notice");
    expect(layoutCss).toContain("@media (max-width: 1400px)");
    expect(chatCss).toContain(".chat-controls .btn--icon {");
    expect(chatCss).toContain("width: 36px;");
    expect(chatCss).toContain(".chat-controls__separator {");
    expect(chatCss).toContain("height: 22px;");
  });

  it("lays out local mobile chat header action icons as an even grid", () => {
    const css = readCss("src/styles/layout.mobile.css");

    expect(css).toContain(
      ".chat-mobile-controls-wrapper .chat-controls-dropdown .chat-controls__thinking",
    );
    expect(css).toContain("grid-template-columns: repeat(3, minmax(0, 1fr));");
    expect(css).toContain(
      ".chat-mobile-controls-wrapper .chat-controls-dropdown .btn--icon {\n    width: 100%;",
    );
    expect(css).toContain("height: 44px;");
  });
});
