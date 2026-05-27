import {
  DEFAULT_AGENT_ID,
  normalizeAgentId,
  resolveAgentIdFromSessionKey,
} from "../../routing/session-key.js";
import { normalizeOptionalLowercaseString } from "../../shared/string-coerce.js";
import { resolveCronAgentSessionKey } from "../isolated-agent/session-key.js";
import type { CronJob } from "../types.js";
import type { CronServiceState } from "./state.js";

function normalizeCronLaneSegment(value: string | undefined, fallback: string): string {
  const normalized = normalizeOptionalLowercaseString(value)
    ?.replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return normalized || fallback;
}

export function resolveMainCronRunSessionKey(params: { job: CronJob; startedAt: number }): string {
  const explicitAgentId = params.job.agentId?.trim();
  const agentId = normalizeAgentId(
    explicitAgentId || resolveAgentIdFromSessionKey(params.job.sessionKey),
  );
  const jobSegment = normalizeCronLaneSegment(params.job.id, "job");
  const runSegment = normalizeCronLaneSegment(
    String(Math.max(0, Math.floor(params.startedAt))),
    "run",
  );
  return `agent:${agentId}:cron:${jobSegment}:run:${runSegment}`;
}

export function resolveCronTaskChildSessionKey(params: {
  state: CronServiceState;
  job: CronJob;
  startedAt: number;
}): string | undefined {
  if (params.job.sessionTarget === "main") {
    return resolveMainCronRunSessionKey(params);
  }
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
