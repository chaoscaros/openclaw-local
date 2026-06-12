export const WORKBOARD_STATUSES = [
  "backlog",
  "todo",
  "running",
  "review",
  "blocked",
  "done",
] as const;

export const WORKBOARD_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const WORKBOARD_EVENT_KINDS = [
  "created",
  "edited",
  "moved",
  "linked",
  "comment_added",
  "link_added",
  "proof_added",
  "artifact_added",
] as const;
export const WORKBOARD_PROOF_STATUSES = ["passed", "failed", "skipped", "unknown"] as const;
export const WORKBOARD_LINK_TYPES = [
  "parent",
  "child",
  "blocks",
  "blocked_by",
  "relates_to",
] as const;

export type WorkboardStatus = (typeof WORKBOARD_STATUSES)[number];
export type WorkboardPriority = (typeof WORKBOARD_PRIORITIES)[number];
export type WorkboardEventKind = (typeof WORKBOARD_EVENT_KINDS)[number];
export type WorkboardProofStatus = (typeof WORKBOARD_PROOF_STATUSES)[number];
export type WorkboardLinkType = (typeof WORKBOARD_LINK_TYPES)[number];

export type WorkboardEvent = {
  id: string;
  kind: WorkboardEventKind;
  at: number;
  fromStatus?: WorkboardStatus;
  toStatus?: WorkboardStatus;
  sessionKey?: string;
  runId?: string;
};

export type WorkboardComment = {
  id: string;
  body: string;
  createdAt: number;
};

export type WorkboardLink = {
  id: string;
  type: WorkboardLinkType;
  createdAt: number;
  targetCardId?: string;
  title?: string;
  url?: string;
};

export type WorkboardProof = {
  id: string;
  status: WorkboardProofStatus;
  createdAt: number;
  label?: string;
  command?: string;
  url?: string;
  note?: string;
};

export type WorkboardArtifact = {
  id: string;
  createdAt: number;
  label?: string;
  url?: string;
  path?: string;
  mimeType?: string;
};

export type WorkboardMetadata = {
  comments?: WorkboardComment[];
  links?: WorkboardLink[];
  proof?: WorkboardProof[];
  artifacts?: WorkboardArtifact[];
};

export type WorkboardCard = {
  id: string;
  title: string;
  notes?: string;
  status: WorkboardStatus;
  priority: WorkboardPriority;
  labels: string[];
  agentId?: string;
  sessionKey?: string;
  runId?: string;
  taskId?: string;
  sourceUrl?: string;
  position: number;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  events?: WorkboardEvent[];
  metadata?: WorkboardMetadata;
};

export type WorkboardListResult = {
  cards: WorkboardCard[];
  statuses: readonly WorkboardStatus[];
};
