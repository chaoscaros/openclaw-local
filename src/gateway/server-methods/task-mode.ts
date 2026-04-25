import { randomUUID } from "node:crypto";
import { errorShape, ErrorCodes } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";
import {
  archiveTaskModeTask,
  createTaskModeTask,
  createTaskModeTodo,
  deleteTaskModeTask,
  deleteTaskModeTodo,
  getTaskModeTask,
  listTaskModeTasks,
  restoreTaskModeTask,
  setTaskModeTodoStatus,
  syncTaskModeTaskProgress,
  updateTaskModeTask,
  updateTaskModeTodo,
  type TaskModeStatus,
  type TaskModeTodoPriority,
  type TaskModeTodoStatus,
} from "../task-mode-store.js";

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalStatus(value: unknown): TaskModeStatus | null {
  return value === "active" ||
    value === "paused" ||
    value === "interrupted" ||
    value === "completed" ||
    value === "ended"
    ? value
    : null;
}

function readOptionalTodoStatus(value: unknown): TaskModeTodoStatus | null {
  return value === "pending" || value === "in_progress" || value === "completed" || value === "cancelled"
    ? value
    : null;
}

function readOptionalTodoPriority(value: unknown): TaskModeTodoPriority | null {
  return value === "low" || value === "normal" || value === "high" ? value : null;
}

export const taskModeHandlers: GatewayRequestHandlers = {
  "taskmode.list": async ({ respond }) => {
    const result = await listTaskModeTasks();
    respond(true, { ok: true, ...result });
  },
  "taskmode.get": async ({ params, respond }) => {
    const id = readString(params.id);
    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    const task = await getTaskModeTask(id);
    respond(true, { ok: true, task });
  },
  "taskmode.create": async ({ params, respond }) => {
    const title = readString(params.title);
    if (!title) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "title required"));
      return;
    }
    const task = await createTaskModeTask({
      id: randomUUID(),
      title,
      description: readString(params.description) || undefined,
      sessionKey: readString(params.sessionKey) || undefined,
    });
    respond(true, { ok: true, task });
  },
  "taskmode.update": async ({ params, respond }) => {
    const id = readString(params.id);
    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    const status = params.status === undefined ? undefined : readOptionalStatus(params.status);
    if (params.status !== undefined && !status) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "invalid status"));
      return;
    }
    const task = await updateTaskModeTask({
      id,
      ...(params.title !== undefined ? { title: readString(params.title) } : {}),
      ...(params.description !== undefined
        ? { description: typeof params.description === "string" ? params.description : null }
        : {}),
      ...(status ? { status } : {}),
      ...(typeof params.archived === "boolean" ? { archived: params.archived } : {}),
      sessionKey: readString(params.sessionKey) || undefined,
    });
    if (!task) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "task not found"));
      return;
    }
    respond(true, { ok: true, task });
  },
  "taskmode.sync": async ({ params, respond }) => {
    const id = readString(params.id);
    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    const result = await syncTaskModeTaskProgress({
      id,
      sessionKey: readString(params.sessionKey) || undefined,
    });
    if (!result.task) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "task not found"));
      return;
    }
    respond(true, { ok: true, task: result.task, synced: result.synced });
  },
  "taskmode.archive": async ({ params, respond }) => {
    const id = readString(params.id);
    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    const task = await archiveTaskModeTask(id);
    if (!task) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "task not found"));
      return;
    }
    respond(true, { ok: true, task });
  },
  "taskmode.restore": async ({ params, respond }) => {
    const id = readString(params.id);
    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    const task = await restoreTaskModeTask(id);
    if (!task) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "task not found"));
      return;
    }
    respond(true, { ok: true, task });
  },
  "taskmode.delete": async ({ params, respond }) => {
    const id = readString(params.id);
    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    const removed = await deleteTaskModeTask(id);
    if (!removed) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "task not found"));
      return;
    }
    respond(true, { ok: true, id });
  },
  "taskmode.todo.create": async ({ params, respond }) => {
    const taskId = readString(params.taskId);
    const content = readString(params.content);
    if (!taskId || !content) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskId and content required"));
      return;
    }
    const priority = params.priority === undefined ? undefined : readOptionalTodoPriority(params.priority);
    if (params.priority !== undefined && !priority) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "invalid priority"));
      return;
    }
    const task = await createTaskModeTodo({
      taskId,
      todoId: randomUUID(),
      content,
      ...(priority ? { priority } : {}),
      note: readString(params.note) || undefined,
      verification: readString(params.verification) || undefined,
      source: "user",
    });
    if (!task) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "task not found"));
      return;
    }
    respond(true, { ok: true, task });
  },
  "taskmode.todo.update": async ({ params, respond }) => {
    const taskId = readString(params.taskId);
    const todoId = readString(params.todoId);
    if (!taskId || !todoId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskId and todoId required"));
      return;
    }
    const priority = params.priority === undefined ? undefined : readOptionalTodoPriority(params.priority);
    if (params.priority !== undefined && !priority) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "invalid priority"));
      return;
    }
    const task = await updateTaskModeTodo({
      taskId,
      todoId,
      ...(params.content !== undefined ? { content: readString(params.content) } : {}),
      ...(priority ? { priority } : {}),
      ...(params.note !== undefined ? { note: typeof params.note === "string" ? params.note : null } : {}),
      ...(params.verification !== undefined
        ? { verification: typeof params.verification === "string" ? params.verification : null }
        : {}),
    });
    if (!task) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "task or todo not found"));
      return;
    }
    respond(true, { ok: true, task });
  },
  "taskmode.todo.setStatus": async ({ params, respond }) => {
    const taskId = readString(params.taskId);
    const todoId = readString(params.todoId);
    const status = readOptionalTodoStatus(params.status);
    if (!taskId || !todoId || !status) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskId, todoId, and valid status required"));
      return;
    }
    const task = await setTaskModeTodoStatus({ taskId, todoId, status });
    if (!task) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "task or todo not found"));
      return;
    }
    respond(true, { ok: true, task });
  },
  "taskmode.todo.delete": async ({ params, respond }) => {
    const taskId = readString(params.taskId);
    const todoId = readString(params.todoId);
    if (!taskId || !todoId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskId and todoId required"));
      return;
    }
    const task = await deleteTaskModeTodo({ taskId, todoId });
    if (!task) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "task or todo not found"));
      return;
    }
    respond(true, { ok: true, task });
  },
};
