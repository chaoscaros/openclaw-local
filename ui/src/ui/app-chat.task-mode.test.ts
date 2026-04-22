import { describe, expect, it, vi } from "vitest";
import { handleSendChat } from "./app-chat.ts";

function buildHost() {
  return {
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
  };
}

describe("handleSendChat task mode guard", () => {
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
