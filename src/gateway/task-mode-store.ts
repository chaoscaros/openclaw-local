import path from "node:path";
import { loadConfig } from "../config/config.js";
import {
  loadSessionStore,
  resolveAllAgentSessionStoreTargetsSync,
  updateSessionStore,
  type SessionEntry,
} from "../config/sessions.js";
import { extractFirstTextBlock, extractAssistantVisibleText } from "../shared/chat-message-content.js";
import { loadSessionEntry, readSessionMessages } from "./session-utils.js";
import { resolveStateDir } from "../config/paths.js";
import { createAsyncLock, readJsonFile, writeJsonAtomic } from "../infra/json-files.js";
import {
  createManagedTaskFlow,
  finishFlow,
  getTaskFlowById,
  resumeFlow,
  setFlowWaiting,
  updateFlowRecordByIdExpectedRevision,
} from "../tasks/task-flow-runtime-internal.js";
import { listTasksForFlowId, listTasksForRelatedSessionKey } from "../tasks/task-registry.js";
import { reconcileTaskRecordForOperatorInspection } from "../tasks/task-registry.maintenance.js";
import type { TaskFlowRecord } from "../tasks/task-flow-registry.types.js";
import type { TaskRecord } from "../tasks/task-registry.types.js";

export type TaskModeStatus = "active" | "paused" | "interrupted" | "completed" | "ended";

export type TaskModeRuntimeTaskSummary = {
  taskId: string;
  runtime: TaskRecord["runtime"];
  status: TaskRecord["status"];
  runId?: string;
  startedAt?: number;
  endedAt?: number;
  lastEventAt?: number;
  error?: string;
  progressSummary?: string;
  terminalSummary?: string;
};

export type TaskModeTodoStatus = "pending" | "in_progress" | "completed" | "cancelled";
export type TaskModeTodoPriority = "low" | "normal" | "high";
export type TaskModeTodoSource = "user" | "agent" | "system";

export type TaskModeTodoItem = {
  id: string;
  taskId: string;
  content: string;
  status: TaskModeTodoStatus;
  priority: TaskModeTodoPriority;
  source: TaskModeTodoSource;
  note?: string;
  verification?: string;
  createdAt: number;
  updatedAt: number;
  order: number;
};

export type TaskModeRecord = {
  id: string;
  title: string;
  description?: string;
  progressSummary?: string;
  completedSummary?: string;
  nextStep?: string;
  todoItems?: TaskModeTodoItem[];
  resourceContext?: string[];
  timeline?: Array<{ at: number; label: string; detail: string }>;
  lastSyncedAt?: number;
  linkedRuntimeTaskIds?: string[];
  latestRuntimeTaskId?: string;
  latestRunId?: string;
  runtimeTaskSummaries?: TaskModeRuntimeTaskSummary[];
  status: TaskModeStatus;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number | null;
  lastSessionKey?: string;
  flowId?: string;
};

export type TaskModeRuntimeHealth = "healthy" | "stale" | "lost" | "recovering";

export type TaskModeView = TaskModeRecord & {
  effectiveStatus: TaskModeStatus;
  runtimeHealth?: TaskModeRuntimeHealth;
  linkedRuntimeTaskIds?: string[];
  latestRuntimeTaskId?: string;
  latestRunId?: string;
  runtimeTaskSummaries?: TaskModeRuntimeTaskSummary[];
  flow?: {
    id: string;
    status: TaskFlowRecord["status"];
    currentStep?: string;
    createdAt: number;
    updatedAt: number;
  } | null;
};

type TaskModeStore = {
  tasks: TaskModeRecord[];
};

const withTaskModeStoreLock = createAsyncLock();

function resolveTaskModeStorePath(): string {
  return path.join(resolveStateDir(), "control-ui", "task-mode-store.json");
}

function normalizeTaskTodoItem(raw: TaskModeTodoItem, fallbackTaskId: string, fallbackOrder: number): TaskModeTodoItem | null {
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const taskId = typeof raw.taskId === "string" && raw.taskId.trim() ? raw.taskId.trim() : fallbackTaskId;
  const content = typeof raw.content === "string" ? raw.content.trim() : "";
  if (!id || !taskId || !content) {
    return null;
  }
  const status =
    raw.status === "pending" || raw.status === "in_progress" || raw.status === "completed" || raw.status === "cancelled"
      ? raw.status
      : "pending";
  const priority = raw.priority === "low" || raw.priority === "normal" || raw.priority === "high" ? raw.priority : "normal";
  const source = raw.source === "user" || raw.source === "agent" || raw.source === "system" ? raw.source : "user";
  return {
    id,
    taskId,
    content,
    status,
    priority,
    source,
    ...(typeof raw.note === "string" && raw.note.trim() ? { note: raw.note.trim() } : {}),
    ...(typeof raw.verification === "string" && raw.verification.trim() ? { verification: raw.verification.trim() } : {}),
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
    order: Number.isFinite(raw.order) ? raw.order : fallbackOrder,
  };
}

function normalizeTaskTodoItems(items: TaskModeTodoItem[] | undefined, taskId: string): TaskModeTodoItem[] | undefined {
  if (!Array.isArray(items) || items.length === 0) {
    return undefined;
  }
  const normalized = items
    .map((item, index) => normalizeTaskTodoItem(item, taskId, index))
    .filter((item): item is TaskModeTodoItem => Boolean(item))
    .toSorted((left, right) => left.order - right.order || left.createdAt - right.createdAt)
    .map((item, index) => ({ ...item, order: index }));
  if (normalized.length === 0) {
    return undefined;
  }
  const inProgress = normalized.filter((item) => item.status === "in_progress");
  if (inProgress.length > 1) {
    let seen = false;
    for (const item of normalized) {
      if (item.status !== "in_progress") {
        continue;
      }
      if (!seen) {
        seen = true;
        continue;
      }
      item.status = "pending";
    }
  }
  return normalized;
}

function deriveTaskNextStepFromTodos(todoItems: TaskModeTodoItem[] | undefined, fallbackNextStep?: string): string | undefined {
  const items = todoItems ?? [];
  const inProgress = items.find((item) => item.status === "in_progress");
  if (inProgress) {
    return inProgress.content;
  }
  const pending = items.find((item) => item.status === "pending");
  if (pending) {
    return pending.content;
  }
  return fallbackNextStep && fallbackNextStep.trim() ? fallbackNextStep.trim() : undefined;
}

function clampBootstrapTodoContent(value: string): string {
  return value.length <= 220 ? value : `${value.slice(0, 219).trim()}…`;
}

function normalizeBootstrapTodoSegment(value: string | undefined): string | undefined {
  const normalized = value
    ?.replace(/^\s*(?:先|再|然后|接着|最后)\s*/u, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) {
    return undefined;
  }
  return clampBootstrapTodoContent(normalized);
}

