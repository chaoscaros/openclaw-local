import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  buildWorkspaceSkillSnapshotMock,
  ensureSkillsWatcherMock,
  getSkillsSnapshotVersionMock,
  shouldRefreshSnapshotForVersionMock,
  getRemoteSkillEligibilityMock,
  resolveAgentConfigMock,
  resolveSessionAgentIdMock,
  resolveAgentIdFromSessionKeyMock,
} = vi.hoisted(() => ({
  buildWorkspaceSkillSnapshotMock: vi.fn((): any => ({
    prompt: "",
    skills: [],
    resolvedSkills: [],
  })),
  ensureSkillsWatcherMock: vi.fn(),
  getSkillsSnapshotVersionMock: vi.fn(() => 0),
  shouldRefreshSnapshotForVersionMock: vi.fn(() => false),
  getRemoteSkillEligibilityMock: vi.fn(() => ({
    platforms: [],
    hasBin: () => false,
    hasAnyBin: () => false,
  })),
  resolveAgentConfigMock: vi.fn(() => undefined),
  resolveSessionAgentIdMock: vi.fn(() => "writer"),
  resolveAgentIdFromSessionKeyMock: vi.fn(() => "main"),
}));

vi.mock("../../agents/agent-scope.js", () => ({
  resolveAgentConfig: resolveAgentConfigMock,
  resolveSessionAgentId: resolveSessionAgentIdMock,
}));

vi.mock("../../agents/skills.js", () => ({
  buildWorkspaceSkillSnapshot: buildWorkspaceSkillSnapshotMock,
}));

vi.mock("../../agents/skills/refresh.js", () => ({
  ensureSkillsWatcher: ensureSkillsWatcherMock,
  getSkillsSnapshotVersion: getSkillsSnapshotVersionMock,
  shouldRefreshSnapshotForVersion: shouldRefreshSnapshotForVersionMock,
}));

vi.mock("../../config/sessions.js", () => ({
  updateSessionStore: vi.fn(),
  resolveSessionFilePath: vi.fn(),
  resolveSessionFilePathOptions: vi.fn(),
}));

vi.mock("../../infra/skills-remote.js", () => ({
  getRemoteSkillEligibility: getRemoteSkillEligibilityMock,
}));

vi.mock("../../routing/session-key.js", () => ({
  normalizeAgentId: (id: string) => id,
  normalizeMainKey: (key?: string) => key ?? "main",
  resolveAgentIdFromSessionKey: resolveAgentIdFromSessionKeyMock,
}));

const { ensureSkillSnapshot } = await import("./session-updates.js");

describe("ensureSkillSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildWorkspaceSkillSnapshotMock.mockReturnValue({ prompt: "", skills: [], resolvedSkills: [] });
    getSkillsSnapshotVersionMock.mockReturnValue(0);
    shouldRefreshSnapshotForVersionMock.mockReturnValue(false);
    getRemoteSkillEligibilityMock.mockReturnValue({
      platforms: [],
      hasBin: () => false,
      hasAnyBin: () => false,
    });
    resolveAgentConfigMock.mockReturnValue(undefined);
    resolveSessionAgentIdMock.mockReturnValue("writer");
    resolveAgentIdFromSessionKeyMock.mockReturnValue("main");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses config-aware session agent resolution for legacy session keys", async () => {
    vi.stubEnv("OPENCLAW_TEST_FAST", "0");

    await ensureSkillSnapshot({
      sessionKey: "main",
      isFirstTurnInSession: false,
      workspaceDir: "/tmp/workspace",
      cfg: {
        agents: {
          list: [{ id: "writer", default: true }],
        },
      },
    });

    expect(resolveSessionAgentIdMock).toHaveBeenCalledWith({
      sessionKey: "main",
      config: {
        agents: {
          list: [{ id: "writer", default: true }],
        },
      },
    });
    expect(buildWorkspaceSkillSnapshotMock).toHaveBeenCalledWith(
      "/tmp/workspace",
      expect.objectContaining({ agentId: "writer" }),
    );
    expect(resolveAgentIdFromSessionKeyMock).not.toHaveBeenCalled();
  });

  it("reuses cached runtime skill snapshots when only resolvedSkills hydration is needed", async () => {
    vi.stubEnv("OPENCLAW_TEST_FAST", "0");
    buildWorkspaceSkillSnapshotMock.mockReturnValue({
      prompt: "skills",
      skills: [{ name: "alpha" }],
      resolvedSkills: [
        {
          name: "alpha",
          description: "A skill",
          filePath: "/tmp/alpha/SKILL.md",
          baseDir: "/tmp/alpha",
          source: "workspace",
        },
      ],
      version: 7,
    });
    getSkillsSnapshotVersionMock.mockReturnValue(7);

    const sessionEntry = {
      sessionId: "session-1",
      updatedAt: Date.now(),
      skillsSnapshot: {
        prompt: "skills",
        skills: [{ name: "alpha" }],
        version: 7,
      },
    };
    const cfg = {};

    const first = await ensureSkillSnapshot({
      sessionEntry,
      sessionKey: "main",
      isFirstTurnInSession: false,
      workspaceDir: "/tmp/workspace",
      cfg,
    });
    const second = await ensureSkillSnapshot({
      sessionEntry,
      sessionKey: "main",
      isFirstTurnInSession: false,
      workspaceDir: "/tmp/workspace",
      cfg,
    });

    expect(first.skillsSnapshot?.resolvedSkills).toHaveLength(1);
    expect(second.skillsSnapshot?.resolvedSkills).toHaveLength(1);
    expect(buildWorkspaceSkillSnapshotMock).toHaveBeenCalledTimes(1);
  });
});
