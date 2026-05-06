import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearFastTestEnv,
  dispatchCronDeliveryMock,
  isHeartbeatOnlyResponseMock,
  loadRunCronIsolatedAgentTurn,
  mockRunCronFallbackPassthrough,
  resetRunCronIsolatedAgentTurnHarness,
  resolveCronDeliveryPlanMock,
  resolveDeliveryTargetMock,
  restoreFastTestEnv,
  runEmbeddedPiAgentMock,
} from "./run.test-harness.js";

const runCronIsolatedAgentTurn = await loadRunCronIsolatedAgentTurn();

function makeParams() {
  return {
    cfg: {},
    deps: {} as never,
    job: {
      id: "message-tool-policy",
      name: "Message Tool Policy",
      schedule: { kind: "every", everyMs: 60_000 },
      sessionTarget: "isolated",
      payload: { kind: "agentTurn", message: "send a message" },
      delivery: { mode: "none" },
    } as never,
    message: "send a message",
    sessionKey: "cron:message-tool-policy",
  };
}

describe("runCronIsolatedAgentTurn message tool policy", () => {
  let previousFastTestEnv: string | undefined;

  async function expectMessageToolDisabledForPlan(plan: {
    requested: boolean;
    mode: "none" | "announce" | "webhook";
    channel?: string;
    to?: string;
  }) {
    mockRunCronFallbackPassthrough();
    resolveCronDeliveryPlanMock.mockReturnValue(plan);
    await runCronIsolatedAgentTurn(makeParams());
    expect(runEmbeddedPiAgentMock).toHaveBeenCalledTimes(1);
    expect(runEmbeddedPiAgentMock.mock.calls[0]?.[0]?.disableMessageTool).toBe(true);
    expect(runEmbeddedPiAgentMock.mock.calls[0]?.[0]?.forceMessageTool).toBe(false);
  }

  async function expectMessageToolEnabledForPlan(plan: {
    requested: boolean;
    mode: "none" | "announce";
    channel?: string;
    to?: string;
  }) {
    mockRunCronFallbackPassthrough();
    resolveCronDeliveryPlanMock.mockReturnValue(plan);
    await runCronIsolatedAgentTurn(makeParams());
    expect(runEmbeddedPiAgentMock).toHaveBeenCalledTimes(1);
    expect(runEmbeddedPiAgentMock.mock.calls[0]?.[0]?.disableMessageTool).toBe(false);
    expect(runEmbeddedPiAgentMock.mock.calls[0]?.[0]?.forceMessageTool).toBe(true);
  }

  beforeEach(() => {
    previousFastTestEnv = clearFastTestEnv();
    resetRunCronIsolatedAgentTurnHarness();
    resolveDeliveryTargetMock.mockResolvedValue({
      ok: true,
      channel: "telegram",
      to: "123",
      accountId: undefined,
      error: undefined,
    });
  });

  afterEach(() => {
    restoreFastTestEnv(previousFastTestEnv);
  });

  it('keeps the message tool enabled when delivery.mode is "none"', async () => {
    await expectMessageToolEnabledForPlan({
      requested: false,
      mode: "none",
    });
  });

  it("keeps the message tool enabled when cron delivery is active", async () => {
    await expectMessageToolEnabledForPlan({
      requested: true,
      mode: "announce",
      channel: "telegram",
      to: "123",
    });
  });

  it("disables the message tool for webhook delivery", async () => {
    await expectMessageToolDisabledForPlan({
      requested: true,
      mode: "webhook",
    });
  });

  it("skips cron delivery when output is heartbeat-only", async () => {
    mockRunCronFallbackPassthrough();
    resolveCronDeliveryPlanMock.mockReturnValue({
      requested: true,
      mode: "announce",
      channel: "telegram",
      to: "123",
    });
    isHeartbeatOnlyResponseMock.mockReturnValue(true);

    await runCronIsolatedAgentTurn({
      ...makeParams(),
      job: {
        id: "message-tool-policy",
        name: "Message Tool Policy",
        schedule: { kind: "every", everyMs: 60_000 },
        sessionTarget: "isolated",
        payload: { kind: "agentTurn", message: "send a message" },
        delivery: { mode: "announce", channel: "telegram", to: "123" },
      } as never,
    });

    expect(dispatchCronDeliveryMock).toHaveBeenCalledTimes(1);
    expect(dispatchCronDeliveryMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        deliveryRequested: true,
        skipHeartbeatDelivery: true,
      }),
    );
  });

  it("skips cron delivery when the message tool already sent to the same target", async () => {
    mockRunCronFallbackPassthrough();
    const params = makeParams();
    const job = {
      id: "message-tool-policy",
      name: "Message Tool Policy",
      schedule: { kind: "every", everyMs: 60_000 },
      sessionTarget: "isolated",
      payload: { kind: "agentTurn", message: "send a message" },
      delivery: { mode: "announce", channel: "telegram", to: "123" },
    } as const;
    resolveCronDeliveryPlanMock.mockReturnValue({
      requested: true,
      mode: "announce",
      channel: "telegram",
      to: "123",
    });
    runEmbeddedPiAgentMock.mockResolvedValue({
      payloads: [{ text: "sent" }],
      didSendViaMessagingTool: true,
      messagingToolSentTargets: [{ tool: "message", provider: "telegram", to: "123" }],
      meta: { agentMeta: { usage: { input: 10, output: 20 } } },
    });

    await runCronIsolatedAgentTurn({
      ...params,
      job: job as never,
    });

    expect(dispatchCronDeliveryMock).toHaveBeenCalledTimes(1);
    expect(dispatchCronDeliveryMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        deliveryRequested: true,
        skipMessagingToolDelivery: true,
      }),
    );
  });

  it("rewrites generic message provider to resolved channel in delivery trace", async () => {
    mockRunCronFallbackPassthrough();
    resolveCronDeliveryPlanMock.mockReturnValue({
      requested: true,
      mode: "announce",
      channel: "telegram",
      to: "123",
    });
    resolveDeliveryTargetMock.mockResolvedValue({
      ok: true,
      channel: "telegram",
      to: "123",
      accountId: undefined,
      mode: "explicit",
      error: undefined,
    });
    runEmbeddedPiAgentMock.mockResolvedValue({
      payloads: [{ text: "sent" }],
      didSendViaMessagingTool: true,
      messagingToolSentTargets: [{ tool: "message", provider: "message", to: "123" }],
      meta: { agentMeta: { usage: { input: 10, output: 20 } } },
    });

    const result = await runCronIsolatedAgentTurn({
      ...makeParams(),
      job: {
        id: "message-tool-generic-target",
        name: "Message Tool Generic Target",
        schedule: { kind: "every", everyMs: 60_000 },
        sessionTarget: "isolated",
        payload: { kind: "agentTurn", message: "send a message" },
        delivery: { mode: "announce", channel: "telegram", to: "123" },
      } as never,
    });

    expect(result.delivery).toEqual(
      expect.objectContaining({
        resolved: { ok: true, channel: "telegram", to: "123", source: "explicit" },
        messageToolSentTo: [{ channel: "telegram", to: "123" }],
      }),
    );
  });

  it("skips cron delivery for account-bound jobs when message tool omits accountId", async () => {
    mockRunCronFallbackPassthrough();
    const params = makeParams();
    const job = {
      id: "message-tool-policy-account-default",
      name: "Message Tool Policy Account Default",
      schedule: { kind: "every", everyMs: 60_000 },
      sessionTarget: "isolated",
      payload: { kind: "agentTurn", message: "send a message" },
      delivery: { mode: "announce", channel: "telegram", to: "123", accountId: "bot-a" },
    } as const;
    resolveCronDeliveryPlanMock.mockReturnValue({
      requested: true,
      mode: "announce",
      channel: "telegram",
      to: "123",
      accountId: "bot-a",
    });
    resolveDeliveryTargetMock.mockResolvedValue({
      ok: true,
      channel: "telegram",
      to: "123",
      accountId: "bot-a",
      mode: "explicit",
      error: undefined,
    });
    runEmbeddedPiAgentMock.mockResolvedValue({
      payloads: [{ text: "sent" }],
      didSendViaMessagingTool: true,
      messagingToolSentTargets: [{ tool: "message", provider: "message", to: "123" }],
      meta: { agentMeta: { usage: { input: 10, output: 20 } } },
    });

    const result = await runCronIsolatedAgentTurn({
      ...params,
      job: job as never,
    });

    expect(dispatchCronDeliveryMock).toHaveBeenCalledTimes(1);
    expect(dispatchCronDeliveryMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        deliveryRequested: true,
        skipMessagingToolDelivery: true,
      }),
    );
    expect(result.delivery).toEqual(
      expect.objectContaining({
        messageToolSentTo: [{ channel: "telegram", to: "123" }],
      }),
    );
  });

  it("does not skip cron delivery when message tool explicitly names a different accountId", async () => {
    mockRunCronFallbackPassthrough();
    const params = makeParams();
    const job = {
      id: "message-tool-policy-account-spoof",
      name: "Message Tool Policy Account Spoof",
      schedule: { kind: "every", everyMs: 60_000 },
      sessionTarget: "isolated",
      payload: { kind: "agentTurn", message: "send a message" },
      delivery: { mode: "announce", channel: "telegram", to: "123", accountId: "bot-a" },
    } as const;
    resolveCronDeliveryPlanMock.mockReturnValue({
      requested: true,
      mode: "announce",
      channel: "telegram",
      to: "123",
      accountId: "bot-a",
    });
    resolveDeliveryTargetMock.mockResolvedValue({
      ok: true,
      channel: "telegram",
      to: "123",
      accountId: "bot-a",
      mode: "explicit",
      error: undefined,
    });
    runEmbeddedPiAgentMock.mockResolvedValue({
      payloads: [{ text: "sent" }],
      didSendViaMessagingTool: true,
      messagingToolSentTargets: [
        { tool: "message", provider: "message", to: "123", accountId: "bot-b" },
      ],
      meta: { agentMeta: { usage: { input: 10, output: 20 } } },
    });

    const result = await runCronIsolatedAgentTurn({
      ...params,
      job: job as never,
    });

    expect(dispatchCronDeliveryMock).toHaveBeenCalledTimes(1);
    expect(dispatchCronDeliveryMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        deliveryRequested: true,
        skipMessagingToolDelivery: false,
      }),
    );
    expect(result.delivery).toEqual(
      expect.objectContaining({
        messageToolSentTo: [{ channel: "message", to: "123", accountId: "bot-b" }],
      }),
    );
  });
});
