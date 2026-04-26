import { describe, expect, it } from "vitest";
import { handleSendChat, type ChatHost } from "./app-chat.ts";
import type { SessionsListResult } from "./types.ts";

function buildHost(): ChatHost & { sessionsResult: SessionsListResult } {
  return {
    settings: {
      gatewayUrl: '',
      token: '',
      locale: 'en',
      sessionKey: 'main',
      lastActiveSessionKey: 'main',
      theme: 'claw',
      themeMode: 'dark',
      splitRatio: 0.6,
      navWidth: 280,
      navCollapsed: false,
      navGroupsCollapsed: {},
      borderRadius: 50,
      chatFocusMode: false,
      chatShowThinking: false,
      chatShowToolCalls: true,
    },
    applySettings(next: import('./storage.ts').UiSettings) {
      (this as { settings: import('./storage.ts').UiSettings }).settings = next;
    },
    client: {} as never,
    chatMessages: [],
    chatStream: null,
    connected: true,
    chatMessage: "hello",
    chatAttachments: [],
    chatQueue: [],
    chatRunId: null,
    chatSending: false,
    lastError: null,
    sessionKey: "main",
    basePath: "",
    hello: null,
    chatAvatarUrl: null,
    chatModelOverrides: {},
    chatModelsLoading: false,
    chatModelCatalog: [],
    toolStreamById: new Map(),
    toolStreamOrder: [],
    chatToolMessages: [],
    chatStreamSegments: [],
    tasksBusy: false,
    sessionsResult: {
      ts: 1,
      path: "",
      count: 1,
      defaults: { modelProvider: null, model: null, contextTokens: null },
      sessions: [{ key: "main", kind: "direct", updatedAt: Date.now(), mode: "task" }],
    },
    updateComplete: Promise.resolve(),
    refreshSessionsAfterChat: new Set<string>(),
    taskCarryoverAfterChatByRun: new Map<string, { taskId: string; sourceSessionKey: string }>(),
  } as unknown as ChatHost & { sessionsResult: SessionsListResult };
}

describe("handleSendChat task mode guard", () => {
  it("records current task carryover when /new is sent from task mode", async () => {
    const request = async (method: string) => {
      if (method === 'chat.send') {
        return {};
      }
      throw new Error(`Unexpected request: ${method}`);
    };
    const host = buildHost();
    host.client = { request } as never;
    host.chatMessage = '/new';
    host.sessionsResult.sessions[0] = {
      ...host.sessionsResult.sessions[0],
      taskId: 'task-current',
    };

    await handleSendChat(host as never);

    expect(host.refreshSessionsAfterChat.size).toBe(1);
    const [runId] = Array.from(host.refreshSessionsAfterChat);
    expect(host.taskCarryoverAfterChatByRun.get(runId)).toEqual({
      taskId: 'task-current',
      sourceSessionKey: 'main',
    });
  });

  it("blocks send when task mode has no current task", async () => {
    const host = buildHost();
    await handleSendChat(host as never);
    expect(host.lastError).toContain("Create a task or select an existing task before sending messages.");
  });

  it("blocks send while task switching is still in progress", async () => {
    const host = buildHost();
    host.tasksBusy = true;
    host.sessionsResult.sessions[0] = {
      ...host.sessionsResult.sessions[0],
      taskId: "task-old",
    };

    await handleSendChat(host as never);

    expect(host.lastError).toContain("正在切换任务模式，请稍候");
  });
});
