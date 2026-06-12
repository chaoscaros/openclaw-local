import { jsonResult, readStringParam, type AnyAgentTool } from "openclaw/plugin-sdk/core";
import { Type } from "typebox";
import type { OpenClawPluginApi } from "../api.js";
import { WorkboardStore, type PersistedWorkboardCard } from "./store.js";
import type { WorkboardCard } from "./types.js";

const EmptyParamsSchema = Type.Object({}, { additionalProperties: false });

const ListParamsSchema = Type.Object(
  {
    status: Type.Optional(Type.String()),
    agentId: Type.Optional(Type.String()),
    limit: Type.Optional(Type.Number()),
  },
  { additionalProperties: false },
);

const CardIdSchema = Type.Object(
  {
    id: Type.String(),
  },
  { additionalProperties: false },
);

const CommentParamsSchema = Type.Object(
  {
    id: Type.String(),
    body: Type.String(),
  },
  { additionalProperties: false },
);

const ProofParamsSchema = Type.Object(
  {
    id: Type.String(),
    status: Type.Optional(Type.String()),
    label: Type.Optional(Type.String()),
    command: Type.Optional(Type.String()),
    url: Type.Optional(Type.String()),
    note: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

function asRecord(params: unknown): Record<string, unknown> {
  return params && typeof params === "object" && !Array.isArray(params)
    ? (params as Record<string, unknown>)
    : {};
}

function readLimit(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.min(200, Math.trunc(value)))
    : 50;
}

function summarizeCard(card: WorkboardCard) {
  return {
    id: card.id,
    title: card.title,
    status: card.status,
    priority: card.priority,
    agentId: card.agentId,
    sessionKey: card.sessionKey,
    runId: card.runId,
    labels: card.labels,
    updatedAt: card.updatedAt,
    comments: card.metadata?.comments?.length ?? 0,
    proof: card.metadata?.proof?.length ?? 0,
    artifacts: card.metadata?.artifacts?.length ?? 0,
    links: card.metadata?.links?.length ?? 0,
  };
}

export function createWorkboardTools(params: {
  api: OpenClawPluginApi;
  store?: WorkboardStore;
}): AnyAgentTool[] {
  const store =
    params.store ??
    WorkboardStore.open((options) =>
      params.api.runtime.state.openKeyedStore<PersistedWorkboardCard>(options),
    );
  return [
    {
      name: "workboard_list",
      label: "Workboard List",
      description: "List Workboard cards with compact metadata counts.",
      parameters: ListParamsSchema,
      execute: async (_toolCallId, rawParams) => {
        const record = asRecord(rawParams);
        const status = readStringParam(record, "status");
        const agentId = readStringParam(record, "agentId");
        const limit = readLimit(record.limit);
        const cards = (await store.list())
          .filter((card) => !status || card.status === status)
          .filter((card) => !agentId || card.agentId === agentId)
          .slice(0, limit)
          .map(summarizeCard);
        return jsonResult({ cards });
      },
    },
    {
      name: "workboard_read",
      label: "Workboard Read",
      description: "Read one Workboard card with notes, metadata, and event history.",
      parameters: CardIdSchema,
      execute: async (_toolCallId, rawParams) => {
        const record = asRecord(rawParams);
        const id = readStringParam(record, "id", { required: true });
        const card = await store.get(id);
        if (!card) {
          throw new Error(`card not found: ${id}`);
        }
        return jsonResult({ card });
      },
    },
    {
      name: "workboard_comment",
      label: "Workboard Comment",
      description: "Append a compact comment to a Workboard card.",
      parameters: CommentParamsSchema,
      execute: async (_toolCallId, rawParams) => {
        const record = asRecord(rawParams);
        const id = readStringParam(record, "id", { required: true });
        const body = readStringParam(record, "body", { required: true });
        return jsonResult({ card: await store.addComment(id, { body }) });
      },
    },
    {
      name: "workboard_proof",
      label: "Workboard Proof",
      description: "Attach proof metadata to a Workboard card.",
      parameters: ProofParamsSchema,
      execute: async (_toolCallId, rawParams) => {
        const record = asRecord(rawParams);
        const id = readStringParam(record, "id", { required: true });
        return jsonResult({ card: await store.addProof(id, record) });
      },
    },
  ];
}
