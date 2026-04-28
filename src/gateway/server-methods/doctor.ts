import fs from "node:fs/promises";
import path from "node:path";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../../agents/agent-scope.js";
import { loadConfig } from "../../config/config.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import {
  isSameMemoryDreamingDay,
  resolveMemoryDeepDreamingConfig,
  resolveMemoryLightDreamingConfig,
  resolveMemoryDreamingPluginConfig,
  resolveMemoryDreamingConfig,
  resolveMemoryDreamingWorkspaces,
  resolveMemoryRemDreamingConfig,
} from "../../memory-host-sdk/dreaming.js";
import { getActiveMemorySearchManager } from "../../plugins/memory-runtime.js";
import { formatError } from "../server-utils.js";
import {
  dedupeDreamDiaryEntries,
  removeBackfillDiaryEntries,
  removeGroundedShortTermCandidates,
  previewGroundedRemMarkdown,
  repairDreamingArtifacts,
  resolveShortTermPromotionDreamingConfig,
  runShortTermDreamingPromotionNow,
  writeBackfillDiaryEntries,
} from "./doctor.memory-core-runtime.js";
import { asRecord, normalizeTrimmedString } from "./record-shared.js";
import type { GatewayRequestHandlers } from "./types.js";
import { listTaskModeTasks } from "../task-mode-store.js";
import { loadSessionStore, resolveDefaultSessionStorePath } from "../../config/sessions.js";
import { readSessionMessages } from "../session-utils.js";
import { extractAssistantVisibleText, extractFirstTextBlock } from "../../shared/chat-message-content.js";

const SHORT_TERM_STORE_RELATIVE_PATH = path.join("memory", ".dreams", "short-term-recall.json");
const SHORT_TERM_PHASE_SIGNAL_RELATIVE_PATH = path.join("memory", ".dreams", "phase-signals.json");
const MANAGED_DEEP_SLEEP_CRON_NAME = "Memory Dreaming Promotion";
const MANAGED_DEEP_SLEEP_CRON_TAG = "[managed-by=memory-core.short-term-promotion]";
const DEEP_SLEEP_SYSTEM_EVENT_TEXT = "__openclaw_memory_core_short_term_promotion_dream__";
const DREAM_DIARY_FILE_NAMES = ["DREAMS.md", "dreams.md"] as const;
const DREAMING_LAST_RUN_RELATIVE_PATH = path.join("memory", ".dreams", "last-run.json");

type DreamingLastRunPayload = NonNullable<DoctorMemoryDreamingPayload["lastRun"]>;
const DREAMING_RUN_LOGGER = {
  info: (_message: string) => {},
  warn: (_message: string) => {},
  error: (_message: string) => {},
};

type DoctorMemoryDreamingPhasePayload = {
  enabled: boolean;
  cron: string;
  managedCronPresent: boolean;
  nextRunAtMs?: number;
};

type DoctorMemoryLightDreamingPayload = DoctorMemoryDreamingPhasePayload & {
  lookbackDays: number;
  limit: number;
};

type DoctorMemoryDeepDreamingPayload = DoctorMemoryDreamingPhasePayload & {
  minScore: number;
  minRecallCount: number;
  minUniqueQueries: number;
  recencyHalfLifeDays: number;
  maxAgeDays?: number;
  limit: number;
};

type DoctorMemoryRemDreamingPayload = DoctorMemoryDreamingPhasePayload & {
  lookbackDays: number;
  limit: number;
  minPatternStrength: number;
};

type DoctorMemoryDreamingEntryPayload = {
  key: string;
  path: string;
  startLine: number;
  endLine: number;
  snippet: string;
  recallCount: number;
  dailyCount: number;
  groundedCount: number;
  totalSignalCount: number;
  lightHits: number;
  remHits: number;
  phaseHitCount: number;
  promotedAt?: string;
  lastRecalledAt?: string;
};

type DreamingLearningSourcePayload = {
  kind: "task" | "chat" | "memory";
  label: string;
  detail: string;
};

type DreamingLearningSummaryPayload = {
  summary: string;
  recommendation: string;
  assistanceStrategy: string;
  sessionKey?: string;
  taskId?: string;
  durableSignals: string[];
  temporaryFocus: string[];
  sources: DreamingLearningSourcePayload[];
};

type DoctorMemoryDreamingPayload = {
  enabled: boolean;
  timezone?: string;
  verboseLogging: boolean;
  storageMode: "inline" | "separate" | "both";
  separateReports: boolean;
  shortTermCount: number;
  recallSignalCount: number;
  dailySignalCount: number;
  groundedSignalCount: number;
  totalSignalCount: number;
  phaseSignalCount: number;
  lightPhaseHitCount: number;
  remPhaseHitCount: number;
  promotedTotal: number;
  promotedToday: number;
  storePath?: string;
  phaseSignalPath?: string;
  lastPromotedAt?: string;
  storeError?: string;
  phaseSignalError?: string;
  shortTermEntries: DoctorMemoryDreamingEntryPayload[];
  signalEntries: DoctorMemoryDreamingEntryPayload[];
  promotedEntries: DoctorMemoryDreamingEntryPayload[];
  lastRun?: {
    at: string;
    workspaces: number;
    candidates: number;
    applied: number;
    failed: number;
    narrativeWritten: number;
    narrativeSkipped: number;
    zeroAppliedReason?: string;
    learningSummary?: DreamingLearningSummaryPayload;
  };
  phases: {
    light: DoctorMemoryLightDreamingPayload;
    deep: DoctorMemoryDeepDreamingPayload;
    rem: DoctorMemoryRemDreamingPayload;
  };
};

export type DoctorMemoryStatusPayload = {
  agentId: string;
  provider?: string;
  embedding: {
    ok: boolean;
    error?: string;
  };
  dreaming?: DoctorMemoryDreamingPayload;
};

export type DoctorMemoryDreamDiaryPayload = {
  agentId: string;
  found: boolean;
  path: string;
  content?: string;
  updatedAtMs?: number;
};

export type DoctorMemoryDreamActionPayload = {
  agentId: string;
  action:
    | "backfill"
    | "reset"
    | "resetGroundedShortTerm"
    | "repairDreamingArtifacts"
    | "dedupeDreamDiary"
    | "run";
  path?: string;
  found?: boolean;
  scannedFiles?: number;
  written?: number;
  replaced?: number;
  removedEntries?: number;
  removedShortTermEntries?: number;
  changed?: boolean;
  archiveDir?: string;
  archivedDreamsDiary?: boolean;
  archivedSessionCorpus?: boolean;
  archivedSessionIngestion?: boolean;
  warnings?: string[];
  dedupedEntries?: number;
  keptEntries?: number;
  runSummary?: {
    at: string;
    workspaces: number;
    candidates: number;
    applied: number;
    failed: number;
    narrativeWritten: number;
    narrativeSkipped: number;
    zeroAppliedReason?: string;
    learningSummary?: DreamingLearningSummaryPayload;
  };
};

