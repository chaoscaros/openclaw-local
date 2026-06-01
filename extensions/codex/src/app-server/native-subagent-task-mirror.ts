import {
  CODEX_NATIVE_SUBAGENT_RUN_ID_PREFIX,
  CODEX_NATIVE_SUBAGENT_RUNTIME,
  CODEX_NATIVE_SUBAGENT_TASK_KIND,
  createRunningTaskRun,
  finalizeTaskRunByRunId,
  recordTaskRunProgressByRunId,
} from "openclaw/plugin-sdk/codex-native-task-runtime";
import type { CodexServerNotification, JsonObject, JsonValue } from "./protocol.js";
import { isJsonObject } from "./protocol.js";

export type TaskLifecycleRuntime = {
  createRunningTaskRun: typeof createRunningTaskRun;
  recordTaskRunProgressByRunId: typeof recordTaskRunProgressByRunId;
  finalizeTaskRunByRunId: typeof finalizeTaskRunByRunId;
};

export type CodexNativeSubagentTaskMirrorParams = {
  parentThreadId: string;
  requesterSessionKey?: string;
  agentId?: string;
  now?: () => number;
};

const defaultRuntime: TaskLifecycleRuntime = {
  createRunningTaskRun,
  recordTaskRunProgressByRunId,
  finalizeTaskRunByRunId,
};

export class CodexNativeSubagentTaskMirror {
  private readonly mirroredThreadIds = new Set<string>();
  private readonly terminalRunIds = new Set<string>();
  private readonly now: () => number;

  constructor(
    private readonly params: CodexNativeSubagentTaskMirrorParams,
    private readonly runtime: TaskLifecycleRuntime = defaultRuntime,
  ) {
    this.now = params.now ?? Date.now;
  }

  handleNotification(notification: CodexServerNotification): void {
    const params = isJsonObject(notification.params) ? notification.params : undefined;
    if (!params) {
      return;
    }
    if (notification.method === "thread/started") {
      this.handleThreadStarted(params);
      return;
    }
    if (notification.method === "thread/status/changed") {
      this.handleThreadStatusChanged(params);
      return;
    }
    if (notification.method === "item/started" || notification.method === "item/completed") {
      this.handleCollabAgentItem(params);
    }
  }

  private handleThreadStarted(params: JsonObject): void {
    const thread = readObject(params.thread);
    if (!thread) {
      return;
    }
    const source = readObject(thread.source);
    const subAgent = readObject(source?.subAgent);
    const spawn = readObject(subAgent?.thread_spawn);
    if (readString(spawn, "parent_thread_id") !== this.params.parentThreadId) {
      return;
    }
    const threadId = readString(thread, "id");
    if (!threadId || this.mirroredThreadIds.has(threadId)) {
      return;
    }
    this.mirroredThreadIds.add(threadId);
    const runId = codexNativeSubagentRunId(threadId);
    const label =
      trimOptional(readString(spawn, "agent_nickname")) ??
      trimOptional(readString(thread, "agentNickname")) ??
      trimOptional(readString(spawn, "agent_role")) ??
      trimOptional(readString(thread, "agentRole")) ??
      "Codex subagent";
    const task =
      trimOptional(readString(thread, "preview")) ??
      `Codex native subagent${label === "Codex subagent" ? "" : ` ${label}`}`;
    const createdAt = secondsToMillis(readNumber(thread, "createdAt")) ?? this.now();
    this.runtime.createRunningTaskRun({
      runtime: CODEX_NATIVE_SUBAGENT_RUNTIME,
      taskKind: CODEX_NATIVE_SUBAGENT_TASK_KIND,
      sourceId: runId,
      requesterSessionKey: this.params.requesterSessionKey,
      ...(this.params.requesterSessionKey
        ? {
            ownerKey: this.params.requesterSessionKey,
            scopeKind: "session" as const,
          }
        : {}),
      agentId: this.params.agentId,
      runId,
      label,
      task,
      notifyPolicy: "silent",
      deliveryStatus: "not_applicable",
      preferMetadata: true,
      startedAt: createdAt,
      lastEventAt: this.now(),
      progressSummary: "Codex native subagent started.",
    });
    this.applyThreadStatus(threadId, readObject(thread.status));
  }

  private handleThreadStatusChanged(params: JsonObject): void {
    const threadId = readString(params, "threadId");
    if (!threadId) {
      return;
    }
    this.applyThreadStatus(threadId, readObject(params.status));
  }