function splitBootstrapTodoCandidates(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }
  const numberedMatches = Array.from(trimmed.matchAll(/(?:^|\s)(?:\d+[.)]|[-*•])\s*([^\n]+?)(?=(?:\s+(?:\d+[.)]|[-*•])\s*)|$)/g))
    .map((match) => normalizeBootstrapTodoSegment(match[1]))
    .filter((item): item is string => Boolean(item));
  if (numberedMatches.length >= 2) {
    return numberedMatches;
  }
  const ordered = [
    ...trimmed.matchAll(/先\s*([^，。；;]+?)(?=再|然后|接着|最后|$)/g),
    ...trimmed.matchAll(/再\s*([^，。；;]+?)(?=然后|接着|最后|$)/g),
    ...trimmed.matchAll(/然后\s*([^，。；;]+?)(?=接着|最后|$)/g),
    ...trimmed.matchAll(/接着\s*([^，。；;]+?)(?=最后|$)/g),
    ...trimmed.matchAll(/最后\s*([^，。；;]+?)(?=$)/g),
  ]
    .map((match) => normalizeBootstrapTodoSegment(match[1]))
    .filter((item): item is string => Boolean(item));
  if (ordered.length >= 2) {
    return ordered;
  }
  const newlineSplit = trimmed
    .split(/\n+/)
    .map((item) => normalizeBootstrapTodoSegment(item))
    .filter((item): item is string => Boolean(item));
  if (newlineSplit.length >= 2) {
    return newlineSplit;
  }
  const semicolonSplit = trimmed
    .split(/[；;]+/)
    .map((item) => normalizeBootstrapTodoSegment(item))
    .filter((item): item is string => Boolean(item));
  if (semicolonSplit.length >= 2) {
    return semicolonSplit;
  }
  return [];
}

function inferBootstrapTodoContentsFromSources(sources: Array<string | undefined>): string[] {
  const normalizedSources = sources
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
  if (normalizedSources.length === 0) {
    return [];
  }
  const multiStep = normalizedSources
    .flatMap((value) => splitBootstrapTodoCandidates(value))
    .map((value) => normalizeBootstrapTodoSegment(value))
    .filter((item): item is string => Boolean(item));
  const dedupedMultiStep = Array.from(new Set(multiStep));
  if (dedupedMultiStep.length >= 2) {
    return dedupedMultiStep.slice(0, 3);
  }
  const fallback = normalizeBootstrapTodoSegment(normalizedSources[0]);
  return fallback ? [fallback] : [];
}

function inferBootstrapTodoContents(task: Pick<TaskModeRecord, 'nextStep' | 'description' | 'progressSummary'>): string[] {
  return inferBootstrapTodoContentsFromSources([task.nextStep, task.description, task.progressSummary]);
}

function isManagedTodoSource(source: TaskModeTodoSource | undefined): boolean {
  return source === 'system' || source === 'agent';
}

function isCompletionLikeText(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  return /(已完成|完成了|已补上|已修复|已同步|已处理|已验证|已对齐|done|fixed|verified)/iu.test(value);
}