function normalizeDreamingLearningSummary(value: unknown): DreamingLearningSummaryPayload | undefined {
  const record = asRecord(value);
  const summary = normalizeTrimmedString(record?.summary);
  const recommendation = normalizeTrimmedString(record?.recommendation);
  const assistanceStrategy = normalizeTrimmedString(record?.assistanceStrategy);
  if (!summary || !recommendation || !assistanceStrategy) {
    return undefined;
  }
  const durableSignals = Array.isArray(record?.durableSignals)
    ? record.durableSignals.map((item) => normalizeTrimmedString(item)).filter((item): item is string => Boolean(item)).slice(0, 3)
    : [];
  const temporaryFocus = Array.isArray(record?.temporaryFocus)
    ? record.temporaryFocus.map((item) => normalizeTrimmedString(item)).filter((item): item is string => Boolean(item)).slice(0, 3)
    : [];
  const sources = Array.isArray(record?.sources)
    ? record.sources
        .map((entry) => {
          const source = asRecord(entry);
          const kind = source?.kind;
          const label = normalizeTrimmedString(source?.label);
          const detail = normalizeTrimmedString(source?.detail);
          if ((kind !== "task" && kind !== "chat" && kind !== "memory") || !label || !detail) {
            return null;
          }
          return { kind, label, detail } satisfies DreamingLearningSourcePayload;
        })
        .filter((entry): entry is DreamingLearningSourcePayload => Boolean(entry))
        .slice(0, 3)
    : [];
  return {
    summary,
    recommendation,
    assistanceStrategy,
    ...(normalizeTrimmedString(record?.sessionKey) ? { sessionKey: normalizeTrimmedString(record?.sessionKey) } : {}),
    ...(normalizeTrimmedString(record?.taskId) ? { taskId: normalizeTrimmedString(record?.taskId) } : {}),
    durableSignals,
    temporaryFocus,
    sources,
  };
}

async function readDreamingLastRun(workspaceDir: string): Promise<DreamingLastRunPayload | undefined> {
  const filePath = path.join(workspaceDir, DREAMING_LAST_RUN_RELATIVE_PATH);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return undefined;
    }
    throw err;
  }
  const record = asRecord(JSON.parse(raw));
  const at = normalizeTrimmedString(record?.at);
  if (!at) {
    return undefined;
  }
  return {
    at,
    workspaces: toNonNegativeInt(record?.workspaces),
    candidates: toNonNegativeInt(record?.candidates),
    applied: toNonNegativeInt(record?.applied),
    failed: toNonNegativeInt(record?.failed),
    narrativeWritten: toNonNegativeInt(record?.narrativeWritten),
    narrativeSkipped: toNonNegativeInt(record?.narrativeSkipped),
    ...(normalizeLegacyDreamingZeroAppliedReason(normalizeTrimmedString(record?.zeroAppliedReason))
      ? { zeroAppliedReason: normalizeLegacyDreamingZeroAppliedReason(normalizeTrimmedString(record?.zeroAppliedReason)) }
      : {}),
    ...(normalizeDreamingLearningSummary(record?.learningSummary)
      ? { learningSummary: normalizeDreamingLearningSummary(record?.learningSummary) }
      : {}),
  };
}

function deriveDreamingZeroAppliedReason(summary: {
  workspaces: number;
  candidates: number;
  applied: number;
  failed: number;
  narrativeWritten: number;
  narrativeSkipped: number;
}): string | undefined {
  if (summary.applied > 0) {
    return undefined;
  }
  if (summary.workspaces <= 0) {
    return "本次运行没有可用的记忆整理工作区。";
  }
  if (summary.failed > 0 && summary.candidates <= 0) {
    return "本次整理在进入提升前就遇到了工作区失败。";
  }
  if (summary.candidates <= 0) {
    return "没有足够强的候选记忆进入提升集合。";
  }
  if (summary.narrativeSkipped > 0 && summary.narrativeWritten <= 0) {
    return "发现了候选记忆，但都没达到提升阈值；由于证据偏弱，这次叙事也被跳过。";
  }
  return "发现了候选记忆，但都没达到当前提升阈值。";
}

function normalizeLegacyDreamingZeroAppliedReason(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  if (value === "No dreaming workspace was available for this run.") {
    return "本次运行没有可用的记忆整理工作区。";
  }
  if (value === "Dreaming run encountered workspace failures before any candidate could be promoted.") {
    return "本次整理在进入提升前就遇到了工作区失败。";
  }
  if (value === "No candidate memories were strong enough to enter the promotion set.") {
    return "没有足够强的候选记忆进入提升集合。";
  }
  if (value === "Candidates were found, but none met the promotion threshold; diary narrative was skipped because evidence stayed weak.") {
    return "发现了候选记忆，但都没达到提升阈值；由于证据偏弱，这次叙事也被跳过。";
  }
  if (value === "Candidates were found, but none met the current promotion threshold.") {
    return "发现了候选记忆，但都没达到当前提升阈值。";
  }
  return value;
}

function normalizeDreamingSourceDetail(value: string | undefined, maxLen = 140): string | undefined {
  const normalized = normalizeTrimmedString(value)?.replace(/\s+/g, " ");
  if (!normalized) {
    return undefined;
  }
  return normalized.length <= maxLen ? normalized : `${normalized.slice(0, maxLen - 1).trim()}…`;
}

function splitDreamingActionItems(value: string | undefined): string[] {
  const normalized = normalizeTrimmedString(value);
  if (!normalized) {
    return [];
  }
  const numbered = Array.from(normalized.matchAll(/(?:^|\s)(?:\d+[.)]|[-*•])\s*([^\n]+?)(?=(?:\s+(?:\d+[.)]|[-*•])\s*)|$)/g))
    .map((match) => normalizeDreamingSourceDetail(match[1], 80))
    .filter((item): item is string => Boolean(item));
  if (numbered.length >= 2) {
    return numbered.slice(0, 3);
  }
  const ordered = normalized
    .split(/\n+|[；;]+|(?=先)|(?=再)|(?=然后)|(?=接着)|(?=最后)/)
    .map((item) => item.replace(/^\s*(?:先|再|然后|接着|最后)\s*/u, ""))
    .map((item) => normalizeDreamingSourceDetail(item, 80))
    .filter((item): item is string => Boolean(item));
  return Array.from(new Set(ordered)).slice(0, 3);
}

