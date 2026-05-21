import { render } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../test-helpers/load-styles.ts";
import { renderChatControls } from "./app-render.helpers.ts";
import type { AppViewState } from "./app-view-state.ts";

function createState(overrides: Partial<AppViewState> = {}) {
  const settings = {
    chatShowThinking: false,
    chatShowToolCalls: true,
    chatFocusMode: false,
    chatAutoScroll: "near-bottom",
    ...overrides.settings,
  } as AppViewState["settings"];
  return {
    connected: true,
    chatLoading: false,
    chatRunId: null,
    chatSending: false,
    chatStream: null,
    onboarding: false,
    sessionKey: "main",
    sessionsHideCron: true,
    chatMessage: "",
    chatMessages: [],
    chatAttachments: [],
    chatQueue: [],
    chatThinkingLevel: null,
    chatStreamStartedAt: null,
    chatSideResult: null,
    chatToolMessages: [],
    chatStreamSegments: [],
    chatModelOverrides: {},
    chatModelsLoading: false,
    chatModelCatalog: [],
    refreshSessionsAfterChat: new Set<string>(),
    taskCarryoverAfterChatByRun: new Map<string, { taskId: string; sourceSessionKey: string }>(),
    sessionsResult: { ts: 0, path: "", count: 0, defaults: {}, sessions: [] },
    applySettings: () => undefined,
    requestUpdate: () => undefined,
    ...overrides,
    settings,
  } as unknown as AppViewState;
}

function renderControls(overrides: Partial<AppViewState> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  render(renderChatControls(createState(overrides)), container);
  return container;
}

function renderRefreshButton(overrides: Partial<AppViewState> = {}) {
  const container = renderControls(overrides);
  const button = container.querySelector<HTMLButtonElement>(`.chat-controls .btn--icon`);
  expect(button).not.toBeNull();
  return button!;
}

describe("chat header controls (browser)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("does not leak cron toggle template logic into the rendered header", () => {
    const container = renderControls();
    const text = container.textContent ?? "";
    expect(text).not.toContain("showCronSessionsHidden");
    expect(text).not.toContain("hiddenCronCount");

    const iconButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>(`.chat-controls .btn--icon`),
    );
    const cronButton = iconButtons.at(-1) ?? null;
    expect(cronButton).not.toBeNull();
    expect(cronButton?.getAttribute("title")?.trim()).toBeTruthy();
  });

  it.each([
    ["connected and idle", {}, false],
    ["chat history loading", { chatLoading: true }, true],
    ["chat send in flight", { chatSending: true }, true],
    ["active run", { chatRunId: "run-123" }, true],
    ["active stream", { chatStream: "streaming" }, true],
    ["disconnected", { connected: false }, true],
  ] as const)("sets refresh disabled state while %s", (_name, overrides, disabled) => {
    const button = renderRefreshButton(overrides);
    expect(button.disabled).toBe(disabled);
  });

  it("renders and applies the chat auto-scroll mode selector", () => {
    const applySettings = vi.fn();
    const container = renderControls({ applySettings });
    const select = container.querySelector<HTMLSelectElement>(
      '[data-chat-auto-scroll-select="true"]',
    );
    expect(select).not.toBeNull();
    expect(select?.value).toBe("near-bottom");

    select!.value = "off";
    select!.dispatchEvent(new Event("change", { bubbles: true }));

    expect(applySettings).toHaveBeenCalledWith(expect.objectContaining({ chatAutoScroll: "off" }));
  });
});
