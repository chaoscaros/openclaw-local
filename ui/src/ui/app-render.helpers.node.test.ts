import { beforeEach, describe, expect, it, vi } from "vitest";
const {
  refreshChatMock,
  refreshChatAvatarMock,
  refreshSlashCommandsMock,
  loadChatHistoryMock,
  loadSessionsMock,
  createSessionAndRefreshMock,
} = vi.hoisted(() => ({
  refreshChatMock: vi.fn(),
  refreshChatAvatarMock: vi.fn(),
  refreshSlashCommandsMock: vi.fn(),
  loadChatHistoryMock: vi.fn(),
  loadSessionsMock: vi.fn(),
  createSessionAndRefreshMock: vi.fn(),
}));

vi.mock("./app-chat.ts", () => ({
  CHAT_SESSIONS_ACTIVE_MINUTES: 120,
  CHAT_SESSIONS_REFRESH_LIMIT: 100,
  refreshChat: refreshChatMock,
  refreshChatAvatar: refreshChatAvatarMock,
}));

vi.mock("./chat/slash-commands.ts", () => ({
  refreshSlashCommands: (...args: unknown[]) => refreshSlashCommandsMock(...args),
}));

vi.mock("./controllers/chat.ts", () => ({
  loadChatHistory: loadChatHistoryMock,
}));

vi.mock("./controllers/sessions.ts", () => ({
  createSessionAndRefresh: createSessionAndRefreshMock,
  loadSessions: loadSessionsMock,
}));

import {
  createChatSession,
  isCronSessionKey,
  isDreamingNarrativeSessionKey,
  parseSessionKey,
  resolveAssistantAttachmentAuthToken,
  resolveSessionDisplayName,
  resolveSessionOptionGroups,
  switchChatSession,
} from "./app-render.helpers.ts";
import type { AppViewState } from "./app-view-state.ts";
import type { SessionsListResult } from "./types.ts";

type SessionRow = SessionsListResult["sessions"][number];

beforeEach(() => {
  refreshChatMock.mockReset();
  refreshChatAvatarMock.mockReset();
  refreshSlashCommandsMock.mockReset();
  loadChatHistoryMock.mockReset();
  loadSessionsMock.mockReset();
  createSessionAndRefreshMock.mockReset();
});

function row(overrides: Partial<SessionRow> & { key: string }): SessionRow {
  return { kind: "direct", updatedAt: 0, ...overrides };
}

/* ================================================================
 *  parseSessionKey – low-level key → type / fallback mapping
 * ================================================================ */

describe("parseSessionKey", () => {
  it("identifies main session (bare 'main')", () => {
    expect(parseSessionKey("main")).toEqual({ prefix: "", fallbackName: "Main Session" });
  });

  it("identifies main session (agent:main:main)", () => {
    expect(parseSessionKey("agent:main:main")).toEqual({
      prefix: "",
      fallbackName: "Main Session",
    });
  });

  it("identifies subagent sessions", () => {
    expect(parseSessionKey("agent:main:subagent:18abfefe-1fa6-43cb-8ba8-ebdc9b43e253")).toEqual({
      prefix: "Subagent:",
      fallbackName: "Subagent:",
    });
  });

  it("identifies cron sessions", () => {
    expect(parseSessionKey("agent:main:cron:daily-briefing-uuid")).toEqual({
      prefix: "Cron:",
      fallbackName: "Cron Job:",
    });
    expect(parseSessionKey("cron:daily-briefing-uuid")).toEqual({
      prefix: "Cron:",
      fallbackName: "Cron Job:",
    });
  });

  it("identifies direct chat with known channel", () => {
    expect(parseSessionKey("agent:main:bluebubbles:direct:+19257864429")).toEqual({
      prefix: "",
      fallbackName: "iMessage · +19257864429",
    });
  });

  it("identifies direct chat with telegram", () => {
    expect(parseSessionKey("agent:main:telegram:direct:user123")).toEqual({
      prefix: "",
      fallbackName: "Telegram · user123",
    });
  });

  it("identifies group chat with known channel", () => {
    expect(parseSessionKey("agent:main:discord:group:guild-chan")).toEqual({
      prefix: "",
      fallbackName: "Discord Group",
    });
  });

  it("capitalises unknown channels in direct/group patterns", () => {
    expect(parseSessionKey("agent:main:mychannel:direct:user1")).toEqual({
      prefix: "",
      fallbackName: "Mychannel · user1",
    });
  });

  it("identifies channel-prefixed legacy keys", () => {
    expect(parseSessionKey("bluebubbles:g-agent-main-bluebubbles-direct-+19257864429")).toEqual({
      prefix: "",
      fallbackName: "iMessage Session",
    });
    expect(parseSessionKey("discord:123:456")).toEqual({
      prefix: "",
      fallbackName: "Discord Session",
    });
  });

  it("handles bare channel name as key", () => {
    expect(parseSessionKey("telegram")).toEqual({
      prefix: "",
      fallbackName: "Telegram Session",
    });
  });

  it("returns raw key for unknown patterns", () => {
    expect(parseSessionKey("something-unknown")).toEqual({
      prefix: "",
      fallbackName: "something-unknown",
    });
  });
});

