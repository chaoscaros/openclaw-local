import { html, nothing, type TemplateResult } from "lit";
import { ref } from "lit/directives/ref.js";
import { repeat } from "lit/directives/repeat.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { t } from "../../i18n/index.ts";
import type { CompactionStatus, FallbackStatus } from "../app-tool-stream.ts";
import {
  CHAT_ATTACHMENT_ACCEPT,
  isSupportedChatAttachmentMimeType,
} from "../chat/attachment-support.ts";
import { DeletedMessages } from "../chat/deleted-messages.ts";
import { exportChatMarkdown } from "../chat/export.ts";
import {
  renderMessageGroup,
  renderReadingIndicatorGroup,
  renderStreamingGroup,
} from "../chat/grouped-render.ts";
import { InputHistory } from "../chat/input-history.ts";
import { extractTextCached } from "../chat/message-extract.ts";
import {
  isToolResultMessage,
  normalizeMessage,
  normalizeRoleForGrouping,
} from "../chat/message-normalizer.ts";
import { PinnedMessages } from "../chat/pinned-messages.ts";
import { getPinnedMessageSummary } from "../chat/pinned-summary.ts";
import { renderChatRunControls } from "../chat/run-controls.ts";
import { messageMatchesSearchQuery } from "../chat/search-match.ts";
import { getOrCreateSessionCacheValue } from "../chat/session-cache.ts";
import type { ChatSideResult } from "../chat/side-result.ts";
import {
  CATEGORY_LABELS,
  SLASH_COMMANDS,
  getSlashCommandCompletions,
  type SlashCommandCategory,
  type SlashCommandDef,
} from "../chat/slash-commands.ts";
import { isSttSupported, startStt, stopStt } from "../chat/speech.ts";
import { buildSidebarContent, extractToolCards, extractToolPreview } from "../chat/tool-cards.ts";
import type { TaskItem } from "../controllers/tasks.ts";
import type { EmbedSandboxMode } from "../embed-sandbox.ts";
import { icons } from "../icons.ts";
import { toSanitizedMarkdownHtml } from "../markdown.ts";
import type { SidebarContent } from "../sidebar-content.ts";
import { detectTextDirection } from "../text-direction.ts";
import type { GatewaySessionRow, SessionsListResult } from "../types.ts";
import type { ChatItem, MessageGroup, ToolCard } from "../types/chat-types.ts";
import type { ChatAttachment, ChatQueueItem } from "../ui-types.ts";
import { agentLogoUrl, resolveAgentAvatarUrl } from "./agents-utils.ts";
import { renderMarkdownSidebar } from "./markdown-sidebar.ts";
import "../components/resizable-divider.ts";

const COMPOSER_CHROME_INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "[contenteditable='true']",
  "[role='button']",
  "[role='listbox']",
  "[role='option']",
].join(",");

type DreamingAssistReason = "disabled" | "no_strategy" | "scope_mismatch" | "expired";
type ChangeReviewHunk = {
  hunkId: string;
  changeType: string;
  beforeStartLine: number;
  beforeEndLine: number;
  afterStartLine: number;
  afterEndLine: number;
  beforeLines: string[];
  afterLines: string[];
};

type ChangeReviewGroup = {
  groupId: string;
  title: string;
  summary: string;
  changeType: string;
  filePath: string;
  hunkIds: string[];
  beforeStartLine: number;
  beforeEndLine: number;
  afterStartLine: number;
  afterEndLine: number;
  beforePreview: string[];
  afterPreview: string[];
  hunkCount: number;
};

type ChangeReviewFile = {
  path: string;
  status: string;
  changeType?: string;
  beforeContent?: string | null;
  afterContent?: string | null;
  hunks?: ChangeReviewHunk[];
  groups?: ChangeReviewGroup[];
};
type ChangeReviewAction = {
  type: "apply" | "revert";
  path?: string | null;
  hunkId?: string | null;
  groupId?: string | null;
};

type NewSessionCreateOptions = {
  agentId?: string;
  label?: string;
};

function renderDreamingAssistReason(reason?: DreamingAssistReason | null): string {
  switch (reason) {
    case "disabled":
      return "未应用：协助策略已关闭";
    case "no_strategy":
      return "未应用：当前没有可用策略";
    case "scope_mismatch":
      return "未应用：当前会话或任务与策略作用域不匹配";
    case "expired":
      return "未应用：协助策略已过期";
    default:
      return "";
  }
}

export type ChatProps = {
  sessionKey: string;
  onSessionKeyChange: (next: string) => void;
  thinkingLevel: string | null;
  dreamingAssistApplied?: boolean | null;
  dreamingAssistReason?: DreamingAssistReason | null;
  dreamingAssistEnabled?: boolean;
  planModeEnabled?: boolean;
  executionGoalModeEnabled?: boolean;
  devSpecFirstEnabled?: boolean;
  changeReviewModeEnabled?: boolean;
  showThinking: boolean;
  showToolCalls: boolean;
  loading: boolean;
  sending: boolean;
  canAbort?: boolean;
  compactionStatus?: CompactionStatus | null;
  fallbackStatus?: FallbackStatus | null;
  messages: unknown[];
  sideResult?: ChatSideResult | null;
  toolMessages: unknown[];
  streamSegments: Array<{ text: string; ts: number }>;
  stream: string | null;
  streamStartedAt: number | null;
  pendingRunId?: string | null;
  assistantAvatarUrl?: string | null;
  draft: string;
  queue: ChatQueueItem[];
  pendingChangeReview?: {
    pending: boolean;
    id?: string;
    createdAt?: number;
    updatedAt?: number;
    files?: ChangeReviewFile[];
    diffText?: string;
  } | null;
  pendingChangeReviewOpen?: boolean;
  pendingChangeReviewSelectedPath?: string | null;
  pendingChangeReviewAction?: ChangeReviewAction | null;
  connected: boolean;
  canSend: boolean;
  disabledReason: string | null;
  error: string | null;
  sessions: SessionsListResult | null;
  focusMode: boolean;
  sessionMode?: "normal" | "task";
  currentTaskId?: string | null;
  currentTaskTitle?: string | null;
  currentTaskStatus?: string | null;
  currentTaskStep?: string | null;
  currentTask?: TaskItem | null;
  taskItems?: TaskItem[];
  taskOptions?: Array<{ id: string; title: string; status?: string | null }>;
  onSetSessionMode?: (mode: "normal" | "task") => void;
  onSelectTask?: (taskId: string) => void;
  onOpenTasksTab?: () => void;
  sidebarOpen?: boolean;
  sidebarContent?: SidebarContent | null;
  sidebarError?: string | null;
  splitRatio?: number;
  canvasHostUrl?: string | null;
  embedSandboxMode?: EmbedSandboxMode;
  allowExternalEmbedUrls?: boolean;
  assistantName: string;
  assistantAvatar: string | null;
  localMediaPreviewRoots?: string[];
  assistantAttachmentAuthToken?: string | null;
  autoExpandToolCalls?: boolean;
  attachments?: ChatAttachment[];
  onAttachmentsChange?: (attachments: ChatAttachment[]) => void;
  showNewMessages?: boolean;
  onScrollToBottom?: () => void;
  onRefresh: () => void;
  onToggleFocusMode: () => void;
  onToggleDreamingAssist?: () => void;
  onTogglePlanMode?: () => void;
  onToggleExecutionGoalMode?: () => void;
  onToggleDevSpecFirst?: () => void;
  onToggleChangeReviewMode?: () => void;
  getDraft?: () => string;
  onDraftChange: (next: string) => void;
  onRequestUpdate?: () => void;
  onSend: () => void;
  onOpenChangeReview?: () => void;
  onCloseChangeReview?: () => void;
  onSelectChangeReviewFile?: (path: string) => void;
  onApplyChangeReview?: (id: string, path?: string) => void;
  onRevertChangeReview?: (id: string, path?: string) => void;
  onApplyChangeReviewGroup?: (id: string, path: string, groupId: string) => void;
  onRevertChangeReviewGroup?: (id: string, path: string, groupId: string) => void;
  onApplyChangeReviewHunk?: (id: string, path: string, hunkId: string) => void;
  onRevertChangeReviewHunk?: (id: string, path: string, hunkId: string) => void;
  onAbort?: () => void;
  onQueueRemove: (id: string) => void;
  onDismissSideResult?: () => void;
  newSessionDialogOpen?: boolean;
  newSessionCreating?: boolean;
  resetSessionBusy?: boolean;
  showNewSessionAction?: boolean;
  onOpenNewSessionDialog?: () => void;
  onCloseNewSessionDialog?: () => void;
  onNewSession: (options?: NewSessionCreateOptions) => void | Promise<boolean>;
  onClearHistory?: () => void;
  agentsList: {
    agents: Array<{ id: string; name?: string; identity?: { name?: string; avatarUrl?: string } }>;
    defaultId?: string;
  } | null;
  currentAgentId: string;
  onAgentChange: (agentId: string) => void;
  onNavigateToAgent?: () => void;
  onSessionSelect?: (sessionKey: string) => void;
  onOpenSidebar?: (content: SidebarContent) => void;
  onCloseSidebar?: () => void;
  onSplitRatioChange?: (ratio: number) => void;
  onChatScroll?: (event: Event) => void;
  basePath?: string;
};

function renderChangeReviewStatusLabel(status: string): string {
  if (status === "added") {
    return "新增";
  }
  if (status === "deleted") {
    return "删除";
  }
  return "修改";
}

type ChangeReviewCompareRow = {
  leftNumber: number | null;
  rightNumber: number | null;
  leftText: string;
  rightText: string;
  leftKind: "context" | "removed" | "empty";
  rightKind: "context" | "added" | "empty";
};

function splitChangeReviewLines(content: string | null | undefined): string[] {
  if (!content) {
    return [];
  }
  return content.replace(/\n$/, "").split("\n");
}

function buildNaiveCompareRows(
  beforeLines: string[],
  afterLines: string[],
): ChangeReviewCompareRow[] {
  const maxLength = Math.max(beforeLines.length, afterLines.length);
  const rows: ChangeReviewCompareRow[] = [];
  for (let index = 0; index < maxLength; index += 1) {
    const leftText = beforeLines[index];
    const rightText = afterLines[index];
    if (leftText === rightText) {
      rows.push({
        leftNumber: leftText === undefined ? null : index + 1,
        rightNumber: rightText === undefined ? null : index + 1,
        leftText: leftText ?? "",
        rightText: rightText ?? "",
        leftKind: leftText === undefined ? "empty" : "context",
        rightKind: rightText === undefined ? "empty" : "context",
      });
      continue;
    }
    if (leftText !== undefined) {
      rows.push({
        leftNumber: index + 1,
        rightNumber: null,
        leftText,
        rightText: "",
        leftKind: "removed",
        rightKind: "empty",
      });
    }
    if (rightText !== undefined) {
      rows.push({
        leftNumber: null,
        rightNumber: index + 1,
        leftText: "",
        rightText,
        leftKind: "empty",
        rightKind: "added",
      });
    }
  }
  return rows;
}

function buildChangeReviewCompareRows(file: ChangeReviewFile): ChangeReviewCompareRow[] {
  const beforeLines = splitChangeReviewLines(file.beforeContent);
  const afterLines = splitChangeReviewLines(file.afterContent);
  const matrixCellCount = (beforeLines.length + 1) * (afterLines.length + 1);
  if (matrixCellCount > 250_000) {
    return buildNaiveCompareRows(beforeLines, afterLines);
  }
  const width = afterLines.length + 1;
  const matrix = new Uint32Array((beforeLines.length + 1) * width);
  for (let leftIndex = beforeLines.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = afterLines.length - 1; rightIndex >= 0; rightIndex -= 1) {
      const currentIndex = leftIndex * width + rightIndex;
      if (beforeLines[leftIndex] === afterLines[rightIndex]) {
        matrix[currentIndex] = matrix[(leftIndex + 1) * width + rightIndex + 1] + 1;
      } else {
        matrix[currentIndex] = Math.max(
          matrix[(leftIndex + 1) * width + rightIndex],
          matrix[leftIndex * width + rightIndex + 1],
        );
      }
    }
  }

  const rows: ChangeReviewCompareRow[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < beforeLines.length && rightIndex < afterLines.length) {
    if (beforeLines[leftIndex] === afterLines[rightIndex]) {
      rows.push({
        leftNumber: leftIndex + 1,
        rightNumber: rightIndex + 1,
        leftText: beforeLines[leftIndex] ?? "",
        rightText: afterLines[rightIndex] ?? "",
        leftKind: "context",
        rightKind: "context",
      });
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    const removeScore = matrix[(leftIndex + 1) * width + rightIndex];
    const addScore = matrix[leftIndex * width + rightIndex + 1];
    if (removeScore >= addScore) {
      rows.push({
        leftNumber: leftIndex + 1,
        rightNumber: null,
        leftText: beforeLines[leftIndex] ?? "",
        rightText: "",
        leftKind: "removed",
        rightKind: "empty",
      });
      leftIndex += 1;
      continue;
    }
    rows.push({
      leftNumber: null,
      rightNumber: rightIndex + 1,
      leftText: "",
      rightText: afterLines[rightIndex] ?? "",
      leftKind: "empty",
      rightKind: "added",
    });
    rightIndex += 1;
  }
  while (leftIndex < beforeLines.length) {
    rows.push({
      leftNumber: leftIndex + 1,
      rightNumber: null,
      leftText: beforeLines[leftIndex] ?? "",
      rightText: "",
      leftKind: "removed",
      rightKind: "empty",
    });
    leftIndex += 1;
  }
  while (rightIndex < afterLines.length) {
    rows.push({
      leftNumber: null,
      rightNumber: rightIndex + 1,
      leftText: "",
      rightText: afterLines[rightIndex] ?? "",
      leftKind: "empty",
      rightKind: "added",
    });
    rightIndex += 1;
  }
  return rows;
}