function looksDurableLearningSignal(value: string | undefined): boolean {
  return /(偏好|喜欢|习惯|总是|优先|请用|避免|不要|always|prefer|usually|habit)/iu.test(value ?? "");
}

function looksTemporaryLearningSignal(value: string | undefined): boolean {
  return /(核对|验证|确认|继续|修复|排查|联调|测试|回归|实现|补|check|verify|continue|fix|test)/iu.test(value ?? "");
}

function buildDreamingRecommendation(params: { durableSignals: string[]; temporaryFocus: string[]; }): string {
  const durable = params.durableSignals[0];
  const focus = params.temporaryFocus[0];
  if (durable && focus) {
    return `下次协助时，保持“${durable}”，同时优先推进“${focus}”。`;
  }
  if (durable) {
    return `下次协助时，继续保持“${durable}”。`;
  }
  if (focus) {
    return `下次协助时，优先继续推进“${focus}”。`;
  }
  return "下次协助时，先综合任务、聊天和本地记忆再行动。";
}

function buildDreamingAssistanceStrategy(params: { durableSignals: string[]; temporaryFocus: string[]; }): string {
  const durable = params.durableSignals[0];
  const focus = params.temporaryFocus[0];
  if (durable && focus) {
    return `先按“${focus}”拆成清单执行，过程中持续遵守“${durable}”。`;
  }
  if (focus) {
    return `先围绕“${focus}”给出更明确的分步清单和验证顺序。`;
  }
  if (durable) {
    return `后续回复继续遵守“${durable}”，减少偏离。`;
  }
  return "后续优先给出更明确的下一步和验证方式。";
}

function extractChatMessageText(message: unknown, role: "user" | "assistant"): string | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }
  const actualRole = typeof (message as { role?: unknown }).role === "string" ? (message as { role?: string }).role : "";
  if (actualRole !== role) {
    return undefined;
  }
  const text = role === "assistant" ? extractAssistantVisibleText(message) : extractFirstTextBlock(message);
  return normalizeDreamingSourceDetail(typeof text === "string" ? text : undefined, 180);
}

async function buildDreamingLearningSummary(workspaceDir: string): Promise<DreamingLearningSummaryPayload | undefined> {
  const sources: DreamingLearningSourcePayload[] = [];
  const durableSignals: string[] = [];
  const temporaryFocus: string[] = [];

  const { tasks } = await listTaskModeTasks();
  const currentTask = tasks[0] ?? null;
  if (currentTask) {
    const taskDetail = normalizeDreamingSourceDetail(
      [currentTask.title, currentTask.nextStep ? `next: ${currentTask.nextStep}` : null, currentTask.progressSummary].filter(Boolean).join(" · "),
    );
    if (taskDetail) {
      sources.push({ kind: "task", label: currentTask.title || "Current task", detail: taskDetail });
    }
    const taskSteps = splitDreamingActionItems(currentTask.nextStep ?? currentTask.description ?? currentTask.progressSummary);
    temporaryFocus.push(...taskSteps);

    const sessionKey = normalizeTrimmedString(currentTask.lastSessionKey);
    if (sessionKey) {
      const store = loadSessionStore(resolveDefaultSessionStorePath());
      const sessionEntry = store[sessionKey];
      if (sessionEntry?.sessionId) {
        const messages = readSessionMessages(sessionEntry.sessionId, resolveDefaultSessionStorePath(), sessionEntry.sessionFile);
        const userMessages = messages.map((message) => extractChatMessageText(message, "user")).filter((item): item is string => Boolean(item));
        const assistantMessages = messages.map((message) => extractChatMessageText(message, "assistant")).filter((item): item is string => Boolean(item));
        const latestUser = userMessages.at(-1);
        const latestAssistant = assistantMessages.at(-1);
        const chatDetail = normalizeDreamingSourceDetail([latestUser ? `user: ${latestUser}` : null, latestAssistant ? `assistant: ${latestAssistant}` : null].filter(Boolean).join(" · "), 180);
        if (chatDetail) {
          sources.push({ kind: "chat", label: "Recent chat", detail: chatDetail });
        }
        const userActionItems = splitDreamingActionItems(latestUser);
        if (userActionItems.length > 0) {
          temporaryFocus.push(...userActionItems);
        }
        for (const candidate of [latestUser, latestAssistant]) {
          const normalized = normalizeDreamingSourceDetail(candidate, 90);
          if (!normalized) {
            continue;
          }
          if (looksDurableLearningSignal(normalized) && !looksTemporaryLearningSignal(normalized)) {
            durableSignals.push(normalized);
          }
        }
      }
    }
  }

  const dailyFiles = await listWorkspaceDailyFiles(path.join(workspaceDir, "memory"));
  const latestDailyFile = dailyFiles.at(-1);
  if (latestDailyFile) {
    try {
      const raw = await fs.readFile(latestDailyFile, "utf-8");
      const memoryLine = raw
        .split("\n")
        .map((line) => line.replace(/^[-*]\s*/, "").trim())
        .find((line) => line.length > 0 && !line.startsWith("#"));
      const memoryDetail = normalizeDreamingSourceDetail(memoryLine, 140);
      if (memoryDetail) {
        sources.push({ kind: "memory", label: path.basename(latestDailyFile), detail: memoryDetail });
        if (looksDurableLearningSignal(memoryDetail) && !looksTemporaryLearningSignal(memoryDetail)) {
          durableSignals.push(memoryDetail);
        }
      }
    } catch {
      // ignore local memory read failures for learning summary
    }
  }

  const normalizedDurable = Array.from(
    new Set(
      durableSignals
        .map((item) => normalizeDreamingSourceDetail(item, 90))
        .filter((item): item is string => Boolean(item)),
    ),
  ).slice(0, 3);
  const normalizedFocus = Array.from(
    new Set(
      temporaryFocus
        .map((item) => normalizeDreamingSourceDetail(item, 80))
        .filter((item): item is string => Boolean(item))
        .filter((item) => !looksDurableLearningSignal(item)),
    ),
  ).slice(0, 3);
  if (sources.length === 0 && normalizedDurable.length === 0 && normalizedFocus.length === 0) {
    return undefined;
  }
  const summaryParts = [
    normalizedFocus[0] ? `当前聚焦：${normalizedFocus[0]}` : null,
    normalizedDurable[0] ? `持续保留：${normalizedDurable[0]}` : null,
    sources[0] ? `主要来源：${sources[0].label}` : null,
  ].filter((item): item is string => Boolean(item));
  return {
    summary: summaryParts.join(" · ") || "本轮 dreaming 已整理一份跨任务、聊天和本地记忆的学习摘要。",
    recommendation: buildDreamingRecommendation({ durableSignals: normalizedDurable, temporaryFocus: normalizedFocus }),
    assistanceStrategy: buildDreamingAssistanceStrategy({ durableSignals: normalizedDurable, temporaryFocus: normalizedFocus }),
    ...(currentTask?.lastSessionKey ? { sessionKey: currentTask.lastSessionKey } : {}),
    ...(currentTask?.id ? { taskId: currentTask.id } : {}),
    durableSignals: normalizedDurable,
    temporaryFocus: normalizedFocus,
    sources: sources.slice(0, 3),
  };
}