describe("resolveAssistantAttachmentAuthToken", () => {
  it("prefers the explicit gateway token when present", () => {
    expect(
      resolveAssistantAttachmentAuthToken({
        settings: { token: "session-token" } as AppViewState["settings"],
        password: "shared-password",
      }),
    ).toBe("session-token");
  });

  it("falls back to the shared password when token is blank", () => {
    expect(
      resolveAssistantAttachmentAuthToken({
        settings: { token: "   " } as AppViewState["settings"],
        password: "shared-password",
      }),
    ).toBe("shared-password");
  });

  it("returns null when neither auth secret is available", () => {
    expect(
      resolveAssistantAttachmentAuthToken({
        settings: { token: "" } as AppViewState["settings"],
        password: "   ",
      }),
    ).toBeNull();
  });
});

/* ================================================================
 *  resolveSessionDisplayName – full resolution with row data
 * ================================================================ */

describe("resolveSessionDisplayName", () => {
  // ── Key-only fallbacks (no row) ──────────────────

  it("returns 'Main Session' for agent:main:main key", () => {
    expect(resolveSessionDisplayName("agent:main:main")).toBe("Main Session");
  });

  it("returns 'Main Session' for bare 'main' key", () => {
    expect(resolveSessionDisplayName("main")).toBe("Main Session");
  });

  it("returns 'Subagent:' for subagent key without row", () => {
    expect(resolveSessionDisplayName("agent:main:subagent:abc-123")).toBe("Subagent:");
  });

  it("returns 'Cron Job:' for cron key without row", () => {
    expect(resolveSessionDisplayName("agent:main:cron:abc-123")).toBe("Cron Job:");
  });

  it("parses direct chat key with channel", () => {
    expect(resolveSessionDisplayName("agent:main:bluebubbles:direct:+19257864429")).toBe(
      "iMessage · +19257864429",
    );
  });

  it("parses channel-prefixed legacy key", () => {
    expect(resolveSessionDisplayName("discord:123:456")).toBe("Discord Session");
  });

  it("returns raw key for unknown patterns", () => {
    expect(resolveSessionDisplayName("something-custom")).toBe("something-custom");
  });

  // ── With row data (label / displayName) ──────────

  it("returns parsed fallback when row has no label or displayName", () => {
    expect(resolveSessionDisplayName("agent:main:main", row({ key: "agent:main:main" }))).toBe(
      "Main Session",
    );
  });

  it("returns parsed fallback when displayName matches key", () => {
    expect(resolveSessionDisplayName("mykey", row({ key: "mykey", displayName: "mykey" }))).toBe(
      "mykey",
    );
  });

  it("returns parsed fallback when label matches key", () => {
    expect(resolveSessionDisplayName("mykey", row({ key: "mykey", label: "mykey" }))).toBe("mykey");
  });

  it("uses label alone when available", () => {
    expect(
      resolveSessionDisplayName(
        "discord:123:456",
        row({ key: "discord:123:456", label: "General" }),
      ),
    ).toBe("General");
  });

  it("falls back to displayName when label is absent", () => {
    expect(
      resolveSessionDisplayName(
        "discord:123:456",
        row({ key: "discord:123:456", displayName: "My Chat" }),
      ),
    ).toBe("My Chat");
  });

  it("prefers label over displayName when both are present", () => {
    expect(
      resolveSessionDisplayName(
        "discord:123:456",
        row({ key: "discord:123:456", displayName: "My Chat", label: "General" }),
      ),
    ).toBe("General");
  });

  it("ignores whitespace-only label and falls back to displayName", () => {
    expect(
      resolveSessionDisplayName(
        "discord:123:456",
        row({ key: "discord:123:456", displayName: "My Chat", label: "   " }),
      ),
    ).toBe("My Chat");
  });

  it("uses parsed fallback when whitespace-only label and no displayName", () => {
    expect(
      resolveSessionDisplayName("discord:123:456", row({ key: "discord:123:456", label: "   " })),
    ).toBe("Discord Session");
  });

  it("trims label and displayName", () => {
    expect(resolveSessionDisplayName("k", row({ key: "k", label: "  General  " }))).toBe("General");
    expect(resolveSessionDisplayName("k", row({ key: "k", displayName: "  My Chat  " }))).toBe(
      "My Chat",
    );
  });

  // ── Type prefixes applied to labels / displayNames ──

  it("prefixes subagent label with Subagent:", () => {
    expect(
      resolveSessionDisplayName(
        "agent:main:subagent:abc-123",
        row({ key: "agent:main:subagent:abc-123", label: "maintainer-v2" }),
      ),
    ).toBe("Subagent: maintainer-v2");
  });

  it("prefixes subagent displayName with Subagent:", () => {
    expect(
      resolveSessionDisplayName(
        "agent:main:subagent:abc-123",
        row({ key: "agent:main:subagent:abc-123", displayName: "Task Runner" }),
      ),
    ).toBe("Subagent: Task Runner");
  });

  it("prefixes cron label with Cron:", () => {
    expect(
      resolveSessionDisplayName(
        "agent:main:cron:abc-123",
        row({ key: "agent:main:cron:abc-123", label: "daily-briefing" }),
      ),
    ).toBe("Cron: daily-briefing");
  });

  it("prefixes cron displayName with Cron:", () => {
    expect(
      resolveSessionDisplayName(
        "agent:main:cron:abc-123",
        row({ key: "agent:main:cron:abc-123", displayName: "Nightly Sync" }),
      ),
    ).toBe("Cron: Nightly Sync");
  });

  it("does not double-prefix cron labels that already include Cron:", () => {
    expect(
      resolveSessionDisplayName(
        "agent:main:cron:abc-123",
        row({ key: "agent:main:cron:abc-123", label: "Cron: Nightly Sync" }),
      ),
    ).toBe("Cron: Nightly Sync");
  });

  it("does not double-prefix subagent display names that already include Subagent:", () => {
    expect(
      resolveSessionDisplayName(
        "agent:main:subagent:abc-123",
        row({ key: "agent:main:subagent:abc-123", displayName: "Subagent: Runner" }),
      ),
    ).toBe("Subagent: Runner");
  });

  it("does not prefix non-typed sessions with labels", () => {
    expect(
      resolveSessionDisplayName(
        "agent:main:bluebubbles:direct:+19257864429",
        row({ key: "agent:main:bluebubbles:direct:+19257864429", label: "Tyler" }),
      ),
    ).toBe("Tyler");
  });
});

