import { html, nothing } from "lit";
import { t } from "../../i18n/index.ts";
import type {
  DreamingEntry,
  WikiImportInsights,
  WikiMemoryPalace,
} from "../controllers/dreaming.ts";

// ── Diary entry parser ─────────────────────────────────────────────────

type DiaryEntry = {
  date: string;
  body: string;
};

type DiaryEntryNav = {
  date: string;
  body: string;
  page: number;
};

const DIARY_START_RE = /<!--\s*openclaw:dreaming:diary:start\s*-->/;
const DIARY_END_RE = /<!--\s*openclaw:dreaming:diary:end\s*-->/;

function parseDiaryEntries(raw: string): DiaryEntry[] {
  // Extract content between diary markers, or use full content.
  let content = raw;
  const startMatch = DIARY_START_RE.exec(raw);
  const endMatch = DIARY_END_RE.exec(raw);
  if (startMatch && endMatch && endMatch.index > startMatch.index) {
    content = raw.slice(startMatch.index + startMatch[0].length, endMatch.index);
  }

  const entries: DiaryEntry[] = [];
  // Split on --- separators.
  const blocks = content.split(/\n---\n/).filter((b) => b.trim().length > 0);

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    let date = "";
    const bodyLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      // Date lines are wrapped in *asterisks* like: *April 5, 2026, 3:00 AM*
      if (!date && trimmed.startsWith("*") && trimmed.endsWith("*") && trimmed.length > 2) {
        date = trimmed.slice(1, -1);
        continue;
      }
      // Skip heading lines and HTML comments.
      if (trimmed.startsWith("#") || trimmed.startsWith("<!--")) {
        continue;
      }
      if (trimmed.length > 0) {
        bodyLines.push(trimmed);
      }
    }

    if (bodyLines.length > 0) {
      entries.push({ date, body: bodyLines.join("\n") });
    }
  }

  return entries;
}

