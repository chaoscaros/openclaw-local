import { Type } from "@sinclair/typebox";
import { ChatSendSessionKeyString, InputProvenanceSchema, NonEmptyString } from "./primitives.js";

export const LogsTailParamsSchema = Type.Object(
  {
    cursor: Type.Optional(Type.Integer({ minimum: 0 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 5000 })),
    maxBytes: Type.Optional(Type.Integer({ minimum: 1, maximum: 1_000_000 })),
  },
  { additionalProperties: false },
);

export const LogsTailResultSchema = Type.Object(
  {
    file: NonEmptyString,
    cursor: Type.Integer({ minimum: 0 }),
    size: Type.Integer({ minimum: 0 }),
    lines: Type.Array(Type.String()),
    truncated: Type.Optional(Type.Boolean()),
    reset: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

// WebChat/WebSocket-native chat methods
export const ChatHistoryParamsSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
    maxChars: Type.Optional(Type.Integer({ minimum: 1, maximum: 500_000 })),
  },
  { additionalProperties: false },
);

export const ChatSendParamsSchema = Type.Object(
  {
    sessionKey: ChatSendSessionKeyString,
    message: Type.String(),
    thinking: Type.Optional(Type.String()),
    deliver: Type.Optional(Type.Boolean()),
    applyDreamingAssist: Type.Optional(Type.Boolean()),
    planModeEnabled: Type.Optional(Type.Boolean()),
    devSpecFirstEnabled: Type.Optional(Type.Boolean()),
    changeReviewModeEnabled: Type.Optional(Type.Boolean()),
    resumeDevExecute: Type.Optional(Type.Boolean()),
    originatingChannel: Type.Optional(Type.String()),
    originatingTo: Type.Optional(Type.String()),
    originatingAccountId: Type.Optional(Type.String()),
    originatingThreadId: Type.Optional(Type.String()),
    attachments: Type.Optional(Type.Array(Type.Unknown())),
    timeoutMs: Type.Optional(Type.Integer({ minimum: 0 })),
    systemInputProvenance: Type.Optional(InputProvenanceSchema),
    systemProvenanceReceipt: Type.Optional(Type.String()),
    idempotencyKey: NonEmptyString,
  },
  { additionalProperties: false },
);

export const ChatAbortParamsSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    runId: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const ChatInjectParamsSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    message: NonEmptyString,
    label: Type.Optional(Type.String({ maxLength: 100 })),
  },
  { additionalProperties: false },
);

export const ChatEventSchema = Type.Object(
  {
    runId: NonEmptyString,
    sessionKey: NonEmptyString,
    seq: Type.Integer({ minimum: 0 }),
    state: Type.Union([
      Type.Literal("delta"),
      Type.Literal("final"),
      Type.Literal("aborted"),
      Type.Literal("error"),
    ]),
    message: Type.Optional(Type.Unknown()),
    errorMessage: Type.Optional(Type.String()),
    errorKind: Type.Optional(
      Type.Union([
        Type.Literal("refusal"),
        Type.Literal("timeout"),
        Type.Literal("rate_limit"),
        Type.Literal("context_length"),
        Type.Literal("unknown"),
      ]),
    ),
    usage: Type.Optional(Type.Unknown()),
    stopReason: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

const NullableString = Type.Union([Type.String(), Type.Null()]);

const ChangeReviewHunkSchema = Type.Object(
  {
    hunkId: NonEmptyString,
    changeType: NonEmptyString,
    beforeStartLine: Type.Integer({ minimum: 0 }),
    beforeEndLine: Type.Integer({ minimum: 0 }),
    afterStartLine: Type.Integer({ minimum: 0 }),
    afterEndLine: Type.Integer({ minimum: 0 }),
    beforeLines: Type.Array(Type.String()),
    afterLines: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);

const ChangeReviewGroupSchema = Type.Object(
  {
    groupId: NonEmptyString,
    title: NonEmptyString,
    summary: NonEmptyString,
    changeType: NonEmptyString,
    filePath: NonEmptyString,
    hunkIds: Type.Array(NonEmptyString),
    beforeStartLine: Type.Integer({ minimum: 0 }),
    beforeEndLine: Type.Integer({ minimum: 0 }),
    afterStartLine: Type.Integer({ minimum: 0 }),
    afterEndLine: Type.Integer({ minimum: 0 }),
    beforePreview: Type.Array(Type.String()),
    afterPreview: Type.Array(Type.String()),
    hunkCount: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

const ChangeReviewFileSchema = Type.Object(
  {
    path: NonEmptyString,
    status: NonEmptyString,
    changeType: Type.Optional(NonEmptyString),
    beforeContent: Type.Optional(NullableString),
    afterContent: Type.Optional(NullableString),
    hunks: Type.Optional(Type.Array(ChangeReviewHunkSchema)),
    groups: Type.Optional(Type.Array(ChangeReviewGroupSchema)),
  },
  { additionalProperties: false },
);

export const ChangeReviewSessionParamsSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    runId: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const ChangeReviewIdParamsSchema = Type.Object(
  {
    id: NonEmptyString,
    path: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const ChangeReviewHunkParamsSchema = Type.Object(
  {
    id: NonEmptyString,
    path: NonEmptyString,
    hunkId: NonEmptyString,
  },
  { additionalProperties: false },
);

export const ChangeReviewGroupParamsSchema = Type.Object(
  {
    id: NonEmptyString,
    path: NonEmptyString,
    groupId: NonEmptyString,
  },
  { additionalProperties: false },
);

export const ChangeReviewResultSchema = Type.Object(
  {
    pending: Type.Boolean(),
    id: Type.Optional(NonEmptyString),
    sessionKey: Type.Optional(NonEmptyString),
    sourceRunId: Type.Optional(NonEmptyString),
    stagedOnly: Type.Optional(Type.Boolean()),
    createdAt: Type.Optional(Type.Integer({ minimum: 0 })),
    updatedAt: Type.Optional(Type.Integer({ minimum: 0 })),
    files: Type.Optional(Type.Array(ChangeReviewFileSchema)),
    diffText: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const ChangeReviewActionResultSchema = Type.Object(
  {
    ok: Type.Boolean(),
    applied: Type.Optional(Type.Boolean()),
    reverted: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