  private applyThreadStatus(threadId: string, status: JsonObject | undefined): void {
    const statusType = readString(status, "type");
    if (!statusType) {
      return;
    }
    const runId = codexNativeSubagentRunId(threadId);
    if (this.terminalRunIds.has(runId) && statusType !== "systemError") {
      return;
    }
    const eventAt = this.now();
    if (statusType === "active") {
      this.runtime.recordTaskRunProgressByRunId({
        runId,
        runtime: CODEX_NATIVE_SUBAGENT_RUNTIME,
        lastEventAt: eventAt,
        progressSummary: "Codex native subagent is active.",
      });
      return;
    }
    if (statusType === "idle") {
      this.terminalRunIds.add(runId);
      this.runtime.finalizeTaskRunByRunId({
        runId,
        runtime: CODEX_NATIVE_SUBAGENT_RUNTIME,
        status: "succeeded",
        endedAt: eventAt,
        lastEventAt: eventAt,
        progressSummary: "Codex native subagent is idle.",
        terminalSummary: "Codex native subagent finished.",
      });
      return;
    }
    if (statusType === "systemError") {
      this.terminalRunIds.add(runId);
      this.runtime.finalizeTaskRunByRunId({
        runId,
        runtime: CODEX_NATIVE_SUBAGENT_RUNTIME,
        status: "failed",
        endedAt: eventAt,
        lastEventAt: eventAt,
        error: "Codex app-server reported a system error for the native subagent thread.",
        progressSummary: "Codex native subagent hit a system error.",
        terminalSummary: "Codex native subagent failed.",
      });
      return;
    }
    if (statusType === "notLoaded") {
      this.runtime.recordTaskRunProgressByRunId({
        runId,
        runtime: CODEX_NATIVE_SUBAGENT_RUNTIME,
        lastEventAt: eventAt,
        progressSummary: "Codex native subagent is not loaded.",
      });
    }
  }

  private handleCollabAgentItem(params: JsonObject): void {
    const item = readObject(params.item);
    if (!item || readString(item, "type") !== "collabAgentToolCall") {
      return;
    }
    if (readString(item, "senderThreadId") !== this.params.parentThreadId) {
      return;
    }
    const receiverThreadIds = readStringArray(item.receiverThreadIds);
    const isSpawnAgentTool = normalizeToolName(readString(item, "tool")) === "spawnagent";
    if (isSpawnAgentTool) {
      for (const receiverThreadId of receiverThreadIds) {
        this.createTaskFromCollabSpawnItem(receiverThreadId, item);
      }
    }
    const agentsStates = readAgentsStates(item.agentsStates);
    const toolCallStatus = normalizeCollabToolCallStatus(readString(item, "status"));
    const terminalToolCallThreadIds = new Set<string>();
    if (isSpawnAgentTool && isBlockedOrFailedCollabToolCallStatus(toolCallStatus)) {
      for (const threadId of receiverThreadIds) {
        terminalToolCallThreadIds.add(threadId);
      }
      for (const threadId of agentsStates.keys()) {
        terminalToolCallThreadIds.add(threadId);
      }
    }
    const terminalAgentStateThreadIds = new Set<string>();
    for (const [threadId, state] of agentsStates) {
      const normalizedStatus = normalizeAgentStateStatus(state.status);
      if (
        terminalToolCallThreadIds.has(threadId) &&
        isNonTerminalAgentStateStatus(normalizedStatus)
      ) {
        continue;
      }
      this.applyCollabAgentStatus(threadId, normalizedStatus, state.message);
      if (isTerminalAgentStateStatus(normalizedStatus)) {
        terminalAgentStateThreadIds.add(threadId);
      }
    }
    if (isBlockedOrFailedCollabToolCallStatus(toolCallStatus)) {
      for (const threadId of terminalToolCallThreadIds) {
        if (terminalAgentStateThreadIds.has(threadId)) {
          continue;
        }
        const state = agentsStates.get(threadId);
        this.applyCollabAgentStatus(threadId, toolCallStatus, state?.message);
      }
    }
  }

  private createTaskFromCollabSpawnItem(threadId: string, item: JsonObject): void {
    const normalizedThreadId = threadId.trim();
    if (!normalizedThreadId || this.mirroredThreadIds.has(normalizedThreadId)) {
      return;
    }
    this.mirroredThreadIds.add(normalizedThreadId);
    const prompt = trimOptional(readString(item, "prompt"));
    const runId = codexNativeSubagentRunId(normalizedThreadId);
    const createdAt = this.now();
    this.runtime.createRunningTaskRun({
      runtime: CODEX_NATIVE_SUBAGENT_RUNTIME,
      taskKind: CODEX_NATIVE_SUBAGENT_TASK_KIND,
      sourceId: runId,
      requesterSessionKey: this.params.requesterSessionKey,
      ...(this.params.requesterSessionKey
        ? {
            ownerKey: this.params.requesterSessionKey,
            scopeKind: "session" as const,
          }
        : {}),
      agentId: this.params.agentId,
      runId,
      label: "Codex subagent",
      task: prompt ?? "Codex native subagent",
      notifyPolicy: "silent",
      deliveryStatus: "not_applicable",
      preferMetadata: true,
      startedAt: createdAt,
      lastEventAt: createdAt,
      progressSummary: "Codex native subagent spawned.",
    });
  }