function parseDiaryTimestamp(date: string): number | null {
  const parsed = Date.parse(date);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDiaryChipLabel(date: string): string {
  const parsed = parseDiaryTimestamp(date);
  if (parsed === null) {
    return date;
  }
  const value = new Date(parsed);
  return `${value.getMonth() + 1}/${value.getDate()}`;
}

function buildDiaryNavigation(entries: DiaryEntry[]): DiaryEntryNav[] {
  const reversed = [...entries].toReversed();
  return reversed.map((entry, page) => ({
    ...entry,
    page,
  }));
}

type DreamingPhaseInfo = {
  enabled: boolean;
  cron: string;
  nextRunAtMs?: number;
};

export type DreamingProps = {
  active: boolean;
  shortTermCount: number;
  groundedSignalCount: number;
  totalSignalCount: number;
  promotedCount: number;
  phases?: {
    light: DreamingPhaseInfo;
    deep: DreamingPhaseInfo;
    rem: DreamingPhaseInfo;
  };
  shortTermEntries: DreamingEntry[];
  promotedEntries: DreamingEntry[];
  latestRun: {
    at: string;
    workspaces: number;
    candidates: number;
    applied: number;
    failed: number;
    narrativeWritten: number;
    narrativeSkipped: number;
    zeroAppliedReason?: string;
    learningSummary?: {
      summary: string;
      recommendation: string;
      assistanceStrategy: string;
      durableSignals: string[];
      temporaryFocus: string[];
      sources: Array<{
        kind: "task" | "chat" | "memory";
        label: string;
        detail: string;
      }>;
    };
  } | null;
  dreamingOf: string | null;
  nextCycle: string | null;
  timezone: string | null;
  statusLoading: boolean;
  statusError: string | null;
  modeSaving: boolean;
  dreamDiaryLoading: boolean;
  dreamDiaryActionLoading: boolean;
  dreamDiaryActionMessage: { kind: "success" | "error"; text: string } | null;
  dreamDiaryActionArchivePath: string | null;
  dreamDiaryError: string | null;
  dreamDiaryPath: string | null;
  dreamDiaryContent: string | null;
  dreamingAssistEnabled: boolean;
  memoryWikiEnabled: boolean;
  wikiImportInsightsLoading: boolean;
  wikiImportInsightsError: string | null;
  wikiImportInsights: WikiImportInsights | null;
  wikiMemoryPalaceLoading: boolean;
  wikiMemoryPalaceError: string | null;
  wikiMemoryPalace: WikiMemoryPalace | null;
  onRefresh: () => void;
  onRefreshDiary: () => void;
  onRefreshImports: () => void;
  onToggleDreamingAssist: () => void;
  onRefreshMemoryPalace: () => void;
  onOpenConfig: () => void;
  onRunNow: () => void;
  onOpenWikiPage: (lookup: string) => Promise<{
    title: string;
    path: string;
    content: string;
    totalLines?: number;
    truncated?: boolean;
    updatedAt?: string;
  } | null>;
  onBackfillDiary: () => void;
  onCopyDreamingArchivePath: () => void;
  onDedupeDreamDiary: () => void;
  onResetDiary: () => void;
  onResetGroundedShortTerm: () => void;
  onRepairDreamingArtifacts: () => void;
  onRequestUpdate?: () => void;
};

const DREAM_PHRASE_KEYS = [
  "dreaming.phrases.consolidatingMemories",
  "dreaming.phrases.tidyingKnowledgeGraph",
  "dreaming.phrases.replayingConversations",
  "dreaming.phrases.weavingShortTerm",
  "dreaming.phrases.defragmentingMindPalace",
  "dreaming.phrases.filingLooseThoughts",
  "dreaming.phrases.connectingDots",
  "dreaming.phrases.compostingContext",
  "dreaming.phrases.alphabetizingSubconscious",
  "dreaming.phrases.promotingHunches",
  "dreaming.phrases.forgettingNoise",
  "dreaming.phrases.dreamingEmbeddings",
  "dreaming.phrases.reorganizingAttic",
  "dreaming.phrases.indexingDay",
  "dreaming.phrases.nurturingInsights",
  "dreaming.phrases.simmeringIdeas",
  "dreaming.phrases.whisperingVectorStore",
] as const;

const DREAM_PHASE_LABEL_KEYS = {
  light: "dreaming.phase.light",
  deep: "dreaming.phase.deep",
  rem: "dreaming.phase.rem",
} as const;

let _dreamIndex = Math.floor(Math.random() * DREAM_PHRASE_KEYS.length);
let _dreamLastSwap = 0;
const DREAM_SWAP_MS = 6_000;

// ── Sub-tab state ─────────────────────────────────────────────────────

type DreamSubTab = "scene" | "diary" | "advanced";
let _subTab: DreamSubTab = "scene";
type DreamDiarySubTab = "dreams" | "insights" | "palace";
let _diarySubTab: DreamDiarySubTab = "dreams";
type AdvancedWaitingSort = "recent" | "signals";
let _advancedWaitingSort: AdvancedWaitingSort = "recent";
const _expandedInsightCards = new Set<string>();
const _expandedPalaceCards = new Set<string>();
let _wikiPreviewOpen = false;
let _wikiPreviewLoading = false;
let _wikiPreviewTitle = "";
let _wikiPreviewPath = "";
let _wikiPreviewUpdatedAt: string | null = null;
let _wikiPreviewContent = "";
let _wikiPreviewTotalLines: number | null = null;
let _wikiPreviewTruncated = false;
let _wikiPreviewError: string | null = null;

export function setDreamSubTab(tab: DreamSubTab): void {
  _subTab = tab;
}

export function setDreamAdvancedWaitingSort(sort: AdvancedWaitingSort): void {
  _advancedWaitingSort = sort;
}

export function setDreamDiarySubTab(tab: DreamDiarySubTab): void {
  _diarySubTab = tab;
}

// ── Diary pagination state ─────────────────────────────────────────────

let _diaryPage = 0;
let _diaryEntryCount = 0;

/** Navigate to a specific diary page. Triggers a re-render via Lit's reactive cycle. */
export function setDiaryPage(page: number): void {
  _diaryPage = Math.max(0, Math.min(page, Math.max(0, _diaryEntryCount - 1)));
}

function currentDreamPhrase(): string {
  const now = Date.now();
  if (now - _dreamLastSwap > DREAM_SWAP_MS) {
    _dreamLastSwap = now;
    _dreamIndex = (_dreamIndex + 1) % DREAM_PHRASE_KEYS.length;
  }
  return t(DREAM_PHRASE_KEYS[_dreamIndex] ?? DREAM_PHRASE_KEYS[0]);
}

const STARS: {
  top: number;
  left: number;
  size: number;
  delay: number;
  hue: "neutral" | "accent";
}[] = [
  { top: 8, left: 15, size: 3, delay: 0, hue: "neutral" },
  { top: 12, left: 72, size: 2, delay: 1.4, hue: "neutral" },
  { top: 22, left: 35, size: 3, delay: 0.6, hue: "accent" },
  { top: 18, left: 88, size: 2, delay: 2.1, hue: "neutral" },
  { top: 35, left: 8, size: 2, delay: 0.9, hue: "neutral" },
  { top: 45, left: 92, size: 2, delay: 1.7, hue: "neutral" },
  { top: 55, left: 25, size: 3, delay: 2.5, hue: "accent" },
  { top: 65, left: 78, size: 2, delay: 0.3, hue: "neutral" },
  { top: 75, left: 45, size: 2, delay: 1.1, hue: "neutral" },
  { top: 82, left: 60, size: 3, delay: 1.8, hue: "accent" },
  { top: 30, left: 55, size: 2, delay: 0.4, hue: "neutral" },
  { top: 88, left: 18, size: 2, delay: 2.3, hue: "neutral" },
];

const sleepingLobster = html`
  <svg viewBox="0 0 120 120" fill="none">
    <defs>
      <linearGradient id="dream-lob-g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#ff4d4d" />
        <stop offset="100%" stop-color="#991b1b" />
      </linearGradient>
    </defs>
    <path
      d="M60 10C30 10 15 35 15 55C15 75 30 95 45 100L45 110L55 110L55 100C55 100 60 102 65 100L65 110L75 110L75 100C90 95 105 75 105 55C105 35 90 10 60 10Z"
      fill="url(#dream-lob-g)"
    />
    <path d="M20 45C5 40 0 50 5 60C10 70 20 65 25 55C28 48 25 45 20 45Z" fill="url(#dream-lob-g)" />
    <path
      d="M100 45C115 40 120 50 115 60C110 70 100 65 95 55C92 48 95 45 100 45Z"
      fill="url(#dream-lob-g)"
    />
    <path d="M45 15Q38 8 35 14" stroke="#ff4d4d" stroke-width="3" stroke-linecap="round" />
    <path d="M75 15Q82 8 85 14" stroke="#ff4d4d" stroke-width="3" stroke-linecap="round" />
    <path
      d="M39 36Q45 32 51 36"
      stroke="#050810"
      stroke-width="2.5"
      stroke-linecap="round"
      fill="none"
    />
    <path
      d="M69 36Q75 32 81 36"
      stroke="#050810"
      stroke-width="2.5"
      stroke-linecap="round"
      fill="none"
    />
  </svg>
`;

export function renderDreaming(props: DreamingProps) {
  const idle = !props.active;
  const dreamText = props.dreamingOf ?? currentDreamPhrase();

  return html`
    <div class="dreams-page">
      <!-- ── Sub-tab bar ── -->
      <nav class="dreams__tabs">
        <button
          class="dreams__tab ${_subTab === "scene" ? "dreams__tab--active" : ""}"
          @click=${() => {
            _subTab = "scene";
            props.onRequestUpdate?.();
          }}
        >
          ${t("dreaming.tabs.scene")}
        </button>
        <button
          class="dreams__tab ${_subTab === "diary" ? "dreams__tab--active" : ""}"
          @click=${() => {
            _subTab = "diary";
            props.onRequestUpdate?.();
          }}
        >
          ${t("dreaming.tabs.diary")}
        </button>
        <button
          class="dreams__tab ${_subTab === "advanced" ? "dreams__tab--active" : ""}"
          @click=${() => {
            _subTab = "advanced";
            props.onRequestUpdate?.();
          }}
        >
          ${t("dreaming.tabs.advanced")}
        </button>
      </nav>

      ${_subTab === "scene"
        ? renderScene(props, idle, dreamText)
        : _subTab === "diary"
          ? renderDiarySection(props)
          : renderAdvancedSection(props)}
    </div>
  `;
}

// ── Scene renderer ────────────────────────────────────────────────────

// Strip source citations like [memory/2026-04-09.md:9] and section headings,
// flatten structured diary entries into plain paragraphs.
function flattenDiaryBody(body: string): string[] {
  return (
    body
      .split("\n")
      .map((line) => line.trim())
      // Remove section headings that leak implementation
      .filter(
        (line) =>
          line.length > 0 &&
          line !== "What Happened" &&
          line !== "Reflections" &&
          line !== "Candidates" &&
          line !== "Possible Lasting Updates",
      )
      // Strip source citations [memory/...]
      .map((line) => line.replace(/\s*\[memory\/[^\]]+\]/g, ""))
      // Strip leading list markers and labels
      .map((line) =>
        line
          .replace(/^(?:\d+\.\s+|-\s+(?:\[[^\]]+\]\s+)?(?:[a-z_]+:\s+)?)/i, "")
          .replace(/^(?:likely_durable|likely_situational|unclear):\s+/i, "")
          .trim(),
      )
      .filter((line) => line.length > 0)
  );
}

function formatPhaseNextRun(nextRunAtMs?: number): string {
  if (!nextRunAtMs) {
    return "—";
  }
  const d = new Date(nextRunAtMs);
  return d.toLocaleTimeString("zh-CN", { hour: "numeric", minute: "2-digit", hour12: false });
}