function resolveChangeReviewRowHunk(
  file: ChangeReviewFile,
  row: ChangeReviewCompareRow,
): ChangeReviewHunk | null {
  const hunks = file.hunks ?? [];
  return (
    hunks.find((hunk) => {
      const inBeforeRange =
        row.leftNumber != null &&
        row.leftKind !== "context" &&
        row.leftNumber >= hunk.beforeStartLine &&
        row.leftNumber <= hunk.beforeEndLine;
      const inAfterRange =
        row.rightNumber != null &&
        row.rightKind !== "context" &&
        row.rightNumber >= hunk.afterStartLine &&
        row.rightNumber <= hunk.afterEndLine;
      return inBeforeRange || inAfterRange;
    }) ?? null
  );
}

type ChangeReviewMinimapEntry = {
  key: string;
  anchorId: string;
  displayIndex: string;
  label: string;
  changeType: string;
  startLine: number;
  endLine: number;
  sortLine: number;
  hunkId?: string;
  groupId?: string;
  lane: number;
};

function resolveChangeReviewVisualRange(
  beforeStart?: number,
  beforeEnd?: number,
  afterStart?: number,
  afterEnd?: number,
): { startLine: number; endLine: number } {
  const starts = [beforeStart, afterStart].filter(
    (value): value is number => typeof value === "number" && value > 0,
  );
  const ends = [beforeEnd, afterEnd, beforeStart, afterStart].filter(
    (value): value is number => typeof value === "number" && value > 0,
  );
  const startLine = starts.length > 0 ? Math.min(...starts) : 1;
  const endLine = ends.length > 0 ? Math.max(...ends) : startLine;
  return { startLine, endLine };
}

function buildChangeReviewHunkAnchorId(filePath: string, hunkId: string): string {
  const fileSlug = filePath
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-48);
  return `change-review-hunk-${fileSlug}-${hunkId}`;
}

function buildChangeReviewGroupAnchorId(filePath: string, groupId: string): string {
  const fileSlug = filePath
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-48);
  return `change-review-group-${fileSlug}-${groupId}`;
}

function buildChangeReviewRenderedBlockAnchorId(
  filePath: string,
  hunkId: string,
  occurrence: number,
): string {
  return `${buildChangeReviewHunkAnchorId(filePath, hunkId)}-part-${occurrence}`;
}

function buildChangeReviewSegmentLabel(
  occurrence: number,
  totalOccurrences: number,
): string | null {
  if (totalOccurrences <= 1) {
    return null;
  }
  return `第 ${occurrence} 段`;
}

function resolveChangeReviewGroupFirstHunk(
  file: ChangeReviewFile,
  group: ChangeReviewGroup,
): ChangeReviewHunk | null {
  for (const hunkId of group.hunkIds) {
    const hunk = resolveChangeReviewHunk(file, hunkId);
    if (hunk) {
      return hunk;
    }
  }
  return null;
}

function getChangeReviewFileTotalLines(file: ChangeReviewFile): number {
  const beforeLines = (file.beforeContent ?? "")
    .replace(/\n$/, "")
    .split("\n")
    .filter(Boolean).length;
  const afterLines = (file.afterContent ?? "")
    .replace(/\n$/, "")
    .split("\n")
    .filter(Boolean).length;
  const hunkMax = Math.max(
    0,
    ...(file.hunks ?? []).map((hunk) => Math.max(hunk.beforeEndLine, hunk.afterEndLine)),
  );
  const groupMax = Math.max(
    0,
    ...(file.groups ?? []).map((group) => Math.max(group.beforeEndLine, group.afterEndLine)),
  );
  return Math.max(beforeLines, afterLines, hunkMax, groupMax, 1);
}

function buildChangeReviewMinimapEntries(file: ChangeReviewFile): ChangeReviewMinimapEntry[] {
  const groups = file.groups ?? [];
  const laneEndLines = [-Infinity, -Infinity, -Infinity, -Infinity, -Infinity];
  if (groups.length > 0) {
    return groups
      .map((group, index) => {
        const visualRange = resolveChangeReviewVisualRange(
          group.beforeStartLine,
          group.beforeEndLine,
          group.afterStartLine,
          group.afterEndLine,
        );
        let lane = laneEndLines.findIndex((endLine) => visualRange.startLine > endLine + 1);
        if (lane === -1) {
          lane = laneEndLines.indexOf(Math.min(...laneEndLines));
        }
        laneEndLines[lane] = Math.max(laneEndLines[lane], visualRange.endLine);
        const firstHunk = resolveChangeReviewGroupFirstHunk(file, group);
        return {
          key: group.groupId,
          anchorId: firstHunk
            ? buildChangeReviewRenderedBlockAnchorId(file.path, firstHunk.hunkId, 1)
            : buildChangeReviewGroupAnchorId(file.path, group.groupId),
          displayIndex: `#${index + 1}`,
          label: `组 #${index + 1} · ${group.summary}`,
          changeType: group.changeType,
          startLine: visualRange.startLine,
          endLine: visualRange.endLine,
          sortLine: visualRange.startLine,
          hunkId: firstHunk?.hunkId,
          groupId: group.groupId,
          lane,
        };
      })
      .toSorted((left, right) => left.sortLine - right.sortLine);
  }
  const rows = buildChangeReviewCompareRows(file);
  const occurrenceCounts = new Map<string, number>();
  const totalOccurrences = new Map<string, number>();
  const entries: ChangeReviewMinimapEntry[] = [];
  let previousHunkId: string | null = null;
  for (const row of rows) {
    const hunk = resolveChangeReviewRowHunk(file, row);
    const currentHunkId = hunk?.hunkId ?? null;
    if (!hunk || currentHunkId === previousHunkId) {
      previousHunkId = currentHunkId;
      continue;
    }
    totalOccurrences.set(hunk.hunkId, (totalOccurrences.get(hunk.hunkId) ?? 0) + 1);
    previousHunkId = hunk.hunkId;
  }
  previousHunkId = null;
  for (const row of rows) {
    const hunk = resolveChangeReviewRowHunk(file, row);
    const currentHunkId = hunk?.hunkId ?? null;
    if (!hunk || currentHunkId === previousHunkId) {
      previousHunkId = currentHunkId;
      continue;
    }
    const hunkId = hunk.hunkId;
    const occurrence = (occurrenceCounts.get(hunkId) ?? 0) + 1;
    occurrenceCounts.set(hunkId, occurrence);
    const visualRange = resolveChangeReviewVisualRange(
      hunk.beforeStartLine,
      hunk.beforeEndLine,
      hunk.afterStartLine,
      hunk.afterEndLine,
    );
    let lane = laneEndLines.findIndex((endLine) => visualRange.startLine > endLine + 1);
    if (lane === -1) {
      lane = laneEndLines.indexOf(Math.min(...laneEndLines));
    }
    laneEndLines[lane] = Math.max(laneEndLines[lane], visualRange.endLine);
    entries.push({
      key: `${hunkId}::${occurrence}`,
      anchorId: buildChangeReviewRenderedBlockAnchorId(file.path, hunkId, occurrence),
      displayIndex: hunk.hunkId.replace(/^hunk-/, "#"),
      label: `改动块 ${hunk.hunkId.replace(/^hunk-/, "#")}`,
      changeType: hunk.changeType,
      startLine: visualRange.startLine,
      endLine: visualRange.endLine,
      sortLine: visualRange.startLine,
      hunkId,
      lane,
    });
    previousHunkId = hunkId;
  }
  return entries;
}

function resolveChangeReviewHunk(file: ChangeReviewFile, hunkId?: string): ChangeReviewHunk | null {
  if (!hunkId) {
    return (file.hunks ?? [])[0] ?? null;
  }
  return (file.hunks ?? []).find((hunk) => hunk.hunkId === hunkId) ?? null;
}

function flashChangeReviewHunkTarget(targetHeader: HTMLElement) {
  targetHeader.classList.remove("is-jump-target");
  if (typeof window !== "undefined") {
    window.requestAnimationFrame(() => targetHeader.classList.add("is-jump-target"));
    window.setTimeout(() => targetHeader.classList.remove("is-jump-target"), 1800);
    return;
  }
  targetHeader.classList.add("is-jump-target");
}

function scrollToChangeReviewDiff(file: ChangeReviewFile, entry: ChangeReviewMinimapEntry) {
  if (typeof document === "undefined") {
    return;
  }
  const details = document.querySelector(
    ".chat-change-review-modal__full-compare",
  ) as HTMLDetailsElement | null;
  if (details && !details.open) {
    details.open = true;
  }
  const totalLines = getChangeReviewFileTotalLines(file);
  const targetLine = Math.max(entry.startLine || 1, 1);
  const ratio = Math.min(Math.max((targetLine - 1) / totalLines, 0), 1);
  const targetHunk = resolveChangeReviewHunk(file, entry.hunkId);
  const run = () => {
    const compareGrid =
      details?.querySelector(".chat-change-review-modal__compare-grid") ??
      document.querySelector(
        ".chat-change-review-modal__full-compare .chat-change-review-modal__compare-grid",
      );
    if (!compareGrid) {
      return;
    }
    const targetHeader =
      document.getElementById(entry.anchorId) ??
      (targetHunk
        ? document.getElementById(buildChangeReviewHunkAnchorId(file.path, targetHunk.hunkId))
        : null);
    if (targetHeader) {
      flashChangeReviewHunkTarget(targetHeader);
      const gridRect = compareGrid.getBoundingClientRect();
      const targetRect = targetHeader.getBoundingClientRect();
      const currentScrollTop = compareGrid.scrollTop || 0;
      const visualOffset = targetRect.top - gridRect.top + currentScrollTop;
      const targetTop = Math.max(visualOffset - compareGrid.clientHeight * 0.18, 0);
      compareGrid.scrollTo({ top: targetTop, behavior: "smooth" });
      return;
    }
    const maxScroll = Math.max(compareGrid.scrollHeight - compareGrid.clientHeight, 0);
    compareGrid.scrollTo({ top: ratio * maxScroll, behavior: "smooth" });
  };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => requestAnimationFrame(run));
    return;
  }
  run();
}

function renderChangeReviewMiniMap(file: ChangeReviewFile) {
  const entries = buildChangeReviewMinimapEntries(file);
  if (entries.length === 0) {
    return nothing;
  }
  const totalLines = getChangeReviewFileTotalLines(file);
  return html`<aside class="chat-change-review-modal__minimap" aria-label="改动定位总览">
    <div class="chat-change-review-modal__minimap-header">
      <div class="chat-change-review-modal__minimap-title">改动定位</div>
      <div class="chat-change-review-modal__minimap-meta">
        ${entries.length} 个定位点 · 共 ${totalLines} 行
      </div>
    </div>
    <div class="chat-change-review-modal__minimap-list" role="list">
      ${entries.map(
        (entry) => html`<button
          class="chat-change-review-modal__minimap-item chat-change-review-modal__minimap-item--${entry.changeType}"
          type="button"
          title=${`${entry.label} · ${entry.startLine}-${entry.endLine} 行`}
          aria-label=${`定位到${entry.label}`}
          @click=${() => scrollToChangeReviewDiff(file, entry)}
        >
          <span class="chat-change-review-modal__minimap-item-index">${entry.displayIndex}</span>
          <span class="chat-change-review-modal__minimap-item-body">
            <span class="chat-change-review-modal__minimap-item-label">${entry.label}</span>
            <span class="chat-change-review-modal__minimap-item-meta"
              >${renderChangeReviewStatusLabel(entry.changeType)} ·
              ${entry.startLine}-${entry.endLine} 行</span
            >
          </span>
        </button>`,
      )}
    </div>
  </aside>`;
}

