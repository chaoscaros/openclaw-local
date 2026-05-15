import { afterEach, describe, expect, it, vi } from "vitest";
import { ExecApprovalManager } from "./exec-approval-manager.js";

describe("ExecApprovalManager resolved-entry cleanup", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("unrefs the resolved-entry cleanup timer after resolve", async () => {
    const manager = new ExecApprovalManager<{ title: string; description: string }>();
    const record = manager.create(
      { title: "Approve", description: "desc" },
      30_000,
      "approval-resolve",
    );

    const expiryTimer = { unref: vi.fn() } as unknown as ReturnType<typeof setTimeout>;
    const cleanupTimer = { unref: vi.fn() } as unknown as ReturnType<typeof setTimeout>;
    let callCount = 0;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      handler: TimerHandler,
      timeout?: number,
    ) => {
      void handler;
      void timeout;
      callCount += 1;
      return callCount === 1 ? expiryTimer : cleanupTimer;
    }) as unknown as typeof setTimeout);

    const decisionPromise = manager.register(record, 30_000);
    expect(manager.resolve(record.id, "allow-once")).toBe(true);
    await expect(decisionPromise).resolves.toBe("allow-once");
    expect(
      (cleanupTimer as unknown as { unref: ReturnType<typeof vi.fn> }).unref,
    ).toHaveBeenCalledTimes(1);
  });

  it("unrefs the resolved-entry cleanup timer after expire", async () => {
    const manager = new ExecApprovalManager<{ title: string; description: string }>();
    const record = manager.create(
      { title: "Approve", description: "desc" },
      30_000,
      "approval-expire",
    );

    const expiryTimer = { unref: vi.fn() } as unknown as ReturnType<typeof setTimeout>;
    const cleanupTimer = { unref: vi.fn() } as unknown as ReturnType<typeof setTimeout>;
    let callCount = 0;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      handler: TimerHandler,
      timeout?: number,
    ) => {
      void handler;
      void timeout;
      callCount += 1;
      return callCount === 1 ? expiryTimer : cleanupTimer;
    }) as unknown as typeof setTimeout);

    const decisionPromise = manager.register(record, 30_000);
    expect(manager.expire(record.id, "timeout")).toBe(true);
    await expect(decisionPromise).resolves.toBeNull();
    expect(
      (cleanupTimer as unknown as { unref: ReturnType<typeof vi.fn> }).unref,
    ).toHaveBeenCalledTimes(1);
  });
});