function renderLatestRunSummary(latestRun: NonNullable<DreamingProps["latestRun"]>) {
  const resultSummary =
    latestRun.applied > 0
      ? `已提升 ${latestRun.applied} 条`
      : latestRun.zeroAppliedReason
        ? "本次未提升任何条目"
        : `已提升 ${latestRun.applied} 条`;
  return html`
    <div class="row wrap items-center gap-2">
      <span class="dreams__phase-next">${t("dreaming.scene.lastRunPrefix")} ${formatCompactDateTime(latestRun.at)} · ${resultSummary}</span>
    </div>
    <div class="row wrap items-center gap-2">
      <span class="dreams__phase-next">候选 ${latestRun.candidates} 条 · 日记 ${latestRun.narrativeWritten} 条 · 工作区 ${latestRun.workspaces} 个</span>
    </div>
    <div class="row wrap items-center gap-2">
      <span class="dreams__phase-next">失败 ${latestRun.failed} 个 · 跳过叙事 ${latestRun.narrativeSkipped} 次</span>
    </div>
    ${latestRun.zeroAppliedReason
      ? html`
          <div class="row wrap items-center gap-2">
            <span class="dreams__phase-next">未提升原因：${latestRun.zeroAppliedReason}</span>
          </div>
        `
      : nothing}
    ${latestRun.learningSummary
      ? html`
          <div class="row wrap items-center gap-2">
            <span class="dreams__phase-next">学习摘要：${latestRun.learningSummary.summary}</span>
          </div>
          ${latestRun.learningSummary.temporaryFocus.length
            ? html`<div class="row wrap items-center gap-2">
                <span class="dreams__phase-next">当前聚焦：${latestRun.learningSummary.temporaryFocus.join(" · ")}</span>
              </div>`
            : nothing}
          <div class="row wrap items-center gap-2">
            <span class="dreams__phase-next">改进建议：${latestRun.learningSummary.recommendation}</span>
          </div>
          <div class="row wrap items-center gap-2">
            <span class="dreams__phase-next">协助策略：${latestRun.learningSummary.assistanceStrategy}</span>
          </div>
          ${latestRun.learningSummary.durableSignals.length
            ? html`<div class="row wrap items-center gap-2">
                <span class="dreams__phase-next">长期信号：${latestRun.learningSummary.durableSignals.join(" · ")}</span>
              </div>`
            : nothing}
          ${latestRun.learningSummary.sources.length
            ? html`<div class="row wrap items-center gap-2">
                <span class="dreams__phase-next">来源：${latestRun.learningSummary.sources
                  .map((source) => `${source.kind}:${source.label}`)
                  .join(" · ")}</span>
              </div>`
            : nothing}
        `
      : nothing}
    <div class="row wrap items-center gap-2">
      <span class="dreams__phase-next">说明：手动运行只会做后台整理，不会创建可见会话。</span>
    </div>
  `;
}

function renderActionCallout(props: DreamingProps) {
  if (!props.dreamDiaryActionMessage) {
    return nothing;
  }
  return html`
    <div
      class="callout ${props.dreamDiaryActionMessage.kind === "success" ? "success" : "danger"}"
      role="status"
    >
      <div class="row wrap items-center gap-2">
        <span>${props.dreamDiaryActionMessage.text}</span>
        ${props.dreamDiaryActionArchivePath
          ? html`
              <button
                class="btn btn--subtle btn--sm"
                ?disabled=${props.dreamDiaryActionLoading}
                @click=${() => props.onCopyDreamingArchivePath()}
              >
                复制归档路径
              </button>
            `
          : nothing}
      </div>
    </div>
  `;
}

function renderScene(props: DreamingProps, idle: boolean, dreamText: string) {
  return html`
    <section class="dreams ${idle ? "dreams--idle" : ""}">
      ${STARS.map(
        (s) => html`
          <div
            class="dreams__star"
            style="
              top: ${s.top}%;
              left: ${s.left}%;
              width: ${s.size}px;
              height: ${s.size}px;
              background: ${s.hue === "accent" ? "var(--accent-muted)" : "var(--text)"};
              animation-delay: ${s.delay}s;
            "
          ></div>
        `,
      )}

      <div class="dreams__moon"></div>

      ${props.active
        ? html`
            <div class="dreams__bubble">
              <span class="dreams__bubble-text">${dreamText}</span>
            </div>
            <div
              class="dreams__bubble-dot"
              style="top: calc(50% - 160px); left: calc(50% - 120px); width: 12px; height: 12px; animation-delay: 0.2s;"
            ></div>
            <div
              class="dreams__bubble-dot"
              style="top: calc(50% - 120px); left: calc(50% - 90px); width: 8px; height: 8px; animation-delay: 0.4s;"
            ></div>
          `
        : nothing}

      <div class="dreams__glow"></div>
      <div class="dreams__lobster">${sleepingLobster}</div>
      <span class="dreams__z">z</span>
      <span class="dreams__z">z</span>
      <span class="dreams__z">Z</span>

      <div class="dreams__status">
        <span class="dreams__status-label"
          >${props.active ? t("dreaming.status.active") : t("dreaming.status.idle")}</span
        >
        <div class="dreams__status-detail">
          <div class="dreams__status-dot"></div>
          <span>
            ${props.promotedCount} ${t("dreaming.status.promotedSuffix")}
            ${props.nextCycle
              ? html`· ${t("dreaming.status.nextSweepPrefix")} ${props.nextCycle}`
              : nothing}
            ${props.timezone ? html`· ${props.timezone}` : nothing}
          </span>
        </div>
        <div class="row wrap items-center gap-2 mt-2">
          <button
            class="btn btn--primary btn--sm"
            ?disabled=${props.modeSaving || props.dreamDiaryActionLoading}
            @click=${() => props.onRunNow()}
          >
            ${props.dreamDiaryActionLoading ? t("dreaming.scene.working") : t("dreaming.scene.runNow")}
          </button>
          <button
            class="btn btn--subtle btn--sm"
            @click=${() => props.onToggleDreamingAssist()}
          >
            ${props.dreamingAssistEnabled ? "协助策略：开启" : "协助策略：关闭"}
          </button>
        </div>
        ${props.latestRun ? renderLatestRunSummary(props.latestRun) : nothing}
        ${renderActionCallout(props)}
      </div>

      <!-- Sleep phases -->
      <div class="dreams__phases">
        ${(Object.keys(DREAM_PHASE_LABEL_KEYS) as (keyof typeof DREAM_PHASE_LABEL_KEYS)[]).map(
          (phaseId) => {
            const phase = props.phases?.[phaseId];
            const hasPhaseStatus = phase !== undefined;
            const enabled = phase?.enabled === true;
            const nextRun = formatPhaseNextRun(phase?.nextRunAtMs);
            const label = t(DREAM_PHASE_LABEL_KEYS[phaseId]);
            const status = !hasPhaseStatus ? "—" : enabled ? nextRun : t("dreaming.phase.off");
            return html`
              <div class="dreams__phase ${hasPhaseStatus && !enabled ? "dreams__phase--off" : ""}">
                <div class="dreams__phase-dot ${enabled ? "dreams__phase-dot--on" : ""}"></div>
                <span class="dreams__phase-name">${label}</span>
                <span class="dreams__phase-next">${status}</span>
              </div>
            `;
          },
        )}
      </div>

      ${props.statusError
        ? html`<div class="dreams__controls-error">${props.statusError}</div>`
        : nothing}
    </section>
  `;
}