function renderChangeReviewCompare(file: ChangeReviewFile, props: ChatProps) {
  const rows = buildChangeReviewCompareRows(file);
  const beforeEmptyText = file.changeType === "added" ? "变更前文件不存在" : "无内容";
  const afterEmptyText = file.changeType === "deleted" ? "该文件将被删除" : "无内容";
  const action = props.pendingChangeReviewAction ?? null;
  const busy = action !== null;
  const reviewId = props.pendingChangeReview?.id ?? "";
  let previousHunkId: string | null = null;
  const occurrenceCounts = new Map<string, number>();
  const totalOccurrences = new Map<string, number>();
  for (const row of rows) {
    const hunk = resolveChangeReviewRowHunk(file, row);
    const currentHunkId = hunk?.hunkId ?? null;
    if (!hunk || currentHunkId === previousHunkId) {
      previousHunkId = currentHunkId;
      continue;
    }
    totalOccurrences.set(hunk.hunkId, (totalOccurrences.get(hunk.hunkId) ?? 0) + 1);
    previousHunkId = hunk.hunkId;
  }
  previousHunkId = null;
  return html`<div
    class="chat-change-review-modal__compare-grid"
    role="document"
    aria-label="变更详情"
  >
    <div class="chat-change-review-modal__grid-header">变更前</div>
    <div class="chat-change-review-modal__grid-header">变更后</div>
    ${rows.length === 0
      ? html`<div class="chat-change-review-modal__grid-empty">${beforeEmptyText}</div>
          <div class="chat-change-review-modal__grid-empty">${afterEmptyText}</div>`
      : rows.map((row) => {
          const hunk = resolveChangeReviewRowHunk(file, row);
          const shouldRenderHunkHeader = hunk && hunk.hunkId !== previousHunkId;
          const occurrence = shouldRenderHunkHeader
            ? (occurrenceCounts.get(hunk.hunkId) ?? 0) + 1
            : null;
          if (shouldRenderHunkHeader) {
            occurrenceCounts.set(hunk.hunkId, occurrence!);
          }
          previousHunkId = hunk?.hunkId ?? null;
          const segmentLabel = shouldRenderHunkHeader
            ? buildChangeReviewSegmentLabel(occurrence!, totalOccurrences.get(hunk.hunkId) ?? 1)
            : null;
          return html`${shouldRenderHunkHeader
              ? html`<div
                  id=${buildChangeReviewRenderedBlockAnchorId(file.path, hunk.hunkId, occurrence!)}
                  class="chat-change-review-modal__hunk-header"
                >
                  <div>
                    <div class="chat-change-review-modal__hunk-title">
                      改动块 ${hunk.hunkId.replace(/^hunk-/, "#")}
                      ${segmentLabel
                        ? html`<span class="chat-change-review-modal__hunk-segment"
                            >${segmentLabel}</span
                          >`
                        : nothing}
                    </div>
                    <div class="chat-change-review-modal__hunk-meta">
                      ${renderChangeReviewStatusLabel(hunk.changeType)} · 前
                      ${hunk.beforeStartLine}-${hunk.beforeEndLine || hunk.beforeStartLine} / 后
                      ${hunk.afterStartLine}-${hunk.afterEndLine || hunk.afterStartLine}
                    </div>
                  </div>
                  <div class="chat-change-review-modal__hunk-actions">
                    <button
                      class="btn btn--small"
                      type="button"
                      ?disabled=${busy}
                      @click=${() =>
                        props.onApplyChangeReviewHunk?.(reviewId, file.path, hunk.hunkId)}
                    >
                      ${action?.type === "apply" &&
                      action.path === file.path &&
                      action.hunkId === hunk.hunkId
                        ? "应用中..."
                        : "应用此块"}
                    </button>
                    <button
                      class="btn btn--ghost btn--small"
                      type="button"
                      ?disabled=${busy}
                      @click=${() =>
                        props.onRevertChangeReviewHunk?.(reviewId, file.path, hunk.hunkId)}
                    >
                      ${action?.type === "revert" &&
                      action.path === file.path &&
                      action.hunkId === hunk.hunkId
                        ? "还原中..."
                        : "还原此块"}
                    </button>
                  </div>
                </div>`
              : nothing}
            <div class="chat-change-review-modal__grid-row ${hunk ? "is-in-hunk" : ""}">
              <div
                class="chat-change-review-modal__code-row chat-change-review-modal__code-row--${row.leftKind}"
              >
                <span class="chat-change-review-modal__line-number">${row.leftNumber ?? ""}</span>
                <span class="chat-change-review-modal__line-text">${row.leftText || " "}</span>
              </div>
              <div
                class="chat-change-review-modal__code-row chat-change-review-modal__code-row--${row.rightKind}"
              >
                <span class="chat-change-review-modal__line-number">${row.rightNumber ?? ""}</span>
                <span class="chat-change-review-modal__line-text">${row.rightText || " "}</span>
              </div>
            </div>`;
        })}
  </div>`;
}

function renderChangeReviewModal(props: ChatProps) {
  const review = props.pendingChangeReview;
  if (!review?.pending || !props.pendingChangeReviewOpen || !review.id) {
    return nothing;
  }
  const files = review.files ?? [];
  const selectedPath = props.pendingChangeReviewSelectedPath ?? files[0]?.path ?? null;
  const selectedFile = files.find((file) => file.path === selectedPath) ?? files[0] ?? null;
  const action = props.pendingChangeReviewAction ?? null;
  const busy = action !== null;
  const summaryTime = review.updatedAt
    ? new Date(review.updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
    : "刚刚";
  return html`<div
    class="chat-change-review-modal"
    role="dialog"
    aria-modal="true"
    aria-label="待确认改动详情"
  >
    <button
      class="chat-change-review-modal__scrim"
      type="button"
      aria-label="关闭待确认改动详情"
      @click=${() => props.onCloseChangeReview?.()}
    ></button>
    <div class="chat-change-review-modal__panel">
      <div class="chat-change-review-modal__header">
        <div>
          <div class="chat-change-review-modal__title">待确认改动</div>
          <div class="chat-change-review-modal__meta">${files.length} 个文件 · ${summaryTime}</div>
        </div>
        <div class="chat-change-review-modal__header-actions">
          <button
            class="btn"
            type="button"
            ?disabled=${busy}
            @click=${() => props.onApplyChangeReview?.(review.id!)}
          >
            ${action?.type === "apply" && !action.path ? "全部应用中..." : "全部应用"}
          </button>
          <button
            class="btn btn--ghost"
            type="button"
            ?disabled=${busy}
            @click=${() => props.onRevertChangeReview?.(review.id!)}
          >
            ${action?.type === "revert" && !action.path ? "全部还原中..." : "全部还原"}
          </button>
          <button
            class="btn btn--ghost"
            type="button"
            @click=${() => props.onCloseChangeReview?.()}
          >
            关闭
          </button>
        </div>
      </div>
      <div class="chat-change-review-modal__body">
        <div class="chat-change-review-modal__files">
          ${files.map(
            (file) => html`<button
              class="chat-change-review-modal__file ${selectedFile?.path === file.path
                ? "is-active"
                : ""}"
              type="button"
              ?disabled=${busy}
              @click=${() => props.onSelectChangeReviewFile?.(file.path)}
            >
              <span class="chat-change-review__status chat-change-review__status--${file.status}"
                >${renderChangeReviewStatusLabel(file.status)}</span
              >
              <span class="chat-change-review-modal__file-path">${file.path}</span>
            </button>`,
          )}
        </div>
        <div class="chat-change-review-modal__detail-shell">
          <div class="chat-change-review-modal__detail">
            ${selectedFile
              ? html`
                  <div class="chat-change-review-modal__detail-header">
                    <div>
                      <div class="chat-change-review-modal__detail-path">${selectedFile.path}</div>
                      <div class="chat-change-review-modal__detail-status">
                        ${renderChangeReviewStatusLabel(selectedFile.status)}
                      </div>
                    </div>
                    <div class="chat-change-review-modal__detail-actions">
                      <button
                        class="btn"
                        type="button"
                        ?disabled=${busy}
                        @click=${() => props.onApplyChangeReview?.(review.id!, selectedFile.path)}
                      >
                        ${action?.type === "apply" && action.path === selectedFile.path
                          ? "应用中..."
                          : "应用此文件"}
                      </button>
                      <button
                        class="btn btn--ghost"
                        type="button"
                        ?disabled=${busy}
                        @click=${() => props.onRevertChangeReview?.(review.id!, selectedFile.path)}
                      >
                        ${action?.type === "revert" && action.path === selectedFile.path
                          ? "还原中..."
                          : "还原此文件"}
                      </button>
                    </div>
                  </div>
                  <div class="chat-change-review-modal__file-summary">
                    本文件共 ${selectedFile.groups?.length ?? 0} 组改动 ·
                    ${selectedFile.hunks?.length ?? 0} 个改动块 · 首个改动
                    ${selectedFile.groups?.[0]?.afterStartLine ??
                    selectedFile.hunks?.[0]?.afterStartLine ??
                    0}
                    行
                  </div>
                  <details class="chat-change-review-modal__full-compare" open>
                    <summary>查看完整文件对比</summary>
                    ${renderChangeReviewCompare(selectedFile, props)}
                  </details>
                `
              : html`<div class="chat-change-review-modal__empty">没有可查看的文件</div>`}
          </div>
          ${selectedFile ? renderChangeReviewMiniMap(selectedFile) : nothing}
        </div>
      </div>
    </div>
  </div>`;
}

const COMPACTION_TOAST_DURATION_MS = 5000;
const FALLBACK_TOAST_DURATION_MS = 8000;

// Persistent instances keyed by session
const inputHistories = new Map<string, InputHistory>();
const pinnedMessagesMap = new Map<string, PinnedMessages>();
const deletedMessagesMap = new Map<string, DeletedMessages>();
const expandedToolCardsBySession = new Map<string, Map<string, boolean>>();
const initializedToolCardsBySession = new Map<string, Set<string>>();
const lastAutoExpandPrefBySession = new Map<string, boolean>();

function getInputHistory(sessionKey: string): InputHistory {
  return getOrCreateSessionCacheValue(inputHistories, sessionKey, () => new InputHistory());
}

function getPinnedMessages(sessionKey: string): PinnedMessages {
  return getOrCreateSessionCacheValue(
    pinnedMessagesMap,
    sessionKey,
    () => new PinnedMessages(sessionKey),
  );
}

function getDeletedMessages(sessionKey: string): DeletedMessages {
  return getOrCreateSessionCacheValue(
    deletedMessagesMap,
    sessionKey,
    () => new DeletedMessages(sessionKey),
  );
}

function getExpandedToolCards(sessionKey: string): Map<string, boolean> {
  return getOrCreateSessionCacheValue(expandedToolCardsBySession, sessionKey, () => new Map());
}

function getInitializedToolCards(sessionKey: string): Set<string> {
  return getOrCreateSessionCacheValue(initializedToolCardsBySession, sessionKey, () => new Set());
}

function appendCanvasBlockToAssistantMessage(
  message: unknown,
  preview: Extract<NonNullable<ToolCard["preview"]>, { kind: "canvas" }>,
  rawText: string | null,
) {
  const raw = message as Record<string, unknown>;
  const existingContent = Array.isArray(raw.content)
    ? [...raw.content]
    : typeof raw.content === "string"
      ? [{ type: "text", text: raw.content }]
      : typeof raw.text === "string"
        ? [{ type: "text", text: raw.text }]
        : [];
  const alreadyHasArtifact = existingContent.some((block) => {
    if (!block || typeof block !== "object") {
      return false;
    }
    const typed = block as {
      type?: unknown;
      preview?: { kind?: unknown; viewId?: unknown; url?: unknown };
    };
    return (
      typed.type === "canvas" &&
      typed.preview?.kind === "canvas" &&
      ((preview.viewId && typed.preview.viewId === preview.viewId) ||
        (preview.url && typed.preview.url === preview.url))
    );
  });
  if (alreadyHasArtifact) {
    return message;
  }
  return {
    ...raw,
    content: [
      ...existingContent,
      {
        type: "canvas",
        preview,
        ...(rawText ? { rawText } : {}),
      },
    ],
  };
}

function extractChatMessagePreview(toolMessage: unknown): {
  preview: Extract<NonNullable<ToolCard["preview"]>, { kind: "canvas" }>;
  text: string | null;
  timestamp: number | null;
} | null {
  const normalized = normalizeMessage(toolMessage);
  const cards = extractToolCards(toolMessage, "preview");
  for (let index = cards.length - 1; index >= 0; index--) {
    const card = cards[index];
    if (card?.preview?.kind === "canvas") {
      return {
        preview: card.preview,
        text: card.outputText ?? null,
        timestamp: normalized.timestamp ?? null,
      };
    }
  }
  const text = extractTextCached(toolMessage) ?? undefined;
  const toolRecord = toolMessage as Record<string, unknown>;
  const toolName =
    typeof toolRecord.toolName === "string"
      ? toolRecord.toolName
      : typeof toolRecord.tool_name === "string"
        ? toolRecord.tool_name
        : undefined;
  const preview = extractToolPreview(text, toolName);
  if (preview?.kind !== "canvas") {
    return null;
  }
  return { preview, text: text ?? null, timestamp: normalized.timestamp ?? null };
}

function findNearestAssistantMessageIndex(
  items: ChatItem[],
  toolTimestamp: number | null,
): number | null {
  const assistantEntries = items
    .map((item, index) => {
      if (item.kind !== "message") {
        return null;
      }
      const message = item.message as Record<string, unknown>;
      const role = typeof message.role === "string" ? message.role.toLowerCase() : "";
      if (role !== "assistant") {
        return null;
      }
      return {
        index,
        timestamp: normalizeMessage(item.message).timestamp ?? null,
      };
    })
    .filter(Boolean) as Array<{ index: number; timestamp: number | null }>;
  if (assistantEntries.length === 0) {
    return null;
  }
  if (toolTimestamp == null) {
    return assistantEntries[assistantEntries.length - 1]?.index ?? null;
  }
  let previous: { index: number; timestamp: number } | null = null;
  let next: { index: number; timestamp: number } | null = null;
  for (const entry of assistantEntries) {
    if (entry.timestamp == null) {
      continue;
    }
    if (entry.timestamp <= toolTimestamp) {
      previous = { index: entry.index, timestamp: entry.timestamp };
      continue;
    }
    next = { index: entry.index, timestamp: entry.timestamp };
    break;
  }
  if (previous && next) {
    const previousDelta = toolTimestamp - previous.timestamp;
    const nextDelta = next.timestamp - toolTimestamp;
    return nextDelta < previousDelta ? next.index : previous.index;
  }
  if (previous) {
    return previous.index;
  }
  if (next) {
    return next.index;
  }
  return assistantEntries[assistantEntries.length - 1]?.index ?? null;
}

function rawMessageTimestamp(message: unknown): number | null {
  const timestamp = (message as { timestamp?: unknown }).timestamp;
  return typeof timestamp === "number" && Number.isFinite(timestamp) ? timestamp : null;
}

