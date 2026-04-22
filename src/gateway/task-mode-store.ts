import path from "node:path";
import { loadConfig } from "../config/config.js";
import {
  resolveAllAgentSessionStoreTargetsSync,
  updateSessionStore,
  type SessionEntry,
} from "../config/sessions.js";
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
import type { TaskFlowRecord } from "../tasks/task-flow-registry.types.js";

export type TaskModeStatus = "active" | "paused" | "interrupted" | "completed" | "ended";

export type TaskModeRecord = {
  id: string;
  title: string;
  description?: string;
  status: TaskModeStatus;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number | null;
  lastSessionKey?: string;
  flowId?: string;
};

export type TaskModeView = TaskModeRecord & {
  effectiveStatus: TaskModeStatus;
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

function normalizeTaskRecord(raw: TaskModeRecord): TaskModeRecord {
  const flowId = typeof raw.flowId === "string" && raw.flowId.trim() ? raw.flowId.trim() : undefined;
  const flow = flowId ? getTaskFlowById(flowId) : undefined;
  return {
    id: String(raw.id || "").trim(),
    title: String(raw.title || "").trim(),
    ...(typeof raw.description === "string" && raw.description.trim()
      ? { description: raw.description.trim() }
      : {}),
    status:
      raw.status === "active" ||
      raw.status === "paused" ||
      raw.status === "interrupted" ||
      raw.status === "completed" ||
      raw.status === "ended"
        ? raw.status
        : "active",
    archived: raw.archived === true,
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

async function loadTaskModeStore(): Promise<TaskModeStore> {
  const parsed = await readJsonFile<Partial<TaskModeStore>>(resolveTaskModeStorePath());
  return {
    tasks: Array.isArray(parsed?.tasks)
      ? parsed.tasks
          .filter((task): task is TaskModeRecord => Boolean(task && typeof task === "object"))
          .map((task) => normalizeTaskRecord(task))
      : [],
  };
}

function compactTaskModeRecordForPersistence(task: TaskModeRecord): Record<string, object | string | number | boolean | null> {
  const base: Record<string, object | string | number | boolean | null> = {
    id: task.id,
    status: task.status,
    archived: task.archived,
    archivedAt: task.archivedAt ?? null,
  };
  if (task.flowId) {
    base.flowId = task.flowId;
  }
  if (task.lastSessionKey) {
    base.lastSessionKey = task.lastSessionKey;
  }
  if (!task.flowId) {
    base.title = task.title;
    base.createdAt = task.createdAt;
    base.updatedAt = task.updatedAt;
    if (task.description) {
      base.description = task.description;
    }
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
  return [...tasks].sort((left, right) => right.updatedAt - left.updatedAt || left.createdAt - right.createdAt);
}

function sortArchivedTasks(tasks: TaskModeRecord[]): TaskModeRecord[] {
  return [...tasks].sort(
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

function toTaskModeView(task: TaskModeRecord): TaskModeView {
  const flow = task.flowId ? getTaskFlowById(task.flowId) : undefined;
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
    const syncedTask = syncTaskModeToFlow(task, input.sessionKey);
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
    const current = store.tasks[index]!;
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
    store.tasks[index] = syncTaskModeToFlow(normalizedNext, params.sessionKey);
    await saveTaskModeStore(store);
    if (store.tasks[index]?.archived || store.tasks[index]?.status === "ended") {
      await clearSessionTaskBindings(store.tasks[index]!.id);
    }
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