function formatRange(path: string, startLine: number, endLine: number): string {
  return startLine === endLine ? `${path}:${startLine}` : `${path}:${startLine}-${endLine}`;
}

function formatCompactDateTime(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }
  return new Date(parsed).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });
}

function basename(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  return normalized.split("/").findLast(Boolean) ?? value;
}

function formatKindLabel(kind: "entity" | "concept" | "source" | "synthesis" | "report"): string {
  switch (kind) {
    case "entity":
      return "实体";
    case "concept":
      return "概念";
    case "source":
      return "来源";
    case "synthesis":
      return "综合";
    case "report":
      return "报告";
  }
}


function formatImportBadge(item: {
  digestStatus: "available" | "withheld";
  riskLevel: "low" | "medium" | "high" | "unknown";
}): string {
  if (item.digestStatus === "withheld") {
    return "待复核";
  }
  switch (item.riskLevel) {
    case "low":
      return "低风险";
    case "medium":
      return "中风险";
    case "high":
      return "高风险";
    case "unknown":
      return "风险未知";
  }
  return "风险未知";
}

function toggleExpandedCard(bucket: Set<string>, key: string, requestUpdate?: () => void): void {
  if (bucket.has(key)) {
    bucket.delete(key);
  } else {
    bucket.add(key);
  }
  requestUpdate?.();
}

async function openWikiPreview(lookup: string, props: DreamingProps): Promise<void> {
  _wikiPreviewOpen = true;
  _wikiPreviewLoading = true;
  _wikiPreviewTitle = basename(lookup);
  _wikiPreviewPath = lookup;
  _wikiPreviewUpdatedAt = null;
  _wikiPreviewContent = "";
  _wikiPreviewTotalLines = null;
  _wikiPreviewTruncated = false;
  _wikiPreviewError = null;
  props.onRequestUpdate?.();
  try {
    const preview = await props.onOpenWikiPage(lookup);
    if (!preview) {
      _wikiPreviewError = `No wiki page found for ${lookup}.`;
      return;
    }
    _wikiPreviewTitle = preview.title;
    _wikiPreviewPath = preview.path;
    _wikiPreviewUpdatedAt = preview.updatedAt ?? null;
    _wikiPreviewContent = preview.content;
    _wikiPreviewTotalLines = typeof preview.totalLines === "number" ? preview.totalLines : null;
    _wikiPreviewTruncated = preview.truncated === true;
  } catch (error) {
    _wikiPreviewError = String(error);
  } finally {
    _wikiPreviewLoading = false;
    props.onRequestUpdate?.();
  }
}

function closeWikiPreview(requestUpdate?: () => void): void {
  _wikiPreviewOpen = false;
  _wikiPreviewLoading = false;
  _wikiPreviewTitle = "";
  _wikiPreviewPath = "";
  _wikiPreviewUpdatedAt = null;
  _wikiPreviewContent = "";
  _wikiPreviewTotalLines = null;
  _wikiPreviewTruncated = false;
  _wikiPreviewError = null;
  requestUpdate?.();
}

function renderWikiPreviewOverlay(props: DreamingProps) {
  if (!_wikiPreviewOpen) {
    return nothing;
  }
  return html`
    <div
      class="dreams-diary__preview-backdrop"
      @click=${() => closeWikiPreview(props.onRequestUpdate)}
    >
      <div class="dreams-diary__preview-panel" @click=${(event: Event) => event.stopPropagation()}>
        <div class="dreams-diary__preview-header">
          <div>
            <div class="dreams-diary__preview-title">${_wikiPreviewTitle || "Wiki 页面"}</div>
            <div class="dreams-diary__preview-meta">
              ${_wikiPreviewPath} ${_wikiPreviewUpdatedAt ? ` · ${_wikiPreviewUpdatedAt}` : ""}
            </div>
          </div>
          <button
            class="btn btn--subtle btn--sm"
            @click=${() => closeWikiPreview(props.onRequestUpdate)}
          >
            关闭
          </button>
        </div>
        <div class="dreams-diary__preview-body">
          ${_wikiPreviewLoading
            ? html`<div class="dreams-diary__empty-text">正在加载 Wiki 页面…</div>`
            : _wikiPreviewError
              ? html`<div class="dreams-diary__error">${_wikiPreviewError}</div>`
              : html`
                  ${_wikiPreviewTruncated
                    ? html`
                        <div class="dreams-diary__preview-hint">
                          当前只显示该页面的首段内容${_wikiPreviewTotalLines !== null
                            ? `（共 ${_wikiPreviewTotalLines} 行）`
                            : ""}。
                        </div>
                      `
                    : nothing}
                  <pre class="dreams-diary__preview-pre">${_wikiPreviewContent}</pre>
                `}
        </div>
      </div>
    </div>
  `;
}

function renderDiarySubtabExplainer() {
  switch (_diarySubTab) {
    case "dreams":
      return html`
        <p class="dreams-diary__explainer">
          这里是系统在回放与整理记忆时写下的原始梦境日记；可用来检查记忆系统正在注意什么，以及哪些地方仍然偏噪或偏薄。
        </p>
      `;
    case "insights":
      return html`
        <p class="dreams-diary__explainer">
          这里是从外部历史聚合出来的导入洞察；可用来回看导入阶段先浮现了什么，再决定哪些内容值得进入长期记忆。
        </p>
      `;
    case "palace":
      return html`
        <p class="dreams-diary__explainer">
          这里是系统可搜索、可推理的记忆 Wiki 汇总面；相比原始导入对话，更适合检查真实记忆页面、结论、待解问题与矛盾点。
        </p>
      `;
  }
  return nothing;
}

function parseSortableTimestamp(value?: string): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function compareWaitingEntryByRecency(a: DreamingEntry, b: DreamingEntry): number {
  const aMs = parseSortableTimestamp(a.lastRecalledAt);
  const bMs = parseSortableTimestamp(b.lastRecalledAt);
  if (bMs !== aMs) {
    return bMs - aMs;
  }
  if (b.totalSignalCount !== a.totalSignalCount) {
    return b.totalSignalCount - a.totalSignalCount;
  }
  return a.path.localeCompare(b.path);
}

