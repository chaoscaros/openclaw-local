import { html, nothing } from "lit";
import { t } from "../../i18n/index.ts";
import { formatRelativeTimestamp } from "../format.ts";
import type { TaskItem, TaskRuntimeHealth, TaskStatus } from "../controllers/tasks.ts";
import type { GatewaySessionRow } from "../types.ts";

export type TasksViewProps = {
  archiveMode?: boolean;
  loading: boolean;
  items: TaskItem[];
  error: string | null;
  currentSession: GatewaySessionRow | null;
  createOpen?: boolean;
  createTitle?: string;
  createDescription?: string;
  editId?: string | null;
  editTitle?: string;
  editDescription?: string;
  onRefresh: () => void;
  onRequestUpdate?: () => void;
  onToggleCreate?: () => void;
  onCreateTitleChange?: (value: string) => void;
  onCreateDescriptionChange?: (value: string) => void;
  onCreateTask: () => void;
  onToggleEdit?: (task: TaskItem | null) => void;
  onEditTitleChange?: (value: string) => void;
  onEditDescriptionChange?: (value: string) => void;
  onSaveEdit?: () => void;
  onSelectCurrent: (taskId: string) => void;
  onChangeStatus: (taskId: string, status: TaskStatus) => void;
  onArchive: (taskId: string) => void;
  onRestore: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onSyncProgress?: (taskId: string) => void;
  onEditTask: (task: TaskItem) => void;
};

const ACTIVE_STATUSES: TaskStatus[] = ["active", "paused", "interrupted", "completed", "ended"];
const TASK_TIMELINE_PREVIEW_LIMIT = 3;
const RESOURCE_CONTEXT_PREVIEW_LIMIT = 3;
const TECHNICAL_DETAIL_PREVIEW_LIMIT = 2;
const RUNTIME_TRAJECTORY_PREVIEW_LIMIT = 3;
const LONG_RECORD_PREVIEW_LIMIT = 60;

type FullRecordDrawerState =
  | { kind: null }
  | { kind: "timeline" }
  | { kind: "resource-context" }
  | { kind: "technical-details" }
  | { kind: "runtime-trajectory"; runtimeTaskId: string }
  | { kind: "runtime-text"; runtimeTaskId: string; field: "progressSummary" | "terminalSummary" | "error" };

const hubUiState = {
  taskQuery: "",
  taskFilter: "all" as "all" | "active" | "completed" | "reference",
  archiveQuery: "",
  archiveFilter: "all" as "all" | "recent" | "completed" | "older",
  selectedTaskId: null as string | null,
  selectedArchiveIds: new Set<string>(),
  selectedRuntimeTaskId: null as string | null,
  fullRecordDrawer: { kind: null } as FullRecordDrawerState,
};

type TaskSection = {
  id: string;
  title: string;
  description: string;
  items: TaskItem[];
  emptyLabel: string;
};

function localizeTaskText(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "active" ||
    normalized === "paused" ||
    normalized === "interrupted" ||
    normalized === "completed" ||
    normalized === "ended"
  ) {
    return String(t(`taskModeUi.status.${normalized}`));
  }
  if (normalized === "running") {
    return String(t("taskModeUi.flowStatus.running"));
  }
  if (normalized === "waiting") {
    return String(t("taskModeUi.flowStatus.waiting"));
  }
  if (normalized === "blocked") {
    return String(t("taskModeUi.flowStatus.blocked"));
  }
  if (normalized === "queued") {
    return String(t("taskModeUi.flowStatus.queued"));
  }
  if (normalized === "succeeded") {
    return String(t("taskModeUi.flowStatus.succeeded"));
  }
  if (normalized === "failed") {
    return String(t("taskModeUi.flowStatus.failed"));
  }
  if (normalized === "cancelled") {
    return String(t("taskModeUi.flowStatus.cancelled"));
  }
  return value;
}

function statusLabel(status: string | null | undefined) {
  return localizeTaskText(status);
}

function runtimeHealthLabel(value: TaskRuntimeHealth | null | undefined): string {
  if (value === "healthy") {
    return "执行正常";
  }
  if (value === "stale") {
    return "执行陈旧";
  }
  if (value === "lost") {
    return "执行丢失";
  }
  if (value === "recovering") {
    return "恢复中";
  }
  return "";
}

function runtimeLabel(value: TaskItem["runtimeTaskSummaries"][number]["runtime"] | null | undefined): string {
  if (value === "subagent") {
    return "subagent";
  }
  if (value === "acp") {
    return "acp";
  }
  if (value === "cli") {
    return "cli";
  }
  if (value === "cron") {
    return "cron";
  }
  return value ?? "unknown";
}