function chatItemTimestamp(item: ChatItem): number | null {
  switch (item.kind) {
    case "message":
      return item.key === "chat:history:notice"
        ? Number.NEGATIVE_INFINITY
        : rawMessageTimestamp(item.message);
    case "divider":
      return item.timestamp;
    case "stream":
      return item.startedAt;
    case "reading-indicator":
      return null;
  }
  return null;
}

function sortChatItemsByVisibleTime(items: ChatItem[]): ChatItem[] {
  return items
    .map((item, index) => ({ item, index, timestamp: chatItemTimestamp(item) }))
    .toSorted((left, right) => {
      if (left.timestamp == null && right.timestamp == null) {
        return left.index - right.index;
      }
      if (left.timestamp == null) {
        return 1;
      }
      if (right.timestamp == null) {
        return -1;
      }
      if (left.timestamp !== right.timestamp) {
        return left.timestamp - right.timestamp;
      }
      return left.index - right.index;
    })
    .map(({ item }) => item);
}

interface ChatEphemeralState {
  sttRecording: boolean;
  sttInterimText: string;
  slashMenuOpen: boolean;
  slashMenuItems: SlashCommandDef[];
  slashMenuIndex: number;
  slashMenuMode: "command" | "args";
  slashMenuCommand: SlashCommandDef | null;
  slashMenuArgItems: string[];
  searchOpen: boolean;
  searchQuery: string;
  pinnedExpanded: boolean;
  taskDetailsExpanded: boolean;
  taskWorkspaceTab: "details" | "timeline" | "technical";
  newSessionDialogOpen: boolean;
  newSessionDialogSeed: string | null;
  newSessionName: string;
  newSessionAgentId: string;
}

function createChatEphemeralState(): ChatEphemeralState {
  return {
    sttRecording: false,
    sttInterimText: "",
    slashMenuOpen: false,
    slashMenuItems: [],
    slashMenuIndex: 0,
    slashMenuMode: "command",
    slashMenuCommand: null,
    slashMenuArgItems: [],
    searchOpen: false,
    searchQuery: "",
    pinnedExpanded: false,
    taskDetailsExpanded: true,
    taskWorkspaceTab: "details",
    newSessionDialogOpen: false,
    newSessionDialogSeed: null,
    newSessionName: "",
    newSessionAgentId: "",
  };
}

const vs = createChatEphemeralState();

/**
 * Reset chat view ephemeral state when navigating away.
 * Stops STT recording and clears search/slash UI that should not survive navigation.
 */
export function resetChatViewState() {
  if (vs.sttRecording) {
    stopStt();
  }
  Object.assign(vs, createChatEphemeralState());
}

export const cleanupChatModuleState = resetChatViewState;

function adjustTextareaHeight(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
}

function focusComposerFromChrome(event: MouseEvent, canSend: boolean) {
  if (!canSend || event.defaultPrevented) {
    return;
  }
  const target = event.target;
  const currentTarget = event.currentTarget;
  if (!(target instanceof Element) || !(currentTarget instanceof HTMLElement)) {
    return;
  }
  if (target.closest(COMPOSER_CHROME_INTERACTIVE_SELECTOR)) {
    return;
  }
  currentTarget.querySelector<HTMLTextAreaElement>(":scope > textarea")?.focus({
    preventScroll: true,
  });
}

function isNewSessionDialogOpen(props: ChatProps): boolean {
  return props.newSessionDialogOpen ?? vs.newSessionDialogOpen;
}

function openNewSessionDialog(props: ChatProps, requestUpdate: () => void) {
  if (props.newSessionCreating) {
    return;
  }
  if (props.onOpenNewSessionDialog) {
    props.onOpenNewSessionDialog();
    return;
  }
  vs.newSessionDialogOpen = true;
  requestUpdate();
}

function closeNewSessionDialog(props: ChatProps, requestUpdate: () => void) {
  if (props.newSessionCreating) {
    return;
  }
  if (props.onCloseNewSessionDialog) {
    props.onCloseNewSessionDialog();
  } else {
    vs.newSessionDialogOpen = false;
  }
  vs.newSessionDialogSeed = null;
  requestUpdate();
}

function getNewSessionAgentOptions(props: ChatProps) {
  const agents = props.agentsList?.agents ?? [];
  if (agents.length > 0) {
    return agents;
  }
  return props.currentAgentId ? [{ id: props.currentAgentId }] : [];
}

function resolveNewSessionAgentLabel(agent: {
  id: string;
  name?: string;
  identity?: { name?: string };
}): string {
  const name = agent.identity?.name?.trim() || agent.name?.trim() || "";
  return name && name !== agent.id ? `${name} (${agent.id})` : agent.id;
}

function syncNewSessionDraft(props: ChatProps) {
  const open = isNewSessionDialogOpen(props);
  if (!open) {
    vs.newSessionDialogSeed = null;
    return;
  }
  const agents = getNewSessionAgentOptions(props);
  const fallbackAgentId = props.agentsList?.defaultId || agents[0]?.id || props.currentAgentId;
  const selectedAgentId = agents.some((agent) => agent.id === props.currentAgentId)
    ? props.currentAgentId
    : fallbackAgentId;
  const seed = `${selectedAgentId}:${agents.map((agent) => agent.id).join(",")}`;
  if (vs.newSessionDialogSeed === seed) {
    return;
  }
  vs.newSessionDialogSeed = seed;
  vs.newSessionName = "";
  vs.newSessionAgentId = selectedAgentId;
}

function renderNewSessionDialog(
  props: ChatProps,
  requestUpdate: () => void,
): TemplateResult | typeof nothing {
  if (!isNewSessionDialogOpen(props)) {
    return nothing;
  }
  syncNewSessionDraft(props);
  const agents = getNewSessionAgentOptions(props);
  const canChooseAgent = agents.length > 1;
  const creating = Boolean(props.newSessionCreating);
  const selectedAgentId = vs.newSessionAgentId || agents[0]?.id || props.currentAgentId;
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0] ?? null;

  return html`
    <div
      class="chat-new-session-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-new-session-title"
      @click=${(event: MouseEvent) => {
        if (event.target === event.currentTarget) {
          closeNewSessionDialog(props, requestUpdate);
        }
      }}
    >
      <form
        class="chat-new-session-modal__panel"
        @submit=${async (event: SubmitEvent) => {
          event.preventDefault();
          if (creating) {
            return;
          }
          const created = await props.onNewSession({
            agentId: selectedAgentId || undefined,
            label: vs.newSessionName.trim() || undefined,
          });
          if (created !== false) {
            closeNewSessionDialog(props, requestUpdate);
          }
        }}
      >
        <div class="chat-new-session-modal__header">
          <div>
            <div class="chat-new-session-modal__eyebrow">New session</div>
            <div id="chat-new-session-title" class="chat-new-session-modal__title">创建新会话</div>
          </div>
          <button
            class="chat-new-session-modal__close"
            type="button"
            aria-label=${t("common.cancel")}
            ?disabled=${creating}
            @click=${() => closeNewSessionDialog(props, requestUpdate)}
          >
            ${icons.x}
          </button>
        </div>

        <label class="chat-new-session-modal__field">
          <span>会话名称</span>
          <input
            type="text"
            autocomplete="off"
            placeholder="例如：supply_vue 项目任务"
            .value=${vs.newSessionName}
            ?disabled=${creating}
            @input=${(event: InputEvent) => {
              vs.newSessionName = (event.target as HTMLInputElement).value;
              requestUpdate();
            }}
          />
        </label>

        <label class="chat-new-session-modal__field">
          <span>智能体</span>
          ${canChooseAgent
            ? html`
                <select
                  .value=${selectedAgentId}
                  ?disabled=${creating}
                  @change=${(event: Event) => {
                    vs.newSessionAgentId = (event.target as HTMLSelectElement).value;
                    requestUpdate();
                  }}
                >
                  ${agents.map(
                    (agent) =>
                      html`<option value=${agent.id}>
                        ${resolveNewSessionAgentLabel(agent)}
                      </option>`,
                  )}
                </select>
              `
            : html`
                <div class="chat-new-session-modal__agent-readonly">
                  ${selectedAgent ? resolveNewSessionAgentLabel(selectedAgent) : "main"}
                </div>
              `}
        </label>

        <div class="chat-new-session-modal__hint">
          创建后会自动切换到新会话，并保留当前输入框草稿。
        </div>

        <div class="chat-new-session-modal__actions">
          <button
            class="btn btn--ghost"
            type="button"
            ?disabled=${creating}
            @click=${() => closeNewSessionDialog(props, requestUpdate)}
          >
            ${t("common.cancel")}
          </button>
          <button class="btn primary" type="submit" ?disabled=${creating}>
            ${creating ? "创建中..." : "创建会话"}
          </button>
        </div>
      </form>
    </div>
  `;
}

function resetComposerHeight() {
  const textarea = document.querySelector<HTMLTextAreaElement>(".agent-chat__input textarea");
  if (!textarea) {
    return;
  }
  textarea.style.height = "auto";
}

function syncToolCardExpansionState(
  sessionKey: string,
  items: Array<ChatItem | MessageGroup>,
  autoExpandToolCalls: boolean,
) {
  const expanded = getExpandedToolCards(sessionKey);
  const initialized = getInitializedToolCards(sessionKey);
  const previousAutoExpand = lastAutoExpandPrefBySession.get(sessionKey) ?? false;
  const currentToolCardIds = new Set<string>();
  for (const item of items) {
    if (item.kind !== "group") {
      continue;
    }
    for (const entry of item.messages) {
      const cards = extractToolCards(entry.message, entry.key);
      for (let cardIndex = 0; cardIndex < cards.length; cardIndex++) {
        const disclosureId = `${entry.key}:toolcard:${cardIndex}`;
        currentToolCardIds.add(disclosureId);
        if (initialized.has(disclosureId)) {
          continue;
        }
        expanded.set(disclosureId, autoExpandToolCalls);
        initialized.add(disclosureId);
      }
      const messageRecord = entry.message as Record<string, unknown>;
      const role = typeof messageRecord.role === "string" ? messageRecord.role : "unknown";
      const normalizedRole = normalizeRoleForGrouping(role);
      const isToolMessage =
        isToolResultMessage(entry.message) ||
        normalizedRole === "tool" ||
        role.toLowerCase() === "toolresult" ||
        role.toLowerCase() === "tool_result" ||
        typeof messageRecord.toolCallId === "string" ||
        typeof messageRecord.tool_call_id === "string";
      if (!isToolMessage) {
        continue;
      }
      const disclosureId = `toolmsg:${entry.key}`;
      currentToolCardIds.add(disclosureId);
      if (initialized.has(disclosureId)) {
        continue;
      }
      expanded.set(disclosureId, autoExpandToolCalls);
      initialized.add(disclosureId);
    }
  }
  if (autoExpandToolCalls && !previousAutoExpand) {
    for (const toolCardId of currentToolCardIds) {
      expanded.set(toolCardId, true);
    }
  }
  lastAutoExpandPrefBySession.set(sessionKey, autoExpandToolCalls);
}

function renderCompactionIndicator(status: CompactionStatus | null | undefined) {
  if (!status) {
    return nothing;
  }
  if (status.phase === "active" || status.phase === "retrying") {
    return html`
      <div
        class="compaction-indicator compaction-indicator--active"
        role="status"
        aria-live="polite"
      >
        ${icons.loader} Compacting context...
      </div>
    `;
  }
  if (status.completedAt) {
    const elapsed = Date.now() - status.completedAt;
    if (elapsed < COMPACTION_TOAST_DURATION_MS) {
      return html`
        <div
          class="compaction-indicator compaction-indicator--complete"
          role="status"
          aria-live="polite"
        >
          ${icons.check} Context compacted
        </div>
      `;
    }
  }
  return nothing;
}

function renderFallbackIndicator(status: FallbackStatus | null | undefined) {
  if (!status) {
    return nothing;
  }
  const phase = status.phase ?? "active";
  const elapsed = Date.now() - status.occurredAt;
  if (elapsed >= FALLBACK_TOAST_DURATION_MS) {
    return nothing;
  }
  const details = [
    `Selected: ${status.selected}`,
    phase === "cleared" ? `Active: ${status.selected}` : `Active: ${status.active}`,
    phase === "cleared" && status.previous ? `Previous fallback: ${status.previous}` : null,
    status.reason ? `Reason: ${status.reason}` : null,
    status.attempts.length > 0 ? `Attempts: ${status.attempts.slice(0, 3).join(" | ")}` : null,
  ]
    .filter(Boolean)
    .join(" • ");
  const message =
    phase === "cleared"
      ? `Fallback cleared: ${status.selected}`
      : `Fallback active: ${status.active}`;
  const className =
    phase === "cleared"
      ? "compaction-indicator compaction-indicator--fallback-cleared"
      : "compaction-indicator compaction-indicator--fallback";
  const icon = phase === "cleared" ? icons.check : icons.brain;
  return html`
    <div class=${className} role="status" aria-live="polite" title=${details}>
      ${icon} ${message}
    </div>
  `;
}

type ChatActivityStatus = {
  label: string;
  detail: string;
  tone: "busy" | "queued" | "muted";
  spin?: boolean;
};

