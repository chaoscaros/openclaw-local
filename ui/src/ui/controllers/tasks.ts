import type { GatewayBrowserClient } from "../gateway.ts";
import { patchSession, type SessionsState } from "./sessions.ts";

export type TaskStatus = "active" | "paused" | "interrupted" | "completed" | "ended";

export type TaskItem = {
  taskId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  effectiveStatus?: TaskStatus;
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
    taskId: String(raw.id ?? "").trim(),
    title: String(raw.title ?? "").trim(),
    ...(typeof raw.description === "string" && raw.description.trim()
      ? { description: raw.description.trim() }
      : {}),
    status: (raw.status as TaskStatus) ?? "active",
    ...(typeof raw.effectiveStatus === 'string' ? { effectiveStatus: raw.effectiveStatus as TaskStatus } : {}),
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

export async function loadTaskModeData(state: TasksState) {
  if (!state.client || !state.connected) {
    return;
  }
  state.tasksLoading = true;
  state.tasksError = null;
  try {
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
        taskId: nextTaskId,
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
