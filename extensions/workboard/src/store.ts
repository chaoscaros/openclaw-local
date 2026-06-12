import { randomUUID } from "node:crypto";
import {
  WORKBOARD_LINK_TYPES,
  WORKBOARD_PRIORITIES,
  WORKBOARD_PROOF_STATUSES,
  WORKBOARD_STATUSES,
  type WorkboardCard,
  type WorkboardArtifact,
  type WorkboardComment,
  type WorkboardEvent,
  type WorkboardEventKind,
  type WorkboardLink,
  type WorkboardLinkType,
  type WorkboardMetadata,
  type WorkboardPriority,
  type WorkboardProof,
  type WorkboardProofStatus,
  type WorkboardStatus,
} from "./types.js";

const POSITION_STEP = 1000;
const MAX_CARDS = 2000;
const MAX_CARD_EVENTS = 50;
const MAX_CARD_COMMENTS = 50;
const MAX_CARD_LINKS = 50;
const MAX_CARD_PROOF = 40;
const MAX_CARD_ARTIFACTS = 40;

export type PersistedWorkboardCard = {
  version: 1;
  card: WorkboardCard;
};

export type WorkboardKeyedStore = {
  register(key: string, value: PersistedWorkboardCard): Promise<void>;
  lookup(key: string): Promise<PersistedWorkboardCard | undefined>;
  delete(key: string): Promise<boolean>;
  entries(): Promise<Array<{ key: string; value: PersistedWorkboardCard }>>;
};

export type WorkboardCardInput = {
  title?: unknown;
  notes?: unknown;
  status?: unknown;
  priority?: unknown;
  labels?: unknown;
  agentId?: unknown;
  sessionKey?: unknown;
  runId?: unknown;
  taskId?: unknown;
  sourceUrl?: unknown;
  position?: unknown;
};

export type WorkboardCardPatch = Partial<WorkboardCardInput>;
export type WorkboardCommentInput = { body?: unknown };
export type WorkboardLinkInput = {
  type?: unknown;
  targetCardId?: unknown;
  title?: unknown;
  url?: unknown;
};
export type WorkboardProofInput = {
  status?: unknown;
  label?: unknown;
  command?: unknown;
  url?: unknown;
  note?: unknown;
};
export type WorkboardArtifactInput = {
  label?: unknown;
  url?: unknown;
  path?: unknown;
  mimeType?: unknown;
};

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeTitle(value: unknown): string {
  const title = normalizeOptionalString(value);
  if (!title) {
    throw new Error("title is required.");
  }
  if (title.length > 180) {
    throw new Error("title must be 180 characters or fewer.");
  }
  return title;
}

function normalizeNotes(value: unknown): string | undefined {
  const notes = normalizeOptionalString(value);
  if (!notes) {
    return undefined;
  }
  if (notes.length > 4000) {
    throw new Error("notes must be 4000 characters or fewer.");
  }
  return notes;
}

function normalizeBoundedString(
  value: unknown,
  fallback: string | undefined,
  maxLength: number,
  fieldName: string,
): string | undefined {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return fallback;
  }
  if (normalized.length > maxLength) {
    throw new Error(`${fieldName} must be ${maxLength} characters or fewer.`);
  }
  return normalized;
}

function normalizeStatus(value: unknown, fallback: WorkboardStatus): WorkboardStatus {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }
  if ((WORKBOARD_STATUSES as readonly string[]).includes(value)) {
    return value as WorkboardStatus;
  }
  throw new Error(`status must be one of: ${WORKBOARD_STATUSES.join(", ")}.`);
}

function normalizePriority(value: unknown, fallback: WorkboardPriority): WorkboardPriority {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }
  if ((WORKBOARD_PRIORITIES as readonly string[]).includes(value)) {
    return value as WorkboardPriority;
  }
  throw new Error(`priority must be one of: ${WORKBOARD_PRIORITIES.join(", ")}.`);
}

function normalizeProofStatus(
  value: unknown,
  fallback: WorkboardProofStatus,
): WorkboardProofStatus {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }
  if ((WORKBOARD_PROOF_STATUSES as readonly string[]).includes(value)) {
    return value as WorkboardProofStatus;
  }
  throw new Error(`proof status must be one of: ${WORKBOARD_PROOF_STATUSES.join(", ")}.`);
}

function normalizeLinkType(value: unknown, fallback: WorkboardLinkType): WorkboardLinkType {
  if (typeof value === "string" && WORKBOARD_LINK_TYPES.includes(value as WorkboardLinkType)) {
    return value as WorkboardLinkType;
  }
  return fallback;
}