describe("isCronSessionKey", () => {
  it("returns true for cron: prefixed keys", () => {
    expect(isCronSessionKey("cron:abc-123")).toBe(true);
    expect(isCronSessionKey("cron:weekly-agent-roundtable")).toBe(true);
    expect(isCronSessionKey("agent:main:cron:abc-123")).toBe(true);
    expect(isCronSessionKey("agent:main:cron:abc-123:run:run-1")).toBe(true);
  });

  it("returns false for non-cron keys", () => {
    expect(isCronSessionKey("main")).toBe(false);
    expect(isCronSessionKey("discord:group:eng")).toBe(false);
    expect(isCronSessionKey("agent:main:slack:cron:job:run:uuid")).toBe(false);
  });
});

describe("isDreamingNarrativeSessionKey", () => {
  it("returns true for internal dreaming narrative session keys", () => {
    expect(isDreamingNarrativeSessionKey("dreaming-narrative-light-abc")).toBe(true);
    expect(isDreamingNarrativeSessionKey("agent:main:dreaming-narrative-rem-abc")).toBe(true);
    expect(isDreamingNarrativeSessionKey("agent:solo:dreaming-narrative-deep-abc")).toBe(true);
  });

  it("returns false for ordinary or channel sessions", () => {
    expect(isDreamingNarrativeSessionKey("main")).toBe(false);
    expect(isDreamingNarrativeSessionKey("agent:main:telegram:group:dreaming-narrative-room")).toBe(
      false,
    );
    expect(isDreamingNarrativeSessionKey("agent:main:cron:dreaming-narrative-job")).toBe(false);
  });
});

