import { describe, expect, it, vi } from "vitest";
import {
  backfillDreamDiary,
  copyDreamingArchivePath,
  dedupeDreamDiary,
  loadDreamDiary,
  loadDreamingStatus,
  loadWikiImportInsights,
  loadWikiMemoryPalace,
  repairDreamingArtifacts,
  resetGroundedShortTerm,
  resetDreamDiary,
  resolveConfiguredDreaming,
  runDreamingNow,
  updateDreamingEnabled,
  type DreamingState,
} from "./dreaming.ts";

function createState(): { state: DreamingState; request: ReturnType<typeof vi.fn> } {
  const request = vi.fn();
  const state: DreamingState = {
    client: {
      request,
    } as unknown as DreamingState["client"],
    connected: true,
    configSnapshot: { hash: "hash-1" },
    applySessionKey: "main",
    dreamingStatusLoading: false,
    dreamingStatusError: null,
    dreamingStatus: null,
    dreamingModeSaving: false,
    dreamDiaryLoading: false,
    dreamDiaryActionLoading: false,
    dreamDiaryActionMessage: null,
    dreamDiaryActionArchivePath: null,
    dreamDiaryError: null,
    dreamDiaryPath: null,
    dreamDiaryContent: null,
    wikiImportInsightsLoading: false,
    wikiImportInsightsError: null,
    wikiImportInsights: null,
    wikiMemoryPalaceLoading: false,
    wikiMemoryPalaceError: null,
    wikiMemoryPalace: null,
    lastError: null,
  };
  return { state, request };
}

function getConfigPatchRawPayload(request: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const patchCall = request.mock.calls.find((entry) => entry[0] === "config.patch");
  expect(patchCall).toBeDefined();
  const requestPayload = patchCall?.[1] as { raw?: string };
  return JSON.parse(String(requestPayload.raw)) as Record<string, unknown>;
}