function compareWaitingEntryBySignals(a: DreamingEntry, b: DreamingEntry): number {
  if (b.totalSignalCount !== a.totalSignalCount) {
    return b.totalSignalCount - a.totalSignalCount;
  }
  if (b.phaseHitCount !== a.phaseHitCount) {
    return b.phaseHitCount - a.phaseHitCount;
  }
  return compareWaitingEntryByRecency(a, b);
}

function sortWaitingEntries(entries: DreamingEntry[], sort: AdvancedWaitingSort): DreamingEntry[] {
  return sort === "signals"
    ? entries.toSorted(compareWaitingEntryBySignals)
    : entries.toSorted(compareWaitingEntryByRecency);
}

function describeWaitingEntryOrigin(entry: DreamingEntry): string {
  const hasGroundedReplay = entry.groundedCount > 0;
  const hasLiveSupport = entry.recallCount > 0 || entry.dailyCount > 0;
  if (hasGroundedReplay && hasLiveSupport) {
    return t("dreaming.advanced.originMixed");
  }
  if (hasGroundedReplay) {
    return t("dreaming.advanced.originDailyLog");
  }
  return t("dreaming.advanced.originLive");
}

function renderAdvancedEntryList(params: {
  titleKey: string;
  descriptionKey: string;
  emptyKey: string;
  entries: DreamingEntry[];
  meta: (entry: DreamingEntry) => string[];
  badge?: (entry: DreamingEntry) => string | null;
  controls?: ReturnType<typeof html>;
}) {
  return html`
    <section class="dreams-advanced__section">
      <div class="dreams-advanced__section-header">
        <div class="dreams-advanced__section-copy">
          <span class="dreams-advanced__section-title">${t(params.titleKey)}</span>
          <p class="dreams-advanced__section-description">${t(params.descriptionKey)}</p>
        </div>
        <div class="dreams-advanced__section-toolbar">
          ${params.controls ?? nothing}
          <span class="dreams-advanced__section-count">${params.entries.length}</span>
        </div>
      </div>
      ${params.entries.length === 0
        ? html`<div class="dreams-advanced__empty">${t(params.emptyKey)}</div>`
        : html`
            <div class="dreams-advanced__list">
              ${params.entries.map(
                (entry) => html`
                  <article class="dreams-advanced__item" data-entry-key=${entry.key}>
                    ${params.badge
                      ? (() => {
                          const label = params.badge?.(entry);
                          return label
                            ? html`<span class="dreams-advanced__badge">${label}</span>`
                            : nothing;
                        })()
                      : nothing}
                    <div class="dreams-advanced__snippet">${entry.snippet}</div>
                    <div class="dreams-advanced__source">
                      ${formatRange(entry.path, entry.startLine, entry.endLine)}
                    </div>
                    <div class="dreams-advanced__meta">
                      ${params
                        .meta(entry)
                        .filter((part) => part.length > 0)
                        .join(" · ")}
                    </div>
                  </article>
                `,
              )}
            </div>
          `}
    </section>
  `;
}

function renderAdvancedSection(props: DreamingProps) {
  const groundedEntries = props.shortTermEntries.filter((entry) => entry.groundedCount > 0);
  const waitingEntries = sortWaitingEntries(props.shortTermEntries, _advancedWaitingSort);
  const description = t("dreaming.advanced.description");
  const summary = [
    `${groundedEntries.length} ${t("dreaming.advanced.summaryFromDailyLog")}`,
    `${props.shortTermCount} ${t("dreaming.advanced.summaryWaiting")}`,
    `${props.promotedCount} ${t("dreaming.advanced.summaryPromotedToday")}`,
  ].join(" · ");

  return html`
    <section class="dreams-advanced">
      <div class="dreams-advanced__header">
        <div class="dreams-advanced__intro">
          <span class="dreams-advanced__eyebrow">${t("dreaming.advanced.eyebrow")}</span>
          <h2 class="dreams-advanced__title">${t("dreaming.advanced.title")}</h2>
          ${description
            ? html`<p class="dreams-advanced__description">${description}</p>`
            : nothing}
          <div class="dreams-advanced__summary">${summary}</div>
        </div>
        <div class="dreams-advanced__actions">
          <button
            class="btn btn--subtle btn--sm"
            ?disabled=${props.modeSaving || props.dreamDiaryActionLoading}
            @click=${() => props.onDedupeDreamDiary()}
          >
            ${t("dreaming.scene.dedupeDiary")}
          </button>
          <button
            class="btn btn--subtle btn--sm"
            ?disabled=${props.modeSaving || props.dreamDiaryActionLoading}
            @click=${() => props.onRepairDreamingArtifacts()}
          >
            ${t("dreaming.scene.repairCache")}
          </button>
          <button
            class="btn btn--subtle btn--sm"
            ?disabled=${props.modeSaving || props.dreamDiaryActionLoading}
            @click=${() => props.onBackfillDiary()}
          >
            ${props.dreamDiaryActionLoading
              ? t("dreaming.scene.working")
              : t("dreaming.scene.backfill")}
          </button>
          <button
            class="btn btn--subtle btn--sm"
            ?disabled=${props.modeSaving || props.dreamDiaryActionLoading}
            @click=${() => props.onResetDiary()}
          >
            ${t("dreaming.scene.reset")}
          </button>
          <button
            class="btn btn--subtle btn--sm"
            ?disabled=${props.modeSaving || props.dreamDiaryActionLoading}
            @click=${() => props.onResetGroundedShortTerm()}
          >
            ${t("dreaming.scene.clearGrounded")}
          </button>
        </div>
      </div>
      ${renderActionCallout(props)}

      <div class="dreams-advanced__sections">
        ${renderAdvancedEntryList({
          titleKey: "dreaming.advanced.stagedTitle",
          descriptionKey: "dreaming.advanced.stagedDescription",
          emptyKey: "dreaming.advanced.emptyGrounded",
          entries: groundedEntries,
          controls: html`
            <button
              class="btn btn--subtle btn--sm"
              ?disabled=${props.modeSaving || props.dreamDiaryActionLoading}
              @click=${() => props.onResetGroundedShortTerm()}
            >
              ${t("dreaming.scene.clearGrounded")}
            </button>
          `,
          badge: () => t("dreaming.advanced.originDailyLog"),
          meta: (entry) => [
            entry.groundedCount > 0
              ? `${entry.groundedCount} ${t("dreaming.stats.grounded").toLowerCase()}`
              : "",
            entry.recallCount > 0 ? `${entry.recallCount} 次召回` : "",
            entry.dailyCount > 0 ? `${entry.dailyCount} 次日记` : "",
          ],
        })}
        ${renderAdvancedEntryList({
          titleKey: "dreaming.advanced.shortTermTitle",
          descriptionKey: "dreaming.advanced.shortTermDescription",
          emptyKey: "dreaming.advanced.emptyShortTerm",
          entries: waitingEntries,
          controls: html`
            <div class="dreams-advanced__sort">
              <button
                class="dreams-advanced__sort-btn ${_advancedWaitingSort === "recent"
                  ? "dreams-advanced__sort-btn--active"
                  : ""}"
                @click=${() => {
                  _advancedWaitingSort = "recent";
                  props.onRequestUpdate?.();
                }}
              >
                ${t("dreaming.advanced.sortRecent")}
              </button>
              <button
                class="dreams-advanced__sort-btn ${_advancedWaitingSort === "signals"
                  ? "dreams-advanced__sort-btn--active"
                  : ""}"
                @click=${() => {
                  _advancedWaitingSort = "signals";
                  props.onRequestUpdate?.();
                }}
              >
                ${t("dreaming.advanced.sortSignals")}
              </button>
            </div>
          `,
          badge: (entry) => describeWaitingEntryOrigin(entry),
          meta: (entry) => [
            `${entry.totalSignalCount} ${t("dreaming.stats.signals").toLowerCase()}`,
            entry.recallCount > 0 ? `${entry.recallCount} 次召回` : "",
            entry.dailyCount > 0 ? `${entry.dailyCount} 次日记` : "",
            entry.groundedCount > 0
              ? `${entry.groundedCount} ${t("dreaming.stats.grounded").toLowerCase()}`
              : "",
            entry.phaseHitCount > 0 ? `${entry.phaseHitCount} 次阶段触发` : "",
          ],
        })}
        ${renderAdvancedEntryList({
          titleKey: "dreaming.advanced.promotedTitle",
          descriptionKey: "dreaming.advanced.promotedDescription",
          emptyKey: "dreaming.advanced.emptyPromoted",
          entries: props.promotedEntries,
          badge: (entry) => describeWaitingEntryOrigin(entry),
          meta: (entry) => [
            entry.promotedAt
              ? `${t("dreaming.advanced.updatedPrefix")} ${formatCompactDateTime(entry.promotedAt)}`
              : "",
            entry.groundedCount > 0
              ? `${entry.groundedCount} ${t("dreaming.stats.grounded").toLowerCase()}`
              : "",
            entry.totalSignalCount > 0
              ? `${entry.totalSignalCount} ${t("dreaming.stats.signals").toLowerCase()}`
              : "",
          ],
        })}
      </div>

      ${props.statusError
        ? html`<div class="dreams__controls-error">${props.statusError}</div>`
        : nothing}
    </section>
  `;
}