function reconcileDynamicTodoItems(params: {
  task: TaskModeRecord;
  latestUserText?: string;
  latestAssistantText?: string;
  progressSummary?: string;
  nextStep?: string;
}): { task: TaskModeRecord; changed: boolean } {
  const currentTodos = params.task.todoItems ?? [];
  if (currentTodos.length === 0) {
    return ensureBootstrapTodoItemsFromSources(params.task, [
      params.latestUserText,
      params.latestAssistantText,
      params.nextStep,
      params.progressSummary,
      params.task.description,
    ]);
  }
  if (currentTodos.some((item) => item.source === 'user')) {
    return { task: params.task, changed: false };
  }
  const managedTodos = currentTodos.filter((item) => isManagedTodoSource(item.source));
  if (managedTodos.length === 0) {
    return { task: params.task, changed: false };
  }
  const candidateSteps = inferBootstrapTodoContentsFromSources([
    params.latestUserText,
    params.latestAssistantText,
    params.nextStep,
    params.progressSummary,
  ]);
  const completedManaged = managedTodos.filter((item) => item.status === 'completed' || item.status === 'cancelled');
  const openManaged = managedTodos.filter((item) => item.status !== 'completed' && item.status !== 'cancelled');
  const currentInProgress = openManaged.find((item) => item.status === 'in_progress');
  const shouldAdvanceCurrent =
    Boolean(currentInProgress) &&
    candidateSteps.length >= 2 &&
    isCompletionLikeText(params.latestAssistantText) &&
    !candidateSteps.some((content) => content === normalizeBootstrapTodoSegment(currentInProgress?.content));
  const inferredOpenContent = Array.from(
    new Set(
      [
        ...(shouldAdvanceCurrent ? [] : openManaged.map((item) => normalizeBootstrapTodoSegment(item.content))),
        ...candidateSteps,
      ].filter((item): item is string => Boolean(item)),
    ),
  ).slice(0, 3);
  if (inferredOpenContent.length === 0) {
    return { task: params.task, changed: false };
  }
  const now = Date.now();
  const advancedCompleted =
    shouldAdvanceCurrent && currentInProgress
      ? [...completedManaged, { ...currentInProgress, status: 'completed' as const, updatedAt: now }]
      : completedManaged;
  const nextOpenManaged = inferredOpenContent.map((content, index) => {
    const existing = openManaged.find((item) => normalizeBootstrapTodoSegment(item.content) === content);
    return {
      id: existing?.id ?? `${params.task.id}:auto-dynamic:${index}`,
      taskId: params.task.id,
      content,
      status: index === 0 ? 'in_progress' : 'pending',
      priority: existing?.priority ?? 'normal',
      source: existing?.source ?? 'system',
      ...(existing?.note ? { note: existing.note } : {}),
      ...(existing?.verification ? { verification: existing.verification } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      order: index,
    } satisfies TaskModeTodoItem;
  });
  const normalizedTodos = normalizeTaskTodoItems([...nextOpenManaged, ...advancedCompleted], params.task.id);
  const nextTask = normalizeTaskRecord({
    ...params.task,
    todoItems: normalizedTodos,
    updatedAt: now,
    nextStep: deriveTaskNextStepFromTodos(normalizedTodos, params.nextStep ?? params.task.nextStep),
  });
  const changed = JSON.stringify(currentTodos) !== JSON.stringify(nextTask.todoItems ?? []);
  return { task: nextTask, changed };
}

function ensureBootstrapTodoItemsFromSources(
  task: TaskModeRecord,
  sources?: Array<string | undefined>,
): { task: TaskModeRecord; changed: boolean } {
  if (task.todoItems?.length) {
    return { task, changed: false };
  }
  const contents = sources?.length ? inferBootstrapTodoContentsFromSources(sources) : inferBootstrapTodoContents(task);
  if (contents.length === 0) {
    return { task, changed: false };
  }
  const now = Date.now();
  const todoItems = normalizeTaskTodoItems(
    contents.map((content, index) => ({
      id: `${task.id}:auto-bootstrap:${index}`,
      taskId: task.id,
      content,
      status: index === 0 ? 'in_progress' : 'pending',
      priority: 'normal',
      source: 'system',
      createdAt: now,
      updatedAt: now,
      order: index,
    })),
    task.id,
  );
  if (!todoItems?.length) {
    return { task, changed: false };
  }
  return {
    task: normalizeTaskRecord({ ...task, todoItems, nextStep: deriveTaskNextStepFromTodos(todoItems, task.nextStep) }),
    changed: true,
  };
}

function ensureBootstrapTodoItems(task: TaskModeRecord): { task: TaskModeRecord; changed: boolean } {
  return ensureBootstrapTodoItemsFromSources(task);
}

function normalizeTaskRecord(raw: TaskModeRecord): TaskModeRecord {
  const normalizedTaskId = typeof raw.id === "string" ? raw.id.trim() : "";
  const flowId = typeof raw.flowId === "string" && raw.flowId.trim() ? raw.flowId.trim() : undefined;
  const flow = flowId ? getTaskFlowById(flowId) : undefined;
  const normalizedTitle = typeof raw.title === "string" ? raw.title.trim() : "";
  return {
    id: normalizedTaskId,
    title: normalizedTitle,
    ...(typeof raw.description === "string" && raw.description.trim()
      ? { description: raw.description.trim() }
      : {}),
    ...(typeof raw.progressSummary === "string" && raw.progressSummary.trim()
      ? { progressSummary: raw.progressSummary.trim() }
      : {}),
    ...(typeof raw.completedSummary === "string" && raw.completedSummary.trim()
      ? { completedSummary: raw.completedSummary.trim() }
      : {}),
    ...(typeof raw.nextStep === "string" && raw.nextStep.trim() ? { nextStep: raw.nextStep.trim() } : {}),
    ...(normalizeTaskTodoItems(raw.todoItems, normalizedTaskId) ? { todoItems: normalizeTaskTodoItems(raw.todoItems, normalizedTaskId) } : {}),
    ...(Array.isArray(raw.resourceContext)
      ? {
          resourceContext: Array.from(
            new Set(
              raw.resourceContext
                .map((item) => (typeof item === "string" ? item.trim() : ""))
                .filter(Boolean),
            ),
          ).slice(0, 12),
        }
      : {}),
    ...(Array.isArray(raw.timeline)
      ? {
          timeline: raw.timeline
            .map((entry) => {
              if (!entry || typeof entry !== "object") {
                return null;
              }
              const record = entry as { at?: unknown; label?: unknown; detail?: unknown };
              const at = Number(record.at);
              const label = typeof record.label === "string" ? record.label.trim() : "";
              const detail = typeof record.detail === "string" ? record.detail.trim() : "";
              if (!Number.isFinite(at) || !label || !detail) {
                return null;
              }
              return { at, label, detail };
            })
            .filter((entry): entry is { at: number; label: string; detail: string } => Boolean(entry))
            .toSorted((left, right) => right.at - left.at)
            .slice(0, 12),
        }
      : {}),
    ...(Number.isFinite(raw.lastSyncedAt) ? { lastSyncedAt: Number(raw.lastSyncedAt) } : {}),
    ...(Array.isArray(raw.linkedRuntimeTaskIds)
      ? {
          linkedRuntimeTaskIds: Array.from(
            new Set(
              raw.linkedRuntimeTaskIds
                .map((item) => (typeof item === "string" ? item.trim() : ""))
                .filter(Boolean),
            ),
          ).slice(0, 12),
        }
      : {}),
    ...(typeof raw.latestRuntimeTaskId === "string" && raw.latestRuntimeTaskId.trim()
      ? { latestRuntimeTaskId: raw.latestRuntimeTaskId.trim() }
      : {}),
    ...(typeof raw.latestRunId === "string" && raw.latestRunId.trim()
      ? { latestRunId: raw.latestRunId.trim() }
      : {}),
    ...(Array.isArray(raw.runtimeTaskSummaries)
      ? {
          runtimeTaskSummaries: raw.runtimeTaskSummaries
            .map((entry) => {
              if (!entry || typeof entry !== "object") {
                return null;
              }
              const record = entry as Record<string, unknown>;
              const taskId = typeof record.taskId === "string" ? record.taskId.trim() : "";
              const runtime = record.runtime;
              const status = record.status;
              if (
                !taskId ||
                (runtime !== "subagent" && runtime !== "acp" && runtime !== "cli" && runtime !== "cron") ||
                (status !== "queued" &&
                  status !== "running" &&
                  status !== "succeeded" &&
                  status !== "failed" &&
                  status !== "timed_out" &&
                  status !== "cancelled" &&
                  status !== "lost")
              ) {
                return null;
              }
              return {
                taskId,
                runtime,
                status,
                ...(typeof record.runId === "string" && record.runId.trim() ? { runId: record.runId.trim() } : {}),
                ...(Number.isFinite(record.startedAt) ? { startedAt: Number(record.startedAt) } : {}),
                ...(Number.isFinite(record.endedAt) ? { endedAt: Number(record.endedAt) } : {}),
                ...(Number.isFinite(record.lastEventAt) ? { lastEventAt: Number(record.lastEventAt) } : {}),
                ...(typeof record.error === "string" && record.error.trim() ? { error: record.error.trim() } : {}),
                ...(typeof record.progressSummary === "string" && record.progressSummary.trim()
                  ? { progressSummary: record.progressSummary.trim() }
                  : {}),
                ...(typeof record.terminalSummary === "string" && record.terminalSummary.trim()
                  ? { terminalSummary: record.terminalSummary.trim() }
                  : {}),
              } satisfies TaskModeRuntimeTaskSummary;
            })
            .filter((entry): entry is TaskModeRuntimeTaskSummary => Boolean(entry))
            .slice(0, 12),
        }
      : {}),
    status:
      raw.status === "active" ||
      raw.status === "paused" ||
      raw.status === "interrupted" ||
      raw.status === "completed" ||
      raw.status === "ended"
        ? raw.status
        : "active",
    archived: raw.archived,
    createdAt: Number.isFinite(raw.createdAt)
      ? raw.createdAt
      : typeof flow?.createdAt === 'number'
        ? flow.createdAt
        : Date.now(),
    updatedAt: Number.isFinite(raw.updatedAt)
      ? raw.updatedAt
      : typeof flow?.updatedAt === 'number'
        ? flow.updatedAt
        : Date.now(),
    archivedAt:
      raw.archivedAt == null || Number.isFinite(raw.archivedAt) ? (raw.archivedAt ?? null) : null,
    ...(typeof raw.lastSessionKey === "string" && raw.lastSessionKey.trim()
      ? { lastSessionKey: raw.lastSessionKey.trim() }
      : {}),
    ...(flowId ? { flowId } : {}),
  };
}

function backfillTaskTitleFromFlow(task: TaskModeRecord): { task: TaskModeRecord; changed: boolean } {
  if (typeof task.title === "string" && task.title.trim()) {
    return { task, changed: false };
  }
  if (!task.flowId) {
    return { task, changed: false };
  }
  const flow = getTaskFlowById(task.flowId);
  const flowGoal = typeof flow?.goal === "string" ? flow.goal.trim() : "";
  if (!flowGoal) {
    return { task, changed: false };
  }
  return { task: { ...task, title: flowGoal }, changed: true };
}

async function loadTaskModeStore(): Promise<TaskModeStore> {
  const parsed = await readJsonFile<Partial<TaskModeStore>>(resolveTaskModeStorePath());
  const tasks = Array.isArray(parsed?.tasks)
    ? parsed.tasks
        .filter((task): task is TaskModeRecord => task !== null && typeof task === "object")
        .map((task) => normalizeTaskRecord(task))
    : [];
  let changed = false;
  const backfilled = tasks.map((task) => {
    const titleResult = backfillTaskTitleFromFlow(task);
    const todoResult = ensureBootstrapTodoItems(titleResult.task);
    changed ||= titleResult.changed || todoResult.changed;
    return todoResult.task;
  });
  const store = { tasks: backfilled };
  if (changed) {
    await saveTaskModeStore(store);
  }
  return store;
}

function compactTaskModeRecordForPersistence(task: TaskModeRecord): Record<string, object | string | number | boolean | null> {
  const base: Record<string, object | string | number | boolean | null> = {
    id: task.id,
    title: task.title,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    status: task.status,
    archived: task.archived,
    archivedAt: task.archivedAt ?? null,
  };
  if (task.flowId) {
    base.flowId = task.flowId;
  }
  if (task.description) {
    base.description = task.description;
  }
  if (task.lastSessionKey) {
    base.lastSessionKey = task.lastSessionKey;
  }
  if (task.progressSummary) {
    base.progressSummary = task.progressSummary;
  }
  if (task.completedSummary) {
    base.completedSummary = task.completedSummary;
  }
  if (task.nextStep) {
    base.nextStep = task.nextStep;
  }
  if (task.todoItems?.length) {
    base.todoItems = task.todoItems;
  }
  if (task.resourceContext?.length) {
    base.resourceContext = task.resourceContext;
  }
  if (task.timeline?.length) {
    base.timeline = task.timeline;
  }
  if (task.lastSyncedAt) {
    base.lastSyncedAt = task.lastSyncedAt;
  }
  if (task.linkedRuntimeTaskIds?.length) {
    base.linkedRuntimeTaskIds = task.linkedRuntimeTaskIds;
  }
  if (task.latestRuntimeTaskId) {
    base.latestRuntimeTaskId = task.latestRuntimeTaskId;
  }
  if (task.latestRunId) {
    base.latestRunId = task.latestRunId;
  }
  if (task.runtimeTaskSummaries?.length) {
    base.runtimeTaskSummaries = task.runtimeTaskSummaries;
  }
  return base;
}

async function saveTaskModeStore(store: TaskModeStore): Promise<void> {
  await writeJsonAtomic(
    resolveTaskModeStorePath(),
    { tasks: store.tasks.map((task) => compactTaskModeRecordForPersistence(task)) },
    { trailingNewline: true },
  );
}

function sortActiveTasks(tasks: TaskModeRecord[]): TaskModeRecord[] {
  return [...tasks].toSorted((left, right) => right.updatedAt - left.updatedAt || left.createdAt - right.createdAt);
}

function sortArchivedTasks(tasks: TaskModeRecord[]): TaskModeRecord[] {
  return [...tasks].toSorted(
    (left, right) =>
      (right.archivedAt ?? right.updatedAt) - (left.archivedAt ?? left.updatedAt) ||
      left.createdAt - right.createdAt,
  );
}

function resolveFlowOwnerKey(task: Pick<TaskModeRecord, "lastSessionKey">, fallbackSessionKey?: string): string {
  return fallbackSessionKey?.trim() || task.lastSessionKey?.trim() || "main";
}

function mapTaskModeStatusToFlowStatus(status: TaskModeStatus, archived: boolean): TaskFlowRecord['status'] {
  if (archived || status === 'ended') {
    return 'succeeded';
  }
  if (status === 'active') {
    return 'running';
  }
  if (status === 'interrupted') {
    return 'blocked';
  }
  return 'waiting';
}

function mapFlowStatusToEffectiveTaskStatus(params: {
  taskStatus: TaskModeStatus;
  archived: boolean;
  flow?: Pick<TaskFlowRecord, 'status'> | null;
}): TaskModeStatus {
  if (params.archived || params.taskStatus === 'ended') {
    return 'ended';
  }
  if (!params.flow) {
    return params.taskStatus;
  }
  if (params.taskStatus === 'completed') {
    return 'completed';
  }
  if (params.flow.status === 'running') {
    return 'active';
  }
  if (params.flow.status === 'blocked') {
    return 'interrupted';
  }
  if (params.flow.status === 'waiting' || params.flow.status === 'queued') {
    return params.taskStatus === 'paused' ? 'paused' : params.taskStatus;
  }
  if (params.flow.status === 'succeeded') {
    return 'completed';
  }
  if (params.flow.status === 'failed' || params.flow.status === 'cancelled' || params.flow.status === 'lost') {
    return 'interrupted';
  }
  return params.taskStatus;
}

function resolveTaskModeRuntimeTasks(task: TaskModeRecord): TaskRecord[] {
  const matches = new Map<string, TaskRecord>();
  const addTasks = (items: TaskRecord[]) => {
    for (const item of items) {
      const reconciled = reconcileTaskRecordForOperatorInspection(item);
      matches.set(reconciled.taskId, reconciled);
    }
  };
  if (task.flowId) {
    addTasks(listTasksForFlowId(task.flowId));
  }
  if (task.lastSessionKey) {
    addTasks(listTasksForRelatedSessionKey(task.lastSessionKey));
  }
  return [...matches.values()].toSorted((left, right) => {
    const leftAt = left.lastEventAt ?? left.endedAt ?? left.startedAt ?? left.createdAt;
    const rightAt = right.lastEventAt ?? right.endedAt ?? right.startedAt ?? right.createdAt;
    return rightAt - leftAt;
  });
}

function resolveTaskModeRuntimeHealth(tasks: TaskRecord[]): TaskModeRuntimeHealth | undefined {
  const latest = tasks[0];
  if (!latest) {
    return undefined;
  }
  if (latest.status === "lost") {
    return "lost";
  }
  if (latest.status === "queued" || latest.status === "running") {
    return "healthy";
  }
  const latestAt = latest.lastEventAt ?? latest.endedAt ?? latest.startedAt ?? latest.createdAt;
  if (Date.now() - latestAt > 5 * 60_000) {
    return "stale";
  }
  return latest.status === "failed" || latest.status === "timed_out" ? "recovering" : "healthy";
}

function syncTaskModeRuntimeLinks(task: TaskModeRecord): TaskModeRecord {
  const runtimeTasks = resolveTaskModeRuntimeTasks(task);
  const latestRuntimeTask = runtimeTasks[0];
  return normalizeTaskRecord({
    ...task,
    linkedRuntimeTaskIds: runtimeTasks.map((item) => item.taskId),
    latestRuntimeTaskId: latestRuntimeTask?.taskId,
    latestRunId: latestRuntimeTask?.runId,
    runtimeTaskSummaries: runtimeTasks.slice(0, 8).map((item) => ({
      taskId: item.taskId,
      runtime: item.runtime,
      status: item.status,
      ...(item.runId ? { runId: item.runId } : {}),
      ...(typeof item.lastEventAt === "number" ? { lastEventAt: item.lastEventAt } : {}),
      ...(item.error ? { error: item.error } : {}),
      ...(item.progressSummary ? { progressSummary: item.progressSummary } : {}),
      ...(item.terminalSummary ? { terminalSummary: item.terminalSummary } : {}),
    })),
  });
}

function toTaskModeView(task: TaskModeRecord): TaskModeView {
  const flow = task.flowId ? getTaskFlowById(task.flowId) : undefined;
  const runtimeTasks = resolveTaskModeRuntimeTasks(task);
  const latestRuntimeTask = runtimeTasks[0];
  const derivedNextStep = deriveTaskNextStepFromTodos(task.todoItems, task.nextStep);
  return {
    ...task,
    effectiveStatus: mapFlowStatusToEffectiveTaskStatus({
      taskStatus: task.status,
      archived: task.archived,
      flow,
    }),
    ...(flow?.goal ? { title: flow.goal } : {}),
    ...(flow?.currentStep ? { description: flow.currentStep } : task.description ? { description: task.description } : {}),
    ...(typeof flow?.createdAt === 'number' ? { createdAt: flow.createdAt } : {}),
    ...(typeof flow?.updatedAt === 'number' ? { updatedAt: flow.updatedAt } : {}),
    ...(task.progressSummary ? { progressSummary: task.progressSummary } : {}),
    ...(task.completedSummary ? { completedSummary: task.completedSummary } : {}),
    ...(derivedNextStep ? { nextStep: derivedNextStep } : {}),
    ...(task.todoItems?.length ? { todoItems: task.todoItems.map((entry) => ({ ...entry })) } : {}),
    ...(task.resourceContext?.length ? { resourceContext: [...task.resourceContext] } : {}),
    ...(task.timeline?.length ? { timeline: task.timeline.map((entry) => ({ ...entry })) } : {}),
    ...(task.lastSyncedAt ? { lastSyncedAt: task.lastSyncedAt } : {}),
    ...(runtimeTasks.length ? { linkedRuntimeTaskIds: runtimeTasks.map((item) => item.taskId) } : {}),
    ...(latestRuntimeTask ? { latestRuntimeTaskId: latestRuntimeTask.taskId } : {}),
    ...(latestRuntimeTask?.runId ? { latestRunId: latestRuntimeTask.runId } : {}),
    ...(task.runtimeTaskSummaries?.length
      ? {
          runtimeTaskSummaries: task.runtimeTaskSummaries.map((entry) => ({ ...entry }))
        }
      : {}),
    ...(resolveTaskModeRuntimeHealth(runtimeTasks)
      ? { runtimeHealth: resolveTaskModeRuntimeHealth(runtimeTasks) }
      : {}),
    flow: flow
      ? {
          id: flow.flowId,
          status: flow.status,
          ...(flow.currentStep ? { currentStep: flow.currentStep } : {}),
          createdAt: flow.createdAt,
          updatedAt: flow.updatedAt,
        }
      : null,
  };
}

type SyncMessageEntry = {
  role: "user" | "assistant";
  text: string;
  at?: number;
};

function selectLatestActionableSyncText(entries: SyncMessageEntry[]): SyncMessageEntry | undefined {
  const latestMultiStep = [...entries]
    .reverse()
    .find((entry) => inferBootstrapTodoContentsFromSources([entry.text]).length >= 2);
  return latestMultiStep ?? entries.at(-1);
}

function extractTaskSyncText(message: unknown, role: "user" | "assistant"): string | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }
  const actualRole = typeof (message as { role?: unknown }).role === "string" ? (message as { role?: string }).role : "";
  if (actualRole !== role) {
    return undefined;
  }
  const text = role === "assistant" ? extractAssistantVisibleText(message) : extractFirstTextBlock(message);
  return typeof text === "string" && text.trim() ? text.trim() : undefined;
}

