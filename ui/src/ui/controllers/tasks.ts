import type { GatewayBrowserClient } from "../gateway.ts";
import { loadSessions, patchSession, type SessionsState } from "./sessions.ts";

export type TaskStatus = "active" | "paused" | "interrupted" | "completed" | "ended";

export type TaskRuntimeHealth = "healthy" | "stale" | "lost" | "recovering";
export type RuntimeTaskSummary = {
  taskId: string;
  runtime: "subagent" | "acp" | "cli" | "cron";
  status: "queued" | "running" | "succeeded" | "failed" | "timed_out" | "cancelled" | "lost";
  runId?: string;
  startedAt?: number;
  endedAt?: number;
  lastEventAt?: number;
  error?: string;
  progressSummary?: string;
  terminalSummary?: string;
};

export type TaskItem = {
  taskId: string;
  title: string;
  description?: string;
  progressSummary?: string;
  completedSummary?: string;
  nextStep?: string;
  resourceContext?: string[];
  timeline?: Array<{ at: number; label: string; detail: string }>;
  lastSyncedAt?: number;
  status: TaskStatus;
  effectiveStatus?: TaskStatus;
  runtimeHealth?: TaskRuntimeHealth;
  linkedRuntimeTaskIds?: string[];
  latestRuntimeTaskId?: string;
  latestRunId?: string;
  runtimeTaskSummaries?: RuntimeTaskSummary[];
  archived: boolean;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number | null;
  lastSessionKey?: string;
  flowId?: string;
  flowStatus?: string;
  flowCurrentStep?: string;
  flowCreatedAt?: number;
  flowUpdatedAt?: number;
};

export type TaskDetail = TaskItem;
export type TaskCheckpoint = {
  at: number;
  step: string;
  status: string;
  next?: string;
};

export type TasksState = SessionsState & {
  sessionKey: string;
  tasksLoading: boolean;
  tasksError: string | null;
  tasksItems: TaskItem[];
  archivedTaskItems: TaskItem[];
  tasksSelectedId: string | null;
  tasksBusy: boolean;
};

function mapTask(raw: Record<string, unknown>): TaskItem {
  return {
    taskId: typeof raw.id === "string" ? raw.id.trim() : "",
    title: typeof raw.title === "string" ? raw.title.trim() : "",
    ...(typeof raw.description === "string" && raw.description.trim()
      ? { description: raw.description.trim() }
      : {}),
    status: (raw.status as TaskStatus) ?? "active",
    ...(typeof raw.progressSummary === "string" && raw.progressSummary.trim()
      ? { progressSummary: raw.progressSummary.trim() }
      : {}),
    ...(typeof raw.completedSummary === "string" && raw.completedSummary.trim()
      ? { completedSummary: raw.completedSummary.trim() }
      : {}),
    ...(typeof raw.nextStep === "string" && raw.nextStep.trim() ? { nextStep: raw.nextStep.trim() } : {}),
    ...(Array.isArray(raw.resourceContext)
      ? {
          resourceContext: raw.resourceContext
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter(Boolean)
            .slice(0, 12),
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
              return Number.isFinite(at) && label && detail ? { at, label, detail } : null;
            })
            .filter((entry): entry is { at: number; label: string; detail: string } => Boolean(entry))
            .slice(0, 12),
        }
      : {}),
    ...(Number.isFinite(raw.lastSyncedAt) ? { lastSyncedAt: Number(raw.lastSyncedAt) } : {}),
    ...(typeof raw.effectiveStatus === 'string' ? { effectiveStatus: raw.effectiveStatus as TaskStatus } : {}),
    ...(typeof raw.runtimeHealth === "string"
      ? { runtimeHealth: raw.runtimeHealth as TaskRuntimeHealth }
      : {}),
    ...(Array.isArray(raw.linkedRuntimeTaskIds)
      ? {
          linkedRuntimeTaskIds: raw.linkedRuntimeTaskIds
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter(Boolean)
            .slice(0, 12),
        }
      : {}),
    ...(typeof raw.latestRuntimeTaskId === "string" && raw.latestRuntimeTaskId.trim()
      ? { latestRuntimeTaskId: raw.latestRuntimeTaskId.trim() }
      : {}),
    ...(typeof raw.latestRunId === "string" && raw.latestRunId.trim() ? { latestRunId: raw.latestRunId.trim() } : {}),
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
              } satisfies RuntimeTaskSummary;
            })
            .filter((entry): entry is RuntimeTaskSummary => Boolean(entry))
            .slice(0, 12),
        }
      : {}),
    archived: raw.archived === true,
    createdAt: Number(raw.createdAt ?? Date.now()),
    updatedAt: Number(raw.updatedAt ?? Date.now()),
    archivedAt:
      raw.archivedAt == null || Number.isFinite(raw.archivedAt) ? Number(raw.archivedAt ?? 0) || null : null,
    ...(typeof raw.lastSessionKey === "string" && raw.lastSessionKey.trim()
      ? { lastSessionKey: raw.lastSessionKey.trim() }
      : {}),
    ...(typeof raw.flowId === "string" && raw.flowId.trim() ? { flowId: raw.flowId.trim() } : {}),
    ...((raw.flow && typeof raw.flow === "object")
      ? {
          ...(typeof (raw.flow as Record<string, unknown>).status === "string"
            ? { flowStatus: String((raw.flow as Record<string, unknown>).status) }
            : {}),
          ...(typeof (raw.flow as Record<string, unknown>).currentStep === "string"
            ? { flowCurrentStep: String((raw.flow as Record<string, unknown>).currentStep) }
            : {}),
          ...(Number.isFinite((raw.flow as Record<string, unknown>).createdAt)
            ? { flowCreatedAt: Number((raw.flow as Record<string, unknown>).createdAt) }
            : {}),
          ...(Number.isFinite((raw.flow as Record<string, unknown>).updatedAt)
            ? { flowUpdatedAt: Number((raw.flow as Record<string, unknown>).updatedAt) }
            : {}),
        }
      : {}),
  };
}

