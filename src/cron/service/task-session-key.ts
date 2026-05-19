import { DEFAULT_AGENT_ID } from "../../routing/session-key.js";
import { resolveCronAgentSessionKey } from "../isolated-agent/session-key.js";
import type { CronJob } from "../types.js";
import type { CronServiceState } from "./state.js";

export function resolveCronTaskChildSessionKey(params: {
  state: CronServiceState;
  job: CronJob;
}): string | undefined {
  const explicitSessionKey = params.job.sessionKey?.trim();
  if (explicitSessionKey) {
    return explicitSessionKey;
  }
  if (params.job.sessionTarget !== "isolated") {
    return undefined;
  }
  return resolveCronAgentSessionKey({
    sessionKey: `cron:${params.job.id}`,
    agentId: params.job.agentId ?? params.state.deps.defaultAgentId ?? DEFAULT_AGENT_ID,
  });
}
