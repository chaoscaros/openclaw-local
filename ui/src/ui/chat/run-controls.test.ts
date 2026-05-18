/* @vitest-environment jsdom */

import { render } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { i18n, t } from "../../i18n/index.ts";
import { renderChatRunControls, type ChatRunControlsProps } from "./run-controls.ts";

vi.mock("../icons.ts", () => ({
  icons: {},
}));

function createProps(overrides: Partial<ChatRunControlsProps> = {}): ChatRunControlsProps {
  return {
    canAbort: false,
    canSend: true,
    draft: "",
    hasMessages: false,
    isBusy: false,
    sending: false,
    onAbort: () => undefined,
    onExport: () => undefined,
    onNewSession: () => undefined,
    onResetSession: () => undefined,
    onSend: () => undefined,
    onStoreDraft: () => undefined,
    ...overrides,
  };
}

function getButton(container: Element, selector: string): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(selector);
  expect(button).toBeInstanceOf(HTMLButtonElement);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected button matching ${selector}`);
  }
  return button;
}

describe("chat run controls", () => {
  afterEach(async () => {
    await i18n.setLocale("en");
  });

  it("shows separate new and reset session buttons while idle", () => {
    const container = document.createElement("div");
    const onNewSession = vi.fn();
    const onResetSession = vi.fn();
    render(
      renderChatRunControls(
        createProps({
          onNewSession,
          onResetSession,
        }),
      ),
      container,
    );

    const newSessionButton = getButton(container, 'button[title="New session"]');
    expect(newSessionButton.textContent).toContain("New session");
    newSessionButton.click();
    expect(onNewSession).toHaveBeenCalledTimes(1);

    const resetButton = getButton(container, 'button[title="Reset session"]');
    expect(resetButton.dataset.chatResetSessionButton).toBe("true");
    expect(resetButton.textContent).toContain("Reset session");
    resetButton.click();
    expect(onResetSession).toHaveBeenCalledTimes(1);
  });

  it("switches to queue and stop actions while aborting is available", () => {
    const container = document.createElement("div");
    const onAbort = vi.fn();
    const onSend = vi.fn();
    const onStoreDraft = vi.fn();
    render(
      renderChatRunControls(
        createProps({
          canAbort: true,
          draft: " follow up ",
          onAbort,
          onSend,
          onStoreDraft,
        }),
      ),
      container,
    );

    expect(container.querySelector('button[title="New session"]')).toBeNull();
    expect(container.querySelector('button[title="Reset session"]')).toBeNull();

    getButton(container, 'button[title="Queue"]').click();
    expect(onStoreDraft).toHaveBeenCalledWith(" follow up ");
    expect(onSend).toHaveBeenCalledTimes(1);

    getButton(container, 'button[title="Stop"]').click();
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it("renders run-control labels from the active locale", async () => {
    await i18n.setLocale("zh-CN");
    const container = document.createElement("div");
    render(renderChatRunControls(createProps({ hasMessages: true })), container);

    expect(getButton(container, `button[title="${t("chatUi.newSession")}"]`).textContent).toContain(
      t("chatUi.newSession"),
    );
    expect(
      getButton(container, `button[title="${t("chatUi.resetSession")}"]`).textContent,
    ).toContain(t("chatUi.resetSession"));
    expect(getButton(container, `button[title="${t("chatUi.export")}"]`).textContent).toContain(
      t("chatUi.export"),
    );
    expect(getButton(container, `button[title="${t("chatUi.send")}"]`).textContent).toContain(
      t("chatUi.send"),
    );
  });
});