  private applyCollabAgentStatus(
    threadId: string,
    status: NormalizedCollabAgentStatus | undefined,
    message: string | undefined,
  ): void {
    const runId = codexNativeSubagentRunId(threadId);
    const eventAt = this.now();
    if (status === "completed" || status === "success") {
      this.terminalRunIds.add(runId);
      const summary = message ?? "Codex native subagent completed.";
      this.runtime.finalizeTaskRunByRunId({
        runId,
        runtime: CODEX_NATIVE_SUBAGENT_RUNTIME,
        status: "succeeded",
        endedAt: eventAt,
        lastEventAt: eventAt,
        progressSummary: summary,
        terminalSummary: summary,
      });
      return;
    }
    if (status === "failed" || status === "blocked") {
      this.terminalRunIds.add(runId);
      const summary =
        message ??
        (status === "blocked" ? "Codex native subagent blocked." : "Codex native subagent failed.");
      this.runtime.finalizeTaskRunByRunId({
        runId,
        runtime: CODEX_NATIVE_SUBAGENT_RUNTIME,
        status: status === "blocked" ? "succeeded" : "failed",
        endedAt: eventAt,
        lastEventAt: eventAt,
        ...(status === "failed" ? { error: summary } : {}),
        progressSummary: summary,
        terminalSummary: summary,
        ...(status === "blocked" ? { terminalOutcome: "blocked" as const } : {}),
      });
      return;
    }
    const progressSummary =
      message ??
      (status === "pendingInit" || status === "pending_init"
        ? "Codex native subagent is initializing."
        : "Codex native subagent is running.");
    this.runtime.recordTaskRunProgressByRunId({
      runId,
      runtime: CODEX_NATIVE_SUBAGENT_RUNTIME,
      lastEventAt: eventAt,
      progressSummary,
    });
  }
}

export function codexNativeSubagentRunId(threadId: string): string {
  return `${CODEX_NATIVE_SUBAGENT_RUN_ID_PREFIX}${threadId}`;
}

type NormalizedCollabAgentStatus =
  | "blocked"
  | "completed"
  | "failed"
  | "pendingInit"
  | "pending_init"
  | "running"
  | "success";

function readAgentsStates(value: JsonValue | undefined): Map<string, AgentState> {
  const result = new Map<string, AgentState>();
  const record = readObject(value);
  if (!record) {
    return result;
  }
  for (const [threadId, stateValue] of Object.entries(record)) {
    const state = readObject(stateValue);
    if (!state) {
      continue;
    }
    result.set(threadId, {
      status: readString(state, "status"),
      message: trimOptional(readString(state, "message")),
    });
  }
  return result;
}

type AgentState = {
  status?: string;
  message?: string;
};

function normalizeAgentStateStatus(status: string | undefined): NormalizedCollabAgentStatus {
  const normalized = normalizeToolName(status);
  if (normalized === "success") {
    return "success";
  }
  if (normalized === "completed" || normalized === "complete" || normalized === "done") {
    return "completed";
  }
  if (normalized === "failed" || normalized === "failure" || normalized === "error") {
    return "failed";
  }
  if (normalized === "blocked") {
    return "blocked";
  }
  if (normalized === "pendinginit" || normalized === "pending_init") {
    return "pendingInit";
  }
  return "running";
}

function normalizeCollabToolCallStatus(status: string | undefined): NormalizedCollabAgentStatus {
  const normalized = normalizeToolName(status);
  if (normalized === "blocked") {
    return "blocked";
  }
  if (normalized === "failed" || normalized === "failure" || normalized === "error") {
    return "failed";
  }
  if (normalized === "completed" || normalized === "complete" || normalized === "done") {
    return "completed";
  }
  return "running";
}

function isBlockedOrFailedCollabToolCallStatus(
  status: NormalizedCollabAgentStatus | undefined,
): boolean {
  return status === "blocked" || status === "failed";
}

function isTerminalAgentStateStatus(status: NormalizedCollabAgentStatus | undefined): boolean {
  return (
    status === "completed" || status === "success" || status === "failed" || status === "blocked"
  );
}

function isNonTerminalAgentStateStatus(status: NormalizedCollabAgentStatus | undefined): boolean {
  return !isTerminalAgentStateStatus(status);
}

function readObject(value: JsonValue | undefined): JsonObject | undefined {
  return isJsonObject(value) ? value : undefined;
}

function readString(record: JsonObject | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNumber(record: JsonObject | undefined, key: string): number | undefined {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (entry): entry is string => typeof entry === "string" && Boolean(entry.trim()),
  );
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function secondsToMillis(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 1000) : undefined;
}

function normalizeToolName(value: string | undefined): string {
  return (
    value
      ?.trim()
      .replaceAll(/[-_\s]/g, "")
      .toLowerCase() ?? ""
  );
}