function normalizeLabels(value: unknown, fallback: string[] = []): string[] {
  if (value == null) {
    return fallback;
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 12);
  }
  if (!Array.isArray(value)) {
    throw new Error("labels must be an array or comma-separated string.");
  }
  const labels: string[] = [];
  for (const entry of value) {
    const label = normalizeOptionalString(entry);
    if (!label || labels.includes(label)) {
      continue;
    }
    if (label.length > 40) {
      throw new Error("labels must be 40 characters or fewer.");
    }
    labels.push(label);
    if (labels.length >= 12) {
      break;
    }
  }
  return labels;
}

function normalizePosition(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.trunc(value));
}

function compareCards(left: WorkboardCard, right: WorkboardCard): number {
  if (left.status !== right.status) {
    return WORKBOARD_STATUSES.indexOf(left.status) - WORKBOARD_STATUSES.indexOf(right.status);
  }
  if (left.position !== right.position) {
    return left.position - right.position;
  }
  return left.createdAt - right.createdAt;
}

function removeUndefinedCardFields(card: WorkboardCard): WorkboardCard {
  const next = { ...card };
  for (const key of [
    "notes",
    "agentId",
    "sessionKey",
    "runId",
    "taskId",
    "sourceUrl",
    "startedAt",
    "completedAt",
    "metadata",
  ] as const) {
    if (next[key] === undefined) {
      delete next[key];
    }
  }
  return next;
}

function removeUndefinedMetadataFields(metadata: WorkboardMetadata): WorkboardMetadata {
  const next = { ...metadata };
  for (const key of ["comments", "links", "proof", "artifacts"] as const) {
    if (!next[key]?.length) {
      delete next[key];
    }
  }
  return next;
}

function normalizeLinkInput(input: WorkboardLinkInput, now: number): WorkboardLink {
  const targetCardId = normalizeBoundedString(input.targetCardId, undefined, 120, "link target");
  const url = normalizeBoundedString(input.url, undefined, 2000, "link URL");
  const title = normalizeBoundedString(input.title, undefined, 180, "link title");
  if (!targetCardId && !url) {
    throw new Error("link targetCardId or url is required.");
  }
  return {
    id: randomUUID(),
    type: normalizeLinkType(input.type, "relates_to"),
    createdAt: now,
    ...(targetCardId ? { targetCardId } : {}),
    ...(title ? { title } : {}),
    ...(url ? { url } : {}),
  };
}

function omitEmptyMetadata(metadata: WorkboardMetadata): WorkboardMetadata | undefined {
  const next = removeUndefinedMetadataFields(metadata);
  return Object.keys(next).length > 0 ? next : undefined;
}

function normalizeCommentInput(input: WorkboardCommentInput, now: number): WorkboardComment {
  const body = normalizeBoundedString(input.body, undefined, 4000, "comment body");
  if (!body) {
    throw new Error("comment body is required.");
  }
  return { id: randomUUID(), body, createdAt: now };
}

function normalizeProofInput(input: WorkboardProofInput, now: number): WorkboardProof {
  const label = normalizeBoundedString(input.label, undefined, 160, "proof label");
  const command = normalizeBoundedString(input.command, undefined, 1000, "proof command");
  const url = normalizeBoundedString(input.url, undefined, 2000, "proof URL");
  const note = normalizeBoundedString(input.note, undefined, 2000, "proof note");
  return {
    id: randomUUID(),
    status: normalizeProofStatus(input.status, "unknown"),
    createdAt: now,
    ...(label ? { label } : {}),
    ...(command ? { command } : {}),
    ...(url ? { url } : {}),
    ...(note ? { note } : {}),
  };
}

function normalizeArtifactInput(input: WorkboardArtifactInput, now: number): WorkboardArtifact {
  const label = normalizeBoundedString(input.label, undefined, 160, "artifact label");
  const url = normalizeBoundedString(input.url, undefined, 2000, "artifact URL");
  const artifactPath = normalizeBoundedString(input.path, undefined, 2000, "artifact path");
  const mimeType = normalizeBoundedString(input.mimeType, undefined, 160, "artifact MIME type");
  if (!url && !artifactPath) {
    throw new Error("artifact url or path is required.");
  }
  return {
    id: randomUUID(),
    createdAt: now,
    ...(label ? { label } : {}),
    ...(url ? { url } : {}),
    ...(artifactPath ? { path: artifactPath } : {}),
    ...(mimeType ? { mimeType } : {}),
  };
}

