import { beforeEach, describe, expect, it, vi } from "vitest";
import { matchesMessagingToolDeliveryTarget } from "./delivery-dispatch.js";

const normalizeTargetForProviderMock = vi.hoisted(() =>
  vi.fn((_provider: string, raw?: string) => raw?.trim()),
);

// Mock the announce flow dependencies to test the fallback behavior.
vi.mock("../../agents/subagent-announce.js", () => ({
  runSubagentAnnounceFlow: vi.fn(),
}));
vi.mock("../../agents/subagent-registry-read.js", () => ({
  countActiveDescendantRuns: vi.fn().mockReturnValue(0),
}));
vi.mock("../../infra/outbound/target-normalization.js", () => ({
  normalizeTargetForProvider: (...args: Parameters<typeof normalizeTargetForProviderMock>) =>
    normalizeTargetForProviderMock(...args),
}));

beforeEach(() => {
  normalizeTargetForProviderMock.mockClear();
  normalizeTargetForProviderMock.mockImplementation((_provider: string, raw?: string) =>
    raw?.trim(),
  );
});

describe("matchesMessagingToolDeliveryTarget", () => {
  it("matches when channel and to agree", () => {
    expect(
      matchesMessagingToolDeliveryTarget(
        { provider: "telegram", to: "123456" },
        { channel: "telegram", to: "123456" },
      ),
    ).toBe(true);
  });

  it("rejects when channel differs", () => {
    expect(
      matchesMessagingToolDeliveryTarget(
        { provider: "whatsapp", to: "123456" },
        { channel: "telegram", to: "123456" },
      ),
    ).toBe(false);
  });

  it("rejects when to is missing from delivery", () => {
    expect(
      matchesMessagingToolDeliveryTarget(
        { provider: "telegram", to: "123456" },
        { channel: "telegram", to: undefined },
      ),
    ).toBe(false);
  });

  it("rejects when channel is missing from delivery", () => {
    expect(
      matchesMessagingToolDeliveryTarget(
        { provider: "telegram", to: "123456" },
        { channel: undefined, to: "123456" },
      ),
    ).toBe(false);
  });

  it("strips :topic:NNN suffix from target.to before comparing", () => {
    expect(
      matchesMessagingToolDeliveryTarget(
        { provider: "telegram", to: "-1003597428309:topic:462" },
        { channel: "telegram", to: "-1003597428309" },
      ),
    ).toBe(true);
  });

  it("matches when provider is 'message' (generic)", () => {
    expect(
      matchesMessagingToolDeliveryTarget(
        { provider: "message", to: "123456" },
        { channel: "telegram", to: "123456" },
      ),
    ).toBe(true);
  });

  it("rejects when accountIds differ", () => {
    expect(
      matchesMessagingToolDeliveryTarget(
        { provider: "telegram", to: "123456", accountId: "bot-a" },
        { channel: "telegram", to: "123456", accountId: "bot-b" },
      ),
    ).toBe(false);
  });

  it("matches when delivery has accountId and target omits it (tool fills accountId at exec)", () => {
    expect(
      matchesMessagingToolDeliveryTarget(
        { provider: "message", to: "123456" },
        { channel: "telegram", to: "123456", accountId: "bot-a" },
      ),
    ).toBe(true);
  });

  it("skips target normalization when stripped raw recipients already match", () => {
    expect(
      matchesMessagingToolDeliveryTarget(
        { provider: "telegram", to: " -1003597428309:topic:462 " },
        { channel: "telegram", to: " -1003597428309 " },
      ),
    ).toBe(true);
    expect(normalizeTargetForProviderMock).not.toHaveBeenCalled();
  });

  it("falls back to target normalization when raw recipients differ", () => {
    normalizeTargetForProviderMock.mockImplementation((_provider: string, raw?: string) =>
      raw?.trim().replace(/^chat:/, ""),
    );

    expect(
      matchesMessagingToolDeliveryTarget(
        { provider: "telegram", to: "chat:-1003597428309" },
        { channel: "telegram", to: "-1003597428309" },
      ),
    ).toBe(true);
    expect(normalizeTargetForProviderMock).toHaveBeenCalledTimes(2);
  });
});

describe("resolveCronDeliveryBestEffort", () => {
  // Import dynamically to avoid top-level side effects
  it("returns false by default (no bestEffort set)", async () => {
    const { resolveCronDeliveryBestEffort } = await import("./delivery-dispatch.js");
    const job = { delivery: {}, payload: { kind: "agentTurn" } } as never;
    expect(resolveCronDeliveryBestEffort(job)).toBe(false);
  });

  it("returns true when delivery.bestEffort is true", async () => {
    const { resolveCronDeliveryBestEffort } = await import("./delivery-dispatch.js");
    const job = { delivery: { bestEffort: true }, payload: { kind: "agentTurn" } } as never;
    expect(resolveCronDeliveryBestEffort(job)).toBe(true);
  });
});