function extractTaskSyncTimestamp(message: unknown): number | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }
  const direct = Number((message as { timestamp?: unknown }).timestamp);
  if (Number.isFinite(direct)) {
    return direct;
  }
  const createdAt = Number((message as { createdAt?: unknown }).createdAt);
  return Number.isFinite(createdAt) ? createdAt : undefined;
}

function extractResourceContextFromText(text: string): string[] {
  const matches = text.match(/(?:\/[A-Za-z0-9_./-]+|[A-Za-z0-9_./-]+\.(?:vue|js|ts|tsx|jsx|json|md))/g) ?? [];
  return Array.from(new Set(matches.map((item) => item.trim()).filter(Boolean))).slice(0, 12);
}

function trimSyncText(value: string | undefined, maxLen: number): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.length <= maxLen ? normalized : `${normalized.slice(0, maxLen - 1).trim()}…`;
}

function collectLinkedTaskSessions(task: TaskModeRecord, preferredSessionKeys?: string[]): Array<{
  sessionKey: string;
  entry: SessionEntry;
  storePath: string;
}> {
  const cfg = loadConfig();
  const targets = resolveAllAgentSessionStoreTargetsSync(cfg);
  const matches = new Map<string, { sessionKey: string; entry: SessionEntry; storePath: string }>();
  const preferred = new Set((preferredSessionKeys ?? []).map((key) => key.trim()).filter(Boolean));
  for (const target of targets) {
    const store = loadSessionStore(target.storePath);
    for (const [sessionKey, entry] of Object.entries(store)) {
      if (!entry?.sessionId) {
        continue;
      }
      const normalizedKey = sessionKey.trim();
      const directlyLinked = preferred.has(normalizedKey);
      const taskLinked = entry.taskId?.trim() === task.id;
      const spawnedFromLinked = preferred.has(entry.parentSessionKey?.trim() ?? "") || preferred.has(entry.spawnedBy?.trim() ?? "");
      if (!directlyLinked && !taskLinked && !spawnedFromLinked) {
        continue;
      }
      const existing = matches.get(normalizedKey);
      if (!existing || (existing.entry.updatedAt ?? 0) < (entry.updatedAt ?? 0)) {
        matches.set(normalizedKey, { sessionKey: normalizedKey, entry, storePath: target.storePath });
      }
    }
  }
  return [...matches.values()].toSorted((left, right) => (left.entry.updatedAt ?? 0) - (right.entry.updatedAt ?? 0));
}

