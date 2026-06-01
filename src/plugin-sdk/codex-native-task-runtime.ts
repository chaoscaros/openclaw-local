// Private helper surface for the bundled Codex plugin. This lets the Codex
// app-server mirror native subagents into OpenClaw tasks without exposing
// broad task mutation APIs as a public third-party plugin contract.

import {
  completeTaskRunByRunId,
  createRunningTaskRun,
  failTaskRunByRunId,
  recordTaskRunProgressByRunId,
} from "../tasks/task-executor.js";

export {
  CODEX_NATIVE_SUBAGENT_RUN_ID_PREFIX,
  CODEX_NATIVE_SUBAGENT_RUNTIME,
  CODEX_NATIVE_SUBAGENT_STALE_ERROR,
  CODEX_NATIVE_SUBAGENT_TASK_KIND,
} from "../tasks/codex-native-subagent-task.js";

export {
  completeTaskRunByRunId,
  createRunningTaskRun,
  failTaskRunByRunId,
  recordTaskRunProgressByRunId,
};

export function finalizeTaskRunByRunId(
  params:
    | (Parameters<typeof completeTaskRunByRunId>[0] & {
        status: "succeeded";
      })
    | (Parameters<typeof failTaskRunByRunId>[0] & {
        status: "failed" | "timed_out" | "cancelled";
      }),
) {
  if (params.status === "succeeded") {
    const { status: _status, ...rest } = params;
    return completeTaskRunByRunId(rest);
  }
  return failTaskRunByRunId(params);
}
