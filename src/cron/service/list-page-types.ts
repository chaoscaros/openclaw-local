import type { CronJob } from "../types.js";

export type CronJobsEnabledFilter = "all" | "enabled" | "disabled";
export type CronJobsScheduleKindFilter = "all" | "at" | "every" | "cron";
export type CronJobsLastStatusFilter = "all" | "ok" | "error" | "skipped";
export type CronJobsSortBy = "nextRunAtMs" | "updatedAtMs" | "name";
export type CronSortDir = "asc" | "desc";

export type CronListPageOptions = {
  includeDisabled?: boolean;
  limit?: number;
  offset?: number;
  query?: string;
  enabled?: CronJobsEnabledFilter;
  scheduleKind?: CronJobsScheduleKindFilter;
  lastRunStatus?: CronJobsLastStatusFilter;
  sortBy?: CronJobsSortBy;
  sortDir?: CronSortDir;
  agentId?: string;
};

export type CronListPageResult<TJobs extends readonly CronJob[] = CronJob[]> = {
  jobs: TJobs;
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  nextOffset: number | null;
};