function buildTaskProgressSyncSnapshot(messages: unknown[], task: TaskModeRecord) {
  const parsed: SyncMessageEntry[] = [];
  for (const message of messages) {
    const userText = extractTaskSyncText(message, "user");
    if (userText) {
      parsed.push({ role: "user", text: userText, at: extractTaskSyncTimestamp(message) });
      continue;
    }
    const assistantText = extractTaskSyncText(message, "assistant");
    if (assistantText) {
      parsed.push({ role: "assistant", text: assistantText, at: extractTaskSyncTimestamp(message) });
    }
  }
  if (parsed.length === 0) {
    return null;
  }
  const users = parsed.filter((entry) => entry.role === "user");
  const assistants = parsed.filter((entry) => entry.role === "assistant");
  const latestUser = users.at(-1);
  const latestAssistant = assistants.at(-1);
  const preferredUser = selectLatestActionableSyncText(users);
  const preferredAssistant = selectLatestActionableSyncText(assistants);
  const previousAssistant = assistants.length > 1 ? assistants.at(-2) : undefined;
  const progressSummary =
    trimSyncText(latestAssistant?.text, 220) ??
    trimSyncText(task.progressSummary, 220) ??
    trimSyncText(task.description, 220);
  const completedSummary =
    trimSyncText([previousAssistant?.text, latestAssistant?.text].filter(Boolean).join(" · "), 260) ??
    trimSyncText(progressSummary, 260);
  const nextStep =
    trimSyncText(latestUser?.text, 220) ?? trimSyncText(task.nextStep, 220) ?? trimSyncText(task.description, 220);
  const resourceContext = Array.from(
    new Set(
      [task.title, task.description, ...parsed.slice(-8).map((entry) => entry.text)]
        .flatMap((text) => extractResourceContextFromText(text ?? ""))
        .concat(task.resourceContext ?? []),
    ),
  ).slice(0, 12);
  const timeline = [
    ...(latestUser?.at && latestUser.text
      ? [{ at: latestUser.at, label: "最近需求", detail: trimSyncText(latestUser.text, 160) ?? latestUser.text }]
      : []),
    ...(latestAssistant?.at && latestAssistant.text
      ? [{ at: latestAssistant.at, label: "最近进展", detail: trimSyncText(latestAssistant.text, 160) ?? latestAssistant.text }]
      : []),
    ...(task.timeline ?? []).map((entry) => ({ ...entry })),
  ]
    .filter(
      (entry, index, array) =>
        array.findIndex((item) => item.at === entry.at && item.label === entry.label && item.detail === entry.detail) ===
        index,
    )
    .toSorted((left, right) => right.at - left.at)
    .slice(0, 12);
  return {
    progressSummary,
    completedSummary,
    nextStep,
    resourceContext,
    timeline,
    latestUserText: preferredUser?.text ?? latestUser?.text,
    latestAssistantText: preferredAssistant?.text ?? latestAssistant?.text,
  };
}