function resolveChatActivityStatus(props: ChatProps): ChatActivityStatus | null {
  if (props.newSessionCreating) {
    return {
      label: t("chatUi.status.creatingSession"),
      detail: t("chatUi.status.sessionMutationDetail"),
      tone: "busy",
      spin: true,
    };
  }
  if (props.resetSessionBusy) {
    return {
      label: t("chatUi.status.resettingSession"),
      detail: t("chatUi.status.sessionMutationDetail"),
      tone: "busy",
      spin: true,
    };
  }
  if (props.loading && props.messages.length === 0 && props.stream === null) {
    return {
      label: t("chatUi.status.loadingSession"),
      detail: t("chatUi.status.loadingSessionDetail"),
      tone: "muted",
      spin: true,
    };
  }
  if (props.sending || props.stream !== null || props.pendingRunId) {
    return {
      label: t("chatUi.status.running"),
      detail:
        props.queue.length > 0
          ? t("chatUi.status.runningWithQueue", { count: String(props.queue.length) })
          : t("chatUi.status.runningDetail"),
      tone: "busy",
      spin: true,
    };
  }
  if (props.queue.length > 0) {
    return {
      label: t("chatUi.status.queued", { count: String(props.queue.length) }),
      detail: t("chatUi.status.queuedDetail"),
      tone: "queued",
    };
  }
  return null;
}

function renderChatActivityStrip(props: ChatProps) {
  const status = resolveChatActivityStatus(props);
  if (!status) {
    return nothing;
  }
  return html`
    <div
      class="agent-chat__status-strip agent-chat__status-strip--${status.tone}"
      role="status"
      aria-live="polite"
    >
      <span
        class="agent-chat__status-strip-icon ${status.spin
          ? "agent-chat__status-strip-icon--spin"
          : ""}"
        aria-hidden="true"
      >
        ${status.spin ? icons.loader : icons.circle}
      </span>
      <span class="agent-chat__status-strip-label">${status.label}</span>
      <span class="agent-chat__status-strip-detail">${status.detail}</span>
    </div>
  `;
}

function renderSideResult(
  sideResult: ChatSideResult | null | undefined,
  onDismiss?: () => void,
): TemplateResult | typeof nothing {
  if (!sideResult) {
    return nothing;
  }
  return html`
    <section
      class=${`chat-side-result ${sideResult.isError ? "chat-side-result--error" : ""}`}
      role="status"
      aria-live="polite"
      aria-label="BTW side result"
    >
      <div class="chat-side-result__header">
        <div class="chat-side-result__label-row">
          <span class="chat-side-result__label">BTW</span>
          <span class="chat-side-result__meta">Not saved to chat history</span>
        </div>
        <button
          class="btn chat-side-result__dismiss"
          type="button"
          aria-label="Dismiss BTW result"
          title="Dismiss"
          @click=${() => onDismiss?.()}
        >
          ${icons.x}
        </button>
      </div>
      <div class="chat-side-result__question">${sideResult.question}</div>
      <div class="chat-side-result__body" dir=${detectTextDirection(sideResult.text)}>
        ${unsafeHTML(toSanitizedMarkdownHtml(sideResult.text))}
      </div>
    </section>
  `;
}

/**
 * Compact notice when context usage reaches 85%+.
 * Progressively shifts from amber (85%) to red (90%+).
 */
/** Parse a 6-digit CSS hex color string to [r, g, b] integer components. */
function parseHexRgb(hex: string): [number, number, number] | null {
  const h = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) {
    return null;
  }
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

let cachedThemeNoticeColors: {
  warnHex: string;
  dangerHex: string;
  warnRgb: [number, number, number];
  dangerRgb: [number, number, number];
} | null = null;

function getThemeNoticeColors() {
  if (cachedThemeNoticeColors) {
    return cachedThemeNoticeColors;
  }
  const rootStyle = getComputedStyle(document.documentElement);
  const warnHex = rootStyle.getPropertyValue("--warn").trim() || "#f59e0b";
  const dangerHex = rootStyle.getPropertyValue("--danger").trim() || "#ef4444";
  cachedThemeNoticeColors = {
    warnHex,
    dangerHex,
    warnRgb: parseHexRgb(warnHex) ?? [245, 158, 11],
    dangerRgb: parseHexRgb(dangerHex) ?? [239, 68, 68],
  };
  return cachedThemeNoticeColors;
}

function renderContextNotice(
  session: GatewaySessionRow | undefined,
  defaultContextTokens: number | null,
) {
  if (session?.totalTokensFresh === false) {
    return nothing;
  }
  const used = session?.totalTokens ?? 0;
  const limit = session?.contextTokens ?? defaultContextTokens ?? 0;
  if (!used || !limit) {
    return nothing;
  }
  const ratio = used / limit;
  if (ratio < 0.85) {
    return nothing;
  }
  const pct = Math.min(Math.round(ratio * 100), 100);
  // Read theme semantic tokens so color tracks the active theme (Dash, dark, light …)
  const { warnRgb, dangerRgb } = getThemeNoticeColors();
  const [wr, wg, wb] = warnRgb;
  const [dr, dg, db] = dangerRgb;
  // Blend from --warn at 85% usage to --danger at 95%+ usage
  const t = Math.min(Math.max((ratio - 0.85) / 0.1, 0), 1);
  const r = Math.round(wr + (dr - wr) * t);
  const g = Math.round(wg + (dg - wg) * t);
  const b = Math.round(wb + (db - wb) * t);
  const color = `rgb(${r}, ${g}, ${b})`;
  const bgOpacity = 0.08 + 0.08 * t;
  const bg = `rgba(${r}, ${g}, ${b}, ${bgOpacity})`;
  return html`
    <div class="context-notice" role="status" style="--ctx-color:${color};--ctx-bg:${bg}">
      <svg
        class="context-notice__icon"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <span>${pct}% context used</span>
      <span class="context-notice__detail"
        >${formatTokensCompact(used)} / ${formatTokensCompact(limit)}</span
      >
    </div>
  `;
}

/** Format token count compactly (e.g. 128000 → "128k"). */
function formatTokensCompact(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(n);
}

function generateAttachmentId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function handlePaste(e: ClipboardEvent, props: ChatProps) {
  const items = e.clipboardData?.items;
  if (!items || !props.onAttachmentsChange) {
    return;
  }
  const imageItems: DataTransferItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.startsWith("image/")) {
      imageItems.push(item);
    }
  }
  if (imageItems.length === 0) {
    return;
  }
  e.preventDefault();
  for (const item of imageItems) {
    const file = item.getAsFile();
    if (!file) {
      continue;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const dataUrl = reader.result as string;
      const newAttachment: ChatAttachment = {
        id: generateAttachmentId(),
        dataUrl,
        mimeType: file.type,
      };
      const current = props.attachments ?? [];
      props.onAttachmentsChange?.([...current, newAttachment]);
    });
    reader.readAsDataURL(file);
  }
}

function handleFileSelect(e: Event, props: ChatProps) {
  const input = e.target as HTMLInputElement;
  if (!input.files || !props.onAttachmentsChange) {
    return;
  }
  const current = props.attachments ?? [];
  const additions: ChatAttachment[] = [];
  let pending = 0;
  for (const file of input.files) {
    if (!isSupportedChatAttachmentMimeType(file.type)) {
      continue;
    }
    pending++;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      additions.push({
        id: generateAttachmentId(),
        dataUrl: reader.result as string,
        mimeType: file.type,
      });
      pending--;
      if (pending === 0) {
        props.onAttachmentsChange?.([...current, ...additions]);
      }
    });
    reader.readAsDataURL(file);
  }
  input.value = "";
}

function handleDrop(e: DragEvent, props: ChatProps) {
  e.preventDefault();
  const files = e.dataTransfer?.files;
  if (!files || !props.onAttachmentsChange) {
    return;
  }
  const current = props.attachments ?? [];
  const additions: ChatAttachment[] = [];
  let pending = 0;
  for (const file of files) {
    if (!isSupportedChatAttachmentMimeType(file.type)) {
      continue;
    }
    pending++;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      additions.push({
        id: generateAttachmentId(),
        dataUrl: reader.result as string,
        mimeType: file.type,
      });
      pending--;
      if (pending === 0) {
        props.onAttachmentsChange?.([...current, ...additions]);
      }
    });
    reader.readAsDataURL(file);
  }
}

function renderAttachmentPreview(props: ChatProps): TemplateResult | typeof nothing {
  const attachments = props.attachments ?? [];
  if (attachments.length === 0) {
    return nothing;
  }
  return html`
    <div class="chat-attachments-preview">
      ${attachments.map(
        (att) => html`
          <div class="chat-attachment-thumb">
            <img src=${att.dataUrl} alt="Attachment preview" />
            <button
              class="chat-attachment-remove"
              type="button"
              aria-label="Remove attachment"
              @click=${() => {
                const next = (props.attachments ?? []).filter((a) => a.id !== att.id);
                props.onAttachmentsChange?.(next);
              }}
            >
              &times;
            </button>
          </div>
        `,
      )}
    </div>
  `;
}

function resetSlashMenuState(): void {
  vs.slashMenuMode = "command";
  vs.slashMenuCommand = null;
  vs.slashMenuArgItems = [];
  vs.slashMenuItems = [];
}

function updateSlashMenu(value: string, requestUpdate: () => void): void {
  // Arg mode: /command <partial-arg>
  const argMatch = value.match(/^\/(\S+)\s(.*)$/);
  if (argMatch) {
    const cmdName = argMatch[1].toLowerCase();
    const argFilter = argMatch[2].toLowerCase();
    const cmd = SLASH_COMMANDS.find((c) => c.name === cmdName);
    if (cmd?.argOptions?.length) {
      const filtered = argFilter
        ? cmd.argOptions.filter((opt) => opt.toLowerCase().startsWith(argFilter))
        : cmd.argOptions;
      if (filtered.length > 0) {
        vs.slashMenuMode = "args";
        vs.slashMenuCommand = cmd;
        vs.slashMenuArgItems = filtered;
        vs.slashMenuOpen = true;
        vs.slashMenuIndex = 0;
        vs.slashMenuItems = [];
        requestUpdate();
        return;
      }
    }
    vs.slashMenuOpen = false;
    resetSlashMenuState();
    requestUpdate();
    return;
  }

  // Command mode: /partial-command
  const match = value.match(/^\/(\S*)$/);
  if (match) {
    const items = getSlashCommandCompletions(match[1]);
    vs.slashMenuItems = items;
    vs.slashMenuOpen = items.length > 0;
    vs.slashMenuIndex = 0;
    vs.slashMenuMode = "command";
    vs.slashMenuCommand = null;
    vs.slashMenuArgItems = [];
  } else {
    vs.slashMenuOpen = false;
    resetSlashMenuState();
  }
  requestUpdate();
}

function selectSlashCommand(
  cmd: SlashCommandDef,
  props: ChatProps,
  requestUpdate: () => void,
): void {
  // Transition to arg picker when the command has fixed options
  if (cmd.argOptions?.length) {
    props.onDraftChange(`/${cmd.name} `);
    vs.slashMenuMode = "args";
    vs.slashMenuCommand = cmd;
    vs.slashMenuArgItems = cmd.argOptions;
    vs.slashMenuOpen = true;
    vs.slashMenuIndex = 0;
    vs.slashMenuItems = [];
    requestUpdate();
    return;
  }

  vs.slashMenuOpen = false;
  resetSlashMenuState();

  if (cmd.executeLocal && !cmd.args) {
    props.onDraftChange(`/${cmd.name}`);
    requestUpdate();
    props.onSend();
  } else {
    props.onDraftChange(`/${cmd.name} `);
    requestUpdate();
  }
}

function tabCompleteSlashCommand(
  cmd: SlashCommandDef,
  props: ChatProps,
  requestUpdate: () => void,
): void {
  // Tab: fill in the command text without executing
  if (cmd.argOptions?.length) {
    props.onDraftChange(`/${cmd.name} `);
    vs.slashMenuMode = "args";
    vs.slashMenuCommand = cmd;
    vs.slashMenuArgItems = cmd.argOptions;
    vs.slashMenuOpen = true;
    vs.slashMenuIndex = 0;
    vs.slashMenuItems = [];
    requestUpdate();
    return;
  }

  vs.slashMenuOpen = false;
  resetSlashMenuState();
  props.onDraftChange(cmd.args ? `/${cmd.name} ` : `/${cmd.name}`);
  requestUpdate();
}

function selectSlashArg(
  arg: string,
  props: ChatProps,
  requestUpdate: () => void,
  execute: boolean,
): void {
  const cmdName = vs.slashMenuCommand?.name ?? "";
  vs.slashMenuOpen = false;
  resetSlashMenuState();
  props.onDraftChange(`/${cmdName} ${arg}`);
  requestUpdate();
  if (execute) {
    props.onSend();
  }
}

function tokenEstimate(draft: string): string | null {
  if (draft.length < 100) {
    return null;
  }
  return `~${Math.ceil(draft.length / 4)} tokens`;
}

/**
 * Export chat markdown - delegates to shared utility.
 */
function exportMarkdown(props: ChatProps): void {
  exportChatMarkdown(props.messages, props.assistantName);
}

const WELCOME_SUGGESTION_KEYS = [
  "chatUi.welcomeSuggestions.whatCanYouDo",
  "chatUi.welcomeSuggestions.recentSessions",
  "chatUi.welcomeSuggestions.configureChannel",
  "chatUi.welcomeSuggestions.systemHealth",
] as const;