function renderDiaryImportsSection(props: DreamingProps) {
  const importInsights = props.wikiImportInsights;
  const clusters = importInsights?.clusters ?? [];

  if (props.wikiImportInsightsLoading && clusters.length === 0) {
    return html`
      <div class="dreams-diary__empty">
        <div class="dreams-diary__empty-text">正在加载导入洞察…</div>
      </div>
    `;
  }

  if (clusters.length === 0) {
    return html`
      <div class="dreams-diary__empty">
        <div class="dreams-diary__empty-text">还没有导入洞察</div>
        <div class="dreams-diary__empty-hint">
          先运行一次带应用写回的 ChatGPT 导入，聚类后的导入洞察才会出现在这里。
        </div>
      </div>
    `;
  }

  _diaryEntryCount = clusters.length;
  const clusterIndex = Math.max(0, Math.min(_diaryPage, clusters.length - 1));
  const cluster = clusters[clusterIndex];

  return html`
    <div class="dreams-diary__daychips">
      ${clusters.map(
        (entry, index) => html`
          <button
            class="dreams-diary__day-chip ${index === clusterIndex
              ? "dreams-diary__day-chip--active"
              : ""}"
            @click=${() => {
              setDiaryPage(index);
              props.onRequestUpdate?.();
            }}
          >
            ${entry.label}
          </button>
        `,
      )}
    </div>

    <article class="dreams-diary__entry" key="imports-${cluster.key}">
      <div class="dreams-diary__accent"></div>
      <div class="dreams-diary__date">
        ${cluster.label} · ${cluster.itemCount} chats
        ${cluster.highRiskCount > 0 ? html`· ${cluster.highRiskCount} sensitive` : nothing}
        ${cluster.preferenceSignalCount > 0
          ? html`· ${cluster.preferenceSignalCount} signals`
          : nothing}
      </div>
      <div class="dreams-diary__prose">
        <p class="dreams-diary__para">
          Imported chats clustered around ${cluster.label.toLowerCase()}.
          ${cluster.withheldCount > 0
            ? ` ${cluster.withheldCount} digest${cluster.withheldCount === 1 ? " was" : "s were"} withheld pending review.`
            : ""}
        </p>
      </div>
      <div class="dreams-diary__insights">
        ${cluster.items.map((item) => {
          const expanded = _expandedInsightCards.has(item.pagePath);
          return html`
            <article
              class="dreams-diary__insight-card dreams-diary__insight-card--clickable"
              data-import-page=${item.pagePath}
              @click=${() =>
                toggleExpandedCard(_expandedInsightCards, item.pagePath, props.onRequestUpdate)}
            >
              <div class="dreams-diary__insight-topline">
                <div class="dreams-diary__insight-title">${item.title}</div>
                <span
                  class="dreams-diary__insight-badge dreams-diary__insight-badge--${item.riskLevel}"
                >
                  ${formatImportBadge(item)}
                </span>
              </div>
              <div class="dreams-diary__insight-meta">
                ${item.updatedAt ? formatCompactDateTime(item.updatedAt) : basename(item.pagePath)}
                ${item.activeBranchMessages > 0 ? ` · ${item.activeBranchMessages} messages` : ""}
              </div>
              <p class="dreams-diary__insight-line">${item.summary}</p>
              ${item.candidateSignals.length > 0
                ? html`
                    <div class="dreams-diary__insight-list">
                      <strong>Potentially useful signals</strong>
                      ${item.candidateSignals.map(
                        (signal) => html`<p class="dreams-diary__insight-line">• ${signal}</p>`,
                      )}
                    </div>
                  `
                : nothing}
              ${item.correctionSignals.length > 0
                ? html`
                    <div class="dreams-diary__insight-list">
                      <strong>Corrections or revisions</strong>
                      ${item.correctionSignals.map(
                        (signal) => html`<p class="dreams-diary__insight-line">• ${signal}</p>`,
                      )}
                    </div>
                  `
                : nothing}
              ${expanded
                ? html`
                    <div class="dreams-diary__insight-list">
                      <strong>Import details</strong>
                      ${item.firstUserLine
                        ? html`
                            <p class="dreams-diary__insight-line">
                              <strong>Started with:</strong> ${item.firstUserLine}
                            </p>
                          `
                        : nothing}
                      ${item.lastUserLine && item.lastUserLine !== item.firstUserLine
                        ? html`
                            <p class="dreams-diary__insight-line">
                              <strong>Ended on:</strong> ${item.lastUserLine}
                            </p>
                          `
                        : nothing}
                      <p class="dreams-diary__insight-line">
                        <strong>Messages:</strong> ${item.userMessageCount} user ·
                        ${item.assistantMessageCount} assistant
                      </p>
                      ${item.riskReasons.length > 0
                        ? html`
                            <p class="dreams-diary__insight-line">
                              <strong>Risk reasons:</strong> ${item.riskReasons.join(", ")}
                            </p>
                          `
                        : nothing}
                      ${item.labels.length > 0
                        ? html`
                            <p class="dreams-diary__insight-line">
                              <strong>Labels:</strong> ${item.labels.join(", ")}
                            </p>
                          `
                        : nothing}
                    </div>
                  `
                : nothing}
              ${item.preferenceSignals.length > 0
                ? html`
                    <div class="dreams-diary__insight-signals">
                      ${item.preferenceSignals.map(
                        (signal) =>
                          html`<span class="dreams-diary__insight-signal">${signal}</span>`,
                      )}
                    </div>
                  `
                : nothing}
              <div class="dreams-diary__insight-actions">
                <button
                  class="btn btn--subtle btn--sm"
                  @click=${(event: Event) => {
                    event.stopPropagation();
                    toggleExpandedCard(_expandedInsightCards, item.pagePath, props.onRequestUpdate);
                  }}
                >
                  ${expanded ? "收起详情" : "查看详情"}
                </button>
                <button
                  class="btn btn--subtle btn--sm"
                  @click=${(event: Event) => {
                    event.stopPropagation();
                    void openWikiPreview(item.pagePath, props);
                  }}
                >
                  打开来源页面
                </button>
              </div>
            </article>
          `;
        })}
      </div>
    </article>
  `;
}