function syncTaskModeToFlow(task: TaskModeRecord, fallbackSessionKey?: string): TaskModeRecord {
  const ownerKey = resolveFlowOwnerKey(task, fallbackSessionKey);
  const currentFlow = task.flowId ? getTaskFlowById(task.flowId) : undefined;
  const stateJson = {
    taskMode: {
      taskId: task.id,
      archived: task.archived,
      status: task.status,
      description: task.description ?? null,
    },
  } as const;
  const currentStep = task.description ?? task.status;

  if (!currentFlow) {
    const created = createManagedTaskFlow({
      ownerKey,
      controllerId: "control-ui/task-mode",
      goal: task.title,
      status: mapTaskModeStatusToFlowStatus(task.status, task.archived),
      currentStep,
      stateJson,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      ...(task.archived || task.status === "ended" ? { endedAt: task.updatedAt } : {}),
    });
    return { ...task, flowId: created.flowId };
  }

  const expectedRevision = currentFlow.revision;
  if (task.archived || task.status === "ended") {
    finishFlow({
      flowId: currentFlow.flowId,
      expectedRevision,
      currentStep,
      stateJson,
      updatedAt: task.updatedAt,
      endedAt: task.archivedAt ?? task.updatedAt,
    });
    return task;
  }
  if (task.status === "active") {
    resumeFlow({
      flowId: currentFlow.flowId,
      expectedRevision,
      status: "running",
      currentStep,
      stateJson,
      updatedAt: task.updatedAt,
    });
    return task;
  }
  if (task.status === "paused") {
    setFlowWaiting({
      flowId: currentFlow.flowId,
      expectedRevision,
      currentStep,
      stateJson,
      waitJson: { reason: "paused" },
      updatedAt: task.updatedAt,
    });
    return task;
  }
  if (task.status === "interrupted") {
    setFlowWaiting({
      flowId: currentFlow.flowId,
      expectedRevision,
      currentStep,
      stateJson,
      blockedSummary: task.description ?? "interrupted",
      updatedAt: task.updatedAt,
    });
    return task;
  }
  updateFlowRecordByIdExpectedRevision({
    flowId: currentFlow.flowId,
    expectedRevision,
    patch: {
      goal: task.title,
      currentStep,
      stateJson,
      updatedAt: task.updatedAt,
      endedAt: null,
      status: mapTaskModeStatusToFlowStatus(task.status, task.archived),
      blockedTaskId: null,
      blockedSummary: null,
      waitJson: task.status === "completed" ? { completed: true } : null,
    },
  });
  return task;
}

export async function listTaskModeTasks(): Promise<{ tasks: TaskModeView[]; archivedTasks: TaskModeView[] }> {
  const store = await loadTaskModeStore();
  return {
    tasks: sortActiveTasks(store.tasks.filter((task) => !task.archived)).map((task) => toTaskModeView(task)),
    archivedTasks: sortArchivedTasks(store.tasks.filter((task) => task.archived)).map((task) => toTaskModeView(task)),
  };
}

