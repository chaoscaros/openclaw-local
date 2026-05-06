import type { CronRunOutcome, CronRunTelemetry } from "../types.js";

export type RunCronAgentTurnResult = {
  /** Last non-empty agent text output (not truncated). */
  outputText?: string;
  /**
   * `true` when the isolated runner already handled the run's user-visible
   * delivery outcome, either through runner fallback delivery, explicit
   * suppression, or a matching message-tool send that already reached the
   * target.
   */
  delivered?: boolean;
  /**
   * `true` when cron attempted announce/direct delivery for this run.
   * This is tracked separately from `delivered` because some announce paths
   * cannot guarantee a final delivery ack synchronously.
   */
  deliveryAttempted?: boolean;
  /** Optional delivery trace for cron routing/debugging. */
  delivery?: {
    resolved?: {
      ok: boolean;
      channel?: string;
      to?: string;
      accountId?: string;
      source?: string;
      error?: string;
    };
    messageToolSentTo?: Array<{
      channel: string;
      to?: string;
      accountId?: string;
    }>;
  };
} & CronRunOutcome &
  CronRunTelemetry;
