import { html, nothing } from "lit";
import { t } from "../../i18n/index.ts";
import { formatRelativeTimestamp } from "../format.ts";
import type { TaskCheckpoint, TaskDetail, TaskItem, TaskStatus } from "../controllers/tasks.ts";

export type TasksViewProps = {
  loading: boolean;
  result: { ok: true; items: TaskItem[]; total: number } | null;
  error: string | null;
  filterStatus: "" | TaskStatus;
  searchQuery: string;
  selectedTaskId: string | null;
  detailLoading: boolean;
  detail: { ok: true; task: TaskDetail; checkpoints: TaskCheckpoint[] } | null;
  detailError: string | null;
  onFilterStatusChange: (value: "" | TaskStatus) => void;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  onSelectTask: (taskId: string) => void;
  onCopyResumePrompt: (task: TaskItem | TaskDetail) => void;
  onMarkDone: (taskId: string) => void;
};

function renderTaskCard(task: TaskItem, props: TasksViewProps) {
  const isSelected = props.selectedTaskId === task.taskId;
  return html`
    <div class="card" style="margin-bottom:12px; border:${isSelected ? "1px solid var(--accent-color, #6aa9ff)" : "1px solid var(--card-border, rgba(255,255,255,.08))"};">
      <div class="row" style="justify-content:space-between; gap:12px; align-items:flex-start;">
        <div style="flex:1; min-width:0;">
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <strong>${task.title}</strong>
            <span class="badge">${t(`tasksView.statusOptions.${task.status}`)}</span>
            ${task.projectId ? html`<span class="badge">${task.projectId}</span>` : nothing}
          </div>
          <div class="muted" style="margin-top:6px;">${task.summary || "-"}</div>
          ${task.currentPhase ? html`<div style="margin-top:6px;"><strong>${t("tasksView.currentPhase")}：</strong>${task.currentPhase}</div>` : nothing}
          ${task.blocker ? html`<div style="margin-top:4px;"><strong>${t("tasksView.blocker")}：</strong>${task.blocker}</div>` : nothing}
          ${task.nextAction ? html`<div style="margin-top:4px;"><strong>${t("tasksView.nextAction")}：</strong>${task.nextAction}</div>` : nothing}
          <div class="muted" style="margin-top:8px;">${t("tasksView.updatedAt", { time: formatRelativeTimestamp(task.updatedAt) })}</div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
          <button @click=${() => props.onSelectTask(task.taskId)}>${t("tasksView.detail")}</button>
          <button @click=${() => props.onCopyResumePrompt(task)}>${t("tasksView.copyResume")}</button>
          <button @click=${() => props.onMarkDone(task.taskId)}>${t("tasksView.markDone")}</button>
        </div>
      </div>
    </div>
  `;
}

