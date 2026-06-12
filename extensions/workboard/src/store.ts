import { randomUUID } from "node:crypto";
import {
  WORKBOARD_LINK_TYPES,
  WORKBOARD_PRIORITIES,
  WORKBOARD_PROOF_STATUSES,
  WORKBOARD_STATUSES,
  type WorkboardCard,
  type WorkboardArtifact,
  type WorkboardClaim,
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
const DEFAULT_CLAIM_TTL_MS = 30 * 60 * 1000;

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
export type WorkboardClaimInput = {
  ownerId?: unknown;
  token?: unknown;
  ttlSeconds?: unknown;
};
export type WorkboardHeartbeatInput = {
  ownerId?: unknown;
  token?: unknown;
  note?: unknown;
  status?: unknown;
};
export type WorkboardCompleteInput = WorkboardHeartbeatInput & {
  summary?: unknown;
  proof?: unknown;
  artifacts?: unknown;
};
export type WorkboardBlockInput = WorkboardHeartbeatInput & {
  reason?: unknown;
};
export type WorkboardDispatchResult = {
  promoted: WorkboardCard[];
  reclaimed: WorkboardCard[];
  count: number;
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
  if (!next.claim) {
    delete next.claim;
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

function createCardLink(type: WorkboardLinkType, targetCardId: string, now: number): WorkboardLink {
  return {
    id: randomUUID(),
    type,
    targetCardId,
    createdAt: now,
  };
}

function upsertCardLink(
  links: readonly WorkboardLink[] | undefined,
  link: WorkboardLink,
): WorkboardLink[] {
  const next = [
    ...(links ?? []).filter(
      (existing) => !(existing.type === link.type && existing.targetCardId === link.targetCardId),
    ),
    link,
  ];
  return next.slice(-MAX_CARD_LINKS);
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

function normalizeClaimTtlMs(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_CLAIM_TTL_MS;
  }
  return Math.max(60, Math.min(24 * 60 * 60, Math.trunc(value))) * 1000;
}

function normalizeClaimOwner(value: unknown): string {
  const ownerId = normalizeBoundedString(value, undefined, 120, "claim owner");
  if (!ownerId) {
    throw new Error("claim ownerId is required.");
  }
  return ownerId;
}

function canMutateClaimedCard(card: WorkboardCard, ownerId: string, token?: string): boolean {
  const claim = card.metadata?.claim;
  if (!claim) {
    return true;
  }
  return claim.ownerId === ownerId || (Boolean(token) && claim.token === token);
}

function assertCanMutateClaimedCard(card: WorkboardCard, ownerId: string, token?: string) {
  if (!canMutateClaimedCard(card, ownerId, token)) {
    throw new Error(`card is claimed by ${card.metadata?.claim?.ownerId ?? "another owner"}.`);
  }
}

function assertClaimScopeIfNeeded(card: WorkboardCard, input: WorkboardHeartbeatInput) {
  const claim = card.metadata?.claim;
  if (!claim) {
    return;
  }
  const ownerId = normalizeClaimOwner(input.ownerId);
  const token = normalizeBoundedString(input.token, undefined, 160, "claim token");
  assertCanMutateClaimedCard(card, ownerId, token);
}

function parentIds(card: WorkboardCard): string[] {
  return (
    card.metadata?.links
      ?.filter((link) => link.type === "parent" && link.targetCardId)
      .map((link) => link.targetCardId as string) ?? []
  );
}

function shouldPromoteBlockedByParents(
  card: WorkboardCard,
  cardsById: ReadonlyMap<string, WorkboardCard>,
): boolean {
  const parents = parentIds(card);
  return (
    card.status === "backlog" &&
    parents.length > 0 &&
    parents.every((parentId) => cardsById.get(parentId)?.status === "done")
  );
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
    if (link.type === "parent" || link.type === "child") {
      throw new Error("parent and child dependency links must use linkCards.");
    }
    return await this.updateMetadata(
      id,
      (existing) => ({
        ...existing.metadata,
        links: [...(existing.metadata?.links ?? []), link].slice(-MAX_CARD_LINKS),
      }),
      createEvent("link_added", now),
    );
  }

  async linkCards(parentId: string, childId: string): Promise<WorkboardCard> {
    const parent = await this.get(parentId);
    if (!parent) {
      throw new Error(`card not found: ${parentId}`);
    }
    const child = await this.get(childId);
    if (!child) {
      throw new Error(`card not found: ${childId}`);
    }
    if (parent.id === child.id) {
      throw new Error("card cannot depend on itself.");
    }
    const now = Date.now();
    const parentLink = createCardLink("parent", parent.id, now);
    const childLink = createCardLink("child", child.id, now);
    const nextParent = removeUndefinedCardFields({
      ...parent,
      updatedAt: now,
      metadata: omitEmptyMetadata({
        ...parent.metadata,
        links: upsertCardLink(parent.metadata?.links, childLink),
      }),
      events: appendEvent(parent.events, createEvent("link_added", now)),
    });
    const nextChild = removeUndefinedCardFields({
      ...child,
      updatedAt: now,
      metadata: omitEmptyMetadata({
        ...child.metadata,
        links: upsertCardLink(child.metadata?.links, parentLink),
      }),
      events: appendEvent(child.events, createEvent("link_added", now)),
    });
    await this.store.register(nextParent.id, { version: 1, card: nextParent });
    await this.store.register(nextChild.id, { version: 1, card: nextChild });
    return nextChild;
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

  async claim(
    id: string,
    input: WorkboardClaimInput,
  ): Promise<{ card: WorkboardCard; token: string }> {
    const ownerId = normalizeClaimOwner(input.ownerId);
    const token =
      normalizeBoundedString(input.token, undefined, 160, "claim token") ?? randomUUID();
    const now = Date.now();
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`card not found: ${id}`);
    }
    assertCanMutateClaimedCard(existing, ownerId, token);
    const claim: WorkboardClaim = {
      ownerId,
      token,
      claimedAt: existing.metadata?.claim?.claimedAt ?? now,
      lastHeartbeatAt: now,
      expiresAt: now + normalizeClaimTtlMs(input.ttlSeconds),
    };
    const next = removeUndefinedCardFields({
      ...existing,
      status:
        existing.status === "backlog" || existing.status === "todo" ? "running" : existing.status,
      startedAt: existing.startedAt ?? now,
      updatedAt: now,
      metadata: omitEmptyMetadata({ ...existing.metadata, claim }),
      events: appendEvent(existing.events, createEvent("claimed", now)),
    });
    await this.store.register(next.id, { version: 1, card: next });
    return { card: next, token };
  }

  async heartbeat(id: string, input: WorkboardHeartbeatInput): Promise<WorkboardCard> {
    const ownerId = normalizeClaimOwner(input.ownerId);
    const token = normalizeBoundedString(input.token, undefined, 160, "claim token");
    const note = normalizeBoundedString(input.note, undefined, 400, "heartbeat note");
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`card not found: ${id}`);
    }
    const claim = existing.metadata?.claim;
    if (!claim) {
      throw new Error("card is not claimed.");
    }
    assertCanMutateClaimedCard(existing, ownerId, token);
    const now = Date.now();
    const ttlMs =
      claim.expiresAt && claim.expiresAt > claim.lastHeartbeatAt
        ? claim.expiresAt - claim.lastHeartbeatAt
        : DEFAULT_CLAIM_TTL_MS;
    const comment = note ? { id: randomUUID(), body: note, createdAt: now } : undefined;
    const next = removeUndefinedCardFields({
      ...existing,
      updatedAt: now,
      metadata: omitEmptyMetadata({
        ...existing.metadata,
        claim: {
          ...claim,
          lastHeartbeatAt: now,
          expiresAt: now + ttlMs,
        },
        comments: comment
          ? [...(existing.metadata?.comments ?? []), comment].slice(-MAX_CARD_COMMENTS)
          : existing.metadata?.comments,
      }),
      events: appendEvent(existing.events, createEvent("heartbeat", now)),
    });
    await this.store.register(next.id, { version: 1, card: next });
    return next;
  }

  async releaseClaim(id: string, input: WorkboardHeartbeatInput = {}): Promise<WorkboardCard> {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`card not found: ${id}`);
    }
    const claim = existing.metadata?.claim;
    if (!claim) {
      throw new Error("card is not claimed.");
    }
    const ownerId = normalizeClaimOwner(input.ownerId ?? claim.ownerId);
    const token = normalizeBoundedString(input.token, undefined, 160, "claim token");
    assertCanMutateClaimedCard(existing, ownerId, token);
    const now = Date.now();
    const status =
      input.status === undefined ? existing.status : normalizeStatus(input.status, existing.status);
    const metadata = { ...existing.metadata };
    delete metadata.claim;
    const next = removeUndefinedCardFields({
      ...existing,
      status,
      updatedAt: now,
      metadata: omitEmptyMetadata(metadata),
      events: appendEvent(existing.events, createEvent("released", now)),
    });
    await this.store.register(next.id, { version: 1, card: next });
    return next;
  }

  async complete(id: string, input: WorkboardCompleteInput = {}): Promise<WorkboardCard> {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`card not found: ${id}`);
    }
    assertClaimScopeIfNeeded(existing, input);
    const now = Date.now();
    const summary = normalizeBoundedString(input.summary, undefined, 2000, "summary");
    const proof =
      input.proof && typeof input.proof === "object" && !Array.isArray(input.proof)
        ? normalizeProofInput(input.proof as WorkboardProofInput, now)
        : undefined;
    const artifacts = Array.isArray(input.artifacts)
      ? input.artifacts.map((artifact) =>
          normalizeArtifactInput(artifact as WorkboardArtifactInput, now),
        )
      : [];
    const metadata = { ...existing.metadata };
    delete metadata.claim;
    const next = removeUndefinedCardFields({
      ...existing,
      status: "done",
      completedAt: existing.completedAt ?? now,
      updatedAt: now,
      metadata: omitEmptyMetadata({
        ...metadata,
        comments: summary
          ? [
              ...(metadata.comments ?? []),
              { id: randomUUID(), body: summary, createdAt: now },
            ].slice(-MAX_CARD_COMMENTS)
          : metadata.comments,
        proof: proof ? [...(metadata.proof ?? []), proof].slice(-MAX_CARD_PROOF) : metadata.proof,
        artifacts: artifacts.length
          ? [...(metadata.artifacts ?? []), ...artifacts].slice(-MAX_CARD_ARTIFACTS)
          : metadata.artifacts,
      }),
      events: appendEvent(existing.events, createEvent("completed", now)),
    });
    await this.store.register(next.id, { version: 1, card: next });
    return next;
  }

  async block(id: string, input: WorkboardBlockInput = {}): Promise<WorkboardCard> {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`card not found: ${id}`);
    }
    assertClaimScopeIfNeeded(existing, input);
    const now = Date.now();
    const reason =
      normalizeBoundedString(input.reason, undefined, 2000, "block reason") ??
      "Workboard card blocked.";
    const metadata = { ...existing.metadata };
    delete metadata.claim;
    const next = removeUndefinedCardFields({
      ...existing,
      status: "blocked",
      updatedAt: now,
      metadata: omitEmptyMetadata({
        ...metadata,
        comments: [
          ...(metadata.comments ?? []),
          { id: randomUUID(), body: reason, createdAt: now },
        ].slice(-MAX_CARD_COMMENTS),
      }),
      events: appendEvent(existing.events, createEvent("blocked", now)),
    });
    await this.store.register(next.id, { version: 1, card: next });
    return next;
  }

  async dispatch(now = Date.now()): Promise<WorkboardDispatchResult> {
    const cards = await this.list();
    const cardsById = new Map(cards.map((card) => [card.id, card]));
    const promoted: WorkboardCard[] = [];
    const reclaimed: WorkboardCard[] = [];
    for (const card of cards) {
      const claimExpired =
        card.metadata?.claim?.expiresAt !== undefined && card.metadata.claim.expiresAt <= now;
      if (claimExpired) {
        const metadata = { ...card.metadata };
        delete metadata.claim;
        const next = removeUndefinedCardFields({
          ...card,
          status: card.status === "running" ? "blocked" : card.status,
          updatedAt: now,
          metadata: omitEmptyMetadata({
            ...metadata,
            comments: [
              ...(metadata.comments ?? []),
              {
                id: randomUUID(),
                body: "Claim expired before the next heartbeat.",
                createdAt: now,
              },
            ].slice(-MAX_CARD_COMMENTS),
          }),
          events: appendEvent(card.events, createEvent("dispatch", now)),
        });
        await this.store.register(next.id, { version: 1, card: next });
        cardsById.set(next.id, next);
        reclaimed.push(next);
        continue;
      }
      if (shouldPromoteBlockedByParents(card, cardsById)) {
        const next = removeUndefinedCardFields({
          ...card,
          status: "todo",
          updatedAt: now,
          events: appendEvent(card.events, createEvent("dispatch", now)),
        });
        await this.store.register(next.id, { version: 1, card: next });
        cardsById.set(next.id, next);
        promoted.push(next);
      }
    }
    return { promoted, reclaimed, count: promoted.length + reclaimed.length };
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