export async function getTaskModeTask(id: string): Promise<TaskModeView | null> {
  const normalizedId = id.trim();
  if (!normalizedId) {
    return null;
  }
  const store = await loadTaskModeStore();
  const task = store.tasks.find((task) => task.id === normalizedId) ?? null;
  return task ? toTaskModeView(task) : null;
}

export async function createTaskModeTask(input: {
  id: string;
  title: string;
  description?: string;
  sessionKey?: string;
}): Promise<TaskModeRecord> {
  return withTaskModeStoreLock(async () => {
    const store = await loadTaskModeStore();
    const now = Date.now();
    const task = normalizeTaskRecord({
      id: input.id,
      title: input.title,
      description: input.description,
      status: "active",
      archived: false,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      lastSessionKey: input.sessionKey,
    });
    const bootstrappedTask = ensureBootstrapTodoItems(task).task;
    const syncedTask = syncTaskModeRuntimeLinks(syncTaskModeToFlow(bootstrappedTask, input.sessionKey));
    store.tasks = [syncedTask, ...store.tasks.filter((item) => item.id !== syncedTask.id)];
    await saveTaskModeStore(store);
    return syncedTask;
  });
}

async function clearSessionTaskBindings(taskId: string): Promise<string[]> {
  const cfg = loadConfig();
  const touched: string[] = [];
  const targets = resolveAllAgentSessionStoreTargetsSync(cfg);
  await Promise.all(
    targets.map(async (target) => {
      await updateSessionStore(
        target.storePath,
        async (store) => {
          let mutated = false;
          for (const entry of Object.values(store)) {
            const typed = entry as SessionEntry | undefined;
            if (!typed || typed.taskId !== taskId) {
              continue;
            }
            delete typed.taskId;
            mutated = true;
          }
          if (mutated) {
            touched.push(target.storePath);
          }
        },
        { skipMaintenance: true },
      );
    }),
  );
  return touched;
}

export async function syncTaskModeTaskProgress(params: {
  id: string;
  sessionKey?: string;
}): Promise<{ task: TaskModeRecord | null; synced: boolean }> {
  return withTaskModeStoreLock(async () => {
    const store = await loadTaskModeStore();
    const index = store.tasks.findIndex((task) => task.id === params.id.trim());
    if (index < 0) {
      return { task: null, synced: false };
    }
    const current = store.tasks[index];
    const targetSessionKey = params.sessionKey?.trim() || current.lastSessionKey?.trim();
    if (!targetSessionKey) {
      return { task: current, synced: false };
    }
    const directLoaded = loadSessionEntry(targetSessionKey);
    const linkedSessions = collectLinkedTaskSessions(current, [
      targetSessionKey,
      directLoaded.canonicalKey ?? "",
      directLoaded.legacyKey ?? "",
    ]);
    const messages = linkedSessions.flatMap((item) =>
      readSessionMessages(item.entry.sessionId, item.storePath, item.entry.sessionFile),
    );
    const snapshot = buildTaskProgressSyncSnapshot(messages, current);
    if (!snapshot) {
      return { task: current, synced: false };
    }
    const lastLinkedSession = linkedSessions.at(-1)?.sessionKey ?? directLoaded.canonicalKey ?? targetSessionKey;
    const now = Date.now();
    const normalizedNext = normalizeTaskRecord({
      ...current,
      progressSummary: snapshot.progressSummary,
      completedSummary: snapshot.completedSummary,
      nextStep: snapshot.nextStep,
      resourceContext: snapshot.resourceContext,
      timeline: snapshot.timeline,
      lastSessionKey: lastLinkedSession,
      lastSyncedAt: now,
      updatedAt: Math.max(current.updatedAt, now),
    });
    const reconciledNext = reconcileDynamicTodoItems({
      task: normalizedNext,
      latestUserText: snapshot.latestUserText,
      latestAssistantText: snapshot.latestAssistantText,
      progressSummary: snapshot.progressSummary,
      nextStep: snapshot.nextStep,
    }).task;
    const next = syncTaskModeRuntimeLinks(reconciledNext);
    const changed =
      JSON.stringify({
        progressSummary: current.progressSummary ?? null,
        completedSummary: current.completedSummary ?? null,
        nextStep: current.nextStep ?? null,
        todoItems: current.todoItems ?? [],
        resourceContext: current.resourceContext ?? [],
        timeline: current.timeline ?? [],
        lastSessionKey: current.lastSessionKey ?? null,
        linkedRuntimeTaskIds: current.linkedRuntimeTaskIds ?? [],
        latestRuntimeTaskId: current.latestRuntimeTaskId ?? null,
        latestRunId: current.latestRunId ?? null,
      }) !==
      JSON.stringify({
        progressSummary: next.progressSummary ?? null,
        completedSummary: next.completedSummary ?? null,
        nextStep: next.nextStep ?? null,
        todoItems: next.todoItems ?? [],
        resourceContext: next.resourceContext ?? [],
        timeline: next.timeline ?? [],
        lastSessionKey: next.lastSessionKey ?? null,
        linkedRuntimeTaskIds: next.linkedRuntimeTaskIds ?? [],
        latestRuntimeTaskId: next.latestRuntimeTaskId ?? null,
        latestRunId: next.latestRunId ?? null,
      });
    store.tasks[index] = next;
    if (changed) {
      await saveTaskModeStore(store);
    }
    return { task: store.tasks[index] ?? null, synced: changed };
  });
}

export async function updateTaskModeTask(params: {
  id: string;
  title?: string;
  description?: string | null;
  status?: TaskModeStatus;
  archived?: boolean;
  sessionKey?: string;
}): Promise<TaskModeRecord | null> {
  return withTaskModeStoreLock(async () => {
    const store = await loadTaskModeStore();
    const index = store.tasks.findIndex((task) => task.id === params.id.trim());
    if (index < 0) {
      return null;
    }
    const current = store.tasks[index];
    const now = Date.now();
    const next: TaskModeRecord = {
      ...current,
      updatedAt: now,
      ...(typeof params.title === "string" && params.title.trim() ? { title: params.title.trim() } : {}),
      ...(params.description !== undefined
        ? params.description && params.description.trim()
          ? { description: params.description.trim() }
          : { description: undefined }
        : {}),
      ...(params.sessionKey ? { lastSessionKey: params.sessionKey } : {}),
    };
    if (params.status) {
      next.status = params.status;
      if (params.status === "ended") {
        next.archived = true;
        next.archivedAt = now;
      }
    }
    if (params.archived === true) {
      next.archived = true;
      next.archivedAt = current.archivedAt ?? now;
    }
    if (params.archived === false) {
      next.archived = false;
      next.archivedAt = null;
    }
    const normalizedNext = normalizeTaskRecord(next);
    store.tasks[index] = syncTaskModeRuntimeLinks(syncTaskModeToFlow(normalizedNext, params.sessionKey));
    await saveTaskModeStore(store);
    if (store.tasks[index]?.archived || store.tasks[index]?.status === "ended") {
      await clearSessionTaskBindings(store.tasks[index].id);
    }
    return store.tasks[index] ?? null;
  });
}