function createEvent(
  kind: WorkboardEventKind,
  at: number,
  fields: Omit<WorkboardEvent, "id" | "kind" | "at"> = {},
): WorkboardEvent {
  return removeUndefinedEventFields({
    id: randomUUID(),
    kind,
    at,
    ...fields,
  });
}

function removeUndefinedEventFields(event: WorkboardEvent): WorkboardEvent {
  const next = { ...event };
  for (const key of ["fromStatus", "toStatus", "sessionKey", "runId"] as const) {
    if (next[key] === undefined) {
      delete next[key];
    }
  }
  return next;
}

function appendEvent(
  events: readonly WorkboardEvent[] | undefined,
  event: WorkboardEvent,
): WorkboardEvent[] {
  return [...(events ?? []), event].slice(-MAX_CARD_EVENTS);
}

function updateEventsForPatch(
  existing: WorkboardCard,
  patch: WorkboardCardPatch,
  status: WorkboardStatus,
  now: number,
): WorkboardEvent[] | undefined {
  const events = existing.events ?? [];
  const statusChanged = status !== existing.status;
  const sessionChanged = patch.sessionKey !== undefined;
  const runChanged = patch.runId !== undefined;
  if (statusChanged) {
    return appendEvent(
      events,
      createEvent("moved", now, {
        fromStatus: existing.status,
        toStatus: status,
        sessionKey: existing.sessionKey,
        runId: existing.runId,
      }),
    );
  }
  if (sessionChanged || runChanged) {
    return appendEvent(
      events,
      createEvent("linked", now, {
        sessionKey:
          patch.sessionKey === undefined
            ? existing.sessionKey
            : normalizeOptionalString(patch.sessionKey),
        runId: patch.runId === undefined ? existing.runId : normalizeOptionalString(patch.runId),
      }),
    );
  }
  if (
    patch.title !== undefined ||
    patch.notes !== undefined ||
    patch.priority !== undefined ||
    patch.labels !== undefined ||
    patch.agentId !== undefined ||
    patch.taskId !== undefined ||
    patch.sourceUrl !== undefined ||
    patch.position !== undefined
  ) {
    return appendEvent(events, createEvent("edited", now));
  }
  return existing.events;
}

export class WorkboardStore {
  constructor(private readonly store: WorkboardKeyedStore) {}

  async list(): Promise<WorkboardCard[]> {
    const entries = await this.store.entries();
    return entries
      .map((entry) => entry.value)
      .filter(
        (entry): entry is PersistedWorkboardCard => entry?.version === 1 && Boolean(entry.card?.id),
      )
      .map((entry) => entry.card)
      .toSorted(compareCards);
  }

  async get(id: string): Promise<WorkboardCard | undefined> {
    const entry = await this.store.lookup(id.trim());
    return entry?.version === 1 ? entry.card : undefined;
  }

  async create(input: WorkboardCardInput): Promise<WorkboardCard> {
    const now = Date.now();
    const status = normalizeStatus(input.status, "todo");
    const cards = await this.list();
    const position =
      normalizePosition(input.position, 0) ||
      Math.max(0, ...cards.filter((card) => card.status === status).map((card) => card.position)) +
        POSITION_STEP;
    const notes = normalizeNotes(input.notes);
    const agentId = normalizeOptionalString(input.agentId);
    const sessionKey = normalizeOptionalString(input.sessionKey);
    const runId = normalizeOptionalString(input.runId);
    const taskId = normalizeOptionalString(input.taskId);
    const sourceUrl = normalizeOptionalString(input.sourceUrl);
    const card: WorkboardCard = {
      id: randomUUID(),
      title: normalizeTitle(input.title),
      status,
      priority: normalizePriority(input.priority, "normal"),
      labels: normalizeLabels(input.labels),
      position,
      createdAt: now,
      updatedAt: now,
      events: [createEvent("created", now, { toStatus: status, sessionKey, runId })],
      ...(notes ? { notes } : {}),
      ...(agentId ? { agentId } : {}),
      ...(sessionKey ? { sessionKey } : {}),
      ...(runId ? { runId } : {}),
      ...(taskId ? { taskId } : {}),
      ...(sourceUrl ? { sourceUrl } : {}),
    };
    await this.store.register(card.id, { version: 1, card });
    return card;
  }

