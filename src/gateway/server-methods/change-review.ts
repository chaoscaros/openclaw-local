import {
  applyReviewBundle,
  applyReviewBundleFile,
  applyReviewBundleGroup,
  applyReviewBundleHunk,
  getFreshPendingReviewBySession,
  getFreshPendingReviewBySessionAndRun,
  getReviewById,
  revertReviewBundle,
  revertReviewBundleFile,
  revertReviewBundleGroup,
  revertReviewBundleHunk,
  serializeReviewBundle,
} from "../change-review-store.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateChangeReviewGroupParams,
  validateChangeReviewHunkParams,
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

function validateReviewHunkParams(
  params: Record<string, unknown>,
): { id: string; path: string; hunkId: string } | null {
  if (!validateChangeReviewHunkParams(params)) {
    return null;
  }
  const id = typeof params.id === "string" ? params.id.trim() : "";
  const path = typeof params.path === "string" ? params.path.trim() : "";
  const hunkId = typeof params.hunkId === "string" ? params.hunkId.trim() : "";
  if (!id || !path || !hunkId) {
    return null;
  }
  return { id, path, hunkId };
}

function validateReviewGroupParams(
  params: Record<string, unknown>,
): { id: string; path: string; groupId: string } | null {
  if (!validateChangeReviewGroupParams(params)) {
    return null;
  }
  const id = typeof params.id === "string" ? params.id.trim() : "";
  const path = typeof params.path === "string" ? params.path.trim() : "";
  const groupId = typeof params.groupId === "string" ? params.groupId.trim() : "";
  if (!id || !path || !groupId) {
    return null;
  }
  return { id, path, groupId };
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
      const bundle = await getFreshPendingReviewBySessionAndRun(sessionKey, runId || undefined);
      respond(true, serializeReviewBundle(bundle), undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `change review capture failed: ${String(err)}`),
      );
    }
  },
  "changeReview.status": async ({ params, respond }) => {
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
    try {
      respond(
        true,
        serializeReviewBundle(await getFreshPendingReviewBySession(sessionKey)),
        undefined,
      );
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `change review status failed: ${String(err)}`),
      );
    }
  },
  "changeReview.apply": async ({ params, respond }) => {
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
    try {
      await (filePath ? applyReviewBundleFile(id, filePath) : applyReviewBundle(id));
      respond(true, { ok: true, applied: true }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `change review apply failed: ${String(err)}`),
      );
    }
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
  "changeReview.applyGroup": async ({ params, respond }) => {
    const validated = validateReviewGroupParams(params);
    if (!validated) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          formatValidationErrors(validateChangeReviewGroupParams.errors ?? []),
        ),
      );
      return;
    }
    const review = getReviewById(validated.id);
    if (!review) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "invalid changeReview.applyGroup params: unknown id",
        ),
      );
      return;
    }
    try {
      await applyReviewBundleGroup(validated.id, validated.path, validated.groupId);
      respond(true, { ok: true, applied: true }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `change review applyGroup failed: ${String(err)}`),
      );
    }
  },
  "changeReview.revertGroup": async ({ params, respond }) => {
    const validated = validateReviewGroupParams(params);
    if (!validated) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          formatValidationErrors(validateChangeReviewGroupParams.errors ?? []),
        ),
      );
      return;
    }
    const review = getReviewById(validated.id);
    if (!review) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "invalid changeReview.revertGroup params: unknown id",
        ),
      );
      return;
    }
    try {
      await revertReviewBundleGroup(validated.id, validated.path, validated.groupId);
      respond(true, { ok: true, reverted: true }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `change review revertGroup failed: ${String(err)}`),
      );
    }
  },
  "changeReview.applyHunk": async ({ params, respond }) => {
    const validated = validateReviewHunkParams(params);
    if (!validated) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          formatValidationErrors(validateChangeReviewHunkParams.errors ?? []),
        ),
      );
      return;
    }
    const review = getReviewById(validated.id);
    if (!review) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid changeReview.applyHunk params: unknown id"),
      );
      return;
    }
    try {
      await applyReviewBundleHunk(validated.id, validated.path, validated.hunkId);
      respond(true, { ok: true, applied: true }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `change review applyHunk failed: ${String(err)}`),
      );
    }
  },
  "changeReview.revertHunk": async ({ params, respond }) => {
    const validated = validateReviewHunkParams(params);
    if (!validated) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          formatValidationErrors(validateChangeReviewHunkParams.errors ?? []),
        ),
      );
      return;
    }
    const review = getReviewById(validated.id);
    if (!review) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "invalid changeReview.revertHunk params: unknown id",
        ),
      );
      return;
    }
    try {
      await revertReviewBundleHunk(validated.id, validated.path, validated.hunkId);
      respond(true, { ok: true, reverted: true }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `change review revertHunk failed: ${String(err)}`),
      );
    }
  },
};
