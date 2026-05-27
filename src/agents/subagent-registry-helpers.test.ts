import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultRuntime } from "../runtime.js";
import { logAnnounceGiveUp } from "./subagent-registry-helpers.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";

describe("logAnnounceGiveUp", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("includes a bounded delivery error when announce retries give up", () => {
    const log = vi.spyOn(defaultRuntime, "log").mockImplementation(() => undefined);
    const longError = `first line\n${"x".repeat(2_100)}`;

    logAnnounceGiveUp(
      {
        runId: "run-1",
        childSessionKey: "agent:main:subagent:child",
        requesterSessionKey: "agent:main:main",
        requesterDisplayKey: "main",
        task: "Summarize status",
        cleanup: "keep",
        createdAt: Date.now() - 20_000,
        announceRetryCount: 3,
        endedAt: Date.now() - 12_345,
        lastAnnounceDeliveryError: longError,
      } satisfies SubagentRunRecord,
      "retry-limit",
    );

    const message = String(log.mock.calls[0]?.[0]);
    expect(message).toContain("deliveryError=");
    expect(message).toContain("first line ");
    expect(message.length).toBeLessThan(2_300);
  });
});