async function requestTasks(client: GatewayBrowserClient) {
  return client.request<{ ok: true; tasks?: Array<Record<string, unknown>>; archivedTasks?: Array<Record<string, unknown>> }>(
    "taskmode.list",
    {},
  );
}

function applyTaskIntoStateCollections(state: TasksState, task: TaskItem) {
  const active = state.tasksItems.filter((item) => item.taskId !== task.taskId);
  const archived = state.archivedTaskItems.filter((item) => item.taskId !== task.taskId);
  if (task.archived) {
    state.tasksItems = active;
    state.archivedTaskItems = [task, ...archived];
    return;
  }
  state.tasksItems = [task, ...active];
  state.archivedTaskItems = archived;
}

export async function syncTaskModeTaskProgress(
  state: TasksState,
  taskId: string,
  opts?: { silent?: boolean; reload?: boolean },
) {
  if (!state.client || !state.connected) {
    return null;
  }
  if (!opts?.silent) {
    state.tasksBusy = true;
  }
  try {
    const result = await state.client.request<{ ok: true; task?: Record<string, unknown>; synced?: boolean }>("taskmode.sync", {
      id: taskId,
      sessionKey: state.sessionKey,
    });
    const task = result.task ? mapTask(result.task) : null;
    if (task) {
      applyTaskIntoStateCollections(state, task);
      if (opts?.reload) {
        await loadTaskModeData(state, { autoSyncCurrentTask: false });
      }
    }
    return task;
  } catch (err) {
    state.tasksError = String(err);
    return null;
  } finally {
    if (!opts?.silent) {
      state.tasksBusy = false;
    }
  }
}

async function ensureCurrentSessionVisible(state: TasksState) {
  const hasCurrentSession = state.sessionsResult?.sessions.some((row) => row.key === state.sessionKey) ?? false;
  if (hasCurrentSession) {
    return;
  }
  await loadSessions(state, {
    activeMinutes: 0,
    limit: 0,
    includeGlobal: true,
    includeUnknown: true,
  });
}

export async function loadTaskModeData(state: TasksState, opts?: { autoSyncCurrentTask?: boolean }) {
  if (!state.client || !state.connected) {
    return;
  }
  state.tasksLoading = true;
  state.tasksError = null;
  try {
    await ensureCurrentSessionVisible(state);
    const result = await requestTasks(state.client);
    state.tasksItems = Array.isArray(result.tasks) ? result.tasks.map((task) => mapTask(task)) : [];
    state.archivedTaskItems = Array.isArray(result.archivedTasks)
      ? result.archivedTasks.map((task) => mapTask(task))
      : [];
    const selected = state.tasksSelectedId;
    if (selected) {
      const stillExists = [...state.tasksItems, ...state.archivedTaskItems].some((task) => task.taskId === selected);
      if (!stillExists) {
        state.tasksSelectedId = null;
      }
    }
    const currentTaskId =
      opts?.autoSyncCurrentTask === false
        ? null
        : (state.sessionsResult?.sessions.find((row) => row.key === state.sessionKey)?.taskId ?? null);
    if (currentTaskId) {
      await syncTaskModeTaskProgress(state, currentTaskId, { silent: true, reload: false });
    }
  } catch (err) {
    state.tasksError = String(err);
  } finally {
    state.tasksLoading = false;
  }
}

