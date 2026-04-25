import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createTaskModeTask,
  createTaskModeTodo,
  deleteTaskModeTask,
  deleteTaskModeTodo,
  listTaskModeTasks,
  restoreTaskModeTask,
  setTaskModeTodoStatus,
  syncTaskModeTaskProgress,
  updateTaskModeTask,
} from "./task-mode-store.js";
import { createTaskRecord, resetTaskRegistryForTests, setTaskTimingById } from "../tasks/task-registry.js";
import { getTaskFlowById, updateFlowRecordByIdExpectedRevision } from "../tasks/task-flow-runtime-internal.js";
import { resolveDefaultSessionStorePath, resolveSessionTranscriptPath } from "../config/sessions.js";

function makeTempStateDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-taskmode-"));
}

describe("task-mode-store", () => {
  const previousStateDir = process.env.OPENCLAW_STATE_DIR;

  afterEach(() => {
    resetTaskRegistryForTests();
    if (previousStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = previousStateDir;
    }
  });

  it("creates and lists active tasks", async () => {
    process.env.OPENCLAW_STATE_DIR = makeTempStateDir();
    const created = await createTaskModeTask({ id: "task-1", title: "Task 1", sessionKey: "main" });
    expect(created.status).toBe("active");
    expect(created.flowId).toBeTruthy();
    const listed = await listTaskModeTasks();
    expect(listed.tasks.map((task) => task.id)).toEqual(["task-1"]);
    expect(listed.archivedTasks).toEqual([]);
  });

  it("keeps managed flow linkage after updates", async () => {
    process.env.OPENCLAW_STATE_DIR = makeTempStateDir();
    const created = await createTaskModeTask({ id: "task-bridge", title: "Bridge task" });
    const updated = await updateTaskModeTask({ id: "task-bridge", status: "paused" });
    expect(updated?.flowId).toBe(created.flowId);
    expect(getTaskFlowById(created.flowId!)).toBeTruthy();
  });

  it("prefers flow goal/currentStep/timestamps when building task views", async () => {
    process.env.OPENCLAW_STATE_DIR = makeTempStateDir();
    const created = await createTaskModeTask({
      id: "task-flow-view",
      title: "Original title",
      description: "original desc",
    });
    const flow = getTaskFlowById(created.flowId!);
    expect(flow).toBeTruthy();
    updateFlowRecordByIdExpectedRevision({
      flowId: flow!.flowId,
      expectedRevision: flow!.revision,
      patch: {
        goal: "Flow title",
        currentStep: "flow step",
        updatedAt: flow!.updatedAt + 10,
      },
    });
    const listed = await listTaskModeTasks();
    const task = listed.tasks.find((item) => item.id === "task-flow-view");
    expect(task?.title).toBe("Flow title");
    expect(task?.description).toBe("flow step");
    expect(task?.updatedAt).toBe(flow!.updatedAt + 10);
    expect(task?.effectiveStatus).toBe("active");
    expect(task?.flow?.currentStep).toBe("flow step");
  });

  it("persists stable fallback task identity for flow-backed tasks", async () => {
    process.env.OPENCLAW_STATE_DIR = makeTempStateDir();
    const created = await createTaskModeTask({ id: "task-compact", title: "Compact title", description: "compact desc" });
    expect(created.flowId).toBeTruthy();
    const storePath = path.join(process.env.OPENCLAW_STATE_DIR, 'control-ui', 'task-mode-store.json');
    const payload = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    const item = payload['tasks'][0];
    expect(item['flowId']).toBe(created.flowId);
    expect(item['title']).toBe('Compact title');
    expect(item['description']).toBe('compact desc');
    expect(typeof item['createdAt']).toBe('number');
    expect(typeof item['updatedAt']).toBe('number');
  });

  it("backfills empty raw task titles from flow goals on load", async () => {
    process.env.OPENCLAW_STATE_DIR = makeTempStateDir();
    const created = await createTaskModeTask({ id: "task-backfill", title: "Original title", description: "orig desc" });
    const flow = getTaskFlowById(created.flowId!);
    expect(flow).toBeTruthy();
    updateFlowRecordByIdExpectedRevision({
      flowId: flow!.flowId,
      expectedRevision: flow!.revision,
      patch: { goal: 'Recovered title from flow' },
    });
    const storePath = path.join(process.env.OPENCLAW_STATE_DIR, 'control-ui', 'task-mode-store.json');
    const payload = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    payload.tasks[0].title = '';
    fs.writeFileSync(storePath, JSON.stringify(payload, null, 2));

    const listed = await listTaskModeTasks();
    const task = listed.tasks.find((item) => item.id === 'task-backfill');
    expect(task?.title).toBe('Recovered title from flow');

    const repaired = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    expect(repaired.tasks[0].title).toBe('Recovered title from flow');
  });

  it("does not overwrite existing raw titles during flow backfill", async () => {
    process.env.OPENCLAW_STATE_DIR = makeTempStateDir();
    const created = await createTaskModeTask({ id: "task-no-overwrite", title: "Keep raw title" });
    const flow = getTaskFlowById(created.flowId!);
    expect(flow).toBeTruthy();
    updateFlowRecordByIdExpectedRevision({
      flowId: flow!.flowId,
      expectedRevision: flow!.revision,
      patch: { goal: 'Flow title should not overwrite raw title' },
    });
    const listed = await listTaskModeTasks();
    const task = listed.tasks.find((item) => item.id === 'task-no-overwrite');
    expect(task?.title).toBe('Flow title should not overwrite raw title');

    const storePath = path.join(process.env.OPENCLAW_STATE_DIR, 'control-ui', 'task-mode-store.json');
    const repaired = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    expect(repaired.tasks[0].title).toBe('Keep raw title');
  });

  it("creates todos and derives next step from the first pending item", async () => {
    process.env.OPENCLAW_STATE_DIR = makeTempStateDir();
    await createTaskModeTask({ id: "task-todo", title: "Todo task" });
    const updated = await createTaskModeTodo({ taskId: "task-todo", todoId: "todo-1", content: "补执行清单" });
    expect(updated?.todoItems?.[0]?.content).toBe("补执行清单");
    const listed = await listTaskModeTasks();
    const task = listed.tasks.find((item) => item.id === "task-todo");
    expect(task?.nextStep).toBe("补执行清单");
  });

  it("ensures only one todo stays in progress", async () => {
    process.env.OPENCLAW_STATE_DIR = makeTempStateDir();
    await createTaskModeTask({ id: "task-todo-progress", title: "Todo progress task" });
    await createTaskModeTodo({ taskId: "task-todo-progress", todoId: "todo-1", content: "旧进行中" });
    await createTaskModeTodo({ taskId: "task-todo-progress", todoId: "todo-2", content: "新进行中" });
    await setTaskModeTodoStatus({ taskId: "task-todo-progress", todoId: "todo-1", status: "in_progress" });
    const updated = await setTaskModeTodoStatus({ taskId: "task-todo-progress", todoId: "todo-2", status: "in_progress" });
    expect(updated?.todoItems?.filter((item) => item.status === 'in_progress')).toHaveLength(1);
    expect(updated?.nextStep).toBe("新进行中");
  });

  it("deletes todos and falls back when no todo remains", async () => {
    process.env.OPENCLAW_STATE_DIR = makeTempStateDir();
    await createTaskModeTask({ id: "task-todo-delete", title: "Todo delete task", description: "fallback desc" });
    await createTaskModeTodo({ taskId: "task-todo-delete", todoId: "todo-1", content: "临时步骤" });
    const updated = await deleteTaskModeTodo({ taskId: "task-todo-delete", todoId: "todo-1" });
    expect(updated?.todoItems).toBeUndefined();
  });

  it("keeps timestamps aligned with flow metadata while retaining persisted fallbacks", async () => {
    process.env.OPENCLAW_STATE_DIR = makeTempStateDir();
    await createTaskModeTask({ id: "task-timestamps", title: "Timestamp task" });
    const storePath = path.join(process.env.OPENCLAW_STATE_DIR, 'control-ui', 'task-mode-store.json');
    const payload = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    const item = payload['tasks'][0];
    expect(typeof item['createdAt']).toBe('number');
    expect(typeof item['updatedAt']).toBe('number');
    const listed = await listTaskModeTasks();
    const task = listed.tasks.find((entry) => entry.id === 'task-timestamps');
    expect(typeof task?.createdAt).toBe('number');
    expect(typeof task?.updatedAt).toBe('number');
    expect(task?.flow?.createdAt).toBe(task?.createdAt);
    expect(task?.flow?.updatedAt).toBe(task?.updatedAt);
  });

  it("maps blocked flow status back to interrupted effective status", async () => {
    process.env.OPENCLAW_STATE_DIR = makeTempStateDir();
    const created = await createTaskModeTask({ id: "task-blocked", title: "Blocked task", description: "waiting" });
    const flow = getTaskFlowById(created.flowId!);
    expect(flow).toBeTruthy();
    updateFlowRecordByIdExpectedRevision({
      flowId: flow!.flowId,
      expectedRevision: flow!.revision,
      patch: {
        status: 'blocked',
        currentStep: 'blocked step',
        updatedAt: flow!.updatedAt + 1,
      },
    });
    const listed = await listTaskModeTasks();
    const task = listed.tasks.find((item) => item.id === 'task-blocked');
    expect(task?.effectiveStatus).toBe('interrupted');
    expect(task?.description).toBe('blocked step');
  });

  it("projects linked runtime task health into task-mode views", async () => {
    process.env.OPENCLAW_STATE_DIR = makeTempStateDir();
    const created = await createTaskModeTask({ id: "task-runtime-health", title: "Runtime health task" });
    const runtimeTask = createTaskRecord({
      runtime: "subagent",
      ownerKey: "main",
      requesterSessionKey: "main",
      scopeKind: "session",
      parentFlowId: created.flowId,
      runId: "run-runtime-health",
      task: "Execute runtime health task",
      status: "running",
      childSessionKey: "agent:solo:child:runtime-health",
    });
    await updateTaskModeTask({ id: "task-runtime-health", description: "runtime linked" });
    const listed = await listTaskModeTasks();
    const task = listed.tasks.find((item) => item.id === "task-runtime-health");
    expect(task?.runtimeHealth).toBe("healthy");
    expect(task?.latestRunId).toBe("run-runtime-health");
    expect(task?.latestRuntimeTaskId).toBe(runtimeTask.taskId);
    expect(task?.linkedRuntimeTaskIds?.length).toBe(1);
  });

  it("persists explicit runtime linkage metadata", async () => {
    process.env.OPENCLAW_STATE_DIR = makeTempStateDir();
    const created = await createTaskModeTask({ id: "task-runtime-persist", title: "Persist runtime linkage" });
    const runtimeTask = createTaskRecord({
      runtime: "subagent",
      ownerKey: "main",
      requesterSessionKey: "main",
      scopeKind: "session",
      parentFlowId: created.flowId,
      runId: "run-runtime-persist",
      task: "Persist runtime linkage execution",
      status: "running",
      childSessionKey: "agent:solo:child:runtime-persist",
    });
    await updateTaskModeTask({ id: "task-runtime-persist", description: "persist runtime linkage" });
    const storePath = path.join(process.env.OPENCLAW_STATE_DIR, 'control-ui', 'task-mode-store.json');
    const payload = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    const item = payload['tasks'].find((entry: { id: string }) => entry.id === 'task-runtime-persist');
    expect(item['linkedRuntimeTaskIds']).toEqual([runtimeTask.taskId]);
    expect(item['latestRuntimeTaskId']).toBe(runtimeTask.taskId);
    expect(item['latestRunId']).toBe('run-runtime-persist');
    expect(item['runtimeTaskSummaries']).toEqual([
      expect.objectContaining({
        taskId: runtimeTask.taskId,
        runtime: 'subagent',
        status: 'running',
        runId: 'run-runtime-persist',
      }),
    ]);
  });

  it("surfaces reconciled lost runtime tasks in task-mode views", async () => {
    process.env.OPENCLAW_STATE_DIR = makeTempStateDir();
    const created = await createTaskModeTask({ id: "task-runtime-lost", title: "Lost runtime task" });
    const runtimeTask = createTaskRecord({
      runtime: "subagent",
      ownerKey: "main",
      requesterSessionKey: "main",
      scopeKind: "session",
      parentFlowId: created.flowId,
      runId: "run-runtime-lost",
      task: "Execute lost runtime task",
      status: "running",
      childSessionKey: "agent:solo:child:runtime-lost",
    });
    setTaskTimingById({
      taskId: runtimeTask.taskId,
      startedAt: Date.now() - 10 * 60_000,
      lastEventAt: Date.now() - 10 * 60_000,
    });
    const listed = await listTaskModeTasks();
    const task = listed.tasks.find((item) => item.id === "task-runtime-lost");
    expect(task?.runtimeHealth).toBe("lost");
  });

  it("syncs task progress from linked local session history", async () => {
    process.env.OPENCLAW_STATE_DIR = makeTempStateDir();
    const now = Date.now();
    const sessionId = "session-progress";
    const storePath = resolveDefaultSessionStorePath();
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(
      storePath,
      JSON.stringify({
        main: {
          sessionId,
          updatedAt: now,
        },
      }),
    );
    const transcriptPath = resolveSessionTranscriptPath(sessionId);
    fs.mkdirSync(path.dirname(transcriptPath), { recursive: true });
    fs.writeFileSync(
      transcriptPath,
      [
        JSON.stringify({ message: { role: "user", timestamp: now - 2000, content: [{ type: "text", text: "继续完成 src/gateway/server-chat.ts 并验证" }] } }),
        JSON.stringify({ message: { role: "assistant", timestamp: now - 1000, content: [{ type: "text", text: "已完成错误恢复修复，并补充 ui/src/ui/app-gateway.ts 回归测试。下一步执行 vitest 验证。" }] } }),
      ].join("\n"),
    );
    await createTaskModeTask({ id: "task-sync", title: "历史同步任务", sessionKey: "main" });

    const synced = await syncTaskModeTaskProgress({ id: "task-sync", sessionKey: "main" });

    expect(synced.synced).toBe(true);
    expect(synced.task?.progressSummary).toContain("已完成错误恢复修复");
    expect(synced.task?.completedSummary).toContain("ui/src/ui/app-gateway.ts");
    expect(synced.task?.nextStep).toContain("继续完成 src/gateway/server-chat.ts 并验证");
    expect(synced.task?.resourceContext).toContain("src/gateway/server-chat.ts");
    expect(synced.task?.timeline?.some((entry) => entry.label === "最近进展")).toBe(true);
  });

  it("aggregates progress across multiple sessions linked to the same task", async () => {
    process.env.OPENCLAW_STATE_DIR = makeTempStateDir();
    const now = Date.now();
    const storePath = resolveDefaultSessionStorePath();
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(
      storePath,
      JSON.stringify({
        main: {
          sessionId: "session-main",
          updatedAt: now - 1000,
          taskId: "task-multi",
        },
        "agent:solo:child": {
          sessionId: "session-child",
          updatedAt: now,
          taskId: "task-multi",
          parentSessionKey: "main",
        },
      }),
    );
    fs.writeFileSync(
      resolveSessionTranscriptPath("session-main"),
      [JSON.stringify({ message: { role: "assistant", timestamp: now - 1500, content: [{ type: "text", text: "已完成网关清理修复。" }] } })].join("\n"),
    );
    fs.writeFileSync(
      resolveSessionTranscriptPath("session-child"),
      [
        JSON.stringify({ message: { role: "user", timestamp: now - 500, content: [{ type: "text", text: "继续补 ui/src/ui/views/tasks.ts 的入口" }] } }),
        JSON.stringify({ message: { role: "assistant", timestamp: now - 100, content: [{ type: "text", text: "已补上 ui/src/ui/views/tasks.ts 与 ui/src/ui/controllers/tasks.ts 的同步入口。" }] } }),
      ].join("\n"),
    );
    await createTaskModeTask({ id: "task-multi", title: "多 session 聚合任务", sessionKey: "main" });

    const synced = await syncTaskModeTaskProgress({ id: "task-multi", sessionKey: "main" });

    expect(synced.synced).toBe(true);
    expect(synced.task?.completedSummary).toContain("已完成网关清理修复");
    expect(synced.task?.progressSummary).toContain("ui/src/ui/views/tasks.ts");
    expect(synced.task?.nextStep).toContain("继续补 ui/src/ui/views/tasks.ts 的入口");
    expect(synced.task?.resourceContext).toContain("ui/src/ui/controllers/tasks.ts");
  });

  it("restores archived tasks without resetting business status", async () => {
    process.env.OPENCLAW_STATE_DIR = makeTempStateDir();
    await createTaskModeTask({ id: "task-restore", title: "Restore task" });
    await updateTaskModeTask({ id: "task-restore", status: "completed", archived: true });
    const restored = await restoreTaskModeTask("task-restore");
    expect(restored?.archived).toBe(false);
    expect(restored?.archivedAt).toBeNull();
    expect(restored?.status).toBe("completed");
    const listed = await listTaskModeTasks();
    const task = listed.tasks.find((item) => item.id === "task-restore");
    expect(task?.status).toBe("completed");
  });

  it("marks ended tasks as archived automatically", async () => {
    process.env.OPENCLAW_STATE_DIR = makeTempStateDir();
    await createTaskModeTask({ id: "task-2", title: "Task 2" });
    const updated = await updateTaskModeTask({ id: "task-2", status: "ended" });
    expect(updated?.status).toBe("ended");
    expect(updated?.archived).toBe(true);
    expect(updated?.flowId).toBeTruthy();
    expect(getTaskFlowById(updated!.flowId!)).toBeTruthy();
    const listed = await listTaskModeTasks();
    expect(listed.tasks).toEqual([]);
    expect(listed.archivedTasks.map((task) => task.id)).toEqual(["task-2"]);
  });

  it("deletes task-mode tasks", async () => {
    process.env.OPENCLAW_STATE_DIR = makeTempStateDir();
    await createTaskModeTask({ id: "task-delete", title: "Delete me" });
    const removed = await deleteTaskModeTask("task-delete");
    expect(removed).toBe(true);
    const listed = await listTaskModeTasks();
    expect(listed.tasks.find((task) => task.id === "task-delete")).toBeUndefined();
  });
});