describe("dreaming controller", () => {
  it("loads and normalizes dreaming status from doctor.memory.status", async () => {
    const { state, request } = createState();
    request.mockResolvedValue({
      dreaming: {
        enabled: true,
        timezone: "America/Los_Angeles",
        verboseLogging: false,
        storageMode: "inline",
        separateReports: false,
        shortTermCount: 8,
        recallSignalCount: 14,
        dailySignalCount: 6,
        groundedSignalCount: 5,
        totalSignalCount: 20,
        phaseSignalCount: 11,
        lightPhaseHitCount: 7,
        remPhaseHitCount: 4,
        promotedTotal: 21,
        promotedToday: 2,
        shortTermEntries: [
          {
            key: "memory:memory/2026-04-05.md:1:2",
            path: "memory/2026-04-05.md",
            startLine: 1,
            endLine: 2,
            snippet: "Emma prefers shorter, lower-pressure check-ins.",
            recallCount: 2,
            dailyCount: 1,
            groundedCount: 1,
            totalSignalCount: 3,
            lightHits: 1,
            remHits: 2,
            phaseHitCount: 3,
            lastRecalledAt: "2026-04-05T01:02:03.000Z",
          },
        ],
        signalEntries: [
          {
            key: "memory:memory/2026-04-05.md:1:2",
            path: "memory/2026-04-05.md",
            startLine: 1,
            endLine: 2,
            snippet: "Emma prefers shorter, lower-pressure check-ins.",
            recallCount: 2,
            dailyCount: 1,
            groundedCount: 1,
            totalSignalCount: 3,
            lightHits: 1,
            remHits: 2,
            phaseHitCount: 3,
          },
        ],
        promotedEntries: [
          {
            key: "memory:memory/2026-04-04.md:4:5",
            path: "memory/2026-04-04.md",
            startLine: 4,
            endLine: 5,
            snippet: "Use the Happy Together calendar for flights.",
            recallCount: 3,
            dailyCount: 2,
            groundedCount: 0,
            totalSignalCount: 5,
            lightHits: 0,
            remHits: 0,
            phaseHitCount: 0,
            promotedAt: "2026-04-05T04:00:00.000Z",
          },
        ],
        lastRun: {
          at: "2026-04-05T04:30:00.000Z",
          workspaces: 1,
          candidates: 4,
          applied: 2,
          failed: 0,
          narrativeWritten: 1,
          narrativeSkipped: 0,
        },
        phases: {
          light: {
            enabled: true,
            cron: "0 */6 * * *",
            lookbackDays: 2,
            limit: 100,
            managedCronPresent: true,
            nextRunAtMs: 12345,
          },
          deep: {
            enabled: true,
            cron: "0 3 * * *",
            limit: 10,
            minScore: 0.8,
            minRecallCount: 3,
            minUniqueQueries: 3,
            recencyHalfLifeDays: 14,
            maxAgeDays: 30,
            managedCronPresent: true,
            nextRunAtMs: 23456,
          },
          rem: {
            enabled: true,
            cron: "0 5 * * 0",
            lookbackDays: 7,
            limit: 10,
            minPatternStrength: 0.75,
            managedCronPresent: true,
            nextRunAtMs: 34567,
          },
        },
      },
    });

    await loadDreamingStatus(state);

    expect(request).toHaveBeenCalledWith("doctor.memory.status", {});
    expect(state.dreamingStatus).toEqual(
      expect.objectContaining({
        enabled: true,
        shortTermCount: 8,
        groundedSignalCount: 5,
        totalSignalCount: 20,
        phaseSignalCount: 11,
        promotedToday: 2,
        shortTermEntries: [
          expect.objectContaining({
            snippet: "Emma prefers shorter, lower-pressure check-ins.",
            totalSignalCount: 3,
            groundedCount: 1,
            phaseHitCount: 3,
          }),
        ],
        promotedEntries: [
          expect.objectContaining({
            snippet: "Use the Happy Together calendar for flights.",
          }),
        ],
        lastRun: expect.objectContaining({
          applied: 2,
          candidates: 4,
          narrativeWritten: 1,
        }),
        phases: expect.objectContaining({
          deep: expect.objectContaining({
            minScore: 0.8,
            nextRunAtMs: 23456,
          }),
        }),
      }),
    );
    expect(state.dreamingStatusLoading).toBe(false);
    expect(state.dreamingStatusError).toBeNull();
  });

  it("preserves unknown phase state when status omits phase metadata", async () => {
    const { state, request } = createState();
    request.mockResolvedValue({
      dreaming: {
        enabled: true,
        shortTermCount: 1,
        recallSignalCount: 0,
        dailySignalCount: 0,
        groundedSignalCount: 0,
        totalSignalCount: 1,
        phaseSignalCount: 0,
        lightPhaseHitCount: 0,
        remPhaseHitCount: 0,
        promotedTotal: 0,
        promotedToday: 0,
        shortTermEntries: [],
        signalEntries: [],
        promotedEntries: [],
      },
    });

    await loadDreamingStatus(state);

    expect(state.dreamingStatus).toEqual(
      expect.objectContaining({
        enabled: true,
      }),
    );
    expect(state.dreamingStatus?.phases).toBeUndefined();
    expect(state.dreamingStatusError).toBeNull();
  });

  it("loads and normalizes wiki import insights", async () => {
    const { state, request } = createState();
    state.configSnapshot = {
      hash: "hash-1",
      config: {
        plugins: {
          entries: {
            "memory-wiki": {
              enabled: true,
            },
          },
        },
      },
    };
    request.mockResolvedValue({
      sourceType: "chatgpt",
      totalItems: 2,
      totalClusters: 1,
      clusters: [
        {
          key: "topic/travel",
          label: "Travel",
          itemCount: 2,
          highRiskCount: 1,
          withheldCount: 1,
          preferenceSignalCount: 1,
          items: [
            {
              pagePath: "sources/chatgpt-2026-04-10-alpha.md",
              title: "BA flight receipts process",
              riskLevel: "low",
              riskReasons: [],
              labels: ["topic/travel"],
              topicKey: "topic/travel",
              topicLabel: "Travel",
              digestStatus: "available",
              activeBranchMessages: 4,
              userMessageCount: 2,
              assistantMessageCount: 2,
              firstUserLine: "how do i get receipts?",
              lastUserLine: "that option does not exist",
              assistantOpener: "Use the BA request-a-receipt flow first.",
              summary: "Use the BA request-a-receipt flow first.",
              candidateSignals: ["prefers airline receipts"],
              correctionSignals: [],
              preferenceSignals: ["prefers airline receipts"],
            },
          ],
        },
      ],
    });

    await loadWikiImportInsights(state);

    expect(request).toHaveBeenCalledWith("wiki.importInsights", {});
    expect(state.wikiImportInsights).toEqual(
      expect.objectContaining({
        totalItems: 2,
        totalClusters: 1,
        clusters: [
          expect.objectContaining({
            key: "topic/travel",
            itemCount: 2,
            withheldCount: 1,
          }),
        ],
      }),
    );
    expect(state.wikiImportInsightsError).toBeNull();
    expect(state.wikiImportInsightsLoading).toBe(false);
  });

  it("skips wiki import insights when memory-wiki is not enabled", async () => {
    const { state, request } = createState();
    state.configSnapshot = {
      hash: "hash-1",
      config: {
        plugins: {},
      },
    };
    state.wikiImportInsights = {
      sourceType: "chatgpt",
      totalItems: 1,
      totalClusters: 1,
      clusters: [],
    };
    state.wikiImportInsightsError = "unknown method: wiki.importInsights";

    await loadWikiImportInsights(state);

    expect(request).not.toHaveBeenCalled();
    expect(state.wikiImportInsights).toBeNull();
    expect(state.wikiImportInsightsError).toBeNull();
    expect(state.wikiImportInsightsLoading).toBe(false);
  });

  it("loads and normalizes the wiki memory palace", async () => {
    const { state, request } = createState();
    state.configSnapshot = {
      hash: "hash-1",
      config: {
        plugins: {
          entries: {
            "memory-wiki": {
              enabled: true,
            },
          },
        },
      },
    };
    request.mockResolvedValue({
      totalItems: 2,
      totalClaims: 3,
      totalQuestions: 1,
      totalContradictions: 1,
      clusters: [
        {
          key: "synthesis",
          label: "Syntheses",
          itemCount: 1,
          claimCount: 2,
          questionCount: 1,
          contradictionCount: 0,
          items: [
            {
              pagePath: "syntheses/travel-system.md",
              title: "Travel system",
              kind: "synthesis",
              claimCount: 2,
              questionCount: 1,
              contradictionCount: 0,
              claims: ["prefers direct receipts"],
              questions: ["should this become a playbook?"],
              contradictions: [],
              snippet: "Recurring travel admin friction.",
            },
          ],
        },
      ],
    });

    await loadWikiMemoryPalace(state);

    expect(request).toHaveBeenCalledWith("wiki.palace", {});
    expect(state.wikiMemoryPalace).toEqual(
      expect.objectContaining({
        totalItems: 2,
        totalClaims: 3,
        clusters: [
          expect.objectContaining({
            key: "synthesis",
            label: "Syntheses",
            items: [
              expect.objectContaining({
                title: "Travel system",
                claims: ["prefers direct receipts"],
              }),
            ],
          }),
        ],
      }),
    );
    expect(state.wikiMemoryPalaceError).toBeNull();
    expect(state.wikiMemoryPalaceLoading).toBe(false);
  });

  it("skips wiki memory palace when memory-wiki is not enabled", async () => {
    const { state, request } = createState();
    state.configSnapshot = {
      hash: "hash-1",
      config: {
        plugins: {},
      },
    };
    state.wikiMemoryPalace = {
      totalItems: 1,
      totalClaims: 1,
      totalQuestions: 0,
      totalContradictions: 0,
      clusters: [],
    };
    state.wikiMemoryPalaceError = "unknown method: wiki.palace";

    await loadWikiMemoryPalace(state);

    expect(request).not.toHaveBeenCalled();
    expect(state.wikiMemoryPalace).toBeNull();
    expect(state.wikiMemoryPalaceError).toBeNull();
    expect(state.wikiMemoryPalaceLoading).toBe(false);
  });

  it("patches config to update global dreaming enablement", async () => {
    const { state, request } = createState();
    state.configSnapshot = {
      hash: "hash-1",
      config: {
        plugins: {
          slots: {
            memory: "memos-local-openclaw-plugin",
          },
          entries: {
            "memos-local-openclaw-plugin": {
              config: {
                dreaming: {
                  enabled: true,
                },
              },
            },
          },
        },
      },
    };
    request.mockResolvedValue({ ok: true });

    const ok = await updateDreamingEnabled(state, false);

    expect(ok).toBe(true);
    expect(request).toHaveBeenCalledWith(
      "config.patch",
      expect.objectContaining({
        baseHash: "hash-1",
        sessionKey: "main",
      }),
    );
    expect(getConfigPatchRawPayload(request)).toEqual({
      plugins: {
        entries: {
          "memos-local-openclaw-plugin": {
            config: {
              dreaming: {
                enabled: false,
              },
            },
          },
        },
      },
    });
    expect(state.dreamingModeSaving).toBe(false);
    expect(state.dreamingStatusError).toBeNull();
  });

  it("falls back to memory-core when selected memory slot is blank", async () => {
    const { state, request } = createState();
    state.configSnapshot = {
      hash: "hash-1",
      config: {
        plugins: {
          slots: {
            memory: "   ",
          },
        },
      },
    };
    request.mockResolvedValue({ ok: true });

    const ok = await updateDreamingEnabled(state, true);

    expect(ok).toBe(true);
    expect(getConfigPatchRawPayload(request)).toEqual({
      plugins: {
        entries: {
          "memory-core": {
            config: {
              dreaming: {
                enabled: true,
              },
            },
          },
        },
      },
    });
  });

  it("blocks dreaming patch when selected plugin config rejects unknown keys", async () => {
    const { state, request } = createState();
    state.configSnapshot = {
      hash: "hash-1",
      config: {
        plugins: {
          slots: {
            memory: "memory-lancedb",
          },
        },
      },
    };
    request.mockImplementation(async (method: string) => {
      if (method === "config.schema.lookup") {
        return {
          path: "plugins.entries.memory-lancedb.config",
          schema: {
            type: "object",
            additionalProperties: false,
          },
          children: [
            { key: "retentionDays", path: "plugins.entries.memory-lancedb.config.retentionDays" },
          ],
        };
      }
      if (method === "config.patch") {
        return { ok: true };
      }
      return {};
    });

    const ok = await updateDreamingEnabled(state, true);

    expect(ok).toBe(false);
    expect(request).toHaveBeenCalledWith("config.schema.lookup", {
      path: "plugins.entries.memory-lancedb.config",
    });
    expect(request).not.toHaveBeenCalledWith("config.patch", expect.anything());
    expect(state.dreamingStatusError).toContain("memory-lancedb");
    expect(state.dreamingStatusError).toContain("does not support dreaming settings");
  });

  it("reads dreaming enabled state from the selected memory slot plugin", () => {
    expect(
      resolveConfiguredDreaming({
        plugins: {
          slots: {
            memory: "memos-local-openclaw-plugin",
          },
          entries: {
            "memos-local-openclaw-plugin": {
              config: {
                dreaming: {
                  enabled: true,
                },
              },
            },
            "memory-core": {
              config: {
                dreaming: {
                  enabled: false,
                },
              },
            },
          },
        },
      }),
    ).toEqual({
      pluginId: "memos-local-openclaw-plugin",
      enabled: true,
    });
  });

  it('falls back to memory-core when selected memory slot is "none"', () => {
    expect(
      resolveConfiguredDreaming({
        plugins: {
          slots: {
            memory: "none",
          },
          entries: {
            "memory-core": {
              config: {
                dreaming: {
                  enabled: true,
                },
              },
            },
          },
        },
      }),
    ).toEqual({
      pluginId: "memory-core",
      enabled: true,
    });
  });

  it("fails gracefully when config hash is missing", async () => {
    const { state, request } = createState();
    state.configSnapshot = {};

    const ok = await updateDreamingEnabled(state, true);

    expect(ok).toBe(false);
    expect(request).not.toHaveBeenCalled();
    expect(state.dreamingStatusError).toContain("Config hash missing");
  });

  it("loads dream diary content", async () => {
    const { state, request } = createState();
    request.mockResolvedValue({
      found: true,
      path: "DREAMS.md",
      content: "## Dream Diary\n- recurring glacier thoughts",
    });

    await loadDreamDiary(state);

    expect(request).toHaveBeenCalledWith("doctor.memory.dreamDiary", {});
    expect(state.dreamDiaryPath).toBe("DREAMS.md");
    expect(state.dreamDiaryContent).toContain("glacier");
    expect(state.dreamDiaryError).toBeNull();
  });

  it("handles missing dream diary without error", async () => {
    const { state, request } = createState();
    request.mockResolvedValue({
      found: false,
      path: "DREAMS.md",
    });

    await loadDreamDiary(state);

    expect(state.dreamDiaryPath).toBe("DREAMS.md");
    expect(state.dreamDiaryContent).toBeNull();
    expect(state.dreamDiaryError).toBeNull();
  });

  it("records dream diary request errors", async () => {
    const { state, request } = createState();
    request.mockRejectedValue(new Error("dream diary read failed"));

    await loadDreamDiary(state);

    expect(state.dreamDiaryError).toContain("dream diary read failed");
    expect(state.dreamDiaryLoading).toBe(false);
  });

  it("backfills and reloads dream diary state", async () => {
    const { state, request } = createState();
    request.mockImplementation(async (method: string) => {
      if (method === "doctor.memory.backfillDreamDiary") {
        return { action: "backfill", written: 79, replaced: 79 };
      }
      if (method === "doctor.memory.dreamDiary") {
        return { found: true, path: "DREAMS.md", content: "backfilled diary" };
      }
      if (method === "doctor.memory.status") {
        return {
          dreaming: {
            enabled: true,
            shortTermCount: 1,
            recallSignalCount: 0,
            dailySignalCount: 0,
            totalSignalCount: 1,
            phaseSignalCount: 0,
            lightPhaseHitCount: 0,
            remPhaseHitCount: 0,
            promotedTotal: 0,
            promotedToday: 0,
            shortTermEntries: [],
            signalEntries: [],
            promotedEntries: [],
            phases: {
              light: {
                enabled: false,
                cron: "",
                managedCronPresent: false,
                lookbackDays: 0,
                limit: 0,
              },
              deep: {
                enabled: false,
                cron: "",
                managedCronPresent: false,
                limit: 0,
                minScore: 0,
                minRecallCount: 0,
                minUniqueQueries: 0,
                recencyHalfLifeDays: 0,
              },
              rem: {
                enabled: false,
                cron: "",
                managedCronPresent: false,
                lookbackDays: 0,
                limit: 0,
                minPatternStrength: 0,
              },
            },
          },
        };
      }
      return {};
    });

    const ok = await backfillDreamDiary(state);

    expect(ok).toBe(true);
    expect(request).toHaveBeenCalledWith("doctor.memory.backfillDreamDiary", {});
    expect(request).toHaveBeenCalledWith("doctor.memory.dreamDiary", {});
    expect(request).toHaveBeenCalledWith("doctor.memory.status", {});
    expect(state.dreamDiaryContent).toBe("backfilled diary");
    expect(state.dreamDiaryActionLoading).toBe(false);
  });

  it("resets and reloads dream diary state", async () => {
    const { state, request } = createState();
    request.mockImplementation(async (method: string) => {
      if (method === "doctor.memory.resetDreamDiary") {
        return { action: "reset", removedEntries: 79 };
      }
      if (method === "doctor.memory.dreamDiary") {
        return { found: false, path: "DREAMS.md" };
      }
      if (method === "doctor.memory.status") {
        return { dreaming: null };
      }
      return {};
    });

    const ok = await resetDreamDiary(state);

    expect(ok).toBe(true);
    expect(request).toHaveBeenCalledWith("doctor.memory.resetDreamDiary", {});
    expect(request).toHaveBeenCalledWith("doctor.memory.dreamDiary", {});
    expect(request).toHaveBeenCalledWith("doctor.memory.status", {});
    expect(state.dreamDiaryContent).toBeNull();
    expect(state.dreamDiaryActionLoading).toBe(false);
  });

  it("runs dreaming now and reloads only dreaming status", async () => {
    const { state, request } = createState();
    state.dreamDiaryContent = "keep existing diary";
    request.mockImplementation(async (method: string) => {
      if (method === "doctor.memory.run") {
        return {
          action: "run",
          runSummary: {
            at: "2026-04-05T04:30:00.000Z",
            workspaces: 1,
            candidates: 4,
            applied: 2,
            failed: 0,
            narrativeWritten: 1,
            narrativeSkipped: 0,
            learningSummary: {
              summary: "当前聚焦：核对 Tasks 页 · 持续保留：用户偏好中文优先 · 主要来源：Recent chat",
              recommendation: "下次协助时，保持“用户偏好中文优先”，同时优先推进“核对 Tasks 页”。",
              assistanceStrategy: "先按“核对 Tasks 页”拆成清单执行，过程中持续遵守“用户偏好中文优先”。",
              durableSignals: ["用户偏好中文优先"],
              temporaryFocus: ["核对 Tasks 页", "验证自动生成 todo"],
              sources: [
                { kind: "chat", label: "Recent chat", detail: "user: 先核对 Tasks 页" },
                { kind: "task", label: "Task A", detail: "Task A · next: 核对 Tasks 页" },
              ],
            },
          },
        };
      }
      if (method === "doctor.memory.status") {
        return {
          dreaming: {
            enabled: true,
            shortTermCount: 1,
            recallSignalCount: 0,
            dailySignalCount: 0,
            groundedSignalCount: 0,
            totalSignalCount: 1,
            phaseSignalCount: 0,
            lightPhaseHitCount: 0,
            remPhaseHitCount: 0,
            promotedTotal: 2,
            promotedToday: 2,
            shortTermEntries: [],
            signalEntries: [],
            promotedEntries: [],
            lastRun: {
              at: "2026-04-05T04:30:00.000Z",
              workspaces: 1,
              candidates: 4,
              applied: 2,
              failed: 0,
              narrativeWritten: 1,
              narrativeSkipped: 0,
              learningSummary: {
                summary: "当前聚焦：核对 Tasks 页 · 持续保留：用户偏好中文优先 · 主要来源：Recent chat",
                recommendation: "下次协助时，保持“用户偏好中文优先”，同时优先推进“核对 Tasks 页”。",
                assistanceStrategy: "先按“核对 Tasks 页”拆成清单执行，过程中持续遵守“用户偏好中文优先”。",
                durableSignals: ["用户偏好中文优先"],
                temporaryFocus: ["核对 Tasks 页", "验证自动生成 todo"],
                sources: [
                  { kind: "chat", label: "Recent chat", detail: "user: 先核对 Tasks 页" },
                  { kind: "task", label: "Task A", detail: "Task A · next: 核对 Tasks 页" },
                ],
              },
            },
            phases: {
              light: { enabled: false, cron: "", managedCronPresent: false, lookbackDays: 0, limit: 0 },
              deep: {
                enabled: false,
                cron: "",
                managedCronPresent: false,
                limit: 0,
                minScore: 0,
                minRecallCount: 0,
                minUniqueQueries: 0,
                recencyHalfLifeDays: 0,
              },
              rem: {
                enabled: false,
                cron: "",
                managedCronPresent: false,
                lookbackDays: 0,
                limit: 0,
                minPatternStrength: 0,
              },
            },
          },
        };
      }
      return {};
    });

    const ok = await runDreamingNow(state);

    expect(ok).toBe(true);
    expect(request).toHaveBeenCalledWith("doctor.memory.run", {});
    expect(request).toHaveBeenCalledWith("doctor.memory.status", {});
    expect(request).not.toHaveBeenCalledWith("doctor.memory.dreamDiary", {});
    expect(state.dreamDiaryContent).toBe("keep existing diary");
    expect(state.dreamingStatus?.lastRun).toMatchObject({ applied: 2, candidates: 4 });
    expect(state.dreamDiaryActionMessage).toMatchObject({
      kind: "success",
      text: expect.stringContaining("说明：手动运行只会做后台整理，不会创建可见会话。"),
    });
    expect(state.dreamDiaryActionMessage?.text).toContain("学习摘要：");
    expect(state.dreamDiaryActionMessage?.text).toContain("改进建议：");
    expect(state.dreamDiaryActionMessage?.text).toContain("协助策略：");
    expect(state.dreamingStatus?.lastRun?.learningSummary?.summary).toContain("当前聚焦：");
    expect(state.dreamingStatus?.lastRun?.learningSummary?.recommendation).toContain("下次协助时");
    expect(state.dreamingStatus?.lastRun?.learningSummary?.assistanceStrategy).toContain("先按");
  });

  it("explains why dreaming run stayed at zero promoted", async () => {
    const { state, request } = createState();
    request.mockImplementation(async (method: string) => {
      if (method === "doctor.memory.run") {
        return {
          action: "run",
          runSummary: {
            at: "2026-04-05T04:30:00.000Z",
            workspaces: 1,
            candidates: 3,
            applied: 0,
            failed: 0,
            narrativeWritten: 0,
            narrativeSkipped: 1,
            zeroAppliedReason: "发现了候选记忆，但都没达到 promotion 阈值；由于证据偏弱，这次 diary narrative 也被跳过。",
          },
        };
      }
      if (method === "doctor.memory.status") {
        return {
          dreaming: {
            enabled: true,
            shortTermCount: 1,
            recallSignalCount: 0,
            dailySignalCount: 0,
            groundedSignalCount: 0,
            totalSignalCount: 1,
            phaseSignalCount: 0,
            lightPhaseHitCount: 0,
            remPhaseHitCount: 0,
            promotedTotal: 0,
            promotedToday: 0,
            shortTermEntries: [],
            signalEntries: [],
            promotedEntries: [],
            lastRun: {
              at: "2026-04-05T04:30:00.000Z",
              workspaces: 1,
              candidates: 3,
              applied: 0,
              failed: 0,
              narrativeWritten: 0,
              narrativeSkipped: 1,
              zeroAppliedReason: "发现了候选记忆，但都没达到 promotion 阈值；由于证据偏弱，这次 diary narrative 也被跳过。",
            },
            phases: {
              light: { enabled: false, cron: "", managedCronPresent: false, lookbackDays: 0, limit: 0 },
              deep: {
                enabled: false,
                cron: "",
                managedCronPresent: false,
                limit: 0,
                minScore: 0,
                minRecallCount: 0,
                minUniqueQueries: 0,
                recencyHalfLifeDays: 0,
              },
              rem: {
                enabled: false,
                cron: "",
                managedCronPresent: false,
                lookbackDays: 0,
                limit: 0,
                minPatternStrength: 0,
              },
            },
          },
        };
      }
      return {};
    });

    const ok = await runDreamingNow(state);

    expect(ok).toBe(true);
    expect(state.dreamingStatus?.lastRun).toMatchObject({
      applied: 0,
      zeroAppliedReason: "发现了候选记忆，但都没达到 promotion 阈值；由于证据偏弱，这次 diary narrative 也被跳过。",
    });
    expect(state.dreamDiaryActionMessage?.text).toContain("未提升原因：");
    expect(state.dreamDiaryActionMessage?.text).toContain("没达到 promotion 阈值");
  });

  it("clears grounded staged entries and reloads only dreaming status", async () => {
    const { state, request } = createState();
    state.dreamDiaryContent = "keep existing diary";
    request.mockImplementation(async (method: string) => {
      if (method === "doctor.memory.resetGroundedShortTerm") {
        return { action: "resetGroundedShortTerm", removedShortTermEntries: 2 };
      }
      if (method === "doctor.memory.status") {
        return { dreaming: null };
      }
      return {};
    });

    const ok = await resetGroundedShortTerm(state);

    expect(ok).toBe(true);
    expect(request).toHaveBeenCalledWith("doctor.memory.resetGroundedShortTerm", {});
    expect(request).toHaveBeenCalledWith("doctor.memory.status", {});
    expect(request).not.toHaveBeenCalledWith("doctor.memory.dreamDiary", {});
    expect(state.dreamDiaryContent).toBe("keep existing diary");
    expect(state.dreamDiaryActionLoading).toBe(false);
  });

  it("repairs dreaming artifacts and reloads only dreaming status", async () => {
    const { state, request } = createState();
    state.dreamDiaryContent = "keep existing diary";
    const confirmSpy = vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    request.mockImplementation(async (method: string) => {
      if (method === "doctor.memory.repairDreamingArtifacts") {
        return {
          action: "repairDreamingArtifacts",
          changed: true,
          archiveDir: "/tmp/openclaw/.openclaw-repair/dreaming/2026-04-11T22-10-00-000Z",
          archivedSessionCorpus: true,
          archivedSessionIngestion: true,
        };
      }
      if (method === "doctor.memory.status") {
        return { dreaming: null };
      }
      return {};
    });

    const ok = await repairDreamingArtifacts(state);

    expect(ok).toBe(true);
    expect(confirmSpy).toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith("doctor.memory.repairDreamingArtifacts", {});
    expect(request).toHaveBeenCalledWith("doctor.memory.status", {});
    expect(request).not.toHaveBeenCalledWith("doctor.memory.dreamDiary", {});
    expect(state.dreamDiaryContent).toBe("keep existing diary");
    expect(state.dreamDiaryActionMessage).toEqual({
      kind: "success",
      text: "Dream cache repair complete: archived session corpus, archived ingestion state. Archive: /tmp/openclaw/.openclaw-repair/dreaming/2026-04-11T22-10-00-000Z",
    });
    expect(state.dreamDiaryActionArchivePath).toBe(
      "/tmp/openclaw/.openclaw-repair/dreaming/2026-04-11T22-10-00-000Z",
    );
    expect(state.dreamDiaryActionLoading).toBe(false);
  });

  it("dedupes dream diary entries and reloads diary plus status", async () => {
    const { state, request } = createState();
    const confirmSpy = vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    request.mockImplementation(async (method: string) => {
      if (method === "doctor.memory.dedupeDreamDiary") {
        return {
          action: "dedupeDreamDiary",
          removedEntries: 2,
          keptEntries: 5,
        };
      }
      if (method === "doctor.memory.dreamDiary") {
        return { found: true, path: "DREAMS.md", content: "deduped diary" };
      }
      if (method === "doctor.memory.status") {
        return { dreaming: null };
      }
      return {};
    });

    const ok = await dedupeDreamDiary(state);

    expect(ok).toBe(true);
    expect(confirmSpy).toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith("doctor.memory.dedupeDreamDiary", {});
    expect(request).toHaveBeenCalledWith("doctor.memory.dreamDiary", {});
    expect(request).toHaveBeenCalledWith("doctor.memory.status", {});
    expect(state.dreamDiaryContent).toBe("deduped diary");
    expect(state.dreamDiaryActionMessage).toEqual({
      kind: "success",
      text: "Removed 2 duplicate dream entries and kept 5.",
    });
    expect(state.dreamDiaryActionArchivePath).toBeNull();
    expect(state.dreamDiaryActionLoading).toBe(false);
  });

  it("copies the dreaming repair archive path", async () => {
    const { state } = createState();
    state.dreamDiaryActionArchivePath =
      "/tmp/openclaw/.openclaw-repair/dreaming/2026-04-11T22-10-00-000Z";
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } } as unknown as Navigator);

    const ok = await copyDreamingArchivePath(state);

    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith(
      "/tmp/openclaw/.openclaw-repair/dreaming/2026-04-11T22-10-00-000Z",
    );
    expect(state.dreamDiaryActionMessage).toEqual({
      kind: "success",
      text: "已复制归档路径。",
    });
  });

  it("does not run repair when confirmation is cancelled", async () => {
    const { state, request } = createState();
    vi.spyOn(globalThis, "confirm").mockReturnValue(false);

    const ok = await repairDreamingArtifacts(state);

    expect(ok).toBe(false);
    expect(request).not.toHaveBeenCalled();
    expect(state.dreamDiaryActionMessage).toBeNull();
  });
});
