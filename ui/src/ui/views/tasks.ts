import { html, nothing } from "lit";
import { t } from "../../i18n/index.ts";
import { formatRelativeTimestamp } from "../format.ts";
import type { TaskItem, TaskStatus } from "../controllers/tasks.ts";
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
  onEditTask: (task: TaskItem) => void;
};

const ACTIVE_STATUSES: TaskStatus[] = ["active", "paused", "interrupted", "completed", "ended"];
const hubUiState = {
  taskQuery: "",
  taskFilter: "all" as "all" | "active" | "completed" | "reference",
  archiveQuery: "",
  archiveFilter: "all" as "all" | "recent" | "completed" | "older",
  selectedTaskId: null as string | null,
  selectedArchiveIds: new Set<string>(),
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

function normalizeTaskBody(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
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
  const summary = clampText(clauses[0] || cleanTitle || statusLabel(task?.effectiveStatus ?? task?.status) || String(t("taskModeUi.empty")), 78);
  const nextStep = clampText(
    clauses[1] ||
      cleanFlowStep ||
      (task?.effectiveStatus === "completed"
        ? String(t("taskWorkspace.nextState.completed"))
        : String(t("taskWorkspace.nextState.continue"))),
    78,
  );
  return {
    title: cleanTitle || title || String(t("taskModeUi.empty")),
    summary,
    nextStep,
    completedSummary: clampText(clauses.slice(0, 2).join(" · ") || String(t("taskWorkspace.noneYet")), 96),
    fullDescription: clampText(cleanDescription || cleanTitle || String(t("taskModeUi.empty")), 160),
    rawDescription: description || title || String(t("taskModeUi.empty")),
  };
}

function extractTechnicalContext(task: TaskItem | null | undefined): string[] {
  const source = `${task?.title ?? ""}\n${task?.description ?? ""}`;
  const matches = source.match(/(?:\/[A-Za-z0-9_./-]+|[A-Za-z0-9_./-]+\.(?:vue|js|ts|tsx|jsx|json|md))/g) ?? [];
  return Array.from(new Set(matches.map((item) => item.trim()).filter(Boolean))).slice(0, 8);
}

function renderTechnicalDetails(task: TaskItem | null | undefined) {
  const endpoints = extractEndpointPaths(task);
  const params = extractParamNames(task);
  if (endpoints.length === 0 && params.length === 0) {
    return nothing;
  }
  return html`
    <details class="task-technical-details">
      <summary>查看技术细节</summary>
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
    </details>
  `;
}

function buildTaskTimeline(task: TaskItem | null | undefined) {
  if (!task) {
    return [] as Array<{ label: string; detail: string; timestamp: number | null }>;
  }
  const effectiveStatus = task.effectiveStatus ?? task.status;
  const progressLabel = normalizeTaskBody(task.flowCurrentStep ?? task.description) || statusLabel(effectiveStatus);
  return [
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
  const timeline = buildTaskTimeline(task).slice(0, 3);
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
        ${renderTechnicalDetails(task)}
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
        <article class="task-preview-pane__card task-preview-pane__card--wide">
          <div class="task-preview-pane__label">本轮完成</div>
          <div class="task-preview-pane__value">${highlights.completedSummary}</div>
        </article>
      </div>

      <div class="task-preview-pane__block">
        <div class="task-preview-pane__block-title">资源上下文</div>
        ${(technical.length || endpoints.length || params.length)
          ? html`
              ${technical.length ? html`<div class="task-chip-row">${technical.map((item) => html`<span class="task-chip">${item}</span>`)}</div>` : nothing}
              ${endpoints.length
                ? html`<div class="task-preview-pane__detail-list"><strong>接口：</strong>${endpoints.join("、")}</div>`
                : nothing}
              ${params.length
                ? html`<div class="task-preview-pane__detail-list"><strong>参数：</strong>${params.join("、")}</div>`
                : nothing}
            `
          : html`<div class="task-empty-inline">${t("taskWorkspace.noTechnicalContext")}</div>`}
      </div>

      <div class="task-preview-pane__block">
        <div class="task-preview-pane__block-title">时间线</div>
        <div class="task-timeline-mini">
          ${timeline.map(
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
    </section>
  `;
}

export function renderTasks(props: TasksViewProps) {
  return props.archiveMode ? renderArchivePage(props) : renderTaskHub(props);
}
