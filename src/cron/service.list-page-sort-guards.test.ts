import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createMockCronStateForJobs } from "./service.test-harness.js";
import { listPage } from "./service/ops.js";
import type { CronJob } from "./types.js";

function createBaseJob(overrides?: Partial<CronJob>): CronJob {
  return {
    id: "job-1",
    name: "job",
    enabled: true,
    schedule: { kind: "cron", expr: "*/5 * * * *", tz: "UTC" },
    sessionTarget: "main",
    wakeMode: "now",
    payload: { kind: "systemEvent", text: "tick" },
    state: { nextRunAtMs: Date.parse("2026-02-27T15:30:00.000Z") },
    createdAtMs: Date.parse("2026-02-27T15:00:00.000Z"),
    updatedAtMs: Date.parse("2026-02-27T15:05:00.000Z"),
    ...overrides,
  };
}

describe("cron listPage sort guards", () => {
  const futureNextRunAtMs = Date.parse("2036-02-27T15:30:00.000Z");

  it("keeps malformed name fields sortable", async () => {
    const jobs = [
      createBaseJob({ id: "job-a", name: undefined as unknown as string }),
      createBaseJob({ id: "job-b", name: "beta" }),
    ];
    const state = createMockCronStateForJobs({ jobs });

    const page = await listPage(state, { sortBy: "name", sortDir: "asc" });
    expect(page.jobs).toHaveLength(2);
  });

  it("keeps missing ids sortable during tie-breaks", async () => {
    const nextRunAtMs = Date.parse("2026-02-27T15:30:00.000Z");
    const jobs = [
      createBaseJob({
        id: undefined as unknown as string,
        name: "alpha",
        state: { nextRunAtMs },
      }),
      createBaseJob({
        id: undefined as unknown as string,
        name: "alpha",
        state: { nextRunAtMs },
      }),
    ];
    const state = createMockCronStateForJobs({ jobs });

    const page = await listPage(state, { sortBy: "nextRunAtMs", sortDir: "asc" });
    expect(page.jobs).toHaveLength(2);
  });

  it("normalizes requested agent ids before filtering", async () => {
    const jobs = [
      createBaseJob({ id: "job-main", agentId: "main", name: "main" }),
      createBaseJob({ id: "job-ops", agentId: "ops", name: "ops" }),
      createBaseJob({ id: "job-unset", agentId: undefined, name: "unset" }),
    ];
    const state = createMockCronStateForJobs({ jobs });

    const page = await listPage(state, { agentId: " Ops " });

    expect(page.jobs.map((job) => job.id)).toEqual(["job-ops"]);
  });

  it("matches omitted job agent ids to the configured default agent when filtering", async () => {
    const jobs = [
      createBaseJob({ id: "job-main", agentId: "main", name: "main" }),
      createBaseJob({ id: "job-ops", agentId: "ops", name: "ops" }),
      createBaseJob({ id: "job-unset", agentId: undefined, name: "unset" }),
    ];
    const state = createMockCronStateForJobs({ jobs });
    state.deps.defaultAgentId = " Ops ";

    const page = await listPage(state, { agentId: "ops" });

    expect(page.jobs.map((job) => job.id)).toEqual(["job-ops", "job-unset"]);
  });

  it("matches omitted job agent ids to main when no default agent is configured", async () => {
    const jobs = [
      createBaseJob({ id: "job-main", agentId: "main", name: "main" }),
      createBaseJob({ id: "job-ops", agentId: "ops", name: "ops" }),
      createBaseJob({ id: "job-unset", agentId: undefined, name: "unset" }),
    ];
    const state = createMockCronStateForJobs({ jobs });

    const page = await listPage(state, { agentId: "main" });

    expect(page.jobs.map((job) => job.id)).toEqual(["job-main", "job-unset"]);
  });

  it("keeps listPage unfiltered when agent id is omitted", async () => {
    const jobs = [
      createBaseJob({ id: "job-main", agentId: "main", name: "main" }),
      createBaseJob({ id: "job-ops", agentId: "ops", name: "ops" }),
    ];
    const state = createMockCronStateForJobs({ jobs });

    const page = await listPage(state);

    expect(page.jobs.map((job) => job.id)).toEqual(["job-main", "job-ops"]);
  });

  it("filters by schedule kind and last run status before paging", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-cron-list-page-"));
    const jobs = [
      createBaseJob({
        id: "cron-error",
        schedule: { kind: "cron", expr: "0 * * * *" },
        state: { nextRunAtMs: futureNextRunAtMs, lastRunStatus: "error" },
      }),
      createBaseJob({
        id: "cron-ok",
        schedule: { kind: "cron", expr: "15 * * * *" },
        state: { nextRunAtMs: futureNextRunAtMs, lastRunStatus: "ok" },
      }),
      createBaseJob({
        id: "every-error",
        schedule: { kind: "every", everyMs: 60_000 },
        state: { nextRunAtMs: futureNextRunAtMs, lastRunStatus: "error" },
      }),
    ];
    const state = createMockCronStateForJobs({ jobs });
    state.deps.storePath = path.join(tmpDir, "cron", "jobs.json");

    try {
      const page = await listPage(state, { scheduleKind: "cron", lastRunStatus: "error" });

      expect(page.jobs.map((job) => job.id)).toEqual(["cron-error"]);
      expect(page.total).toBe(1);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