function renderWelcomeState(props: ChatProps): TemplateResult {
  if ((props.sessionMode ?? "normal") === "task" && !props.currentTaskTitle) {
    return html`
      <div class="agent-chat__welcome" style="--agent-color: var(--accent)">
        <h2>${t("taskModeUi.banner.task")}</h2>
        <p class="agent-chat__hint">${t("taskModeUi.emptyTaskModeHint")}</p>
        <div class="agent-chat__suggestions">
          <button
            type="button"
            class="agent-chat__suggestion"
            @click=${() => props.onOpenTasksTab?.()}
          >
            ${t("taskModeUi.banner.openTasks")}
          </button>
        </div>
      </div>
    `;
  }
  const name = props.assistantName || "Assistant";
  const avatar = resolveAgentAvatarUrl({
    identity: {
      avatar: props.assistantAvatar ?? undefined,
      avatarUrl: props.assistantAvatarUrl ?? undefined,
    },
  });
  const logoUrl = agentLogoUrl(props.basePath ?? "");

  return html`
    <div class="agent-chat__welcome" style="--agent-color: var(--accent)">
      <div class="agent-chat__welcome-glow"></div>
      ${avatar
        ? html`<img
            src=${avatar}
            alt=${name}
            style="width:56px; height:56px; border-radius:50%; object-fit:cover;"
          />`
        : html`<div class="agent-chat__avatar agent-chat__avatar--logo">
            <img src=${logoUrl} alt="OpenClaw" />
          </div>`}
      <h2>${name}</h2>
      <div class="agent-chat__badges">
        <span class="agent-chat__badge"
          ><img src=${logoUrl} alt="" /> ${t("chatUi.readyToChat")}</span
        >
      </div>
      <p class="agent-chat__hint">
        ${t("chatUi.typeMessageHint")}&nbsp;<kbd>/</kbd>&nbsp;${t("chatUi.forCommands")}
      </p>
      <div class="agent-chat__suggestions">
        ${WELCOME_SUGGESTION_KEYS.map(
          (key) => html`
            <button
              type="button"
              class="agent-chat__suggestion"
              @click=${() => {
                const text = t(key);
                props.onDraftChange(text);
                props.onSend();
              }}
            >
              ${t(key)}
            </button>
          `,
        )}
      </div>
    </div>
  `;
}

function renderSearchBar(requestUpdate: () => void): TemplateResult | typeof nothing {
  if (!vs.searchOpen) {
    return nothing;
  }
  return html`
    <div class="agent-chat__search-bar">
      ${icons.search}
      <input
        type="text"
        placeholder="Search messages..."
        aria-label="Search messages"
        .value=${vs.searchQuery}
        @input=${(e: Event) => {
          vs.searchQuery = (e.target as HTMLInputElement).value;
          requestUpdate();
        }}
      />
      <button
        class="btn btn--ghost"
        aria-label="Close search"
        @click=${() => {
          vs.searchOpen = false;
          vs.searchQuery = "";
          requestUpdate();
        }}
      >
        ${icons.x}
      </button>
    </div>
  `;
}

function renderPinnedSection(
  props: ChatProps,
  pinned: PinnedMessages,
  requestUpdate: () => void,
): TemplateResult | typeof nothing {
  const messages = Array.isArray(props.messages) ? props.messages : [];
  const entries: Array<{ index: number; text: string; role: string }> = [];
  for (const idx of pinned.indices) {
    const msg = messages[idx] as Record<string, unknown> | undefined;
    if (!msg) {
      continue;
    }
    const text = getPinnedMessageSummary(msg);
    const role = typeof msg.role === "string" ? msg.role : "unknown";
    entries.push({ index: idx, text, role });
  }
  if (entries.length === 0) {
    return nothing;
  }
  return html`
    <div class="agent-chat__pinned">
      <button
        class="agent-chat__pinned-toggle"
        @click=${() => {
          vs.pinnedExpanded = !vs.pinnedExpanded;
          requestUpdate();
        }}
      >
        ${icons.bookmark} ${entries.length} pinned
        <span class="collapse-chevron ${vs.pinnedExpanded ? "" : "collapse-chevron--collapsed"}"
          >${icons.chevronDown}</span
        >
      </button>
      ${vs.pinnedExpanded
        ? html`
            <div class="agent-chat__pinned-list">
              ${entries.map(
                ({ index, text, role }) => html`
                  <div class="agent-chat__pinned-item">
                    <span class="agent-chat__pinned-role"
                      >${role === "user" ? "You" : "Assistant"}</span
                    >
                    <span class="agent-chat__pinned-text"
                      >${text.slice(0, 100)}${text.length > 100 ? "..." : ""}</span
                    >
                    <button
                      class="btn btn--ghost"
                      @click=${() => {
                        pinned.unpin(index);
                        requestUpdate();
                      }}
                      title="Unpin"
                    >
                      ${icons.x}
                    </button>
                  </div>
                `,
              )}
            </div>
          `
        : nothing}
    </div>
  `;
}

function renderSlashMenu(
  requestUpdate: () => void,
  props: ChatProps,
): TemplateResult | typeof nothing {
  if (!vs.slashMenuOpen) {
    return nothing;
  }

  // Arg-picker mode: show options for the selected command
  if (vs.slashMenuMode === "args" && vs.slashMenuCommand && vs.slashMenuArgItems.length > 0) {
    return html`
      <div class="slash-menu" role="listbox" aria-label="Command arguments">
        <div class="slash-menu-group">
          <div class="slash-menu-group__label">
            /${vs.slashMenuCommand.name} ${vs.slashMenuCommand.description}
          </div>
          ${vs.slashMenuArgItems.map(
            (arg, i) => html`
              <div
                class="slash-menu-item ${i === vs.slashMenuIndex ? "slash-menu-item--active" : ""}"
                role="option"
                aria-selected=${i === vs.slashMenuIndex}
                @click=${() => selectSlashArg(arg, props, requestUpdate, true)}
                @mouseenter=${() => {
                  vs.slashMenuIndex = i;
                  requestUpdate();
                }}
              >
                ${vs.slashMenuCommand?.icon
                  ? html`<span class="slash-menu-icon">${icons[vs.slashMenuCommand.icon]}</span>`
                  : nothing}
                <span class="slash-menu-name">${arg}</span>
                <span class="slash-menu-desc">/${vs.slashMenuCommand?.name} ${arg}</span>
              </div>
            `,
          )}
        </div>
        <div class="slash-menu-footer">
          <kbd>↑↓</kbd> navigate <kbd>Tab</kbd> fill <kbd>Enter</kbd> run <kbd>Esc</kbd> close
        </div>
      </div>
    `;
  }

  // Command mode: show grouped commands
  if (vs.slashMenuItems.length === 0) {
    return nothing;
  }

  const grouped = new Map<
    SlashCommandCategory,
    Array<{ cmd: SlashCommandDef; globalIdx: number }>
  >();
  for (let i = 0; i < vs.slashMenuItems.length; i++) {
    const cmd = vs.slashMenuItems[i];
    const cat = cmd.category ?? "session";
    let list = grouped.get(cat);
    if (!list) {
      list = [];
      grouped.set(cat, list);
    }
    list.push({ cmd, globalIdx: i });
  }

  const sections: TemplateResult[] = [];
  for (const [cat, entries] of grouped) {
    sections.push(html`
      <div class="slash-menu-group">
        <div class="slash-menu-group__label">${CATEGORY_LABELS[cat]}</div>
        ${entries.map(
          ({ cmd, globalIdx }) => html`
            <div
              class="slash-menu-item ${globalIdx === vs.slashMenuIndex
                ? "slash-menu-item--active"
                : ""}"
              role="option"
              aria-selected=${globalIdx === vs.slashMenuIndex}
              @click=${() => selectSlashCommand(cmd, props, requestUpdate)}
              @mouseenter=${() => {
                vs.slashMenuIndex = globalIdx;
                requestUpdate();
              }}
            >
              ${cmd.icon ? html`<span class="slash-menu-icon">${icons[cmd.icon]}</span>` : nothing}
              <span class="slash-menu-name">/${cmd.name}</span>
              ${cmd.args ? html`<span class="slash-menu-args">${cmd.args}</span>` : nothing}
              <span class="slash-menu-desc">${cmd.description}</span>
              ${cmd.argOptions?.length
                ? html`<span class="slash-menu-badge">${cmd.argOptions.length} options</span>`
                : cmd.executeLocal && !cmd.args
                  ? html` <span class="slash-menu-badge">instant</span> `
                  : nothing}
            </div>
          `,
        )}
      </div>
    `);
  }

  return html`
    <div class="slash-menu" role="listbox" aria-label=${t("chatUi.slashCommands")}>
      ${sections}
      <div class="slash-menu-footer">
        <kbd>↑↓</kbd> ${t("chatUi.navigate")} <kbd>Tab</kbd> ${t("chatUi.fill")}
        <kbd>Enter</kbd> ${t("chatUi.select")} <kbd>Esc</kbd> ${t("chatUi.close")}
      </div>
    </div>
  `;
}

