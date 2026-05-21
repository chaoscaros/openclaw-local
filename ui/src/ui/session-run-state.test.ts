import { describe, expect, it } from "vitest";
import { isSessionRunActive, resolveSessionRunIndicatorId } from "./session-run-state.ts";

describe("session run state", () => {
  it("treats only non-ended running rows as active", () => {
    expect(isSessionRunActive({ status: "running" })).toBe(true);
    expect(isSessionRunActive({ status: "running", endedAt: 1 })).toBe(false);
    expect(isSessionRunActive({ status: "done" })).toBe(false);
    expect(isSessionRunActive({ hasActiveRun: true })).toBe(true);
    expect(isSessionRunActive({ hasActiveRun: true, status: "done" })).toBe(false);
  });

  it("suppresses a stale local run id when the session row is terminal", () => {
    expect(resolveSessionRunIndicatorId("run-stale", { status: "done", key: "main" })).toBeNull();
  });

  it("recovers a visible run id from a running session row after refresh", () => {
    expect(resolveSessionRunIndicatorId(null, { status: "running", key: "agent:main" })).toBe(
      "agent:main",
    );
  });

  it("recovers from legacy active-run rows when no terminal status is available", () => {
    expect(resolveSessionRunIndicatorId(null, { hasActiveRun: true, key: "agent:legacy" })).toBe(
      "agent:legacy",
    );
  });

  it("keeps a local run id when no session row status is available yet", () => {
    expect(resolveSessionRunIndicatorId("run-local", null)).toBe("run-local");
  });
});
