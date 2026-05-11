import {
  applyReviewBundle,
  applyReviewBundleFile,
  getPendingReviewBySession,
  getPendingReviewBySessionAndRun,
  getReviewById,
  revertReviewBundle,
  revertReviewBundleFile,
  serializeReviewBundle,
} from "../change-review-store.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateChangeReviewIdParams,
  validateChangeReviewSessionParams,
} from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

function validateSessionKey(params: Record<string, unknown>): string | null {
  if (!validateChangeReviewSessionParams(params)) {
    return null;
  }
  const sessionKey = typeof params.sessionKey === "string" ? params.sessionKey.trim() : "";
  return sessionKey || null;
}

function validateReviewId(params: Record<string, unknown>): string | null {
  if (!validateChangeReviewIdParams(params)) {
    return null;
  }
  const id = typeof params.id === "string" ? params.id.trim() : "";
  return id || null;
}

export const changeReviewHandlers: GatewayRequestHandlers = {
  "changeReview.capture": async ({ params, respond }) => {
    const sessionKey = validateSessionKey(params);
    const runId = typeof params.runId === "string" ? params.runId.trim() : "";
    if (!sessionKey) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          formatValidationErrors(validateChangeReviewSessionParams.errors ?? []),
        ),
      );
      return;
    }
    try {
      const bundle = getPendingReviewBySessionAndRun(sessionKey, runId || undefined);
      respond(true, serializeReviewBundle(bundle), undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `change review capture failed: ${String(err)}`),
      );
    }
  },
  "changeReview.status": ({ params, respond }) => {
    const sessionKey = validateSessionKey(params);
    if (!sessionKey) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          formatValidationErrors(validateChangeReviewSessionParams.errors ?? []),
        ),
      );
      return;
    }
    respond(true, serializeReviewBundle(getPendingReviewBySession(sessionKey)), undefined);
  },
  "changeReview.apply": ({ params, respond }) => {
    const id = validateReviewId(params);
    const filePath = typeof params.path === "string" ? params.path.trim() : "";
    if (!id) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          formatValidationErrors(validateChangeReviewIdParams.errors ?? []),
        ),
      );
      return;
    }
    const review = getReviewById(id);
    if (!review) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid changeReview.apply params: unknown id"),
      );
      return;
    }
    (filePath ? applyReviewBundleFile(id, filePath) : applyReviewBundle(id))
      .then(() => {
        respond(true, { ok: true, applied: true }, undefined);
      })
      .catch((err) => {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, `change review apply failed: ${String(err)}`),
        );
      });
  },
  "changeReview.revert": async ({ params, respond }) => {
    const id = validateReviewId(params);
    const filePath = typeof params.path === "string" ? params.path.trim() : "";
    if (!id) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          formatValidationErrors(validateChangeReviewIdParams.errors ?? []),
        ),
      );
      return;
    }
    const review = getReviewById(id);
    if (!review) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid changeReview.revert params: unknown id"),
      );
      return;
    }
    try {
      await (filePath ? revertReviewBundleFile(id, filePath) : revertReviewBundle(id));
      respond(true, { ok: true, reverted: true }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `change review revert failed: ${String(err)}`),
      );
    }
  },
};
