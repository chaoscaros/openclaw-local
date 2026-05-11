import type { EmbeddedRunTrigger } from "./params.js";

export function buildEmbeddedAttemptToolRunContext(params: {
  trigger?: EmbeddedRunTrigger;
  memoryFlushWritePath?: string;
  changeReviewModeEnabled?: boolean;
}): {
  trigger?: EmbeddedRunTrigger;
  memoryFlushWritePath?: string;
  changeReviewModeEnabled?: boolean;
} {
  return {
    trigger: params.trigger,
    memoryFlushWritePath: params.memoryFlushWritePath,
    changeReviewModeEnabled: params.changeReviewModeEnabled,
  };
}
