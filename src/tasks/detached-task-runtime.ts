import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("tasks/detached-runtime");
const DETACHED_TASK_RECOVERY_WARN_MS = 5_000;

export type DetachedTaskRecoveryAttemptParams = {
  taskId: string;
  runtime: "subagent" | "acp" | "cli" | "cron";
  ownerKey: string;
  childSessionKey?: string;
  runId?: string;
  sourceId?: string;
};

export type DetachedTaskRecoveryAttemptResult = {
  recovered: boolean;
};

export type DetachedTaskLifecycleRuntime = {
  tryRecoverTaskBeforeMarkLost?: (
    params: DetachedTaskRecoveryAttemptParams,
  ) => Promise<DetachedTaskRecoveryAttemptResult>;
};

let detachedTaskLifecycleRuntime: DetachedTaskLifecycleRuntime | null = null;

export function registerDetachedTaskRuntime(runtime: DetachedTaskLifecycleRuntime): void {
  detachedTaskLifecycleRuntime = runtime;
}

export function getDetachedTaskLifecycleRuntime(): DetachedTaskLifecycleRuntime | null {
  return detachedTaskLifecycleRuntime;
}

export function resetDetachedTaskLifecycleRuntimeForTests(): void {
  detachedTaskLifecycleRuntime = null;
}

export async function tryRecoverTaskBeforeMarkLost(
  params: DetachedTaskRecoveryAttemptParams,
): Promise<DetachedTaskRecoveryAttemptResult> {
  const hook = detachedTaskLifecycleRuntime?.tryRecoverTaskBeforeMarkLost;
  if (!hook) {
    return { recovered: false };
  }
  const startedAt = Date.now();
  try {
    const result = await hook(params);
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= DETACHED_TASK_RECOVERY_WARN_MS) {
      log.warn("Detached task recovery hook was slow", {
        taskId: params.taskId,
        runtime: params.runtime,
        elapsedMs,
      });
    }
    if (result && typeof result.recovered === "boolean") {
      return result;
    }
    log.warn("Detached task recovery hook returned invalid result, proceeding with markTaskLost", {
      taskId: params.taskId,
      runtime: params.runtime,
      result,
    });
    return { recovered: false };
  } catch (error) {
    log.warn("Detached task recovery hook threw, proceeding with markTaskLost", {
      taskId: params.taskId,
      runtime: params.runtime,
      elapsedMs: Date.now() - startedAt,
      error,
    });
    return { recovered: false };
  }
}
