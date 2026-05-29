import { emitDiagnosticEvent } from "../infra/diagnostic-events.js";

type LargePayloadBase = {
  surface: string;
  bytes?: number;
  limitBytes?: number;
  count?: number;
  channel?: string;
  pluginId?: string;
  reason?: string;
};

export function logLargePayload(
  params: LargePayloadBase & {
    action: "rejected" | "truncated" | "chunked";
  },
): void {
  emitDiagnosticEvent({
    type: "payload.large",
    ...params,
  });
}

export function logRejectedLargePayload(params: LargePayloadBase): void {
  logLargePayload({
    action: "rejected",
    ...params,
  });
}