describe("resolveSessionOptionGroups", () => {
  it("hides internal dreaming narrative sessions from the switcher while keeping normal sessions", () => {
    const state = {
      sessionsHideCron: true,
      agentsList: { defaultId: "main", agents: [{ id: "main", name: "Main" }] },
    } as unknown as AppViewState;
    const groups = resolveSessionOptionGroups(state, "main", {
      ts: 1,
      path: "",
      count: 3,
      defaults: {},
      sessions: [
        row({ key: "main" }),
        row({ key: "agent:main:dreaming-narrative-light-abc" }),
        row({ key: "agent:main:telegram:direct:user-1", label: "User 1" }),
      ],
    } as SessionsListResult);
    const keys = groups.flatMap((group) => group.options.map((option) => option.key));
    expect(keys).toContain("main");
    expect(keys).toContain("agent:main:telegram:direct:user-1");
    expect(keys).not.toContain("agent:main:dreaming-narrative-light-abc");
  });

  it("filters chat session options to the active agent", () => {
    const state = {
      sessionsHideCron: true,
      agentsList: {
        defaultId: "solo",
        agents: [
          { id: "solo", name: "Solo" },
          { id: "ops", name: "Ops" },
        ],
      },
    } as unknown as AppViewState;
    const groups = resolveSessionOptionGroups(state, "agent:ops:dashboard:current", {
      ts: 1,
      path: "",
      count: 5,
      defaults: {},
      sessions: [
        row({ key: "agent:solo:dashboard:old", label: "Solo Old", updatedAt: 1 }),
        row({ key: "agent:ops:dashboard:current", label: "Ops Current", updatedAt: 5 }),
        row({ key: "agent:ops:dashboard:recent", label: "Ops Recent", updatedAt: 4 }),
        row({ key: "agent:ops:subagent:worker", label: "Worker", updatedAt: 3 }),
        row({ key: "agent:ops:cron:daily", label: "Ops Cron", updatedAt: 2 }),
      ],
    } as SessionsListResult);

    const keys = groups.flatMap((group) => group.options.map((option) => option.key));
    expect(keys).toContain("agent:ops:dashboard:current");
    expect(keys).toContain("agent:ops:dashboard:recent");
    expect(keys).not.toContain("agent:solo:dashboard:old");
    expect(keys).not.toContain("agent:ops:subagent:worker");
    expect(keys).not.toContain("agent:ops:cron:daily");
  });
});