export function renderChat(props: ChatProps) {
  const canCompose = props.connected;
  const isBusy = props.sending || props.stream !== null;
  const canAbort = Boolean(props.canAbort && props.onAbort);
  const activeSession = props.sessions?.sessions?.find((row) => row.key === props.sessionKey);
  const visiblePendingChangeReview = props.pendingRunId ? null : props.pendingChangeReview;
  const reasoningLevel = activeSession?.reasoningLevel ?? "off";
  const showReasoning = props.showThinking && reasoningLevel !== "off";
  const assistantIdentity = {
    name: props.assistantName,
    avatar:
      resolveAgentAvatarUrl({
        identity: {
          avatar: props.assistantAvatar ?? undefined,
          avatarUrl: props.assistantAvatarUrl ?? undefined,
        },
      }) ?? null,
  };
  const pinned = getPinnedMessages(props.sessionKey);
  const deleted = getDeletedMessages(props.sessionKey);
  const inputHistory = getInputHistory(props.sessionKey);
  const hasAttachments = (props.attachments?.length ?? 0) > 0;
  const tokens = tokenEstimate(props.draft);

  const placeholder = props.connected
    ? hasAttachments
      ? t("chatUi.placeholders.addMessageOrPasteImages")
      : t("chatUi.placeholders.messageAgent", { agent: props.assistantName || "agent" })
    : t("chatUi.placeholders.connectToGateway");

  const requestUpdate = props.onRequestUpdate ?? (() => {});
  const getDraft = props.getDraft ?? (() => props.draft);

  const splitRatio = props.splitRatio ?? 0.6;
  const sidebarOpen = Boolean(props.sidebarOpen && props.onCloseSidebar);

  const handleCodeBlockCopy = (e: Event) => {
    const btn = (e.target as HTMLElement).closest(".code-block-copy");
    if (!btn) {
      return;
    }
    const code = (btn as HTMLElement).dataset.code ?? "";
    navigator.clipboard.writeText(code).then(
      () => {
        btn.classList.add("copied");
        setTimeout(() => btn.classList.remove("copied"), 1500);
      },
      () => {},
    );
  };

  const chatItems = buildChatItems(props);
  syncToolCardExpansionState(props.sessionKey, chatItems, Boolean(props.autoExpandToolCalls));
  const expandedToolCards = getExpandedToolCards(props.sessionKey);
  const toggleToolCardExpanded = (toolCardId: string) => {
    expandedToolCards.set(toolCardId, !expandedToolCards.get(toolCardId));
    requestUpdate();
  };
  const hasVisibleConversation =
    chatItems.length > 0 || props.stream !== null || props.sending || props.queue.length > 0;
  const showLoadingSkeleton = props.loading && !hasVisibleConversation;
  const isEmpty = chatItems.length === 0 && !showLoadingSkeleton;

  const thread = html`
    <div
      class="chat-thread"
      role="log"
      aria-live="polite"
      @scroll=${props.onChatScroll}
      @click=${handleCodeBlockCopy}
    >
      <div class="chat-thread-inner">
        ${showLoadingSkeleton
          ? html`
              <div class="chat-loading-skeleton" aria-label="Loading chat">
                <div class="chat-line assistant">
                  <div class="chat-msg">
                    <div class="chat-bubble">
                      <div
                        class="skeleton skeleton-line skeleton-line--long"
                        style="margin-bottom: 8px"
                      ></div>
                      <div
                        class="skeleton skeleton-line skeleton-line--medium"
                        style="margin-bottom: 8px"
                      ></div>
                      <div class="skeleton skeleton-line skeleton-line--short"></div>
                    </div>
                  </div>
                </div>
                <div class="chat-line user" style="margin-top: 12px">
                  <div class="chat-msg">
                    <div class="chat-bubble">
                      <div class="skeleton skeleton-line skeleton-line--medium"></div>
                    </div>
                  </div>
                </div>
                <div class="chat-line assistant" style="margin-top: 12px">
                  <div class="chat-msg">
                    <div class="chat-bubble">
                      <div
                        class="skeleton skeleton-line skeleton-line--long"
                        style="margin-bottom: 8px"
                      ></div>
                      <div class="skeleton skeleton-line skeleton-line--short"></div>
                    </div>
                  </div>
                </div>
              </div>
            `
          : nothing}
        ${isEmpty && !vs.searchOpen ? renderWelcomeState(props) : nothing}
        ${isEmpty && vs.searchOpen
          ? html` <div class="agent-chat__empty">${t("chatUi.noMatchingMessages")}</div> `
          : nothing}
        ${repeat(
          chatItems,
          (item) => item.key,
          (item) => {
            if (item.kind === "divider") {
              return html`
                <div class="chat-divider" role="separator" data-ts=${String(item.timestamp)}>
                  <span class="chat-divider__line"></span>
                  <span class="chat-divider__label">${item.label}</span>
                  <span class="chat-divider__line"></span>
                </div>
              `;
            }
            if (item.kind === "reading-indicator") {
              return renderReadingIndicatorGroup(assistantIdentity, props.basePath);
            }
            if (item.kind === "stream") {
              return renderStreamingGroup(
                item.text,
                item.startedAt,
                props.onOpenSidebar,
                assistantIdentity,
                props.basePath,
              );
            }
            if (item.kind === "group") {
              if (deleted.has(item.key)) {
                return nothing;
              }
              return renderMessageGroup(item, {
                onOpenSidebar: props.onOpenSidebar,
                showReasoning,
                showToolCalls: props.showToolCalls,
                autoExpandToolCalls: Boolean(props.autoExpandToolCalls),
                isToolMessageExpanded: (messageId: string) =>
                  expandedToolCards.get(messageId) ?? false,
                onToggleToolMessageExpanded: (messageId: string) => {
                  expandedToolCards.set(messageId, !expandedToolCards.get(messageId));
                  requestUpdate();
                },
                isToolExpanded: (toolCardId: string) => expandedToolCards.get(toolCardId) ?? false,
                onToggleToolExpanded: toggleToolCardExpanded,
                onRequestUpdate: requestUpdate,
                assistantName: props.assistantName,
                assistantAvatar: assistantIdentity.avatar,
                basePath: props.basePath,
                localMediaPreviewRoots: props.localMediaPreviewRoots ?? [],
                assistantAttachmentAuthToken: props.assistantAttachmentAuthToken ?? null,
                canvasHostUrl: props.canvasHostUrl,
                embedSandboxMode: props.embedSandboxMode ?? "scripts",
                allowExternalEmbedUrls: props.allowExternalEmbedUrls ?? false,
                contextWindow:
                  activeSession?.contextTokens ?? props.sessions?.defaults?.contextTokens ?? null,
                onDelete: () => {
                  deleted.delete(item.key);
                  requestUpdate();
                },
              });
            }
            return nothing;
          },
        )}
      </div>
    </div>
  `;

  const handleKeyDown = (e: KeyboardEvent) => {
    // Slash menu navigation — arg mode
    if (vs.slashMenuOpen && vs.slashMenuMode === "args" && vs.slashMenuArgItems.length > 0) {
      const len = vs.slashMenuArgItems.length;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          vs.slashMenuIndex = (vs.slashMenuIndex + 1) % len;
          requestUpdate();
          return;
        case "ArrowUp":
          e.preventDefault();
          vs.slashMenuIndex = (vs.slashMenuIndex - 1 + len) % len;
          requestUpdate();
          return;
        case "Tab":
          e.preventDefault();
          selectSlashArg(vs.slashMenuArgItems[vs.slashMenuIndex], props, requestUpdate, false);
          return;
        case "Enter":
          e.preventDefault();
          selectSlashArg(vs.slashMenuArgItems[vs.slashMenuIndex], props, requestUpdate, true);
          return;
        case "Escape":
          e.preventDefault();
          vs.slashMenuOpen = false;
          resetSlashMenuState();
          requestUpdate();
          return;
      }
    }

    // Slash menu navigation — command mode
    if (vs.slashMenuOpen && vs.slashMenuItems.length > 0) {
      const len = vs.slashMenuItems.length;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          vs.slashMenuIndex = (vs.slashMenuIndex + 1) % len;
          requestUpdate();
          return;
        case "ArrowUp":
          e.preventDefault();
          vs.slashMenuIndex = (vs.slashMenuIndex - 1 + len) % len;
          requestUpdate();
          return;
        case "Tab":
          e.preventDefault();
          tabCompleteSlashCommand(vs.slashMenuItems[vs.slashMenuIndex], props, requestUpdate);
          return;
        case "Enter":
          e.preventDefault();
          selectSlashCommand(vs.slashMenuItems[vs.slashMenuIndex], props, requestUpdate);
          return;
        case "Escape":
          e.preventDefault();
          vs.slashMenuOpen = false;
          resetSlashMenuState();
          requestUpdate();
          return;
      }
    }

    if (e.key === "Escape" && props.sideResult && !vs.searchOpen) {
      e.preventDefault();
      props.onDismissSideResult?.();
      return;
    }

    // Input history (only when input is empty)
    if (!props.draft.trim()) {
      if (e.key === "ArrowUp") {
        const prev = inputHistory.up();
        if (prev !== null) {
          e.preventDefault();
          props.onDraftChange(prev);
        }
        return;
      }
      if (e.key === "ArrowDown") {
        const next = inputHistory.down();
        e.preventDefault();
        props.onDraftChange(next ?? "");
        return;
      }
    }

    // Cmd+F for search
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "f") {
      e.preventDefault();
      vs.searchOpen = !vs.searchOpen;
      if (!vs.searchOpen) {
        vs.searchQuery = "";
      }
      requestUpdate();
      return;
    }

    // Send on Enter (without shift)
    if (e.key === "Enter" && !e.shiftKey) {
      if (e.isComposing || e.keyCode === 229) {
        return;
      }
      if (!props.connected) {
        return;
      }
      e.preventDefault();
      if (canCompose) {
        if (props.draft.trim()) {
          inputHistory.push(props.draft);
        }
        props.onSend();
      }
    }
  };

  const handleInput = (event: Event) => {
    const target = event.target as HTMLTextAreaElement;
    adjustTextareaHeight(target);
    updateSlashMenu(target.value, requestUpdate);
    inputHistory.reset();
    props.onDraftChange(target.value);
  };

  const showModeSwitchPanel =
    (props.pendingRunId &&
      props.dreamingAssistApplied !== null &&
      props.dreamingAssistApplied !== undefined) ||
    props.onToggleDreamingAssist ||
    props.onTogglePlanMode ||
    props.onToggleExecutionGoalMode ||
    props.onToggleDevSpecFirst ||
    props.onToggleChangeReviewMode;

  const modeSwitchPanel = showModeSwitchPanel
    ? html`<div class="chat-mode-switches__panel">
        ${props.onToggleDreamingAssist ||
        props.onTogglePlanMode ||
        props.onToggleExecutionGoalMode ||
        props.onToggleDevSpecFirst ||
        props.onToggleChangeReviewMode
          ? html`<div class="chat-mode-switches__list">
              ${props.onToggleDreamingAssist
                ? html`<button
                    class="chat-mode-switch"
                    type="button"
                    role="switch"
                    aria-checked=${props.dreamingAssistEnabled !== false}
                    @click=${() => props.onToggleDreamingAssist?.()}
                  >
                    <span class="chat-mode-switch__meta">
                      <span class="chat-mode-switch__icon">${icons.brain}</span>
                      <span class="chat-mode-switch__text">
                        <span class="chat-mode-switch__label">协助策略</span>
                      </span>
                    </span>
                    <span
                      class="chat-mode-switch__control ${props.dreamingAssistEnabled !== false
                        ? "is-on"
                        : "is-off"}"
                    >
                      <span class="chat-mode-switch__thumb"></span>
                    </span>
                  </button>`
                : nothing}
              ${props.onTogglePlanMode
                ? html`<button
                    class="chat-mode-switch"
                    type="button"
                    role="switch"
                    aria-checked=${props.planModeEnabled === true}
                    @click=${() => props.onTogglePlanMode?.()}
                  >
                    <span class="chat-mode-switch__meta">
                      <span class="chat-mode-switch__icon">${icons.scrollText}</span>
                      <span class="chat-mode-switch__text">
                        <span class="chat-mode-switch__label">计划模式</span>
                      </span>
                    </span>
                    <span
                      class="chat-mode-switch__control ${props.planModeEnabled === true
                        ? "is-on"
                        : "is-off"}"
                    >
                      <span class="chat-mode-switch__thumb"></span>
                    </span>
                  </button>`
                : nothing}
              ${props.onToggleExecutionGoalMode
                ? html`<button
                    class="chat-mode-switch"
                    type="button"
                    role="switch"
                    aria-checked=${props.executionGoalModeEnabled === true}
                    @click=${() => props.onToggleExecutionGoalMode?.()}
                  >
                    <span class="chat-mode-switch__meta">
                      <span class="chat-mode-switch__icon">${icons.flag}</span>
                      <span class="chat-mode-switch__text">
                        <span class="chat-mode-switch__label">目标执行</span>
                      </span>
                    </span>
                    <span
                      class="chat-mode-switch__control ${props.executionGoalModeEnabled === true
                        ? "is-on"
                        : "is-off"}"
                    >
                      <span class="chat-mode-switch__thumb"></span>
                    </span>
                  </button>`
                : nothing}
              ${props.onToggleDevSpecFirst
                ? html`<button
                    class="chat-mode-switch"
                    type="button"
                    role="switch"
                    aria-checked=${props.devSpecFirstEnabled === true}
                    @click=${() => props.onToggleDevSpecFirst?.()}
                  >
                    <span class="chat-mode-switch__meta">
                      <span class="chat-mode-switch__icon">${icons.fileCode}</span>
                      <span class="chat-mode-switch__text">
                        <span class="chat-mode-switch__label">规格优先</span>
                      </span>
                    </span>
                    <span
                      class="chat-mode-switch__control ${props.devSpecFirstEnabled === true
                        ? "is-on"
                        : "is-off"}"
                    >
                      <span class="chat-mode-switch__thumb"></span>
                    </span>
                  </button>`
                : nothing}
              ${props.onToggleChangeReviewMode
                ? html`<button
                    class="chat-mode-switch"
                    type="button"
                    role="switch"
                    aria-checked=${props.changeReviewModeEnabled === true}
                    @click=${() => props.onToggleChangeReviewMode?.()}
                  >
                    <span class="chat-mode-switch__meta">
                      <span class="chat-mode-switch__icon">${icons.checkSquare}</span>
                      <span class="chat-mode-switch__text">
                        <span class="chat-mode-switch__label">改动确认</span>
                      </span>
                    </span>
                    <span
                      class="chat-mode-switch__control ${props.changeReviewModeEnabled === true
                        ? "is-on"
                        : "is-off"}"
                    >
                      <span class="chat-mode-switch__thumb"></span>
                    </span>
                  </button>`
                : nothing}
            </div>`
          : nothing}
        ${props.pendingRunId &&
        props.dreamingAssistApplied !== null &&
        props.dreamingAssistApplied !== undefined
          ? html`<div
              class="chat-mode-switches__status ${props.dreamingAssistApplied
                ? "is-success"
                : "is-muted"}"
            >
              ${props.dreamingAssistApplied ? "本轮已应用协助策略" : "本轮未应用协助策略"}
            </div>`
          : nothing}
        ${props.pendingRunId && !props.dreamingAssistApplied && props.dreamingAssistReason
          ? html`<div class="chat-mode-switches__reason">
              ${renderDreamingAssistReason(props.dreamingAssistReason)}
            </div>`
          : nothing}
      </div>`
    : nothing;

  const section = html`
    <section
      class="card chat"
      @drop=${(e: DragEvent) => handleDrop(e, props)}
      @dragover=${(e: DragEvent) => e.preventDefault()}
    >
      ${props.disabledReason ? html`<div class="callout">${props.disabledReason}</div>` : nothing}
      ${props.error ? html`<div class="callout danger">${props.error}</div>` : nothing}
      ${props.focusMode
        ? html`
            <button
              class="chat-focus-exit"
              type="button"
              @click=${props.onToggleFocusMode}
              aria-label=${t("chatUi.exitFocusMode")}
              title=${t("chatUi.exitFocusMode")}
            >
              ${icons.x}
            </button>
          `
        : nothing}
      ${renderSearchBar(requestUpdate)} ${renderPinnedSection(props, pinned, requestUpdate)}

      <div class="chat-split-container ${sidebarOpen ? "chat-split-container--open" : ""}">
        <div
          class="chat-main"
          style="flex: ${sidebarOpen ? `0 0 ${splitRatio * 100}%` : "1 1 100%"}"
        >
          ${thread}
        </div>

        ${sidebarOpen
          ? html`
              <resizable-divider
                .splitRatio=${splitRatio}
                @resize=${(e: CustomEvent) => props.onSplitRatioChange?.(e.detail.splitRatio)}
              ></resizable-divider>
              <div class="chat-sidebar" @click=${handleCodeBlockCopy}>
                ${renderMarkdownSidebar({
                  content: props.sidebarContent ?? null,
                  error: props.sidebarError ?? null,
                  canvasHostUrl: props.canvasHostUrl,
                  embedSandboxMode: props.embedSandboxMode ?? "scripts",
                  allowExternalEmbedUrls: props.allowExternalEmbedUrls ?? false,
                  onClose: props.onCloseSidebar!,
                  onViewRawText: () => {
                    if (!props.sidebarContent || !props.onOpenSidebar) {
                      return;
                    }
                    if (props.sidebarContent.kind === "markdown") {
                      props.onOpenSidebar(
                        buildSidebarContent(`\`\`\`\n${props.sidebarContent.content}\n\`\`\``),
                      );
                      return;
                    }
                    if (props.sidebarContent.rawText?.trim()) {
                      props.onOpenSidebar(
                        buildSidebarContent(`\`\`\`json\n${props.sidebarContent.rawText}\n\`\`\``),
                      );
                    }
                  },
                })}
              </div>
            `
          : nothing}
      </div>

      ${props.queue.length
        ? html`
            <div class="chat-queue" role="status" aria-live="polite">
              <div class="chat-queue__title">
                ${t("chatUi.queued", { count: String(props.queue.length) })}
              </div>
              <div class="chat-queue__list">
                ${props.queue.map(
                  (item) => html`
                    <div class="chat-queue__item">
                      <div class="chat-queue__text">
                        ${item.text ||
                        (item.attachments?.length ? `Image (${item.attachments.length})` : "")}
                      </div>
                      <button
                        class="btn chat-queue__remove"
                        type="button"
                        aria-label="Remove queued message"
                        @click=${() => props.onQueueRemove(item.id)}
                      >
                        ${icons.x}
                      </button>
                    </div>
                  `,
                )}
              </div>
            </div>
          `
        : nothing}
      ${renderSideResult(props.sideResult, props.onDismissSideResult)}
      ${renderFallbackIndicator(props.fallbackStatus)}
      ${renderCompactionIndicator(props.compactionStatus)}
      ${renderContextNotice(activeSession, props.sessions?.defaults?.contextTokens ?? null)}
      ${visiblePendingChangeReview?.pending
        ? html`<div class="callout warning chat-change-review" role="status">
            <div class="chat-change-review__header">
              <div>
                <strong>待确认改动</strong>
                <div class="chat-change-review__meta">
                  ${visiblePendingChangeReview.files?.length ?? 0} 个文件 ·
                  ${visiblePendingChangeReview.updatedAt
                    ? new Date(visiblePendingChangeReview.updatedAt).toLocaleTimeString("zh-CN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "刚刚"}
                </div>
              </div>
              <div class="row" style="gap: 8px; flex-wrap: wrap;">
                <button class="btn" type="button" @click=${() => props.onOpenChangeReview?.()}>
                  查看本次改动
                </button>
              </div>
            </div>
            <div class="chat-change-review__files">
              ${(visiblePendingChangeReview.files ?? [])
                .slice(0, 3)
                .map(
                  (file) =>
                    html`<div class="chat-change-review__file">
                      <span
                        class="chat-change-review__status chat-change-review__status--${file.status}"
                        >${renderChangeReviewStatusLabel(file.status)}</span
                      ><span class="chat-change-review__path">${file.path}</span>
                    </div>`,
                )}
            </div>
          </div>`
        : nothing}
      ${props.showNewMessages
        ? html`
            <button class="chat-new-messages" type="button" @click=${props.onScrollToBottom}>
              ${icons.arrowDown} ${t("chatUi.newMessages")}
            </button>
          `
        : nothing}
      ${renderChatActivityStrip(props)}

      <!-- Input bar -->
      <div
        class="agent-chat__input"
        @click=${(event: MouseEvent) => focusComposerFromChrome(event, props.canSend)}
      >
        ${renderSlashMenu(requestUpdate, props)} ${renderAttachmentPreview(props)}

        <input
          type="file"
          accept=${CHAT_ATTACHMENT_ACCEPT}
          multiple
          class="agent-chat__file-input"
          @change=${(e: Event) => handleFileSelect(e, props)}
        />

        ${vs.sttRecording && vs.sttInterimText
          ? html`<div class="agent-chat__stt-interim">${vs.sttInterimText}</div>`
          : nothing}

        <textarea
          ${ref((el) => el && adjustTextareaHeight(el as HTMLTextAreaElement))}
          .value=${props.draft}
          dir=${detectTextDirection(props.draft)}
          ?disabled=${!props.canSend}
          @keydown=${handleKeyDown}
          @input=${handleInput}
          @paste=${(e: ClipboardEvent) => handlePaste(e, props)}
          placeholder=${vs.sttRecording ? t("chatUi.listening") : placeholder}
          rows="1"
        ></textarea>

        <div class="agent-chat__toolbar">
          <div class="agent-chat__toolbar-left">
            <button
              class="agent-chat__input-btn"
              @click=${() => {
                document.querySelector<HTMLInputElement>(".agent-chat__file-input")?.click();
              }}
              title=${t("chatUi.attachFile")}
              aria-label=${t("chatUi.attachFile")}
              ?disabled=${!props.connected}
            >
              ${icons.paperclip}
              <span class="agent-chat__control-label">${t("chatUi.attachFile")}</span>
            </button>

            ${isSttSupported()
              ? html`
                  <button
                    class="agent-chat__input-btn ${vs.sttRecording
                      ? "agent-chat__input-btn--recording"
                      : ""}"
                    @click=${() => {
                      if (vs.sttRecording) {
                        stopStt();
                        vs.sttRecording = false;
                        vs.sttInterimText = "";
                        requestUpdate();
                      } else {
                        const started = startStt({
                          onTranscript: (text, isFinal) => {
                            if (isFinal) {
                              const current = getDraft();
                              const sep = current && !current.endsWith(" ") ? " " : "";
                              props.onDraftChange(current + sep + text);
                              vs.sttInterimText = "";
                            } else {
                              vs.sttInterimText = text;
                            }
                            requestUpdate();
                          },
                          onStart: () => {
                            vs.sttRecording = true;
                            requestUpdate();
                          },
                          onEnd: () => {
                            vs.sttRecording = false;
                            vs.sttInterimText = "";
                            requestUpdate();
                          },
                          onError: () => {
                            vs.sttRecording = false;
                            vs.sttInterimText = "";
                            requestUpdate();
                          },
                        });
                        if (started) {
                          vs.sttRecording = true;
                          requestUpdate();
                        }
                      }
                    }}
                    title=${vs.sttRecording ? t("chatUi.stopRecording") : t("chatUi.voiceInput")}
                    ?disabled=${!props.canSend}
                  >
                    ${vs.sttRecording ? icons.micOff : icons.mic}
                  </button>
                `
              : nothing}
            ${showModeSwitchPanel
              ? html`<details class="agent-chat__mode-menu">
                  <summary class="agent-chat__mode-trigger" aria-label="打开聊天模式设置">
                    <span class="agent-chat__mode-trigger-icon">${icons.settings}</span>
                    <span class="agent-chat__mode-trigger-label">模式</span>
                    <span class="agent-chat__mode-trigger-caret">${icons.arrowDown}</span>
                  </summary>
                  <div class="agent-chat__mode-menu-panel" role="dialog" aria-label="聊天模式设置">
                    ${modeSwitchPanel}
                  </div>
                </details>`
              : nothing}
            ${tokens ? html`<span class="agent-chat__token-count">${tokens}</span>` : nothing}
          </div>

          ${renderChatRunControls({
            canAbort,
            canSend: props.canSend,
            draft: props.draft,
            hasMessages: props.messages.length > 0,
            isBusy,
            newSessionBusy: props.newSessionCreating,
            resetSessionBusy: props.resetSessionBusy,
            showNewSessionAction: props.showNewSessionAction,
            sending: props.sending,
            onAbort: props.onAbort,
            onExport: () => exportMarkdown(props),
            onNewSession: () => openNewSessionDialog(props, requestUpdate),
            onResetSession: props.onClearHistory,
            onSend: props.onSend,
            onStoreDraft: (draft) => inputHistory.push(draft),
          })}
        </div>
      </div>
    </section>
  `;

  queueMicrotask(() => {
    if (!props.draft.trim()) {
      resetComposerHeight();
    }
  });

  return html`${section}${renderNewSessionDialog(props, requestUpdate)}${renderChangeReviewModal({
    ...props,
    pendingChangeReview: visiblePendingChangeReview,
    pendingChangeReviewOpen: visiblePendingChangeReview ? props.pendingChangeReviewOpen : false,
  })}`;
}