async function writeDreamingLastRun(params: {
  workspaceDir: string;
  summary: Omit<DreamingLastRunPayload, "at">;
}): Promise<DreamingLastRunPayload> {
  const filePath = path.join(params.workspaceDir, DREAMING_LAST_RUN_RELATIVE_PATH);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const payload: DreamingLastRunPayload = {
    at: new Date().toISOString(),
    ...params.summary,
  };
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  return payload;
}

function extractIsoDayFromPath(filePath: string): string | null {
  const match = filePath.replaceAll("\\", "/").match(/(\d{4}-\d{2}-\d{2})\.md$/i);
  return match?.[1] ?? null;
}

function groundedMarkdownToDiaryLines(markdown: string): string[] {
  return markdown
    .split("\n")
    .map((line) => line.replace(/^##\s+/, "").trimEnd())
    .filter((line, index, lines) => line.length > 0 || (index > 0 && lines[index - 1]?.length > 0));
}

async function listWorkspaceDailyFiles(memoryDir: string): Promise<string[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(memoryDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return [];
    }
    throw err;
  }
  return entries
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/i.test(name))
    .map((name) => path.join(memoryDir, name))
    .toSorted((left, right) => left.localeCompare(right));
}

function resolveDreamingConfig(
  cfg: OpenClawConfig,
): Omit<
  DoctorMemoryDreamingPayload,
  | "shortTermCount"
  | "recallSignalCount"
  | "dailySignalCount"
  | "groundedSignalCount"
  | "totalSignalCount"
  | "phaseSignalCount"
  | "lightPhaseHitCount"
  | "remPhaseHitCount"
  | "promotedTotal"
  | "promotedToday"
  | "storePath"
  | "phaseSignalPath"
  | "lastPromotedAt"
  | "storeError"
  | "phaseSignalError"
> {
  const resolved = resolveMemoryDreamingConfig({
    pluginConfig: resolveMemoryDreamingPluginConfig(cfg),
    cfg,
  });
  const light = resolveMemoryLightDreamingConfig({
    pluginConfig: resolveMemoryDreamingPluginConfig(cfg),
    cfg,
  });
  const deep = resolveMemoryDeepDreamingConfig({
    pluginConfig: resolveMemoryDreamingPluginConfig(cfg),
    cfg,
  });
  const rem = resolveMemoryRemDreamingConfig({
    pluginConfig: resolveMemoryDreamingPluginConfig(cfg),
    cfg,
  });
  return {
    enabled: resolved.enabled,
    ...(resolved.timezone ? { timezone: resolved.timezone } : {}),
    verboseLogging: resolved.verboseLogging,
    storageMode: resolved.storage.mode,
    separateReports: resolved.storage.separateReports,
    shortTermEntries: [],
    signalEntries: [],
    promotedEntries: [],
    phases: {
      light: {
        enabled: light.enabled,
        cron: light.cron,
        lookbackDays: light.lookbackDays,
        limit: light.limit,
        managedCronPresent: false,
      },
      deep: {
        enabled: deep.enabled,
        cron: deep.cron,
        limit: deep.limit,
        minScore: deep.minScore,
        minRecallCount: deep.minRecallCount,
        minUniqueQueries: deep.minUniqueQueries,
        recencyHalfLifeDays: deep.recencyHalfLifeDays,
        managedCronPresent: false,
        ...(typeof deep.maxAgeDays === "number" ? { maxAgeDays: deep.maxAgeDays } : {}),
      },
      rem: {
        enabled: rem.enabled,
        cron: rem.cron,
        lookbackDays: rem.lookbackDays,
        limit: rem.limit,
        minPatternStrength: rem.minPatternStrength,
        managedCronPresent: false,
      },
    },
  };
}

function normalizeMemoryPath(rawPath: string): string {
  return rawPath.replaceAll("\\", "/").replace(/^\.\//, "");
}

function normalizeMemoryPathForWorkspace(workspaceDir: string, rawPath: string): string {
  const normalized = normalizeMemoryPath(rawPath);
  const workspaceNormalized = normalizeMemoryPath(workspaceDir);
  if (path.isAbsolute(rawPath) && normalized.startsWith(`${workspaceNormalized}/`)) {
    return normalized.slice(workspaceNormalized.length + 1);
  }
  return normalized;
}

function isShortTermMemoryPath(filePath: string): boolean {
  const normalized = normalizeMemoryPath(filePath);
  if (/(?:^|\/)memory\/(\d{4})-(\d{2})-(\d{2})\.md$/.test(normalized)) {
    return true;
  }
  if (
    /(?:^|\/)memory\/\.dreams\/session-corpus\/(\d{4})-(\d{2})-(\d{2})\.(?:md|txt)$/.test(
      normalized,
    )
  ) {
    return true;
  }
  return /^(\d{4})-(\d{2})-(\d{2})\.md$/.test(normalized);
}

type DreamingStoreStats = Pick<
  DoctorMemoryDreamingPayload,
  | "shortTermCount"
  | "recallSignalCount"
  | "dailySignalCount"
  | "groundedSignalCount"
  | "totalSignalCount"
  | "phaseSignalCount"
  | "lightPhaseHitCount"
  | "remPhaseHitCount"
  | "promotedTotal"
  | "promotedToday"
  | "storePath"
  | "phaseSignalPath"
  | "lastPromotedAt"
  | "storeError"
  | "phaseSignalError"
  | "shortTermEntries"
  | "signalEntries"
  | "promotedEntries"
>;

const DREAMING_ENTRY_LIST_LIMIT = 8;

function toNonNegativeInt(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 0;
  }
  return Math.max(0, Math.floor(num));
}