function renderMemoryPalaceSection(props: DreamingProps) {
  const palace = props.wikiMemoryPalace;
  const clusters = palace?.clusters ?? [];

  if (props.wikiMemoryPalaceLoading && clusters.length === 0) {
    return html`
      <div class="dreams-diary__empty">
        <div class="dreams-diary__empty-text">正在加载记忆宫殿…</div>
      </div>
    `;
  }

  if (clusters.length === 0) {
    return html`
      <div class="dreams-diary__empty">
        <div class="dreams-diary__empty-text">记忆宫殿还没有形成内容</div>
        <div class="dreams-diary__empty-hint">
          目前 wiki 里大多还是原始来源导入和运行报告。等综合页、实体或概念开始写入后，这个页签才会更有用。
        </div>
      </div>
    `;
  }

  _diaryEntryCount = clusters.length;
  const clusterIndex = Math.max(0, Math.min(_diaryPage, clusters.length - 1));
  const cluster = clusters[clusterIndex];

  return html`
    <div class="dreams-diary__daychips">
      ${clusters.map(
        (entry, index) => html`
          <button
            class="dreams-diary__day-chip ${index === clusterIndex
              ? "dreams-diary__day-chip--active"
              : ""}"
            @click=${() => {
              setDiaryPage(index);
              props.onRequestUpdate?.();
            }}
          >
            ${entry.label}
          </button>
        `,
      )}
    </div>

    <article class="dreams-diary__entry" key="palace-${cluster.key}">
      <div class="dreams-diary__accent"></div>
      <div class="dreams-diary__date">
        ${cluster.label} · ${cluster.itemCount} 页
        ${cluster.claimCount > 0 ? html`· ${cluster.claimCount} 条结论` : nothing}
        ${cluster.questionCount > 0 ? html`· ${cluster.questionCount} 个问题` : nothing}
        ${cluster.contradictionCount > 0
          ? html`· ${cluster.contradictionCount} 处矛盾`
          : nothing}
      </div>
      <div class="dreams-diary__prose">
        <p class="dreams-diary__para">
          当前汇总到 ${cluster.label.toLowerCase()} 分类下的 Wiki 页面。${cluster.updatedAt
            ? ` 最近更新于 ${formatCompactDateTime(cluster.updatedAt)}。`
            : ""}
        </p>
      </div>
      <div class="dreams-diary__insights">
        ${cluster.items.map((item) => {
          const expanded = _expandedPalaceCards.has(item.pagePath);
          return html`
            <article
              class="dreams-diary__insight-card dreams-diary__insight-card--clickable"
              data-palace-page=${item.pagePath}
              @click=${() =>
                toggleExpandedCard(_expandedPalaceCards, item.pagePath, props.onRequestUpdate)}
            >
              <div class="dreams-diary__insight-topline">
                <div class="dreams-diary__insight-title">${item.title}</div>
                <span class="dreams-diary__insight-badge dreams-diary__insight-badge--palace">
                  ${formatKindLabel(item.kind)}
                </span>
              </div>
              <div class="dreams-diary__insight-meta">
                ${item.updatedAt ? formatCompactDateTime(item.updatedAt) : basename(item.pagePath)}
                · ${item.pagePath}
              </div>
              ${item.snippet
                ? html`<p class="dreams-diary__insight-line">${item.snippet}</p>`
                : nothing}
              ${item.claims.length > 0
                ? html`
                    <div class="dreams-diary__insight-list">
                      <strong>结论</strong>
                      ${item.claims.map(
                        (claim) => html`<p class="dreams-diary__insight-line">• ${claim}</p>`,
                      )}
                    </div>
                  `
                : nothing}
              ${item.questions.length > 0
                ? html`
                    <div class="dreams-diary__insight-list">
                      <strong>待解问题</strong>
                      ${item.questions.map(
                        (question) => html`<p class="dreams-diary__insight-line">• ${question}</p>`,
                      )}
                    </div>
                  `
                : nothing}
              ${item.contradictions.length > 0
                ? html`
                    <div class="dreams-diary__insight-list">
                      <strong>矛盾点</strong>
                      ${item.contradictions.map(
                        (entry) => html`<p class="dreams-diary__insight-line">• ${entry}</p>`,
                      )}
                    </div>
                  `
                : nothing}
              ${expanded
                ? html`
                    <div class="dreams-diary__insight-list">
                      <strong>页面详情</strong>
                      <p class="dreams-diary__insight-line">
                        <strong>Wiki 页面：</strong> ${item.pagePath}
                      </p>
                      ${item.id
                        ? html`
                            <p class="dreams-diary__insight-line">
                              <strong>Id：</strong> ${item.id}
                            </p>
                          `
                        : nothing}
                    </div>
                  `
                : nothing}
              <div class="dreams-diary__insight-actions">
                <button
                  class="btn btn--subtle btn--sm"
                  @click=${(event: Event) => {
                    event.stopPropagation();
                    toggleExpandedCard(_expandedPalaceCards, item.pagePath, props.onRequestUpdate);
                  }}
                >
                  ${expanded ? "收起详情" : "查看详情"}
                </button>
                <button
                  class="btn btn--subtle btn--sm"
                  @click=${(event: Event) => {
                    event.stopPropagation();
                    void openWikiPreview(item.pagePath, props);
                  }}
                >
                  打开 Wiki 页面
                </button>
              </div>
            </article>
          `;
        })}
      </div>
    </article>
  `;
}