const CHAT_HISTORY_RENDER_LIMIT = 200;

function groupMessages(items: ChatItem[]): Array<ChatItem | MessageGroup> {
  const result: Array<ChatItem | MessageGroup> = [];
  let currentGroup: MessageGroup | null = null;

  for (const item of items) {
    if (item.kind !== "message") {
      if (currentGroup) {
        result.push(currentGroup);
        currentGroup = null;
      }
      result.push(item);
      continue;
    }

    const normalized = normalizeMessage(item.message);
    const role = normalizeRoleForGrouping(normalized.role);
    const senderLabel = role.toLowerCase() === "user" ? (normalized.senderLabel ?? null) : null;
    const timestamp = normalized.timestamp || Date.now();

    if (
      !currentGroup ||
      currentGroup.role !== role ||
      (role.toLowerCase() === "user" && currentGroup.senderLabel !== senderLabel)
    ) {
      if (currentGroup) {
        result.push(currentGroup);
      }
      currentGroup = {
        kind: "group",
        key: `group:${role}:${item.key}`,
        role,
        senderLabel,
        messages: [{ message: item.message, key: item.key }],
        timestamp,
        isStreaming: false,
      };
    } else {
      currentGroup.messages.push({ message: item.message, key: item.key });
    }
  }

  if (currentGroup) {
    result.push(currentGroup);
  }
  return result;
}

function buildChatItems(props: ChatProps): Array<ChatItem | MessageGroup> {
  const items: ChatItem[] = [];
  const history = Array.isArray(props.messages) ? props.messages : [];
  const tools = Array.isArray(props.toolMessages) ? props.toolMessages : [];
  const historyStart = Math.max(0, history.length - CHAT_HISTORY_RENDER_LIMIT);
  if (historyStart > 0) {
    items.push({
      kind: "message",
      key: "chat:history:notice",
      message: {
        role: "system",
        content: `Showing last ${CHAT_HISTORY_RENDER_LIMIT} messages (${historyStart} hidden).`,
        timestamp: Date.now(),
      },
    });
  }
  for (let i = historyStart; i < history.length; i++) {
    const msg = history[i];
    const normalized = normalizeMessage(msg);
    const raw = msg as Record<string, unknown>;
    const marker = raw.__openclaw as Record<string, unknown> | undefined;
    if (marker && marker.kind === "compaction") {
      items.push({
        kind: "divider",
        key:
          typeof marker.id === "string"
            ? `divider:compaction:${marker.id}`
            : `divider:compaction:${normalized.timestamp}:${i}`,
        label: "Compaction",
        timestamp: normalized.timestamp ?? Date.now(),
      });
      continue;
    }

    if (!props.showToolCalls && normalized.role.toLowerCase() === "toolresult") {
      continue;
    }

    // Apply search filter if active
    if (vs.searchOpen && vs.searchQuery.trim() && !messageMatchesSearchQuery(msg, vs.searchQuery)) {
      continue;
    }

    items.push({
      kind: "message",
      key: messageKey(msg, i),
      message: msg,
    });
  }
  const liftedCanvasSources = tools
    .map((tool) => extractChatMessagePreview(tool))
    .filter((entry) => Boolean(entry)) as Array<{
    preview: Extract<NonNullable<ToolCard["preview"]>, { kind: "canvas" }>;
    text: string | null;
    timestamp: number | null;
  }>;
  for (const liftedCanvasSource of liftedCanvasSources) {
    const assistantIndex = findNearestAssistantMessageIndex(items, liftedCanvasSource.timestamp);
    if (assistantIndex == null) {
      continue;
    }
    const item = items[assistantIndex];
    if (!item || item.kind !== "message") {
      continue;
    }
    items[assistantIndex] = {
      ...item,
      message: appendCanvasBlockToAssistantMessage(
        item.message as Record<string, unknown>,
        liftedCanvasSource.preview,
        liftedCanvasSource.text,
      ),
    };
  }
  // Interleave stream segments and tool cards in order. Each segment
  // contains text that was streaming before the corresponding tool started.
  // This ensures correct visual ordering: text → tool → text → tool → ...
  const segments = props.streamSegments ?? [];
  const maxLen = Math.max(segments.length, tools.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < segments.length && segments[i].text.trim().length > 0) {
      items.push({
        kind: "stream" as const,
        key: `stream-seg:${props.sessionKey}:${i}`,
        text: segments[i].text,
        startedAt: segments[i].ts,
      });
    }
    if (i < tools.length && props.showToolCalls) {
      items.push({
        kind: "message",
        key: messageKey(tools[i], i + history.length),
        message: tools[i],
      });
    }
  }

  if (props.stream !== null) {
    const key = `stream:${props.sessionKey}:${props.streamStartedAt ?? "live"}`;
    if (props.stream.trim().length > 0) {
      items.push({
        kind: "stream",
        key,
        text: props.stream,
        startedAt: props.streamStartedAt ?? Date.now(),
      });
    }
  }

  return groupMessages(sortChatItemsByVisibleTime(items));
}

function messageKey(message: unknown, index: number): string {
  const m = message as Record<string, unknown>;
  const toolCallId = typeof m.toolCallId === "string" ? m.toolCallId : "";
  if (toolCallId) {
    const role = typeof m.role === "string" ? m.role : "unknown";
    const id = typeof m.id === "string" ? m.id : "";
    if (id) {
      return `tool:${role}:${toolCallId}:${id}`;
    }
    const messageId = typeof m.messageId === "string" ? m.messageId : "";
    if (messageId) {
      return `tool:${role}:${toolCallId}:${messageId}`;
    }
    const timestamp = typeof m.timestamp === "number" ? m.timestamp : null;
    if (timestamp != null) {
      return `tool:${role}:${toolCallId}:${timestamp}:${index}`;
    }
    return `tool:${role}:${toolCallId}:${index}`;
  }
  const id = typeof m.id === "string" ? m.id : "";
  if (id) {
    return `msg:${id}`;
  }
  const messageId = typeof m.messageId === "string" ? m.messageId : "";
  if (messageId) {
    return `msg:${messageId}`;
  }
  const timestamp = typeof m.timestamp === "number" ? m.timestamp : null;
  const role = typeof m.role === "string" ? m.role : "unknown";
  if (timestamp != null) {
    return `msg:${role}:${timestamp}:${index}`;
  }
  return `msg:${role}:${index}`;
}