function parseEntryRangeFromKey(
  key: string,
  fallbackStartLine: unknown,
  fallbackEndLine: unknown,
): { startLine: number; endLine: number } {
  const startLine = toNonNegativeInt(fallbackStartLine);
  const endLine = toNonNegativeInt(fallbackEndLine);
  if (startLine > 0 && endLine > 0) {
    return { startLine, endLine };
  }
  const match = key.match(/:(\d+):(\d+)$/);
  if (match) {
    return {
      startLine: Math.max(1, toNonNegativeInt(match[1])),
      endLine: Math.max(1, toNonNegativeInt(match[2])),
    };
  }
  return { startLine: 1, endLine: 1 };
}

function compareDreamingEntryByRecency(
  a: DoctorMemoryDreamingEntryPayload,
  b: DoctorMemoryDreamingEntryPayload,
): number {
  const aMs = a.lastRecalledAt ? Date.parse(a.lastRecalledAt) : Number.NEGATIVE_INFINITY;
  const bMs = b.lastRecalledAt ? Date.parse(b.lastRecalledAt) : Number.NEGATIVE_INFINITY;
  if (Number.isFinite(aMs) || Number.isFinite(bMs)) {
    if (bMs !== aMs) {
      return bMs - aMs;
    }
  }
  if (b.totalSignalCount !== a.totalSignalCount) {
    return b.totalSignalCount - a.totalSignalCount;
  }
  return a.path.localeCompare(b.path);
}

function compareDreamingEntryBySignals(
  a: DoctorMemoryDreamingEntryPayload,
  b: DoctorMemoryDreamingEntryPayload,
): number {
  if (b.totalSignalCount !== a.totalSignalCount) {
    return b.totalSignalCount - a.totalSignalCount;
  }
  if (b.phaseHitCount !== a.phaseHitCount) {
    return b.phaseHitCount - a.phaseHitCount;
  }
  return compareDreamingEntryByRecency(a, b);
}

function compareDreamingEntryByPromotion(
  a: DoctorMemoryDreamingEntryPayload,
  b: DoctorMemoryDreamingEntryPayload,
): number {
  const aMs = a.promotedAt ? Date.parse(a.promotedAt) : Number.NEGATIVE_INFINITY;
  const bMs = b.promotedAt ? Date.parse(b.promotedAt) : Number.NEGATIVE_INFINITY;
  if (Number.isFinite(aMs) || Number.isFinite(bMs)) {
    if (bMs !== aMs) {
      return bMs - aMs;
    }
  }
  return compareDreamingEntryBySignals(a, b);
}

function trimDreamingEntries(
  entries: DoctorMemoryDreamingEntryPayload[],
  compare: (a: DoctorMemoryDreamingEntryPayload, b: DoctorMemoryDreamingEntryPayload) => number,
): DoctorMemoryDreamingEntryPayload[] {
  return entries.toSorted(compare).slice(0, DREAMING_ENTRY_LIST_LIMIT);
}