describe("switchChatSession", () => {
  it("refreshes the chat avatar after clearing session-scoped state", async () => {
    const settings: AppViewState["settings"] = {
      gatewayUrl: "",
      token: "",
      locale: "en",
      sessionKey: "main",
      lastActiveSessionKey: "main",
      theme: "claw",
      themeMode: "dark",
      splitRatio: 0.6,
      navWidth: 280,
      navCollapsed: false,
      navGroupsCollapsed: {},
      borderRadius: 50,
      chatFocusMode: false,
      chatShowThinking: false,
      chatShowToolCalls: true,
      dreamingAssistEnabled: true,
      planModeEnabled: false,
      executionGoalModeEnabled: false,
      devSpecFirstEnabled: false,
      changeReviewModeEnabled: false,
    };
    const announceSessionSwitch = vi.fn();
    const state = {
      sessionKey: "main",
      chatMessage: "draft",
      chatAttachments: [{ mimeType: "image/png", dataUrl: "data:image/png;base64,AAA" }],
      chatMessages: [{ role: "assistant", content: "old" }],
      chatToolMessages: [{ id: "tool-1" }],
      chatStreamSegments: [{ text: "segment", ts: 1 }],
      chatThinkingLevel: "high",
      chatStream: "stream",
      chatSideResult: {
        kind: "btw",
        runId: "btw-run-1",
        sessionKey: "main",
        question: "what changed?",
        text: "draft answer",
        isError: false,
        ts: 1,
      },
      lastError: "oops",
      compactionStatus: { phase: "active" },
      fallbackStatus: { phase: "active" },
      chatAvatarUrl: "/avatar/old",
      chatQueue: [{ id: "queued" }],
      chatChangeReview: {
        pending: true,
        id: "review-1",
        files: [{ path: "src/demo.ts", status: "M" }],
        diffText: "diff --git a/src/demo.ts b/src/demo.ts",
      },
      chatRunId: "run-1",
      chatSideResultTerminalRuns: new Set(["btw-run-1"]),
      chatStreamStartedAt: 1,
      sessionsResult: {
        ts: 1,
        path: "",
        count: 2,
        defaults: {},
        sessions: [
          row({ key: "main", label: "Main" }),
          row({ key: "agent:main:test-b", label: "Project B" }),
        ],
      } as SessionsListResult,
      settings,
      applySettings(next: typeof settings) {
        state.settings = next;
      },
      loadAssistantIdentity: vi.fn(),
      resetToolStream: vi.fn(),
      resetChatScroll: vi.fn(),
      announceSessionSwitch,
    } as unknown as AppViewState;

    refreshChatAvatarMock.mockResolvedValue(undefined);
    refreshSlashCommandsMock.mockResolvedValue(undefined);
    loadChatHistoryMock.mockResolvedValue(undefined);
    loadSessionsMock.mockResolvedValue(undefined);

    switchChatSession(state, "agent:main:test-b");
    await Promise.resolve();

    expect(state.chatSideResult).toBeNull();
    expect(state.chatChangeReview).toBeNull();
    expect(state.chatSideResultTerminalRuns.size).toBe(0);
    expect(announceSessionSwitch).toHaveBeenCalledWith("agent:main:test-b", "Project B");
    expect(refreshChatAvatarMock).toHaveBeenCalledWith(state);
    expect(refreshSlashCommandsMock).toHaveBeenCalledWith({
      client: undefined,
      agentId: "main",
    });
    expect(loadChatHistoryMock).toHaveBeenCalledWith(state);
    expect(loadSessionsMock).toHaveBeenCalledWith(state, {
      activeMinutes: 0,
      limit: 100,
      includeGlobal: true,
      includeUnknown: true,
    });
  });

  it("does not force agentId=main for plain session keys", async () => {
    const settings: AppViewState["settings"] = {
      gatewayUrl: "",
      token: "",
      locale: "en",
      sessionKey: "main",
      lastActiveSessionKey: "main",
      theme: "claw",
      themeMode: "dark",
      splitRatio: 0.6,
      navWidth: 280,
      navCollapsed: false,
      navGroupsCollapsed: {},
      borderRadius: 50,
      chatFocusMode: false,
      chatShowThinking: false,
      chatShowToolCalls: true,
      dreamingAssistEnabled: true,
      planModeEnabled: false,
      executionGoalModeEnabled: false,
      devSpecFirstEnabled: false,
      changeReviewModeEnabled: false,
    };
    const state = {
      sessionKey: "main",
      chatMessage: "",
      chatAttachments: [],
      chatMessages: [],
      chatToolMessages: [],
      chatStreamSegments: [],
      chatThinkingLevel: null,
      chatStream: null,
      chatSideResult: null,
      lastError: null,
      compactionStatus: null,
      fallbackStatus: null,
      chatAvatarUrl: null,
      chatQueue: [],
      chatRunId: null,
      chatSideResultTerminalRuns: new Set<string>(),
      chatStreamStartedAt: null,
      settings,
      applySettings(next: typeof settings) {
        state.settings = next;
      },
      loadAssistantIdentity: vi.fn(),
      resetToolStream: vi.fn(),
      resetChatScroll: vi.fn(),
      client: { request: vi.fn() },
    } as unknown as AppViewState;

    refreshChatAvatarMock.mockResolvedValue(undefined);
    refreshSlashCommandsMock.mockResolvedValue(undefined);
    loadChatHistoryMock.mockResolvedValue(undefined);
    loadSessionsMock.mockResolvedValue(undefined);

    switchChatSession(state, "main");
    await Promise.resolve();

    expect(refreshSlashCommandsMock).toHaveBeenCalledWith({
      client: state.client,
      agentId: undefined,
    });
  });
});

