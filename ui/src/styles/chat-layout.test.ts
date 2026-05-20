import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readChatLayoutCss(): string {
  const candidates = [
    resolve(process.cwd(), "src/styles/chat/layout.css"),
    resolve(process.cwd(), "ui/src/styles/chat/layout.css"),
  ];
  const cssPath = candidates.find((candidate) => existsSync(candidate));
  if (!cssPath) {
    throw new Error("chat layout.css fixture not found");
  }
  return readFileSync(cssPath, "utf8");
}

describe("chat layout styles", () => {
  it("keeps mobile PWA composer controls above under-reported safe areas", () => {
    const css = readChatLayoutCss();

    expect(css).toContain("margin: 0 8px calc(14px + var(--safe-area-bottom));");
    expect(css).toContain("@media (display-mode: standalone) and (max-width: 768px)");
    expect(css).toContain("margin-bottom: calc(14px + max(var(--safe-area-bottom), 34px));");
  });
});