function normalizeTaskBody(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function hasOverflowText(value: string | null | undefined, max = LONG_RECORD_PREVIEW_LIMIT) {
  return normalizeTaskBody(value).length > max;
}

function previewOverflowText(value: string | null | undefined, max = LONG_RECORD_PREVIEW_LIMIT) {
  const normalized = normalizeTaskBody(value);
  return normalized ? clampText(normalized, max) : "无";
}

function clampText(value: string, max = 88) {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max).trim()}…`;
}

function stripTechnicalNoise(value: string | null | undefined): string {
  return normalizeTaskBody(value)
    .replace(/\/Admin\/[A-Za-z0-9_./-]+/g, "")
    .replace(/\b(?:storehouse_id|goods_spu_id|area_id|page|per_page)\b/gi, "")
    .replace(/传参[:：]?/g, "")
    .replace(/接口/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function humanizeTaskTitle(value: string | null | undefined): string {
  const normalized = normalizeTaskBody(value);
  if (!normalized) {
    return "";
  }
  const short = normalized.split(/[:：]/)[0]?.trim() ?? normalized;
  return clampText(short, 42);
}

function extractEndpointPaths(task: TaskItem | null | undefined): string[] {
  const source = `${task?.title ?? ""}\n${task?.description ?? ""}`;
  const matches = source.match(/\/Admin\/[A-Za-z0-9_./-]+/g) ?? [];
  return Array.from(new Set(matches)).slice(0, 6);
}

function extractParamNames(task: TaskItem | null | undefined): string[] {
  const source = `${task?.title ?? ""}\n${task?.description ?? ""}`;
  const matches = source.match(/\b(?:storehouse_id|goods_spu_id|area_id|page|per_page)\b/gi) ?? [];
  return Array.from(new Set(matches.map((item) => item.toLowerCase()))).slice(0, 8);
}

function splitTaskClauses(value: string | null | undefined): string[] {
  const normalized = normalizeTaskBody(value);
  if (!normalized) {
    return [];
  }
  return normalized
    .split(/(?<=[。！？；;])\s*|\s*[•·]\s*|\s{2,}|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractTaskHighlights(task: TaskItem | null | undefined) {
  const title = normalizeTaskBody(task?.title);
  const description = normalizeTaskBody(task?.description);
  const flowStep = normalizeTaskBody(task?.flowCurrentStep);
  const cleanTitle = humanizeTaskTitle(title);
  const cleanDescription = stripTechnicalNoise(description);
  const cleanFlowStep = stripTechnicalNoise(flowStep);
  const clauses = Array.from(new Set([cleanFlowStep, cleanDescription, ...splitTaskClauses(cleanDescription)])).filter(Boolean);
  const summary = clampText(
    normalizeTaskBody(task?.progressSummary) ||
      clauses[0] ||
      cleanTitle ||
      statusLabel(task?.effectiveStatus ?? task?.status) ||
      String(t("taskModeUi.empty")),
    78,
  );
  const nextStep = clampText(
    normalizeTaskBody(task?.nextStep) ||
      clauses[1] ||
      cleanFlowStep ||
      (task?.effectiveStatus === "completed"
        ? String(t("taskWorkspace.nextState.completed"))
        : String(t("taskWorkspace.nextState.continue"))),
    78,
  );
  const fallbackTitle = humanizeTaskTitle(
    cleanTitle || title || cleanFlowStep || clauses[0] || normalizeTaskBody(task?.progressSummary) || normalizeTaskBody(task?.nextStep),
  );
  return {
    title: fallbackTitle || String(t("taskModeUi.empty")),
    summary,
    nextStep,
    completedSummary: clampText(
      normalizeTaskBody(task?.completedSummary) || clauses.slice(0, 2).join(" · ") || String(t("taskWorkspace.noneYet")),
      96,
    ),
    fullDescription: clampText(cleanDescription || cleanTitle || String(t("taskModeUi.empty")), 160),
    rawDescription: description || title || String(t("taskModeUi.empty")),
  };
}

function extractTechnicalContext(task: TaskItem | null | undefined): string[] {
  const source = `${task?.title ?? ""}\n${task?.description ?? ""}`;
  const matches = source.match(/(?:\/[A-Za-z0-9_./-]+|[A-Za-z0-9_./-]+\.(?:vue|js|ts|tsx|jsx|json|md))/g) ?? [];
  return Array.from(new Set([...(task?.resourceContext ?? []), ...matches.map((item) => item.trim()).filter(Boolean)])).slice(0, 8);
}

function renderTechnicalDetails(task: TaskItem | null | undefined, props: TasksViewProps) {
  const endpoints = extractEndpointPaths(task);
  const params = extractParamNames(task);
  if (endpoints.length === 0 && params.length === 0) {
    return nothing;
  }
  const endpointPreview = endpoints.slice(0, TECHNICAL_DETAIL_PREVIEW_LIMIT);
  const paramsPreview = params.slice(0, TECHNICAL_DETAIL_PREVIEW_LIMIT);
  const remainingEndpoints = endpoints.length - endpointPreview.length;
  const remainingParams = params.length - paramsPreview.length;
  const hasMore = remainingEndpoints > 0 || remainingParams > 0;
  return html`
    <div class="task-technical-details">
      <div class="task-preview-pane__block-title">
        <span>技术细节</span>
        <button type="button" class="btn btn--ghost" @click=${() => openFullRecordDrawer(props, { kind: "technical-details" })}>
          ${hasMore ? "查看完整技术细节" : "查看技术细节"}
        </button>
      </div>
      ${endpointPreview.length
        ? html`<div class="task-technical-details__group">
            <div class="task-technical-details__label">接口</div>
            <div class="task-chip-row">${endpointPreview.map((item) => html`<span class="task-chip">${item}</span>`)}</div>
          </div>`
        : nothing}
      ${paramsPreview.length
        ? html`<div class="task-technical-details__group">
            <div class="task-technical-details__label">参数</div>
            <div class="task-chip-row">${paramsPreview.map((item) => html`<span class="task-chip">${item}</span>`)}</div>
          </div>`
        : nothing}
      ${renderOverflowHint(
        [
          remainingEndpoints > 0 ? `还有 ${remainingEndpoints} 个接口` : null,
          remainingParams > 0 ? `还有 ${remainingParams} 个参数` : null,
        ]
          .filter(Boolean)
          .join("，") || null,
      )}
    </div>
  `;
}

function openFullRecordDrawer(props: TasksViewProps, next: FullRecordDrawerState) {
  hubUiState.fullRecordDrawer = next;
  requestTaskViewUpdate(props);
}

function closeFullRecordDrawer(props: TasksViewProps) {
  hubUiState.fullRecordDrawer = { kind: null };
  requestTaskViewUpdate(props);
}

function renderBlockTitle(title: string, props: TasksViewProps, action?: { label: string; onClick: () => void }) {
  return html`<div class="task-preview-pane__block-title">
    <span>${title}</span>
    ${action
      ? html`<button type="button" class="btn btn--ghost" @click=${action.onClick}>${action.label}</button>`
      : nothing}
  </div>`;
}

function renderOverflowHint(label: string | null | undefined) {
  if (!label) {
    return nothing;
  }
  return html`<div class="task-preview-pane__detail-list task-preview-pane__hint"><span>${label}</span></div>`;
}

function runtimeSummaryPriority(entry: NonNullable<TaskItem["runtimeTaskSummaries"]>[number], latestTaskId: string) {
  const isLatest = entry.taskId === latestTaskId;
  const isException =
    entry.status === "failed" ||
    entry.status === "lost" ||
    entry.status === "timed_out" ||
    Boolean(entry.error);
  return {
    isLatest,
    isException,
    sortTime: entry.lastEventAt ?? 0,
  };
}

function buildRuntimeTrajectory(task: TaskItem, entry: NonNullable<TaskItem["runtimeTaskSummaries"]>[number], latestTaskId: string) {
  const isLatest = entry.taskId === latestTaskId;
  const isException = runtimeSummaryPriority(entry, latestTaskId).isException;
  return [
    ...(entry.startedAt
      ? [{ label: "启动", detail: `${runtimeLabel(entry.runtime)} 已启动`, timestamp: entry.startedAt }]
      : []),
    ...(entry.progressSummary
      ? [{ label: "进展", detail: entry.progressSummary, timestamp: entry.lastEventAt ?? entry.startedAt ?? null }]
      : []),
    {
      label: "状态",
      detail: `${statusLabel(entry.status)}${isLatest ? " · 最新" : ""}${isException ? " · 异常" : ""}`,
      timestamp: entry.lastEventAt ?? entry.endedAt ?? entry.startedAt ?? null,
    },
    ...(entry.terminalSummary
      ? [{ label: "结束摘要", detail: entry.terminalSummary, timestamp: entry.endedAt ?? entry.lastEventAt ?? null }]
      : []),
    ...(entry.error ? [{ label: "错误", detail: entry.error, timestamp: entry.lastEventAt ?? entry.endedAt ?? null }] : []),
    {
      label: "任务健康",
      detail: task.runtimeHealth ? runtimeHealthLabel(task.runtimeHealth) : "未记录",
      timestamp: task.updatedAt ?? task.createdAt,
    },
  ]
    .filter((item) => item.detail)
    .sort((left, right) => (right.timestamp ?? 0) - (left.timestamp ?? 0));
}

function renderExpandableRuntimeText(
  entry: NonNullable<TaskItem["runtimeTaskSummaries"]>[number],
  field: "progressSummary" | "terminalSummary" | "error",
  label: string,
  props: TasksViewProps,
) {
  const value = entry[field];
  if (!normalizeTaskBody(value)) {
    return html`<div><strong>${label}：</strong>无</div>`;
  }
  const actionLabel =
    field === "progressSummary"
      ? "查看完整进展摘要"
      : field === "terminalSummary"
        ? "查看完整终端摘要"
        : "查看完整错误信息";
  return html`<div>
    <strong>${label}：</strong>${previewOverflowText(value)}
    ${hasOverflowText(value)
      ? html`<button
          type="button"
          class="btn btn--ghost"
          @click=${() => openFullRecordDrawer(props, { kind: "runtime-text", runtimeTaskId: entry.taskId, field })}
        >
          ${actionLabel}
        </button>`
      : nothing}
  </div>`;
}

function renderRuntimeTaskLinks(task: TaskItem | null | undefined, props: TasksViewProps) {
  const linked = Array.from(new Set(task?.linkedRuntimeTaskIds ?? [])).filter(Boolean);
  const latest = task?.latestRuntimeTaskId?.trim() ?? "";
  const summaries = [...(task?.runtimeTaskSummaries ?? [])].sort((left, right) => {
    const leftMeta = runtimeSummaryPriority(left, latest);
    const rightMeta = runtimeSummaryPriority(right, latest);
    if (leftMeta.isLatest !== rightMeta.isLatest) {
      return leftMeta.isLatest ? -1 : 1;
    }
    if (leftMeta.isException !== rightMeta.isException) {
      return leftMeta.isException ? -1 : 1;
    }
    if (leftMeta.sortTime !== rightMeta.sortTime) {
      return rightMeta.sortTime - leftMeta.sortTime;
    }
    return left.taskId.localeCompare(right.taskId);
  });
  if (linked.length === 0 && !latest && summaries.length === 0) {
    return nothing;
  }
  const ordered = latest ? [latest, ...linked.filter((item) => item !== latest)] : linked;
  const selectedRuntimeTask =
    summaries.find((entry) => entry.taskId === hubUiState.selectedRuntimeTaskId) ?? summaries[0] ?? null;
  const runtimeTrajectory = task && selectedRuntimeTask ? buildRuntimeTrajectory(task, selectedRuntimeTask, latest) : [];
  const runtimeTrajectoryPreview = runtimeTrajectory.slice(0, RUNTIME_TRAJECTORY_PREVIEW_LIMIT);
  const remainingRuntimeTrajectory = runtimeTrajectory.length - runtimeTrajectoryPreview.length;
  return html`
    <div class="task-preview-pane__block">
      ${renderBlockTitle("关联 runtime tasks", props)}
      <div class="task-chip-row">
        ${ordered.map((item) => html`<span class="task-chip">${item}${item === latest ? " · latest" : ""}</span>`) }
      </div>
      ${summaries.length
        ? html`<div class="task-preview-pane__detail-list">
            ${summaries.map((entry) => {
              const meta = runtimeSummaryPriority(entry, latest);
              const rowClass = [
                "task-runtime-row",
                meta.isLatest ? "task-runtime-row--latest" : "",
                meta.isException ? "task-runtime-row--exception" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return html`<div class=${rowClass}>
                <div>
                  <strong>${entry.taskId}</strong>
                  ${meta.isLatest ? html`<span> · 最新</span>` : nothing}
                  ${meta.isException ? html`<span> · 异常</span>` : nothing}
                  <span> · ${runtimeLabel(entry.runtime)} · ${statusLabel(entry.status)}</span>
                  ${entry.runId ? html`<span> · ${entry.runId}</span>` : nothing}
                  ${entry.lastEventAt ? html`<span> · ${formatRelativeTimestamp(entry.lastEventAt)}</span>` : nothing}
                  ${entry.error ? html`<span> · ${entry.error}</span>` : nothing}
                </div>
                <div class="task-runtime-row__actions">
                  <button
                    type="button"
                    class="btn btn--ghost"
                    @click=${() => {
                      hubUiState.selectedRuntimeTaskId = entry.taskId;
                      requestTaskViewUpdate(props);
                    }}
                    title="查看当前 runtime task 的只读详情"
                  >
                    查看详情
                  </button>
                  <button type="button" class="btn btn--ghost" disabled title="占位，后续接重试接口">重试</button>
                  <button type="button" class="btn btn--ghost" disabled title="占位，后续接取消接口">取消</button>
                </div>
              </div>`;
            })}
          </div>`
        : nothing}
      ${selectedRuntimeTask
        ? html`<div class="task-preview-pane__detail-list task-preview-pane__detail-list--runtime-detail">
            <div><strong>Runtime task 详情</strong></div>
            <div><strong>taskId：</strong>${selectedRuntimeTask.taskId}</div>
            <div><strong>runtime：</strong>${runtimeLabel(selectedRuntimeTask.runtime)}</div>
            <div><strong>status：</strong>${statusLabel(selectedRuntimeTask.status)}</div>
            <div><strong>runId：</strong>${selectedRuntimeTask.runId ?? "未记录"}</div>
            <div><strong>startedAt：</strong>${selectedRuntimeTask.startedAt ? formatRelativeTimestamp(selectedRuntimeTask.startedAt) : "未记录"}</div>
            <div><strong>endedAt：</strong>${selectedRuntimeTask.endedAt ? formatRelativeTimestamp(selectedRuntimeTask.endedAt) : "未记录"}</div>
            <div><strong>lastEventAt：</strong>${selectedRuntimeTask.lastEventAt ? formatRelativeTimestamp(selectedRuntimeTask.lastEventAt) : "未记录"}</div>
            <div><strong>runtimeHealth：</strong>${task.runtimeHealth ? runtimeHealthLabel(task.runtimeHealth) : "未记录"}</div>
            <div><strong>是否 latest：</strong>${selectedRuntimeTask.taskId === latest ? "是" : "否"}</div>
            <div><strong>是否异常：</strong>${runtimeSummaryPriority(selectedRuntimeTask, latest).isException ? "是" : "否"}</div>
            ${renderExpandableRuntimeText(selectedRuntimeTask, "progressSummary", "progressSummary", props)}
            ${renderExpandableRuntimeText(selectedRuntimeTask, "terminalSummary", "terminalSummary", props)}
            ${renderExpandableRuntimeText(selectedRuntimeTask, "error", "error", props)}
            ${runtimeTrajectoryPreview.length
              ? html`<div><strong>状态轨迹：</strong></div>
                  ${runtimeTrajectory.length > runtimeTrajectoryPreview.length
                    ? html`<div>
                        <button
                          type="button"
                          class="btn btn--ghost"
                          @click=${() =>
                            openFullRecordDrawer(props, {
                              kind: "runtime-trajectory",
                              runtimeTaskId: selectedRuntimeTask.taskId,
                            })}
                        >
                          查看完整状态轨迹
                        </button>
                      </div>`
                    : nothing}
                  <div class="task-timeline-mini">
                    ${runtimeTrajectoryPreview.map(
                      (entry) => html`<div class="task-timeline-mini__item">
                        <div class="task-timeline-mini__time">${entry.timestamp ? formatRelativeTimestamp(entry.timestamp) : t("common.na")}</div>
                        <div class="task-timeline-mini__body">
                          <strong>${entry.label}</strong>
                          <span>${entry.detail}</span>
                        </div>
                      </div>`,
                    )}
                  </div>
                  ${renderOverflowHint(remainingRuntimeTrajectory > 0 ? `还有 ${remainingRuntimeTrajectory} 条轨迹` : null)}`
              : nothing}
          </div>`
        : nothing}
    </div>
  `;
}

function buildTaskTimeline(task: TaskItem | null | undefined) {
  if (!task) {
    return [] as Array<{ label: string; detail: string; timestamp: number | null }>;
  }
  const effectiveStatus = task.effectiveStatus ?? task.status;
  const progressLabel = normalizeTaskBody(task.progressSummary ?? task.flowCurrentStep ?? task.description) || statusLabel(effectiveStatus);
  return [
    ...(task.timeline ?? []).map((entry) => ({
      label: entry.label,
      detail: entry.detail,
      timestamp: entry.at,
    })),
    {
      label: String(t("taskWorkspace.timeline.created")),
      detail: String(t("taskWorkspace.timeline.createdDetail", { title: task.title })),
      timestamp: task.createdAt ?? null,
    },
    ...(task.flowCreatedAt && task.flowCreatedAt !== task.createdAt
      ? [
          {
            label: String(t("taskWorkspace.timeline.executionStarted")),
            detail: progressLabel,
            timestamp: task.flowCreatedAt,
          },
        ]
      : []),
    {
      label: String(t("taskWorkspace.timeline.statusChanged", { status: statusLabel(effectiveStatus) })),
      detail: progressLabel,
      timestamp: task.flowUpdatedAt ?? task.updatedAt ?? null,
    },
    ...(task.archivedAt
      ? [
          {
            label: String(t("taskModeUi.archivedAt")),
            detail: statusLabel(effectiveStatus),
            timestamp: task.archivedAt,
          },
        ]
      : []),
  ].sort((left, right) => (right.timestamp ?? 0) - (left.timestamp ?? 0));
}

function resolveFullRecordDrawer(task: TaskItem | null | undefined, latestRuntimeTaskId: string | null) {
  const state = hubUiState.fullRecordDrawer;
  if (!task || state.kind === null) {
    return { state: { kind: null } as FullRecordDrawerState, runtimeEntry: null, runtimeTrajectory: [] as ReturnType<typeof buildRuntimeTrajectory> };
  }
  if (state.kind === "timeline" || state.kind === "resource-context" || state.kind === "technical-details") {
    return { state, runtimeEntry: null, runtimeTrajectory: [] as ReturnType<typeof buildRuntimeTrajectory> };
  }
  const runtimeEntry =
    task.runtimeTaskSummaries?.find((entry) => entry.taskId === state.runtimeTaskId) ?? task.runtimeTaskSummaries?.[0] ?? null;
  if (!runtimeEntry) {
    return { state: { kind: null } as FullRecordDrawerState, runtimeEntry: null, runtimeTrajectory: [] as ReturnType<typeof buildRuntimeTrajectory> };
  }
  const runtimeTrajectory = buildRuntimeTrajectory(task, runtimeEntry, latestRuntimeTaskId ?? task.latestRuntimeTaskId ?? "");
  if (state.kind === "runtime-trajectory") {
    return { state: { kind: "runtime-trajectory", runtimeTaskId: runtimeEntry.taskId } as FullRecordDrawerState, runtimeEntry, runtimeTrajectory };
  }
  return {
    state: { kind: "runtime-text", runtimeTaskId: runtimeEntry.taskId, field: state.field } as FullRecordDrawerState,
    runtimeEntry,
    runtimeTrajectory,
  };
}

function renderDrawerMeta(items: Array<[string, string | number | null | undefined]>) {
  const visible = items.filter(([, value]) => value !== null && value !== undefined && String(value).trim());
  if (!visible.length) {
    return nothing;
  }
  return html`<div class="task-preview-pane__detail-list task-preview-pane__detail-list--meta">
    ${visible.map(([label, value]) => html`<div class="task-preview-pane__meta-item"><strong>${label}：</strong>${String(value)}</div>`) }
  </div>`;
}

function renderFullRecordDrawer(task: TaskItem | null, props: TasksViewProps) {
  const resolved = resolveFullRecordDrawer(task, task?.latestRuntimeTaskId ?? null);
  const state = resolved.state;
  if (state.kind === null || !task) {
    return nothing;
  }
  let eyebrow = "完整记录";
  let title = task.title;
  let body = nothing;
  let meta = nothing;
  if (state.kind === "timeline") {
    const timeline = buildTaskTimeline(task);
    eyebrow = "任务时间线";
    title = `${task.title} · 完整时间线`;
    meta = renderDrawerMeta([
      ["taskId", task.taskId],
      ["记录条数", timeline.length],
      ["最近会话", task.lastSessionKey ?? null],
    ]);
    body = timeline.length
      ? html`<div class="task-timeline-mini">
          ${timeline.map(
            (entry) => html`<div class="task-timeline-mini__item">
              <div class="task-timeline-mini__time">${entry.timestamp ? formatRelativeTimestamp(entry.timestamp) : t("common.na")}</div>
              <div class="task-timeline-mini__body">
                <strong>${entry.label}</strong>
                <span>${entry.detail}</span>
              </div>
            </div>`,
          )}
        </div>`
      : html`<div class="task-empty-inline">当前没有可查看的时间线记录。</div>`;
  }
  if (state.kind === "resource-context") {
    const resourceContext = extractTechnicalContext(task);
    const endpoints = extractEndpointPaths(task);
    const params = extractParamNames(task);
    eyebrow = "资源上下文";
    title = `${task.title} · 完整资源上下文`;
    meta = renderDrawerMeta([
      ["taskId", task.taskId],
      ["路径数", resourceContext.length],
      ["接口数", endpoints.length],
      ["参数数", params.length],
    ]);
    body = resourceContext.length || endpoints.length || params.length
      ? html`
          ${resourceContext.length
            ? html`<div class="task-technical-details__group">
                <div class="task-technical-details__label">文件 / 路径</div>
                <div class="task-chip-row">${resourceContext.map((item) => html`<span class="task-chip">${item}</span>`)}</div>
              </div>`
            : nothing}
          ${endpoints.length
            ? html`<div class="task-technical-details__group">
                <div class="task-technical-details__label">接口</div>
                <div class="task-chip-row">${endpoints.map((item) => html`<span class="task-chip">${item}</span>`)}</div>
              </div>`
            : nothing}
          ${params.length
            ? html`<div class="task-technical-details__group">
                <div class="task-technical-details__label">参数</div>
                <div class="task-chip-row">${params.map((item) => html`<span class="task-chip">${item}</span>`)}</div>
              </div>`
            : nothing}
        `
      : html`<div class="task-empty-inline">当前没有可查看的资源上下文。</div>`;
  }
  if (state.kind === "technical-details") {
    const endpoints = extractEndpointPaths(task);
    const params = extractParamNames(task);
    eyebrow = "技术细节";
    title = `${task.title} · 完整技术细节`;
    meta = renderDrawerMeta([
      ["taskId", task.taskId],
      ["接口数", endpoints.length],
      ["参数数", params.length],
    ]);
    body = endpoints.length || params.length
      ? html`
          ${endpoints.length
            ? html`<div class="task-technical-details__group">
                <div class="task-technical-details__label">接口</div>
                <div class="task-chip-row">${endpoints.map((item) => html`<span class="task-chip">${item}</span>`)}</div>
              </div>`
            : nothing}
          ${params.length
            ? html`<div class="task-technical-details__group">
                <div class="task-technical-details__label">参数</div>
                <div class="task-chip-row">${params.map((item) => html`<span class="task-chip">${item}</span>`)}</div>
              </div>`
            : nothing}
        `
      : html`<div class="task-empty-inline">当前没有可查看的技术细节。</div>`;
  }
  if (state.kind === "runtime-trajectory") {
    eyebrow = "Runtime 状态轨迹";
    title = `${task.title} · ${resolved.runtimeEntry?.taskId ?? "runtime task"}`;
    meta = renderDrawerMeta([
      ["taskId", task.taskId],
      ["runtimeTaskId", resolved.runtimeEntry?.taskId ?? null],
      ["runId", resolved.runtimeEntry?.runId ?? null],
      ["轨迹条数", resolved.runtimeTrajectory.length],
    ]);
    body = resolved.runtimeTrajectory.length
      ? html`<div class="task-timeline-mini">
          ${resolved.runtimeTrajectory.map(
            (entry) => html`<div class="task-timeline-mini__item">
              <div class="task-timeline-mini__time">${entry.timestamp ? formatRelativeTimestamp(entry.timestamp) : t("common.na")}</div>
              <div class="task-timeline-mini__body">
                <strong>${entry.label}</strong>
                <span>${entry.detail}</span>
              </div>
            </div>`,
          )}
        </div>`
      : html`<div class="task-empty-inline">当前没有可查看的 runtime 轨迹记录。</div>`;
  }
  if (state.kind === "runtime-text") {
    const labelMap = {
      progressSummary: "progressSummary",
      terminalSummary: "terminalSummary",
      error: "error",
    } as const;
    const fullText = normalizeTaskBody(resolved.runtimeEntry?.[state.field]);
    eyebrow = `Runtime 完整记录 · ${labelMap[state.field]}`;
    title = `${task.title} · ${resolved.runtimeEntry?.taskId ?? "runtime task"}`;
    meta = renderDrawerMeta([
      ["taskId", task.taskId],
      ["runtimeTaskId", resolved.runtimeEntry?.taskId ?? null],
      ["runId", resolved.runtimeEntry?.runId ?? null],
      ["字段", labelMap[state.field]],
      ["字符数", fullText.length],
    ]);
    body = fullText
      ? html`<div class="task-preview-pane__detail-list"><strong>${labelMap[state.field]}：</strong>${fullText}</div>`
      : html`<div class="task-empty-inline">当前字段没有可查看的完整记录。</div>`;
  }
  return html`
    <div class="task-side-sheet">
      <div class="task-side-sheet__scrim" @click=${() => closeFullRecordDrawer(props)}></div>
      <div class="task-side-sheet__panel">
        <div class="task-side-sheet__header">
          <div>
            <div class="task-side-sheet__eyebrow">${eyebrow}</div>
            <h3 class="task-side-sheet__title">${title}</h3>
          </div>
          <button type="button" class="btn btn--ghost" @click=${() => closeFullRecordDrawer(props)}>
            ${t("common.cancel")}
          </button>
        </div>
        <div class="task-side-sheet__body">${meta}${body}</div>
      </div>
    </div>
  `;
}

function scoreTaskForHub(task: TaskItem, currentTaskId: string | null) {
  let score = 0;
  const status = task.effectiveStatus ?? task.status;
  if (task.taskId === currentTaskId) {
    score += 100;
  }
  if (status === "active") {
    score += 40;
  }
  if (status === "interrupted") {
    score += 30;
  }
  if (status === "paused") {
    score += 20;
  }
  if (status === "completed") {
    score += 10;
  }
  score += Math.floor((task.updatedAt ?? task.createdAt) / 10000000);
  return score;
}

function sortTasks(items: TaskItem[], currentTaskId: string | null | undefined) {
  return [...items].sort((left, right) => {
    const scoreDelta = scoreTaskForHub(right, currentTaskId ?? null) - scoreTaskForHub(left, currentTaskId ?? null);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    const leftTime = left.archivedAt ?? left.updatedAt ?? left.createdAt;
    const rightTime = right.archivedAt ?? right.updatedAt ?? right.createdAt;
    return rightTime - leftTime;
  });
}

function matchesTaskQuery(task: TaskItem, query: string) {
  if (!query) {
    return true;
  }
  const haystack = normalizeTaskBody(`${task.title} ${task.description ?? ""} ${task.flowCurrentStep ?? ""}`).toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((part) => haystack.includes(part));
}

function taskIsReferenceComplete(task: TaskItem) {
  const status = task.effectiveStatus ?? task.status;
  return status === "completed" && !task.archived;
}

function taskIsActive(task: TaskItem) {
  const status = task.effectiveStatus ?? task.status;
  return status === "active" || status === "paused" || status === "interrupted";
}

function taskSectionItems(items: TaskItem[], currentTaskId: string | null) {
  const sorted = sortTasks(items, currentTaskId);
  const currentTask = currentTaskId ? sorted.find((task) => task.taskId === currentTaskId) ?? null : null;
  const active = sorted.filter((task) => taskIsActive(task) && task.taskId !== currentTaskId);
  const completedReference = sorted.filter((task) => taskIsReferenceComplete(task) && task.taskId !== currentTaskId);
  const recent = sorted
    .filter((task) => task.taskId !== currentTaskId && !active.includes(task) && !completedReference.includes(task))
    .slice(0, 6);
  return { currentTask, active, completedReference, recent };
}

function selectedTask(items: TaskItem[], currentTaskId: string | null) {
  const selectedId = hubUiState.selectedTaskId;
  const selected = (selectedId ? items.find((task) => task.taskId === selectedId) : null) ?? null;
  return selected ?? (currentTaskId ? items.find((task) => task.taskId === currentTaskId) ?? null : null) ?? items[0] ?? null;
}

function requestTaskViewUpdate(props: TasksViewProps) {
  props.onRequestUpdate?.();
}

function renderStatusMenu(task: TaskItem, props: TasksViewProps) {
  if (props.archiveMode) {
    return nothing;
  }
  return html`<label class="task-field">
    <span class="task-field__label">${t("taskModeUi.labels.status")}</span>
    <select
      .value=${task.status}
      @change=${(event: Event) => props.onChangeStatus(task.taskId, (event.target as HTMLSelectElement).value as TaskStatus)}
    >
      ${ACTIVE_STATUSES.map((status) => html`<option value=${status}>${statusLabel(status)}</option>`)}
    </select>
  </label>`;
}

function renderTaskCompactRow(task: TaskItem, props: TasksViewProps, opts?: { archive?: boolean; selectable?: boolean }) {
  const isCurrent = props.currentSession?.taskId === task.taskId;
  const highlights = extractTaskHighlights(task);
  const effectiveStatus = task.effectiveStatus ?? task.status;
  const selected = hubUiState.selectedTaskId === task.taskId || (!hubUiState.selectedTaskId && isCurrent);
  return html`
        <article class="task-list-item ${selected ? "task-list-item--selected" : ""}">
      <div class="task-list-item__row">
        ${opts?.archive
          ? html`<label class="task-list-item__check">
              <input
                type="checkbox"
                .checked=${hubUiState.selectedArchiveIds.has(task.taskId)}
                @change=${(event: Event) => {
                  const checked = (event.target as HTMLInputElement).checked;
                  if (checked) {
                    hubUiState.selectedArchiveIds.add(task.taskId);
                  } else {
                    hubUiState.selectedArchiveIds.delete(task.taskId);
                  }
                  requestTaskViewUpdate(props);
                }}
              />
            </label>`
          : nothing}
        <button
          type="button"
          class="task-list-item__body"
          @click=${() => {
            hubUiState.selectedTaskId = task.taskId;
            requestTaskViewUpdate(props);
          }}
        >
          <div class="task-list-item__title-row">
            <span class="task-list-item__title">${highlights.title}</span>
            <span class="task-status-pill task-status-pill--${effectiveStatus}">${statusLabel(effectiveStatus)}</span>
            ${isCurrent ? html`<span class="task-relation-badge">${t("taskModeUi.current")}</span>` : nothing}
          </div>
          <div class="task-list-item__summary">${highlights.summary}</div>
          <div class="task-list-item__meta-row">
            <span>${opts?.archive ? t("taskModeUi.archivedAt") : t("taskModeUi.updatedAt")} ${formatRelativeTimestamp(
              opts?.archive ? task.archivedAt ?? task.updatedAt : task.updatedAt,
            )}</span>
            ${task.runtimeHealth
              ? html`<span>执行层 ${runtimeHealthLabel(task.runtimeHealth)}</span>`
              : nothing}
            ${task.latestRunId ? html`<span>Run ${task.latestRunId}</span>` : nothing}
            ${task.lastSessionKey ? html`<span>${t("taskWorkspace.lastLinkedSession")} ${task.lastSessionKey}</span>` : nothing}
          </div>
        </button>
      </div>
      <div class="task-list-item__footer">
        <div class="task-list-item__footer-left">${renderStatusMenu(task, props)}</div>
        <div class="task-list-item__footer-actions">
          ${!opts?.archive
            ? html`
                ${!isCurrent
                  ? html`<button type="button" class="btn btn--ghost" @click=${() => props.onSelectCurrent(task.taskId)}>
                      ${t("taskModeUi.actions.setCurrent")}
                    </button>`
                  : nothing}
                <button type="button" class="btn btn--ghost" @click=${() => props.onToggleEdit?.(task)}>${t("taskModeUi.actions.edit")}</button>
                <button type="button" class="btn btn--ghost" @click=${() => props.onArchive(task.taskId)}>${t("taskModeUi.actions.archive")}</button>
              `
            : html`<button type="button" class="btn btn--ghost" @click=${() => props.onRestore(task.taskId)}>${t("taskModeUi.actions.restore")}</button>`}
          <button type="button" class="btn btn--ghost" @click=${() => props.onDelete(task.taskId)}>${t("taskModeUi.actions.delete")}</button>
        </div>
      </div>
    </article>
