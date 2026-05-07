import { render } from "lit";
import { afterEach, describe, expect, it } from "vitest";
import "../test-helpers/load-styles.ts";
import { renderChatControls } from "./app-render.helpers.ts";
import type { AppViewState } from "./app-view-state.ts";

function createState(overrides: Partial<AppViewState> = {}) {
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
    settings: {
      chatShowThinking: false,
      chatShowToolCalls: true,
      chatFocusMode: false,
    },
    applySettings: () => undefined,
    requestUpdate: () => undefined,
    ...overrides,
  } as unknown as AppViewState;
}

function renderRefreshButton(overrides: Partial<AppViewState> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  render(renderChatControls(createState(overrides)), container);

  const button = container.querySelector<HTMLButtonElement>(
    `.chat-controls .btn--icon`,
  );
  expect(button).not.toBeNull();
  return button!;
}

describe("chat header controls (browser)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
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
});
