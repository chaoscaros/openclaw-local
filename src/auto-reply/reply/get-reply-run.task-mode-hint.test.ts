import { describe, expect, it } from "vitest";
import { buildTaskModePromptHint, buildTaskModeUserPromptPrefix } from "./get-reply-run.js";

describe("buildTaskModePromptHint", () => {
  it("describes normal sessions explicitly", () => {
    const result = buildTaskModePromptHint({ sessionEntry: { mode: "normal", taskId: "task-1" } });

    expect(result).toContain("Current session mode: normal.");
    expect(result).toContain("This session is not in task mode.");
    expect(result).toContain("Do not infer an active task from older conversation context when the session mode is normal.");
    expect(result).toContain("Any earlier task-binding blocks in the transcript are stale after the mode switch");
    expect(result).toContain("do not answer from a previous task binding");
  });

  it("describes active task mode and current task id", () => {
    const result = buildTaskModePromptHint({ sessionEntry: { mode: "task", taskId: "task-1" } });

    expect(result).toContain("Current session mode: task.");
    expect(result).toContain("Current task id: task-1.");
    expect(result).toContain("Do not describe it as normal chat mode.");
  });

  it("includes task title and summary when provided", () => {
    const result = buildTaskModePromptHint({
      sessionEntry: { mode: "task", taskId: "task-1" },
      taskTitle: "supply_vue项目新增获取商品规格库区列表和获取商品规格库存明细列表接口",
      taskDescription: "补齐任务内容说明并按当前任务回答，不要串到旧 cdj 上下文。",
    });

    expect(result).toContain("Current task title: supply_vue项目新增获取商品规格库区列表和获取商品规格库存明细列表接口.");
    expect(result).toContain("Current task summary: 补齐任务内容说明并按当前任务回答，不要串到旧 cdj 上下文。.");
    expect(result).toContain("answer from the current task title/summary above");
    expect(result).toContain("continue/继续 without naming a task");
    expect(result).toContain("overrides older task references in the transcript");
    expect(result).toContain("ignore the stale task context");
  });

  it("still marks task mode active when no task is selected", () => {
    const result = buildTaskModePromptHint({ sessionEntry: { mode: "task" } });

    expect(result).toContain("Current session mode: task.");
    expect(result).toContain("Current task id: none selected.");
  });
});

describe("buildTaskModeUserPromptPrefix", () => {
  it("injects authoritative current-task context into the user turn", () => {
    const result = buildTaskModeUserPromptPrefix({
      sessionEntry: { mode: "task", taskId: "task-2" },
      taskTitle: "supply_vue项目的分拣管理下的需求更改",
      taskDescription: "查看取货点弹窗、已分拣只读、确认取货并分拣",
    });

    expect(result).toContain("[Current task binding for this turn]");
    expect(result).toContain("Task id: task-2");
    expect(result).toContain("Task title: supply_vue项目的分拣管理下的需求更改");
    expect(result).toContain("Use the task binding above as the task the user is continuing right now.");
    expect(result).toContain("treat those as stale unless the user explicitly switches again");
  });

  it("injects a normal-mode override that disables stale task bindings", () => {
    const result = buildTaskModeUserPromptPrefix({ sessionEntry: { mode: "normal", taskId: "task-1" } });

    expect(result).toContain("[Current task binding for this turn]");
    expect(result).toContain("Task mode is currently off for this session.");
    expect(result).toContain("There is no active task binding for this turn.");
    expect(result).toContain("Ignore any task-binding blocks from earlier turns");
    expect(result).not.toContain("Use the task binding above as the task the user is continuing right now.");
  });
});
