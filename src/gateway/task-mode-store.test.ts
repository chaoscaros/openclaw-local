import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createTaskModeTask,
  deleteTaskModeTask,
  listTaskModeTasks,
  restoreTaskModeTask,
  updateTaskModeTask,
} from "./task-mode-store.js";
import { getTaskFlowById, updateFlowRecordByIdExpectedRevision } from "../tasks/task-flow-runtime-internal.js";

function makeTempStateDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-taskmode-"));
}

describe("task-mode-store", () => {
  const previousStateDir = process.env.OPENCLAW_STATE_DIR;

  afterEach(() => {
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

  it("persists flow-backed tasks without redundant title/description/timestamp fields", async () => {
    process.env.OPENCLAW_STATE_DIR = makeTempStateDir();
    const created = await createTaskModeTask({ id: "task-compact", title: "Compact title", description: "compact desc" });
    expect(created.flowId).toBeTruthy();
    const storePath = path.join(process.env.OPENCLAW_STATE_DIR!, 'control-ui', 'task-mode-store.json');
    const payload = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    const item = payload['tasks'][0];
    expect(item['flowId']).toBe(created.flowId);
    expect('title' in item).toBe(false);
    expect('description' in item).toBe(false);
    expect('createdAt' in item).toBe(false);
    expect('updatedAt' in item).toBe(false);
  });

  it("backfills timestamps from flow when persisted task omits them", async () => {
    process.env.OPENCLAW_STATE_DIR = makeTempStateDir();
    const created = await createTaskModeTask({ id: "task-timestamps", title: "Timestamp task" });
    const storePath = path.join(process.env.OPENCLAW_STATE_DIR!, 'control-ui', 'task-mode-store.json');
    const payload = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    const item = payload['tasks'][0];
    expect('createdAt' in item).toBe(false);
    expect('updatedAt' in item).toBe(false);
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