`;
}

function renderTaskSection(section: TaskSection, props: TasksViewProps) {
  return html`
    <section class="task-section-card">
      <div class="task-section-card__header">
        <div>
          <h4 class="task-section-card__title">${section.title}</h4>
          <div class="task-section-card__sub">${section.description}</div>
        </div>
        <div class="task-section-card__count">${section.items.length}</div>
      </div>
      ${section.items.length
        ? html`<div class="task-section-card__list">${section.items.map((task) => renderTaskCompactRow(task, props))}</div>`
        : html`<div class="task-empty-inline">${section.emptyLabel}</div>`}
    </section>
  `;
}

function renderTaskPreview(task: TaskItem | null, props: TasksViewProps, archiveMode = false) {
  if (!task) {
    return html`
      <aside class="task-preview-pane">
        <div class="task-preview-pane__empty-title">${archiveMode ? "未选择归档任务" : "未选择任务"}</div>
        <div class="task-preview-pane__empty-copy">
          ${archiveMode ? "选择一条归档任务，查看最后快照并决定恢复或删除。" : "选择一条任务，查看摘要、下一步和最近进展。"}
        </div>
      </aside>
    `;
  }
  const highlights = extractTaskHighlights(task);
  const technical = extractTechnicalContext(task);
  const timeline = buildTaskTimeline(task);
  const timelinePreview = timeline.slice(0, TASK_TIMELINE_PREVIEW_LIMIT);
  const remainingTimeline = timeline.length - timelinePreview.length;
  const effectiveStatus = task.effectiveStatus ?? task.status;
  const endpoints = extractEndpointPaths(task);
  const params = extractParamNames(task);
  return html`
    <aside class="task-preview-pane">
      <div class="task-preview-pane__header">
        <div class="task-preview-pane__eyebrow">${archiveMode ? "归档预览" : "任务预览"}</div>
        <h3 class="task-preview-pane__title">${highlights.title}</h3>
        <div class="task-preview-pane__status-row">
          <span class="task-status-pill task-status-pill--${effectiveStatus}">${statusLabel(effectiveStatus)}</span>
          ${props.currentSession?.taskId === task.taskId && !archiveMode
            ? html`<span class="task-relation-badge">${t("taskModeUi.current")}</span>`
            : nothing}
        </div>
        <p class="task-preview-pane__summary">${highlights.fullDescription}</p>
        ${renderTechnicalDetails(task, props)}
      </div>

      <div class="task-preview-pane__grid">
        <article class="task-preview-pane__card">
          <div class="task-preview-pane__label">当前进展</div>
          <div class="task-preview-pane__value">${highlights.summary}</div>
        </article>
        <article class="task-preview-pane__card">
          <div class="task-preview-pane__label">下一步</div>
          <div class="task-preview-pane__value">${highlights.nextStep}</div>
        </article>
        <article class="task-preview-pane__card">
          <div class="task-preview-pane__label">执行层健康</div>
          <div class="task-preview-pane__value">${task.runtimeHealth ? runtimeHealthLabel(task.runtimeHealth) : "未关联"}</div>
        </article>
        <article class="task-preview-pane__card">
          <div class="task-preview-pane__label">最近 Run</div>
          <div class="task-preview-pane__value">${task.latestRunId ?? task.latestRuntimeTaskId ?? "未记录"}</div>
        </article>
        <article class="task-preview-pane__card task-preview-pane__card--wide">
          <div class="task-preview-pane__label">本轮完成</div>
          <div class="task-preview-pane__value">${highlights.completedSummary}</div>
        </article>
      </div>

      <div class="task-preview-pane__block">
        ${renderBlockTitle(
          "资源上下文",
          props,
          technical.length > RESOURCE_CONTEXT_PREVIEW_LIMIT ||
            endpoints.length > TECHNICAL_DETAIL_PREVIEW_LIMIT ||
            params.length > TECHNICAL_DETAIL_PREVIEW_LIMIT
            ? { label: "查看完整资源上下文", onClick: () => openFullRecordDrawer(props, { kind: "resource-context" }) }
            : undefined,
        )}
        ${(technical.length || endpoints.length || params.length)
          ? html`
              ${technical.length
                ? html`<div class="task-chip-row">${technical
                    .slice(0, RESOURCE_CONTEXT_PREVIEW_LIMIT)
                    .map((item) => html`<span class="task-chip">${item}</span>`)}</div>`
                : nothing}
              ${endpoints.length
                ? html`<div class="task-preview-pane__detail-list"><strong>接口：</strong>${endpoints.slice(0, TECHNICAL_DETAIL_PREVIEW_LIMIT).join("、")}</div>`
                : nothing}
              ${params.length
                ? html`<div class="task-preview-pane__detail-list"><strong>参数：</strong>${params.slice(0, TECHNICAL_DETAIL_PREVIEW_LIMIT).join("、")}</div>`
                : nothing}
              ${renderOverflowHint(
                [
                  technical.length > RESOURCE_CONTEXT_PREVIEW_LIMIT
                    ? `还有 ${technical.length - RESOURCE_CONTEXT_PREVIEW_LIMIT} 项资源上下文`
                    : null,
                  endpoints.length > TECHNICAL_DETAIL_PREVIEW_LIMIT
                    ? `还有 ${endpoints.length - TECHNICAL_DETAIL_PREVIEW_LIMIT} 个接口`
                    : null,
                  params.length > TECHNICAL_DETAIL_PREVIEW_LIMIT
                    ? `还有 ${params.length - TECHNICAL_DETAIL_PREVIEW_LIMIT} 个参数`
                    : null,
                ]
                  .filter(Boolean)
                  .join("，") || null,
              )}
            `
          : html`<div class="task-empty-inline">${t("taskWorkspace.noTechnicalContext")}</div>`}
      </div>

      ${renderRuntimeTaskLinks(task, props)}

      <div class="task-preview-pane__block">
        ${renderBlockTitle(
          "时间线",
          props,
          timeline.length > timelinePreview.length
            ? { label: "查看完整时间线", onClick: () => openFullRecordDrawer(props, { kind: "timeline" }) }
            : undefined,
        )}
        <div class="task-timeline-mini">
          ${timelinePreview.map(
            (entry) => html`
              <div class="task-timeline-mini__item">
                <div class="task-timeline-mini__time">${entry.timestamp ? formatRelativeTimestamp(entry.timestamp) : t("common.na")}</div>
                <div class="task-timeline-mini__body">
                  <strong>${entry.label}</strong>
                  <span>${entry.detail}</span>
                </div>
              </div>
            `,
          )}
        </div>
        ${renderOverflowHint(remainingTimeline > 0 ? `还有 ${remainingTimeline} 条时间线记录` : null)}
      </div>

      <div class="task-preview-pane__actions">
        ${archiveMode
          ? html`
              <button type="button" class="btn" @click=${() => props.onRestore(task.taskId)}>${t("taskModeUi.actions.restore")}</button>
              <button type="button" class="btn btn--ghost" @click=${() => props.onDelete(task.taskId)}>${t("taskModeUi.actions.delete")}</button>
            `
          : html`
              ${props.currentSession?.taskId !== task.taskId
                ? html`<button type="button" class="btn" @click=${() => props.onSelectCurrent(task.taskId)}>${t("taskModeUi.actions.setCurrent")}</button>`
                : nothing}
              <button type="button" class="btn btn--ghost" @click=${() => props.onSyncProgress?.(task.taskId)}>同步历史进度</button>
              <button type="button" class="btn btn--ghost" @click=${() => props.onToggleEdit?.(task)}>${t("taskModeUi.actions.edit")}</button>
              <button type="button" class="btn btn--ghost" @click=${() => props.onArchive(task.taskId)}>${t("taskModeUi.actions.archive")}</button>
            `}
      </div>
    </aside>
  `;
}

function renderCreateDrawer(props: TasksViewProps) {
  if (!props.createOpen || props.archiveMode) {
    return nothing;
  }
  return html`
    <div class="task-side-sheet">
      <div class="task-side-sheet__scrim" @click=${() => props.onToggleCreate?.()}></div>
      <div class="task-side-sheet__panel">
        <div class="task-side-sheet__header">
          <div>
            <div class="task-side-sheet__eyebrow">创建任务</div>
            <h3 class="task-side-sheet__title">新增任务</h3>
          </div>
          <button type="button" class="btn btn--ghost" @click=${() => props.onToggleCreate?.()}>
            ${t("common.cancel")}
          </button>
        </div>
        <div class="task-side-sheet__body">
          <label class="field">
            <span>标题</span>
            <input
              type="text"
              placeholder=${String(t("taskModeUi.placeholders.title"))}
              .value=${props.createTitle ?? ""}
              @input=${(event: Event) => props.onCreateTitleChange?.((event.target as HTMLInputElement).value)}
            />
          </label>
          <label class="field">
            <span>说明</span>
            <textarea
              placeholder=${String(t("taskModeUi.placeholders.description"))}
              rows="6"
              .value=${props.createDescription ?? ""}
              @input=${(event: Event) => props.onCreateDescriptionChange?.((event.target as HTMLTextAreaElement).value)}
            ></textarea>
          </label>
        </div>
        <div class="task-side-sheet__footer">
          <button type="button" class="btn" @click=${props.onCreateTask} ?disabled=${!(props.createTitle ?? "").trim()}>
            ${t("taskModeUi.actions.create")}
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderEditDrawer(props: TasksViewProps) {
  if (!props.editId) {
    return nothing;
  }
  return html`
    <div class="task-side-sheet">
      <div class="task-side-sheet__scrim" @click=${() => props.onToggleEdit?.(null)}></div>
      <div class="task-side-sheet__panel">
        <div class="task-side-sheet__header">
          <div>
            <div class="task-side-sheet__eyebrow">编辑任务</div>
            <h3 class="task-side-sheet__title">更新任务信息</h3>
          </div>
          <button type="button" class="btn btn--ghost" @click=${() => props.onToggleEdit?.(null)}>
            ${t("common.cancel")}
          </button>
        </div>
        <div class="task-side-sheet__body">
          <label class="field">
            <span>标题</span>
            <input
              type="text"
              placeholder=${String(t("taskModeUi.placeholders.title"))}
              .value=${props.editTitle ?? ""}
              @input=${(event: Event) => props.onEditTitleChange?.((event.target as HTMLInputElement).value)}
            />
          </label>
          <label class="field">
            <span>说明</span>
            <textarea
              placeholder=${String(t("taskModeUi.placeholders.description"))}
              rows="6"
              .value=${props.editDescription ?? ""}
              @input=${(event: Event) => props.onEditDescriptionChange?.((event.target as HTMLTextAreaElement).value)}
            ></textarea>
          </label>
        </div>
        <div class="task-side-sheet__footer">
          <button type="button" class="btn" @click=${() => props.onSaveEdit?.()} ?disabled=${!(props.editTitle ?? "").trim()}>
            ${t("common.save")}
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderTaskHub(props: TasksViewProps) {
  const currentTaskId = props.currentSession?.taskId ?? null;
  const query = hubUiState.taskQuery.trim();
  const filtered = props.items.filter((task) => matchesTaskQuery(task, query));
  const filteredByMode = filtered.filter((task) => {
    if (hubUiState.taskFilter === "all") {
      return true;
    }
    if (hubUiState.taskFilter === "active") {
      return taskIsActive(task);
    }
    if (hubUiState.taskFilter === "completed") {
      return (task.effectiveStatus ?? task.status) === "completed";
    }
    return taskIsReferenceComplete(task);
  });
  const sectionsSource = taskSectionItems(filteredByMode, currentTaskId);
  const sections: TaskSection[] = [
    {
      id: "current",
      title: "当前会话任务",
      description: "当前会话正在绑定的任务。",
      items: sectionsSource.currentTask ? [sectionsSource.currentTask] : [],
      emptyLabel: "当前会话暂未绑定任务。",
    },
    {
      id: "active",
      title: "进行中",
      description: "仍需继续推进的任务。",
      items: sectionsSource.active,
      emptyLabel: "当前筛选下没有进行中的任务。",
    },
    {
      id: "reference",
      title: "已完成 · 保留参考",
      description: "已经完成，但仍值得继续保留在任务中心的任务。",
      items: sectionsSource.completedReference,
      emptyLabel: "当前筛选下没有需要保留参考的已完成任务。",
    },
    {
      id: "recent",
      title: "最近活跃",
      description: "最近更新过、方便快速找回上下文的任务。",
      items: sectionsSource.recent,
      emptyLabel: "当前筛选下没有最近活跃任务。",
    },
  ];
  const previewTask = selectedTask(filteredByMode, currentTaskId);
  return html`
    <section class="task-page task-page--hub">
      <div class="task-page__header task-page__header--hero">
        <div class="task-page__intro">
          <div class="task-page__eyebrow">任务中心</div>
          <p class="task-page__sub">任务中心保留重要任务、进行中任务，以及仍有参考价值的已完成任务。</p>
          <div class="task-page__stats">
            <span class="task-page__stat"><strong>${sectionsSource.currentTask ? 1 : 0}</strong><span>当前会话</span></span>
            <span class="task-page__stat"><strong>${sectionsSource.active.length}</strong><span>进行中</span></span>
            <span class="task-page__stat"><strong>${sectionsSource.completedReference.length}</strong><span>保留参考</span></span>
          </div>
        </div>
        <div class="task-page__actions">
          <button type="button" class="btn btn--ghost" @click=${props.onRefresh}>${t("common.refresh")}</button>
          <button type="button" class="btn" @click=${() => props.onToggleCreate?.()}>
            ${t("taskModeUi.actions.createTask")}
          </button>
        </div>
      </div>

      <div class="task-toolbar task-toolbar--panel">
        <label class="field task-toolbar__search">
          <span>搜索任务</span>
          <input
            .value=${hubUiState.taskQuery}
            @input=${(event: Event) => {
              hubUiState.taskQuery = (event.target as HTMLInputElement).value;
              requestTaskViewUpdate(props);
            }}
            placeholder="按任务标题、描述或下一步搜索"
            autocomplete="off"
          />
        </label>
        <div class="task-filter-chips" role="tablist" aria-label="任务筛选">
          ${[
            ["all", "全部"],
            ["active", "进行中"],
            ["completed", "已完成"],
            ["reference", "保留参考"],
          ].map(
            ([id, label]) => html`
              <button
                type="button"
                class="task-filter-chip ${hubUiState.taskFilter === id ? "task-filter-chip--active" : ""}"
                @click=${() => {
                  hubUiState.taskFilter = id as typeof hubUiState.taskFilter;
                  requestTaskViewUpdate(props);
                }}
              >
                ${label}
              </button>
            `,
          )}
        </div>
      </div>

      ${props.loading ? html`<div class="callout">${t("common.loading")}</div>` : nothing}
      ${props.error ? html`<div class="callout danger">${props.error}</div>` : nothing}

      <div class="task-hub-layout">
        <div class="task-hub-layout__main">
          ${sections.map((section) => renderTaskSection(section, props))}
          ${!props.loading && filteredByMode.length === 0
            ? html`
                <section class="task-section-card task-section-card--empty-state">
                  <h4 class="task-section-card__title">未找到任务</h4>
                  <div class="task-section-card__sub">可以放宽搜索条件，或直接创建一条新任务。</div>
                </section>
              `
            : nothing}
        </div>
        ${renderTaskPreview(previewTask, props)}
      </div>
      ${renderCreateDrawer(props)}
      ${renderEditDrawer(props)}
      ${renderFullRecordDrawer(previewTask, props)}
    </section>
  `;
}

function renderArchiveBatchToolbar(props: TasksViewProps, selectedItems: TaskItem[]) {
  return html`
    <div class="task-archive-toolbar">
      <div class="task-archive-toolbar__meta">已选 ${selectedItems.length} 项</div>
      <div class="task-archive-toolbar__actions">
        <button
          type="button"
          class="btn btn--ghost"
          ?disabled=${selectedItems.length === 0}
          @click=${() => {
            selectedItems.forEach((task) => props.onRestore(task.taskId));
            hubUiState.selectedArchiveIds.clear();
            requestTaskViewUpdate(props);
          }}
        >
          ${t("taskModeUi.actions.restore")}
        </button>
        <button
          type="button"
          class="btn btn--ghost"
          ?disabled=${selectedItems.length === 0}
          @click=${() => {
            selectedItems.forEach((task) => props.onDelete(task.taskId));
            hubUiState.selectedArchiveIds.clear();
            requestTaskViewUpdate(props);
          }}
        >
          ${t("taskModeUi.actions.delete")}
        </button>
      </div>
    </div>
  `;
}

function renderArchivePage(props: TasksViewProps) {
  const query = hubUiState.archiveQuery.trim();
  const filtered = props.items.filter((task) => matchesTaskQuery(task, query));
  const filteredByMode = filtered.filter((task) => {
    if (hubUiState.archiveFilter === "all") {
      return true;
    }
    if (hubUiState.archiveFilter === "completed") {
      return (task.effectiveStatus ?? task.status) === "completed";
    }
    if (hubUiState.archiveFilter === "recent") {
      return Boolean(task.archivedAt && Date.now() - task.archivedAt < 1000 * 60 * 60 * 24 * 30);
    }
    return Boolean(task.archivedAt && Date.now() - task.archivedAt >= 1000 * 60 * 60 * 24 * 30);
  });
  const sorted = sortTasks(filteredByMode, props.currentSession?.taskId ?? null);
  const previewTask = selectedTask(sorted, props.currentSession?.taskId ?? null);
  const selectedItems = sorted.filter((task) => hubUiState.selectedArchiveIds.has(task.taskId));
  return html`
    <section class="task-page task-page--archive">
      <div class="task-page__header task-page__header--hero">
        <div class="task-page__intro">
          <div class="task-page__eyebrow">独立归档</div>
          <p class="task-page__sub">归档区用于存放低频任务，避免任务中心被历史内容淹没；需要时可恢复，确定无用后可删除。</p>
          <div class="task-page__stats">
            <span class="task-page__stat"><strong>${sorted.length}</strong><span>当前归档</span></span>
            <span class="task-page__stat"><strong>${selectedItems.length}</strong><span>已选中</span></span>
          </div>
        </div>
        <div class="task-page__actions">
          <button type="button" class="btn btn--ghost" @click=${props.onRefresh}>${t("common.refresh")}</button>
        </div>
      </div>

      <div class="task-toolbar task-toolbar--panel">
        <label class="field task-toolbar__search">
          <span>搜索归档</span>
          <input
            .value=${hubUiState.archiveQuery}
            @input=${(event: Event) => {
              hubUiState.archiveQuery = (event.target as HTMLInputElement).value;
              requestTaskViewUpdate(props);
            }}
            placeholder="按归档标题或描述搜索"
            autocomplete="off"
          />
        </label>
        <div class="task-filter-chips" role="tablist" aria-label="归档筛选">
          ${[
            ["all", "全部"],
            ["recent", "最近归档"],
            ["completed", "已完成"],
            ["older", "更早历史"],
          ].map(
            ([id, label]) => html`
              <button
                type="button"
                class="task-filter-chip ${hubUiState.archiveFilter === id ? "task-filter-chip--active" : ""}"
                @click=${() => {
                  hubUiState.archiveFilter = id as typeof hubUiState.archiveFilter;
                  requestTaskViewUpdate(props);
                }}
              >
                ${label}
              </button>
            `,
          )}
        </div>
      </div>

      ${renderArchiveBatchToolbar(props, selectedItems)}
      ${props.loading ? html`<div class="callout">${t("common.loading")}</div>` : nothing}
      ${props.error ? html`<div class="callout danger">${props.error}</div>` : nothing}

      <div class="task-hub-layout">
        <div class="task-hub-layout__main">
          ${sorted.length
            ? html`<section class="task-section-card">
                <div class="task-section-card__header">
                  <div>
                    <h4 class="task-section-card__title">归档任务</h4>
                    <div class="task-section-card__sub">在这里集中查看低频任务，需要时恢复；确认无用后再删除。</div>
                  </div>
                  <div class="task-section-card__count">${sorted.length}</div>
                </div>
                <div class="task-section-card__list">
                  ${sorted.map((task) => renderTaskCompactRow(task, props, { archive: true }))}
                </div>
              </section>`
            : html`
                <section class="task-section-card task-section-card--empty-state task-archive-empty">
                  <div class="task-archive-empty__icon">🗂️</div>
                  <h4 class="task-section-card__title">当前没有归档任务</h4>
                  <div class="task-section-card__sub">低频任务归档后会集中存放在这里，避免任务中心被历史内容打断。</div>
                  <ul class="task-archive-empty__list">
                    <li>不需要频繁查看的任务适合归档。</li>
                    <li>仍有参考价值的已完成任务应继续保留在任务中心。</li>
                    <li>当归档任务重新变得重要时，可随时恢复。</li>
                  </ul>
                </section>
              `}
        </div>
        ${renderTaskPreview(previewTask, props, true)}
      </div>
      ${renderEditDrawer(props)}
      ${renderFullRecordDrawer(previewTask, props)}
    </section>
  `;
}

export function renderTasks(props: TasksViewProps) {
  return props.archiveMode ? renderArchivePage(props) : renderTaskHub(props);
}