function renderDreamDiaryEntries(props: DreamingProps) {
  if (typeof props.dreamDiaryContent !== "string") {
    return html`
      <div class="dreams-diary__empty">
        <div class="dreams-diary__empty-moon">
          <svg viewBox="0 0 32 32" fill="none" width="32" height="32">
            <circle cx="16" cy="16" r="14" stroke="currentColor" stroke-width="0.5" opacity="0.2" />
            <path d="M20 8a10 10 0 0 1 0 16 10 10 0 1 0 0-16z" fill="currentColor" opacity="0.08" />
          </svg>
        </div>
        <div class="dreams-diary__empty-text">${t("dreaming.diary.noDreamsYet")}</div>
        <div class="dreams-diary__empty-hint">${t("dreaming.diary.noDreamsHint")}</div>
      </div>
    `;
  }

  const entries = parseDiaryEntries(props.dreamDiaryContent);
  _diaryEntryCount = entries.length;

  if (entries.length === 0) {
    return html`
      <div class="dreams-diary__empty">
        <div class="dreams-diary__empty-text">${t("dreaming.diary.waitingTitle")}</div>
        <div class="dreams-diary__empty-hint">${t("dreaming.diary.waitingHint")}</div>
      </div>
    `;
  }

  const reversed = buildDiaryNavigation(entries);
  const page = Math.max(0, Math.min(_diaryPage, reversed.length - 1));
  const entry = reversed[page];

  return html`
    <div class="dreams-diary__daychips">
      ${reversed.map(
        (e) => html`
          <button
            class="dreams-diary__day-chip ${e.page === page
              ? "dreams-diary__day-chip--active"
              : ""}"
            @click=${() => {
              setDiaryPage(e.page);
              props.onRequestUpdate?.();
            }}
          >
            ${formatDiaryChipLabel(e.date)}
          </button>
        `,
      )}
    </div>
    <article class="dreams-diary__entry" key="${page}">
      <div class="dreams-diary__accent"></div>
      ${entry.date ? html`<time class="dreams-diary__date">${entry.date}</time>` : nothing}
      <div class="dreams-diary__prose">
        ${flattenDiaryBody(entry.body).map(
          (para, i) =>
            html`<p class="dreams-diary__para" style="animation-delay: ${0.3 + i * 0.15}s;">
              ${para}
            </p>`,
        )}
      </div>
    </article>
  `;
}

// ── Diary section renderer ────────────────────────────────────────────

function renderDiarySection(props: DreamingProps) {
  const wikiTabSelected = _diarySubTab === "insights" || _diarySubTab === "palace";
  const memoryWikiUnavailable = wikiTabSelected && !props.memoryWikiEnabled;
  const diaryError =
    _diarySubTab === "dreams"
      ? props.dreamDiaryError
      : _diarySubTab === "insights"
        ? props.wikiImportInsightsError
        : props.wikiMemoryPalaceError;
  if (diaryError && !memoryWikiUnavailable) {
    return html`
      <section class="dreams-diary">
        <div class="dreams-diary__error">${diaryError}</div>
      </section>
    `;
  }

  return html`
    <section class="dreams-diary">
      <div class="dreams-diary__chrome">
        <div class="dreams-diary__header">
          <span class="dreams-diary__title">${t("dreaming.diary.title")}</span>
          <div class="dreams-diary__subtabs">
            <button
              class="dreams-diary__subtab ${_diarySubTab === "dreams"
                ? "dreams-diary__subtab--active"
                : ""}"
              @click=${() => {
                closeWikiPreview();
                _diarySubTab = "dreams";
                _diaryPage = 0;
                props.onRequestUpdate?.();
              }}
            >
              梦境
            </button>
            <button
              class="dreams-diary__subtab ${_diarySubTab === "insights"
                ? "dreams-diary__subtab--active"
                : ""}"
              @click=${() => {
                closeWikiPreview();
                _diarySubTab = "insights";
                _diaryPage = 0;
                props.onRequestUpdate?.();
              }}
            >
              导入洞察
            </button>
            <button
              class="dreams-diary__subtab ${_diarySubTab === "palace"
                ? "dreams-diary__subtab--active"
                : ""}"
              @click=${() => {
                closeWikiPreview();
                _diarySubTab = "palace";
                _diaryPage = 0;
                props.onRequestUpdate?.();
              }}
            >
              记忆宫殿
            </button>
          </div>
          <button
            class="btn btn--subtle btn--sm"
            ?disabled=${memoryWikiUnavailable
              ? false
              : props.modeSaving ||
                (_diarySubTab === "dreams"
                  ? props.dreamDiaryLoading
                  : _diarySubTab === "insights"
                    ? props.wikiImportInsightsLoading
                    : props.wikiMemoryPalaceLoading)}
            @click=${() => {
              _diaryPage = 0;
              if (memoryWikiUnavailable) {
                props.onOpenConfig();
              } else if (_diarySubTab === "dreams") {
                props.onRefreshDiary();
              } else if (_diarySubTab === "insights") {
                props.onRefreshImports();
              } else {
                props.onRefreshMemoryPalace();
              }
            }}
          >
            ${memoryWikiUnavailable
              ? "如何启用"
              : _diarySubTab === "dreams"
                ? props.dreamDiaryLoading
                  ? t("dreaming.diary.reloading")
                  : t("dreaming.diary.reload")
                : _diarySubTab === "insights"
                  ? props.wikiImportInsightsLoading
                    ? "重新加载中…"
                    : "重新加载"
                  : props.wikiMemoryPalaceLoading
                    ? "重新加载中…"
                    : "重新加载"}
          </button>
        </div>
        ${renderDiarySubtabExplainer()}
      </div>

      ${memoryWikiUnavailable
        ? html`
            <div class="dreams-diary__empty">
              <div class="dreams-diary__empty-text">记忆 Wiki 尚未启用</div>
              <div class="dreams-diary__empty-hint">
                导入洞察和记忆宫殿由内置的 <code>memory-wiki</code> 插件提供。
              </div>
              <div class="dreams-diary__empty-hint">
                启用 <code>plugins.entries.memory-wiki.enabled = true</code> 后，再重新加载这个页签。
              </div>
              <div class="dreams-diary__empty-actions">
                <button class="btn btn--subtle btn--sm" @click=${() => props.onOpenConfig()}>
                  打开配置
                </button>
              </div>
            </div>
          `
        : _diarySubTab === "dreams"
          ? renderDreamDiaryEntries(props)
          : _diarySubTab === "insights"
            ? renderDiaryImportsSection(props)
            : renderMemoryPalaceSection(props)}
      ${renderWikiPreviewOverlay(props)}
    </section>
  `;
}