function renderTaskDetail(detail: { ok: true; task: TaskDetail; checkpoints: TaskCheckpoint[] } | null, error: string | null, loading: boolean, onCopyResumePrompt: (task: TaskDetail) => void) {
  if (loading) {
    return html`<div class="card">${t("tasksView.detailLoading")}</div>`;
  }
  if (error) {
    return html`<div class="card">${t("tasksView.detailLoadFailed", { error })}</div>`;
  }
  if (!detail) {
    return html`<div class="card">${t("tasksView.selectPrompt")}</div>`;
  }
  const task = detail.task;
  const statusLabel = t(`tasksView.statusOptions.${task.status}`);
  const projectSuffix = task.projectId
    ? t("tasksView.detailProjectSuffix", { project: task.projectId })
    : "";
  const detailMeta = t("tasksView.detailMeta", { status: statusLabel, project: projectSuffix }).replace(
    /\{project\}/g,
    projectSuffix,
  );
  return html`
    <div class="card">
      <div class="row" style="justify-content:space-between; gap:12px; align-items:flex-start;">
        <div>
          <h3 style="margin:0 0 8px 0;">${task.title}</h3>
          <div class="muted">${detailMeta}</div>
        </div>
        <button @click=${() => onCopyResumePrompt(task)}>${t("tasksView.copyResume")}</button>
      </div>
      <div style="margin-top:12px;"><strong>${t("tasksView.summary")}：</strong>${task.summary || "-"}</div>
      ${task.currentPhase ? html`<div style="margin-top:8px;"><strong>${t("tasksView.currentPhase")}：</strong>${task.currentPhase}</div>` : nothing}
      ${task.progress?.done?.length ? html`<div style="margin-top:12px;"><strong>${t("tasksView.doneItems")}：</strong><ul>${task.progress.done.map((item) => html`<li>${item}</li>`)}</ul></div>` : nothing}
      ${task.progress?.pending?.length ? html`<div style="margin-top:12px;"><strong>${t("tasksView.pendingItems")}：</strong><ul>${task.progress.pending.map((item) => html`<li>${item}</li>`)}</ul></div>` : nothing}
      ${task.relatedFiles?.length ? html`<div style="margin-top:12px;"><strong>${t("tasksView.relatedFiles")}：</strong><ul>${task.relatedFiles.map((item) => html`<li>${item}</li>`)}</ul></div>` : nothing}
      <div style="margin-top:12px;"><strong>${t("tasksView.checkpoints")}：</strong>
        ${detail.checkpoints.length
          ? html`<ul>${detail.checkpoints.map((cp) => {
              const nextSuffix = cp.next
                ? t("tasksView.checkpointNextSuffix", { next: cp.next })
                : "";
              return html`<li>${t("tasksView.checkpointEntry", {
                time: new Date(cp.at).toLocaleString(),
                step: cp.step,
                status: cp.status,
                next: nextSuffix,
              })}</li>`;
            })}</ul>`
          : html`<div class="muted">${t("tasksView.noCheckpoints")}</div>`}
      </div>
    </div>
  `;
}

export function renderTasks(props: TasksViewProps) {
  const items = props.result?.items || [];
  return html`
    <section class="card">
      <div class="row" style="justify-content:space-between; gap:12px; align-items:flex-end; margin-bottom:12px; flex-wrap:wrap;">
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <select .value=${props.filterStatus} @change=${(e: Event) => props.onFilterStatusChange(((e.target as HTMLSelectElement).value || "") as "" | TaskStatus)}>
            <option value="">${t("tasksView.statusOptions.all")}</option>
            <option value="active">${t("tasksView.statusOptions.active")}</option>
            <option value="paused">${t("tasksView.statusOptions.paused")}</option>
            <option value="blocked">${t("tasksView.statusOptions.blocked")}</option>
            <option value="done">${t("tasksView.statusOptions.done")}</option>
            <option value="cancelled">${t("tasksView.statusOptions.cancelled")}</option>
            <option value="draft">${t("tasksView.statusOptions.draft")}</option>
          </select>
          <input type="search" placeholder=${t("tasksView.searchPlaceholder")} .value=${props.searchQuery} @input=${(e: Event) => props.onSearchChange((e.target as HTMLInputElement).value)} />
          <button @click=${props.onRefresh}>${t("tasksView.refresh")}</button>
        </div>
        <div class="muted">${t("tasksView.total", { count: props.result?.total || 0 })}</div>
      </div>
      ${props.loading ? html`<div>${t("tasksView.loading")}</div>` : nothing}
      ${props.error ? html`<div style="margin-bottom:12px; color: var(--danger-color, #ff8080);">${props.error}</div>` : nothing}
      <div style="display:grid; grid-template-columns:minmax(320px, 1fr) minmax(320px, 1fr); gap:16px; align-items:start;">
        <div>
          ${!props.loading && items.length === 0 ? html`<div class="card">${t("tasksView.empty")}</div>` : items.map((task) => renderTaskCard(task, props))}
        </div>
        <div>
          ${renderTaskDetail(props.detail, props.detailError, props.detailLoading, props.onCopyResumePrompt)}
        </div>
      </div>
    </section>
  `;
}