describe("createChatSession", () => {
  function createChatSessionState(overrides: Partial<AppViewState> = {}) {
    const settings: AppViewState["settings"] = {
      gatewayUrl: "",
      token: "",
      locale: "en",
      sessionKey: "agent:solo:main",
      lastActiveSessionKey: "agent:solo:main",
      theme: "claw",
      themeMode: "dark",
      splitRatio: 0.6,
      navWidth: 280,
      navCollapsed: false,
      navGroupsCollapsed: {},
      borderRadius: 50,
      chatFocusMode: false,
      chatShowThinking: false,
      chatShowToolCalls: true,
      dreamingAssistEnabled: true,
      planModeEnabled: false,
      executionGoalModeEnabled: false,
      devSpecFirstEnabled: false,
      changeReviewModeEnabled: true,
    };
    const state = {
      client: { request: vi.fn() },
      connected: true,
      sessionsLoading: false,
      sessionsError: null,
      sessionKey: "agent:solo:main",
      sessionsResult: {
        ts: 1,
        path: "",
        count: 1,
        defaults: {},
        sessions: [
          {
            key: "agent:solo:main",
            kind: "direct",
            updatedAt: 1,
            mode: "task",
            taskId: "task-current",
          },
        ],
      } as SessionsListResult,
      chatLoading: false,
      chatSending: false,
      chatRunId: null,
      chatStream: null,
      chatQueue: [],
      chatMessage: "draft",
      chatAttachments: [{ mimeType: "image/png", dataUrl: "data:image/png;base64,AAA" }],
      chatMessages: [{ role: "user", content: "old" }],
      chatToolMessages: [],
      chatStreamSegments: [],
      chatThinkingLevel: null,
      chatSideResult: null,
      compactionStatus: null,
      fallbackStatus: null,
      chatAvatarUrl: null,
      chatChangeReview: null,
      chatSideResultTerminalRuns: new Set<string>(),
      chatStreamStartedAt: null,
      settings,
      resumedDevExecuteBySessionKey: new Map<
        string,
        { changeReviewModeEnabled: boolean; remainingTurns: number }
      >(),
      applySettings(next: typeof settings) {
        state.settings = next;
      },
      loadAssistantIdentity: vi.fn(),
      resetToolStream: vi.fn(),
      resetChatScroll: vi.fn(),
      setCurrentTaskForSession: vi.fn(async () => undefined),
      ...overrides,
    } as unknown as AppViewState;
    return state;
  }

  it("creates and switches to a real dashboard session while preserving local modes", async () => {
    const state = createChatSessionState();
    createSessionAndRefreshMock.mockResolvedValue("agent:solo:dashboard:new");
    refreshChatAvatarMock.mockResolvedValue(undefined);
    refreshSlashCommandsMock.mockResolvedValue(undefined);
    loadChatHistoryMock.mockResolvedValue(undefined);
    loadSessionsMock.mockResolvedValue(undefined);

    const created = await createChatSession(state);

    expect(created).toBe(true);
    expect(createSessionAndRefreshMock).toHaveBeenCalledWith(
      state,
      {
        agentId: "solo",
        parentSessionKey: "agent:solo:main",
        emitCommandHooks: true,
      },
      {
        activeMinutes: 0,
        limit: 100,
        includeGlobal: true,
        includeUnknown: true,
      },
    );
    expect(state.sessionKey).toBe("agent:solo:dashboard:new");
    expect(state.chatMessage).toBe("draft");
    expect(state.chatAttachments).toEqual([
      { mimeType: "image/png", dataUrl: "data:image/png;base64,AAA" },
    ]);
    expect(state.setCurrentTaskForSession).toHaveBeenCalledWith("task-current");
    expect(state.resumedDevExecuteBySessionKey.get("agent:solo:dashboard:new")).toEqual({
      changeReviewModeEnabled: true,
      remainingTurns: 1,
    });
  });

  it("does not create a session while the current chat is busy", async () => {
    const state = createChatSessionState({ chatRunId: "run-active" } as Partial<AppViewState>);

    const created = await createChatSession(state);

    expect(created).toBe(false);
    expect(createSessionAndRefreshMock).not.toHaveBeenCalled();
    expect(state.lastError).toContain("active run");
  });

  it("passes requested label and agent without linking a different-agent parent session", async () => {
    const state = createChatSessionState();
    createSessionAndRefreshMock.mockResolvedValue("agent:ops:dashboard:new");
    refreshChatAvatarMock.mockResolvedValue(undefined);
    refreshSlashCommandsMock.mockResolvedValue(undefined);
    loadChatHistoryMock.mockResolvedValue(undefined);
    loadSessionsMock.mockResolvedValue(undefined);

    const created = await createChatSession(state, {
      agentId: "ops",
      label: "项目复盘",
    });

    expect(created).toBe(true);
    expect(createSessionAndRefreshMock).toHaveBeenCalledWith(
      state,
      {
        agentId: "ops",
        label: "项目复盘",
      },
      {
        activeMinutes: 0,
        limit: 100,
        includeGlobal: true,
        includeUnknown: true,
      },
    );
    expect(state.setCurrentTaskForSession).not.toHaveBeenCalled();
  });
});