  async update(id: string, patch: WorkboardCardPatch): Promise<WorkboardCard> {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`card not found: ${id}`);
    }
    const status = normalizeStatus(patch.status, existing.status);
    const now = Date.now();
    const completedAt = status === "done" ? (existing.completedAt ?? now) : undefined;
    const startedAt = status === "running" ? (existing.startedAt ?? now) : existing.startedAt;
    const events = updateEventsForPatch(existing, patch, status, now);
    const next = removeUndefinedCardFields({
      ...existing,
      title: patch.title === undefined ? existing.title : normalizeTitle(patch.title),
      notes: patch.notes === undefined ? existing.notes : normalizeNotes(patch.notes),
      status,
      priority:
        patch.priority === undefined
          ? existing.priority
          : normalizePriority(patch.priority, existing.priority),
      labels: patch.labels === undefined ? existing.labels : normalizeLabels(patch.labels),
      agentId:
        patch.agentId === undefined ? existing.agentId : normalizeOptionalString(patch.agentId),
      sessionKey:
        patch.sessionKey === undefined
          ? existing.sessionKey
          : normalizeOptionalString(patch.sessionKey),
      runId: patch.runId === undefined ? existing.runId : normalizeOptionalString(patch.runId),
      taskId: patch.taskId === undefined ? existing.taskId : normalizeOptionalString(patch.taskId),
      sourceUrl:
        patch.sourceUrl === undefined
          ? existing.sourceUrl
          : normalizeOptionalString(patch.sourceUrl),
      position:
        patch.position === undefined
          ? existing.position
          : normalizePosition(patch.position, existing.position),
      updatedAt: now,
      ...(events ? { events } : {}),
      ...(startedAt ? { startedAt } : {}),
      ...(completedAt ? { completedAt } : {}),
    });
    if (status !== "done") {
      delete next.completedAt;
    }
    await this.store.register(next.id, { version: 1, card: next });
    return next;
  }

  async move(id: string, status: unknown, position: unknown): Promise<WorkboardCard> {
    return await this.update(id, {
      status,
      position,
    });
  }

  async delete(id: string): Promise<{ deleted: boolean }> {
    return { deleted: await this.store.delete(id.trim()) };
  }

  private async updateMetadata(
    id: string,
    updater: (existing: WorkboardCard) => WorkboardMetadata,
    event: WorkboardEvent,
  ): Promise<WorkboardCard> {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`card not found: ${id}`);
    }
    const next = removeUndefinedCardFields({
      ...existing,
      updatedAt: event.at,
      metadata: omitEmptyMetadata(updater(existing)),
      events: appendEvent(existing.events, event),
    });
    await this.store.register(next.id, { version: 1, card: next });
    return next;
  }

  async addComment(id: string, input: WorkboardCommentInput): Promise<WorkboardCard> {
    const now = Date.now();
    const comment = normalizeCommentInput(input, now);
    return await this.updateMetadata(
      id,
      (existing) => ({
        ...existing.metadata,
        comments: [...(existing.metadata?.comments ?? []), comment].slice(-MAX_CARD_COMMENTS),
      }),
      createEvent("comment_added", now),
    );
  }

  async addLink(id: string, input: WorkboardLinkInput): Promise<WorkboardCard> {
    const now = Date.now();
    const link = normalizeLinkInput(input, now);
    return await this.updateMetadata(
      id,
      (existing) => ({
        ...existing.metadata,
        links: [...(existing.metadata?.links ?? []), link].slice(-MAX_CARD_LINKS),
      }),
      createEvent("link_added", now),
    );
  }

  async addProof(id: string, input: WorkboardProofInput): Promise<WorkboardCard> {
    const now = Date.now();
    const proof = normalizeProofInput(input, now);
    return await this.updateMetadata(
      id,
      (existing) => ({
        ...existing.metadata,
        proof: [...(existing.metadata?.proof ?? []), proof].slice(-MAX_CARD_PROOF),
      }),
      createEvent("proof_added", now),
    );
  }

  async addArtifact(id: string, input: WorkboardArtifactInput): Promise<WorkboardCard> {
    const now = Date.now();
    const artifact = normalizeArtifactInput(input, now);
    return await this.updateMetadata(
      id,
      (existing) => ({
        ...existing.metadata,
        artifacts: [...(existing.metadata?.artifacts ?? []), artifact].slice(-MAX_CARD_ARTIFACTS),
      }),
      createEvent("artifact_added", now),
    );
  }

  static open(
    openKeyedStore: (options: { namespace: string; maxEntries: number }) => WorkboardKeyedStore,
  ) {
    return new WorkboardStore(
      openKeyedStore({
        namespace: "workboard.cards",
        maxEntries: MAX_CARDS,
      }),
    );
  }
}