export async function createTaskModeTodo(params: {
  taskId: string;
  todoId: string;
  content: string;
  priority?: TaskModeTodoPriority;
  source?: TaskModeTodoSource;
  note?: string;
  verification?: string;
}): Promise<TaskModeRecord | null> {
  return withTaskModeStoreLock(async () => {
    const store = await loadTaskModeStore();
    const index = store.tasks.findIndex((task) => task.id === params.taskId.trim());
    if (index < 0) {
      return null;
    }
    const current = store.tasks[index];
    const now = Date.now();
    const nextTodo: TaskModeTodoItem = {
      id: params.todoId.trim(),
      taskId: current.id,
      content: params.content.trim(),
      status: "pending",
      priority: params.priority ?? "normal",
      source: params.source ?? "user",
      ...(params.note?.trim() ? { note: params.note.trim() } : {}),
      ...(params.verification?.trim() ? { verification: params.verification.trim() } : {}),
      createdAt: now,
      updatedAt: now,
      order: current.todoItems?.length ?? 0,
    };
    const todoItems = normalizeTaskTodoItems([...(current.todoItems ?? []), nextTodo], current.id);
    const next = normalizeTaskRecord({ ...current, todoItems, updatedAt: now, nextStep: deriveTaskNextStepFromTodos(todoItems, current.nextStep) });
    store.tasks[index] = syncTaskModeRuntimeLinks(syncTaskModeToFlow(next));
    await saveTaskModeStore(store);
    return store.tasks[index] ?? null;
  });
}

export async function updateTaskModeTodo(params: {
  taskId: string;
  todoId: string;
  content?: string;
  priority?: TaskModeTodoPriority;
  note?: string | null;
  verification?: string | null;
}): Promise<TaskModeRecord | null> {
  return withTaskModeStoreLock(async () => {
    const store = await loadTaskModeStore();
    const index = store.tasks.findIndex((task) => task.id === params.taskId.trim());
    if (index < 0) {
      return null;
    }
    const current = store.tasks[index];
    const now = Date.now();
    const todoItems = (current.todoItems ?? []).map((item) => {
      if (item.id !== params.todoId.trim()) {
        return item;
      }
      return normalizeTaskTodoItem(
        {
          ...item,
          ...(params.content !== undefined ? { content: params.content } : {}),
          ...(params.priority !== undefined ? { priority: params.priority } : {}),
          ...(params.note !== undefined ? { note: params.note ?? undefined } : {}),
          ...(params.verification !== undefined ? { verification: params.verification ?? undefined } : {}),
          updatedAt: now,
        },
        current.id,
        item.order,
      );
    }).filter((item): item is TaskModeTodoItem => Boolean(item));
    const normalizedTodos = normalizeTaskTodoItems(todoItems, current.id);
    const next = normalizeTaskRecord({ ...current, todoItems: normalizedTodos, updatedAt: now, nextStep: deriveTaskNextStepFromTodos(normalizedTodos, current.nextStep) });
    store.tasks[index] = syncTaskModeRuntimeLinks(syncTaskModeToFlow(next));
    await saveTaskModeStore(store);
    return store.tasks[index] ?? null;
  });
}

export async function setTaskModeTodoStatus(params: {
  taskId: string;
  todoId: string;
  status: TaskModeTodoStatus;
}): Promise<TaskModeRecord | null> {
  return withTaskModeStoreLock(async () => {
    const store = await loadTaskModeStore();
    const index = store.tasks.findIndex((task) => task.id === params.taskId.trim());
    if (index < 0) {
      return null;
    }
    const current = store.tasks[index];
    const now = Date.now();
    const targetId = params.todoId.trim();
    const todoItems = (current.todoItems ?? []).map((item) => {
      if (params.status === "in_progress" && item.status === "in_progress" && item.id !== targetId) {
        return { ...item, status: "pending" as const, updatedAt: now };
      }
      if (item.id !== targetId) {
        return item;
      }
      return { ...item, status: params.status, updatedAt: now };
    });
    const normalizedTodos = normalizeTaskTodoItems(todoItems, current.id);
    const next = normalizeTaskRecord({ ...current, todoItems: normalizedTodos, updatedAt: now, nextStep: deriveTaskNextStepFromTodos(normalizedTodos, current.nextStep) });
    store.tasks[index] = syncTaskModeRuntimeLinks(syncTaskModeToFlow(next));
    await saveTaskModeStore(store);
    return store.tasks[index] ?? null;
  });
}

export async function deleteTaskModeTodo(params: { taskId: string; todoId: string }): Promise<TaskModeRecord | null> {
  return withTaskModeStoreLock(async () => {
    const store = await loadTaskModeStore();
    const index = store.tasks.findIndex((task) => task.id === params.taskId.trim());
    if (index < 0) {
      return null;
    }
    const current = store.tasks[index];
    const remaining = (current.todoItems ?? []).filter((item) => item.id !== params.todoId.trim());
    const normalizedTodos = normalizeTaskTodoItems(remaining, current.id);
    const next = normalizeTaskRecord({ ...current, todoItems: normalizedTodos, updatedAt: Date.now(), nextStep: deriveTaskNextStepFromTodos(normalizedTodos, current.nextStep) });
    store.tasks[index] = syncTaskModeRuntimeLinks(syncTaskModeToFlow(next));
    await saveTaskModeStore(store);
    return store.tasks[index] ?? null;
  });
}

export async function archiveTaskModeTask(id: string): Promise<TaskModeRecord | null> {
  return updateTaskModeTask({ id, archived: true });
}

export async function restoreTaskModeTask(id: string): Promise<TaskModeRecord | null> {
  return updateTaskModeTask({ id, archived: false });
}

export async function deleteTaskModeTask(id: string): Promise<boolean> {
  const normalizedId = id.trim();
  if (!normalizedId) {
    return false;
  }
  return withTaskModeStoreLock(async () => {
    const store = await loadTaskModeStore();
    const nextTasks = store.tasks.filter((task) => task.id !== normalizedId);
    if (nextTasks.length === store.tasks.length) {
      return false;
    }
    store.tasks = nextTasks;
    await saveTaskModeStore(store);
    await clearSessionTaskBindings(normalizedId);
    return true;
  });
}