export async function createTaskForCurrentSession(
  state: TasksState,
  input: { title: string; description?: string },
) {
  if (!state.client || !state.connected) {
    return null;
  }
  state.tasksBusy = true;
  try {
    const created = await state.client.request<{ ok: true; task?: Record<string, unknown> }>("taskmode.create", {
      title: input.title,
      description: input.description,
      sessionKey: state.sessionKey,
    });
    const task = created.task ? mapTask(created.task) : null;
    if (task) {
      await patchSession(state, state.sessionKey, { mode: "task", taskId: task.taskId });
      await loadTaskModeData(state);
    }
    return task;
  } catch (err) {
    state.tasksError = String(err);
    return null;
  } finally {
    state.tasksBusy = false;
  }
}

function applyOptimisticSessionTaskBinding(
  state: TasksState,
  patch: { mode?: "normal" | "task"; taskId?: string | null },
) {
  const result = state.sessionsResult;
  if (!result) {
    return;
  }
  state.sessionsResult = {
    ...result,
    sessions: result.sessions.map((row) => {
      if (row.key !== state.sessionKey) {
        return row;
      }
      const nextMode = patch.mode ?? row.mode ?? "normal";
      const nextTaskId =
        patch.taskId !== undefined ? patch.taskId : nextMode === "normal" ? null : (row.taskId ?? null);
      return {
        ...row,
        mode: nextMode,
        ...(nextTaskId ? { taskId: nextTaskId } : {}),
      };
    }),
  };
}

export async function setCurrentTaskForSession(state: TasksState, taskId: string) {
  state.tasksBusy = true;
  try {
    applyOptimisticSessionTaskBinding(state, { mode: "task", taskId });
    await patchSession(state, state.sessionKey, { mode: "task", taskId });
    await loadTaskModeData(state);
  } finally {
    state.tasksBusy = false;
  }
}

export async function setCurrentSessionMode(state: TasksState, mode: "normal" | "task") {
  const currentSession = state.sessionsResult?.sessions.find((row) => row.key === state.sessionKey);
  state.tasksBusy = true;
  try {
    await patchSession(state, state.sessionKey, {
      mode,
      taskId: mode === "normal" ? null : currentSession?.taskId ?? null,
    });
    if (mode === "task") {
      await loadTaskModeData(state);
    }
  } finally {
    state.tasksBusy = false;
  }
}

export async function updateTaskModeTask(
  state: TasksState,
  taskId: string,
  patch: { title?: string; description?: string | null; status?: TaskStatus },
) {
  if (!state.client || !state.connected) {
    return null;
  }
  state.tasksBusy = true;
  try {
    const result = await state.client.request<{ ok: true; task?: Record<string, unknown> }>("taskmode.update", {
      id: taskId,
      ...patch,
      sessionKey: state.sessionKey,
    });
    await loadTaskModeData(state);
    await state.client.request("sessions.list", {});
    return result.task ? mapTask(result.task) : null;
  } catch (err) {
    state.tasksError = String(err);
    return null;
  } finally {
    state.tasksBusy = false;
  }
}

export async function archiveTaskForSession(state: TasksState, taskId: string) {
  if (!state.client || !state.connected) {
    return;
  }
  state.tasksBusy = true;
  try {
    await state.client.request("taskmode.archive", { id: taskId });
    const currentSession = state.sessionsResult?.sessions.find((row) => row.key === state.sessionKey);
    if (currentSession?.taskId === taskId) {
      await patchSession(state, state.sessionKey, { taskId: null });
    }
    await loadTaskModeData(state);
  } catch (err) {
    state.tasksError = String(err);
  } finally {
    state.tasksBusy = false;
  }
}

export async function restoreArchivedTask(state: TasksState, taskId: string) {
  if (!state.client || !state.connected) {
    return;
  }
  state.tasksBusy = true;
  try {
    await state.client.request("taskmode.restore", { id: taskId });
    await loadTaskModeData(state);
  } catch (err) {
    state.tasksError = String(err);
  } finally {
    state.tasksBusy = false;
  }
}

export async function deleteTaskForSession(state: TasksState, taskId: string) {
  if (!state.client || !state.connected) {
    return;
  }
  state.tasksBusy = true;
  try {
    await state.client.request("taskmode.delete", { id: taskId });
    const currentSession = state.sessionsResult?.sessions.find((row) => row.key === state.sessionKey);
    if (currentSession?.taskId === taskId) {
      await patchSession(state, state.sessionKey, { taskId: null, mode: "normal" });
    }
    await loadTaskModeData(state);
  } catch (err) {
    state.tasksError = String(err);
  } finally {
    state.tasksBusy = false;
  }
}
