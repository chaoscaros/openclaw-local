import type { MemorySearchResult } from "openclaw/plugin-sdk/memory-core-host-runtime-files";
import * as sessionTranscriptHit from "openclaw/plugin-sdk/session-transcript-hit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { filterMemorySearchHitsBySessionVisibility } from "./session-search-visibility.js";
import { asOpenClawConfig } from "./tools.test-helpers.js";

type TestSessionEntry = {
  sessionId: string;
  updatedAt: number;
  sessionFile: string;
};

const crossAgentStore: Record<string, TestSessionEntry> = {
  "agent:peer:only": {
    sessionId: "w1",
    updatedAt: 1,
    sessionFile: "/tmp/sessions/w1.jsonl",
  },
};
let combinedSessionStore: Record<string, TestSessionEntry> = crossAgentStore;

vi.mock("openclaw/plugin-sdk/session-transcript-hit", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("openclaw/plugin-sdk/session-transcript-hit")>();
  return {
    ...actual,
    loadCombinedSessionStoreForGateway: vi.fn(() => ({
      storePath: "(test)",
      store: combinedSessionStore,
    })),
  };
});

describe("filterMemorySearchHitsBySessionVisibility", () => {
  afterEach(() => {
    vi.mocked(sessionTranscriptHit.loadCombinedSessionStoreForGateway).mockClear();
    combinedSessionStore = crossAgentStore;
  });

  it("drops sessions-sourced hits when requester key is missing", async () => {
    const hit: MemorySearchResult = {
      path: "sessions/u1.jsonl",
      source: "sessions",
      score: 1,
      snippet: "x",
      startLine: 1,
      endLine: 2,
    };
    const filtered = await filterMemorySearchHitsBySessionVisibility({
      cfg: asOpenClawConfig({ tools: { sessions: { visibility: "all" } } }),
      requesterSessionKey: undefined,
      sandboxed: false,
      hits: [hit],
    });
    expect(filtered).toStrictEqual([]);
  });

  it("keeps non-session hits unchanged", async () => {
    const hits: MemorySearchResult[] = [
      {
        path: "memory/foo.md",
        source: "memory",
        score: 1,
        snippet: "x",
        startLine: 1,
        endLine: 2,
      },
    ];
    const filtered = await filterMemorySearchHitsBySessionVisibility({
      cfg: asOpenClawConfig({ tools: { sessions: { visibility: "all" } } }),
      requesterSessionKey: "agent:main:main",
      sandboxed: false,
      hits,
    });
    expect(filtered).toEqual(hits);
  });

  it("loads the combined session store once per filter pass", async () => {
    combinedSessionStore = {
      "agent:main:only": {
        sessionId: "w1",
        updatedAt: 1,
        sessionFile: "/tmp/sessions/w1.jsonl",
      },
    };
    const cfg = asOpenClawConfig({ tools: { sessions: { visibility: "all" } } });
    await filterMemorySearchHitsBySessionVisibility({
      cfg,
      requesterSessionKey: "agent:main:main",
      sandboxed: false,
      hits: [
        {
          path: "sessions/w1.jsonl",
          source: "sessions",
          score: 1,
          snippet: "a",
          startLine: 1,
          endLine: 2,
        },
        {
          path: "sessions/w1.jsonl",
          source: "sessions",
          score: 0.9,
          snippet: "b",
          startLine: 1,
          endLine: 2,
        },
      ],
    });
    expect(sessionTranscriptHit.loadCombinedSessionStoreForGateway).toHaveBeenCalledTimes(1);
    expect(sessionTranscriptHit.loadCombinedSessionStoreForGateway).toHaveBeenCalledWith(cfg, {
      agentId: "main",
    });
  });

  it("keeps same-agent session hits when visibility allows history", async () => {
    combinedSessionStore = {
      "agent:main:only": {
        sessionId: "w1",
        updatedAt: 1,
        sessionFile: "/tmp/sessions/w1.jsonl",
      },
    };
    const hit: MemorySearchResult = {
      path: "sessions/w1.jsonl",
      source: "sessions",
      score: 1,
      snippet: "x",
      startLine: 1,
      endLine: 2,
    };
    const filtered = await filterMemorySearchHitsBySessionVisibility({
      cfg: asOpenClawConfig({
        tools: {
          sessions: { visibility: "all" },
          agentToAgent: { enabled: true, allow: ["*"] },
        },
      }),
      requesterSessionKey: "agent:main:main",
      sandboxed: false,
      hits: [hit],
    });
    expect(filtered).toEqual([hit]);
  });

  it("does not keep cross-agent session hits outside the scoped store", async () => {
    combinedSessionStore = {};
    const hit: MemorySearchResult = {
      path: "sessions/w1.jsonl",
      source: "sessions",
      score: 1,
      snippet: "x",
      startLine: 1,
      endLine: 2,
    };
    const filtered = await filterMemorySearchHitsBySessionVisibility({
      cfg: asOpenClawConfig({
        tools: {
          sessions: { visibility: "all" },
          agentToAgent: { enabled: true, allow: ["*"] },
        },
      }),
      requesterSessionKey: "agent:main:main",
      sandboxed: false,
      hits: [hit],
    });
    expect(filtered).toStrictEqual([]);
  });

  it("does not keep cross-agent session hits when agent-to-agent is disabled", async () => {
    const hit: MemorySearchResult = {
      path: "sessions/w1.jsonl",
      source: "sessions",
      score: 1,
      snippet: "x",
      startLine: 1,
      endLine: 2,
    };
    const filtered = await filterMemorySearchHitsBySessionVisibility({
      cfg: asOpenClawConfig({
        tools: {
          sessions: { visibility: "all" },
          agentToAgent: { enabled: false },
        },
      }),
      requesterSessionKey: "agent:main:main",
      sandboxed: false,
      hits: [hit],
    });
    expect(filtered).toStrictEqual([]);
  });

  it("keeps same-agent deleted archive hits using owner metadata when the live store entry is gone", async () => {
    combinedSessionStore = {};
    const hit: MemorySearchResult = {
      path: "sessions/main/deleted-stem.jsonl.deleted.2026-02-16T22-27-33.000Z",
      source: "sessions",
      score: 1,
      snippet: "x",
      startLine: 1,
      endLine: 2,
    };
    const filtered = await filterMemorySearchHitsBySessionVisibility({
      cfg: asOpenClawConfig({ tools: { sessions: { visibility: "agent" } } }),
      requesterSessionKey: "agent:main:main",
      sandboxed: false,
      hits: [hit],
    });
    expect(filtered).toEqual([hit]);
  });

  it("does not authorize QMD archived hits through lossy slug fallback", async () => {
    combinedSessionStore = {
      "agent:main:foo_bar": {
        sessionId: "foo_bar",
        updatedAt: 1,
        sessionFile: "/tmp/sessions/foo_bar.jsonl",
      },
    };
    const hit: MemorySearchResult = {
      path: "qmd/sessions-main/foo-bar-jsonl-deleted-2026-02-16t22-26-33-000z.md",
      source: "sessions",
      score: 1,
      snippet: "x",
      startLine: 1,
      endLine: 2,
    };
    const filtered = await filterMemorySearchHitsBySessionVisibility({
      cfg: asOpenClawConfig({ tools: { sessions: { visibility: "self" } } }),
      requesterSessionKey: "agent:main:foo_bar",
      sandboxed: false,
      hits: [hit],
    });
    expect(filtered).toStrictEqual([]);
  });
});