async function loadDreamingStoreStats(
  workspaceDir: string,
  nowMs: number,
  timezone?: string,
): Promise<DreamingStoreStats> {
  const storePath = path.join(workspaceDir, SHORT_TERM_STORE_RELATIVE_PATH);
  const phaseSignalPath = path.join(workspaceDir, SHORT_TERM_PHASE_SIGNAL_RELATIVE_PATH);
  try {
    const raw = await fs.readFile(storePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    const store = asRecord(parsed);
    const entries = asRecord(store?.entries) ?? {};
    let shortTermCount = 0;
    let recallSignalCount = 0;
    let dailySignalCount = 0;
    let groundedSignalCount = 0;
    let totalSignalCount = 0;
    let phaseSignalCount = 0;
    let lightPhaseHitCount = 0;
    let remPhaseHitCount = 0;
    let promotedTotal = 0;
    let promotedToday = 0;
    let latestPromotedAtMs = Number.NEGATIVE_INFINITY;
    let latestPromotedAt: string | undefined;
    const activeKeys = new Set<string>();
    const activeEntries = new Map<string, DoctorMemoryDreamingEntryPayload>();
    const shortTermEntries: DoctorMemoryDreamingEntryPayload[] = [];
    const promotedEntries: DoctorMemoryDreamingEntryPayload[] = [];

    for (const [entryKey, value] of Object.entries(entries)) {
      const entry = asRecord(value);
      if (!entry) {
        continue;
      }
      const source = normalizeTrimmedString(entry.source);
      const entryPath = normalizeTrimmedString(entry.path);
      if (source !== "memory" || !entryPath || !isShortTermMemoryPath(entryPath)) {
        continue;
      }
      const range = parseEntryRangeFromKey(entryKey, entry.startLine, entry.endLine);
      const recallCount = toNonNegativeInt(entry.recallCount);
      const dailyCount = toNonNegativeInt(entry.dailyCount);
      const groundedCount = toNonNegativeInt(entry.groundedCount);
      const totalEntrySignalCount = recallCount + dailyCount + groundedCount;
      const normalizedEntryPath = normalizeMemoryPathForWorkspace(workspaceDir, entryPath);
      const snippet =
        normalizeTrimmedString(entry.snippet) ??
        normalizeTrimmedString(entry.summary) ??
        normalizedEntryPath;
      const lastRecalledAt = normalizeTrimmedString(entry.lastRecalledAt);
      const detail: DoctorMemoryDreamingEntryPayload = {
        key: entryKey,
        path: normalizedEntryPath,
        startLine: range.startLine,
        endLine: Math.max(range.startLine, range.endLine),
        snippet,
        recallCount,
        dailyCount,
        groundedCount,
        totalSignalCount: totalEntrySignalCount,
        lightHits: 0,
        remHits: 0,
        phaseHitCount: 0,
        ...(lastRecalledAt ? { lastRecalledAt } : {}),
      };
      const promotedAt = normalizeTrimmedString(entry.promotedAt);
      if (!promotedAt) {
        shortTermCount += 1;
        activeKeys.add(entryKey);
        recallSignalCount += recallCount;
        dailySignalCount += dailyCount;
        groundedSignalCount += groundedCount;
        totalSignalCount += totalEntrySignalCount;
        shortTermEntries.push(detail);
        activeEntries.set(entryKey, detail);
        continue;
      }
      promotedTotal += 1;
      promotedEntries.push({
        ...detail,
        promotedAt,
      });
      const promotedAtMs = Date.parse(promotedAt);
      if (Number.isFinite(promotedAtMs) && isSameMemoryDreamingDay(promotedAtMs, nowMs, timezone)) {
        promotedToday += 1;
      }
      if (Number.isFinite(promotedAtMs) && promotedAtMs > latestPromotedAtMs) {
        latestPromotedAtMs = promotedAtMs;
        latestPromotedAt = promotedAt;
      }
    }

    let phaseSignalError: string | undefined;
    try {
      const phaseRaw = await fs.readFile(phaseSignalPath, "utf-8");
      const parsedPhase = JSON.parse(phaseRaw) as unknown;
      const phaseStore = asRecord(parsedPhase);
      const phaseEntries = asRecord(phaseStore?.entries) ?? {};
      for (const [key, value] of Object.entries(phaseEntries)) {
        if (!activeKeys.has(key)) {
          continue;
        }
        const phaseEntry = asRecord(value);
        const lightHits = toNonNegativeInt(phaseEntry?.lightHits);
        const remHits = toNonNegativeInt(phaseEntry?.remHits);
        lightPhaseHitCount += lightHits;
        remPhaseHitCount += remHits;
        phaseSignalCount += lightHits + remHits;
        const detail = activeEntries.get(key);
        if (detail) {
          detail.lightHits = lightHits;
          detail.remHits = remHits;
          detail.phaseHitCount = lightHits + remHits;
        }
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      if (code !== "ENOENT") {
        phaseSignalError = formatError(err);
      }
    }

    return {
      shortTermCount,
      recallSignalCount,
      dailySignalCount,
      groundedSignalCount,
      totalSignalCount,
      phaseSignalCount,
      lightPhaseHitCount,
      remPhaseHitCount,
      promotedTotal,
      promotedToday,
      storePath,
      phaseSignalPath,
      shortTermEntries: trimDreamingEntries(shortTermEntries, compareDreamingEntryByRecency),
      signalEntries: trimDreamingEntries(shortTermEntries, compareDreamingEntryBySignals),
      promotedEntries: trimDreamingEntries(promotedEntries, compareDreamingEntryByPromotion),
      ...(latestPromotedAt ? { lastPromotedAt: latestPromotedAt } : {}),
      ...(phaseSignalError ? { phaseSignalError } : {}),
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") {
      return {
        shortTermCount: 0,
        recallSignalCount: 0,
        dailySignalCount: 0,
        groundedSignalCount: 0,
        totalSignalCount: 0,
        phaseSignalCount: 0,
        lightPhaseHitCount: 0,
        remPhaseHitCount: 0,
        promotedTotal: 0,
        promotedToday: 0,
        storePath,
        phaseSignalPath,
        shortTermEntries: [],
        signalEntries: [],
        promotedEntries: [],
      };
    }
    return {
      shortTermCount: 0,
      recallSignalCount: 0,
      dailySignalCount: 0,
      groundedSignalCount: 0,
      totalSignalCount: 0,
      phaseSignalCount: 0,
      lightPhaseHitCount: 0,
      remPhaseHitCount: 0,
      promotedTotal: 0,
      promotedToday: 0,
      storePath,
      phaseSignalPath,
      shortTermEntries: [],
      signalEntries: [],
      promotedEntries: [],
      storeError: formatError(err),
    };
  }
}

function mergeDreamingStoreStats(stats: DreamingStoreStats[]): DreamingStoreStats {
  let shortTermCount = 0;
  let recallSignalCount = 0;
  let dailySignalCount = 0;
  let groundedSignalCount = 0;
  let totalSignalCount = 0;
  let phaseSignalCount = 0;
  let lightPhaseHitCount = 0;
  let remPhaseHitCount = 0;
  let promotedTotal = 0;
  let promotedToday = 0;
  let latestPromotedAtMs = Number.NEGATIVE_INFINITY;
  let lastPromotedAt: string | undefined;
  const storePaths = new Set<string>();
  const phaseSignalPaths = new Set<string>();
  const storeErrors: string[] = [];
  const phaseSignalErrors: string[] = [];
  const shortTermEntries: DoctorMemoryDreamingEntryPayload[] = [];
  const signalEntries: DoctorMemoryDreamingEntryPayload[] = [];
  const promotedEntries: DoctorMemoryDreamingEntryPayload[] = [];

  for (const stat of stats) {
    shortTermCount += stat.shortTermCount;
    recallSignalCount += stat.recallSignalCount;
    dailySignalCount += stat.dailySignalCount;
    groundedSignalCount += stat.groundedSignalCount;
    totalSignalCount += stat.totalSignalCount;
    phaseSignalCount += stat.phaseSignalCount;
    lightPhaseHitCount += stat.lightPhaseHitCount;
    remPhaseHitCount += stat.remPhaseHitCount;
    promotedTotal += stat.promotedTotal;
    promotedToday += stat.promotedToday;
    if (stat.storePath) {
      storePaths.add(stat.storePath);
    }
    if (stat.phaseSignalPath) {
      phaseSignalPaths.add(stat.phaseSignalPath);
    }
    if (stat.storeError) {
      storeErrors.push(stat.storeError);
    }
    if (stat.phaseSignalError) {
      phaseSignalErrors.push(stat.phaseSignalError);
    }
    shortTermEntries.push(...stat.shortTermEntries);
    signalEntries.push(...stat.signalEntries);
    promotedEntries.push(...stat.promotedEntries);
    const promotedAtMs = stat.lastPromotedAt ? Date.parse(stat.lastPromotedAt) : Number.NaN;
    if (Number.isFinite(promotedAtMs) && promotedAtMs > latestPromotedAtMs) {
      latestPromotedAtMs = promotedAtMs;
      lastPromotedAt = stat.lastPromotedAt;
    }
  }

  return {
    shortTermCount,
    recallSignalCount,
    dailySignalCount,
    groundedSignalCount,
    totalSignalCount,
    phaseSignalCount,
    lightPhaseHitCount,
    remPhaseHitCount,
    promotedTotal,
    promotedToday,
    shortTermEntries: trimDreamingEntries(shortTermEntries, compareDreamingEntryByRecency),
    signalEntries: trimDreamingEntries(signalEntries, compareDreamingEntryBySignals),
    promotedEntries: trimDreamingEntries(promotedEntries, compareDreamingEntryByPromotion),
    ...(storePaths.size === 1 ? { storePath: [...storePaths][0] } : {}),
    ...(phaseSignalPaths.size === 1 ? { phaseSignalPath: [...phaseSignalPaths][0] } : {}),
    ...(lastPromotedAt ? { lastPromotedAt } : {}),
    ...(storeErrors.length === 1
      ? { storeError: storeErrors[0] }
      : storeErrors.length > 1
        ? { storeError: `${storeErrors.length} dreaming stores had read errors.` }
        : {}),
    ...(phaseSignalErrors.length === 1
      ? { phaseSignalError: phaseSignalErrors[0] }
      : phaseSignalErrors.length > 1
        ? { phaseSignalError: `${phaseSignalErrors.length} phase signal stores had read errors.` }
        : {}),
  };
}

type ManagedDreamingCronStatus = {
  managedCronPresent: boolean;
  nextRunAtMs?: number;
};

type ManagedCronJobLike = {
  name?: string;
  description?: string;
  enabled?: boolean;
  payload?: { kind?: string; text?: string };
  state?: { nextRunAtMs?: number };
};

function isManagedDreamingJob(
  job: ManagedCronJobLike,
  params: { name: string; tag: string; payloadText: string },
): boolean {
  const description = normalizeTrimmedString(job.description);
  if (description?.includes(params.tag)) {
    return true;
  }
  const name = normalizeTrimmedString(job.name);
  const payloadKind = normalizeTrimmedString(job.payload?.kind)?.toLowerCase();
  const payloadText = normalizeTrimmedString(job.payload?.text);
  return (
    name === params.name && payloadKind === "systemevent" && payloadText === params.payloadText
  );
}

async function resolveManagedDreamingCronStatus(params: {
  context: {
    cron?: { list?: (opts?: { includeDisabled?: boolean }) => Promise<unknown[]> };
  };
  match: {
    name: string;
    tag: string;
    payloadText: string;
  };
}): Promise<ManagedDreamingCronStatus> {
  if (!params.context.cron || typeof params.context.cron.list !== "function") {
    return { managedCronPresent: false };
  }
  try {
    const jobs = await params.context.cron.list({ includeDisabled: true });
    const managed = jobs
      .filter((job): job is ManagedCronJobLike => typeof job === "object" && job !== null)
      .filter((job) => isManagedDreamingJob(job, params.match));
    let nextRunAtMs: number | undefined;
    for (const job of managed) {
      if (job.enabled !== true) {
        continue;
      }
      const candidate = job.state?.nextRunAtMs;
      if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
        continue;
      }
      if (nextRunAtMs === undefined || candidate < nextRunAtMs) {
        nextRunAtMs = candidate;
      }
    }
    return {
      managedCronPresent: managed.length > 0,
      ...(nextRunAtMs !== undefined ? { nextRunAtMs } : {}),
    };
  } catch {
    return { managedCronPresent: false };
  }
}

async function resolveAllManagedDreamingCronStatuses(context: {
  cron?: { list?: (opts?: { includeDisabled?: boolean }) => Promise<unknown[]> };
}): Promise<Record<"light" | "deep" | "rem", ManagedDreamingCronStatus>> {
  const sweepStatus = await resolveManagedDreamingCronStatus({
    context,
    match: {
      name: MANAGED_DEEP_SLEEP_CRON_NAME,
      tag: MANAGED_DEEP_SLEEP_CRON_TAG,
      payloadText: DEEP_SLEEP_SYSTEM_EVENT_TEXT,
    },
  });
  return {
    light: sweepStatus,
    deep: sweepStatus,
    rem: sweepStatus,
  };
}

async function readDreamDiary(
  workspaceDir: string,
): Promise<Omit<DoctorMemoryDreamDiaryPayload, "agentId">> {
  for (const name of DREAM_DIARY_FILE_NAMES) {
    const filePath = path.join(workspaceDir, name);
    let stat;
    try {
      stat = await fs.lstat(filePath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      if (code === "ENOENT") {
        continue;
      }
      return {
        found: false,
        path: name,
      };
    }
    if (stat.isSymbolicLink() || !stat.isFile()) {
      continue;
    }
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return {
        found: true,
        path: name,
        content,
        updatedAtMs: Math.floor(stat.mtimeMs),
      };
    } catch {
      return {
        found: false,
        path: name,
      };
    }
  }
  return {
    found: false,
    path: DREAM_DIARY_FILE_NAMES[0],
  };
}

export const doctorHandlers: GatewayRequestHandlers = {
  "doctor.memory.status": async ({ respond, context }) => {
    const cfg = loadConfig();
    const agentId = resolveDefaultAgentId(cfg);
    const { manager, error } = await getActiveMemorySearchManager({
      cfg,
      agentId,
      purpose: "status",
    });
    if (!manager) {
      const payload: DoctorMemoryStatusPayload = {
        agentId,
        embedding: {
          ok: false,
          error: error ?? "memory search unavailable",
        },
      };
      respond(true, payload, undefined);
      return;
    }

    try {
      const status = manager.status();
      let embedding = await manager.probeEmbeddingAvailability();
      if (!embedding.ok && !embedding.error) {
        embedding = { ok: false, error: "memory embeddings unavailable" };
      }
      const nowMs = Date.now();
      const dreamingConfig = resolveDreamingConfig(cfg);
      const workspaceDir = normalizeTrimmedString((status as Record<string, unknown>).workspaceDir);
      const configuredWorkspaces = resolveMemoryDreamingWorkspaces(cfg).map(
        (entry) => entry.workspaceDir,
      );
      const allWorkspaces =
        configuredWorkspaces.length > 0 ? configuredWorkspaces : workspaceDir ? [workspaceDir] : [];
      const storeStats =
        allWorkspaces.length > 0
          ? mergeDreamingStoreStats(
              await Promise.all(
                allWorkspaces.map((entry) =>
                  loadDreamingStoreStats(entry, nowMs, dreamingConfig.timezone),
                ),
              ),
            )
          : {
              shortTermCount: 0,
              recallSignalCount: 0,
              dailySignalCount: 0,
              groundedSignalCount: 0,
              totalSignalCount: 0,
              phaseSignalCount: 0,
              lightPhaseHitCount: 0,
              remPhaseHitCount: 0,
              promotedTotal: 0,
              promotedToday: 0,
            };
      const cronStatuses = await resolveAllManagedDreamingCronStatuses(context);
      const payload: DoctorMemoryStatusPayload = {
        agentId,
        provider: status.provider,
        embedding,
        dreaming: {
          ...dreamingConfig,
          ...storeStats,
          ...(workspaceDir ? { lastRun: await readDreamingLastRun(workspaceDir) } : {}),
          phases: {
            light: {
              ...dreamingConfig.phases.light,
              ...cronStatuses.light,
            },
            deep: {
              ...dreamingConfig.phases.deep,
              ...cronStatuses.deep,
            },
            rem: {
              ...dreamingConfig.phases.rem,
              ...cronStatuses.rem,
            },
          },
        },
      };
      respond(true, payload, undefined);
    } catch (err) {
      const payload: DoctorMemoryStatusPayload = {
        agentId,
        embedding: {
          ok: false,
          error: `gateway memory probe failed: ${formatError(err)}`,
        },
      };
      respond(true, payload, undefined);
    } finally {
      await manager.close?.().catch(() => {});
    }
  },
  "doctor.memory.dreamDiary": async ({ respond }) => {
    const cfg = loadConfig();
    const agentId = resolveDefaultAgentId(cfg);
    const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
    const dreamDiary = await readDreamDiary(workspaceDir);
    const payload: DoctorMemoryDreamDiaryPayload = {
      agentId,
      ...dreamDiary,
    };
    respond(true, payload, undefined);
  },
  "doctor.memory.backfillDreamDiary": async ({ respond }) => {
    const cfg = loadConfig();
    const agentId = resolveDefaultAgentId(cfg);
    const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
    const memoryDir = path.join(workspaceDir, "memory");
    const sourceFiles = await listWorkspaceDailyFiles(memoryDir);
    if (sourceFiles.length === 0) {
      const dreamDiary = await readDreamDiary(workspaceDir);
      const payload: DoctorMemoryDreamActionPayload = {
        agentId,
        path: dreamDiary.path,
        action: "backfill",
        found: dreamDiary.found,
        scannedFiles: 0,
        written: 0,
        replaced: 0,
      };
      respond(true, payload, undefined);
      return;
    }
    const grounded = await previewGroundedRemMarkdown({
      workspaceDir,
      inputPaths: sourceFiles,
    });
    const remConfig = resolveMemoryRemDreamingConfig({
      pluginConfig: resolveMemoryDreamingPluginConfig(cfg),
      cfg,
    });
    const entries = grounded.files
      .map((file) => {
        const isoDay = extractIsoDayFromPath(file.path);
        if (!isoDay) {
          return null;
        }
        return {
          isoDay,
          sourcePath: file.path,
          bodyLines: groundedMarkdownToDiaryLines(file.renderedMarkdown),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    const written = await writeBackfillDiaryEntries({
      workspaceDir,
      entries,
      timezone: remConfig.timezone,
    });
    const dreamDiary = await readDreamDiary(workspaceDir);
    const payload: DoctorMemoryDreamActionPayload = {
      agentId,
      path: dreamDiary.path,
      action: "backfill",
      found: dreamDiary.found,
      scannedFiles: grounded.scannedFiles,
      written: written.written,
      replaced: written.replaced,
    };
    respond(true, payload, undefined);
  },
  "doctor.memory.resetDreamDiary": async ({ respond }) => {
    const cfg = loadConfig();
    const agentId = resolveDefaultAgentId(cfg);
    const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
    const removed = await removeBackfillDiaryEntries({ workspaceDir });
    const dreamDiary = await readDreamDiary(workspaceDir);
    const payload: DoctorMemoryDreamActionPayload = {
      agentId,
      path: dreamDiary.path,
      action: "reset",
      found: dreamDiary.found,
      removedEntries: removed.removed,
    };
    respond(true, payload, undefined);
  },
  "doctor.memory.resetGroundedShortTerm": async ({ respond }) => {
    const cfg = loadConfig();
    const agentId = resolveDefaultAgentId(cfg);
    const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
    const removed = await removeGroundedShortTermCandidates({ workspaceDir });
    const payload: DoctorMemoryDreamActionPayload = {
      agentId,
      action: "resetGroundedShortTerm",
      removedShortTermEntries: removed.removed,
    };
    respond(true, payload, undefined);
  },
  "doctor.memory.repairDreamingArtifacts": async ({ respond }) => {
    const cfg = loadConfig();
    const agentId = resolveDefaultAgentId(cfg);
    const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
    const repair = await repairDreamingArtifacts({ workspaceDir });
    const payload: DoctorMemoryDreamActionPayload = {
      agentId,
      action: "repairDreamingArtifacts",
      changed: repair.changed,
      archiveDir: repair.archiveDir,
      archivedDreamsDiary: repair.archivedDreamsDiary,
      archivedSessionCorpus: repair.archivedSessionCorpus,
      archivedSessionIngestion: repair.archivedSessionIngestion,
      warnings: repair.warnings,
    };
    respond(true, payload, undefined);
  },
  "doctor.memory.dedupeDreamDiary": async ({ respond }) => {
    const cfg = loadConfig();
    const agentId = resolveDefaultAgentId(cfg);
    const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
    const dedupe = await dedupeDreamDiaryEntries({ workspaceDir });
    const dreamDiary = await readDreamDiary(workspaceDir);
    const payload: DoctorMemoryDreamActionPayload = {
      agentId,
      action: "dedupeDreamDiary",
      path: dreamDiary.path,
      found: dreamDiary.found,
      removedEntries: dedupe.removed,
      dedupedEntries: dedupe.removed,
      keptEntries: dedupe.kept,
    };
    respond(true, payload, undefined);
  },
  "doctor.memory.run": async ({ respond }) => {
    const cfg = loadConfig();
    const agentId = resolveDefaultAgentId(cfg);
    const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
    const summary = await runShortTermDreamingPromotionNow({
      workspaceDir,
      cfg,
      config: resolveShortTermPromotionDreamingConfig({
        pluginConfig: resolveMemoryDreamingPluginConfig(cfg),
        cfg,
      }),
      logger: DREAMING_RUN_LOGGER,
    });
    const learningSummary = await buildDreamingLearningSummary(workspaceDir);
    const runSummary = await writeDreamingLastRun({
      workspaceDir,
      summary: {
        workspaces: summary.workspaces,
        candidates: summary.candidates,
        applied: summary.applied,
        failed: summary.failed,
        narrativeWritten: summary.narrativeWritten,
        narrativeSkipped: summary.narrativeSkipped,
        ...(deriveDreamingZeroAppliedReason(summary)
          ? { zeroAppliedReason: deriveDreamingZeroAppliedReason(summary) }
          : {}),
        ...(learningSummary ? { learningSummary } : {}),
      },
    });
    const payload: DoctorMemoryDreamActionPayload = {
      agentId,
      action: "run",
      runSummary,
    };
    respond(true, payload, undefined);
  },
};
