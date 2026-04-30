import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecApprovalDecision } from "../../infra/exec-approvals.js";
import { ExecApprovalManager, type ExecApprovalRecord } from "../exec-approval-manager.js";
import { handlePendingApprovalRequest } from "./approval-shared.js";

const mocks = vi.hoisted(() => ({
  hasApprovalTurnSourceRoute: vi.fn(() => true),
}));

vi.mock("../../infra/approval-turn-source.js", () => ({
  hasApprovalTurnSourceRoute: mocks.hasApprovalTurnSourceRoute,
}));

type ApprovalPayload = {
  title: string;
  description: string;
  turnSourceChannel?: string | null;
  turnSourceAccountId?: string | null;
};

function createRecord(manager: ExecApprovalManager<ApprovalPayload>, id: string): ExecApprovalRecord<ApprovalPayload> {
  return manager.create(
    {
      title: "Approve",
      description: "desc",
      turnSourceChannel: "slack",
      turnSourceAccountId: "acct-1",
    },
    30_000,
    id,
  );
}

describe("handlePendingApprovalRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips turn-source route lookup when delivery already succeeded", async () => {
    const manager = new ExecApprovalManager<ApprovalPayload>();
    const record = createRecord(manager, "approval-delivered");
    const decisionPromise = Promise.resolve<ExecApprovalDecision | null>("allow-once");
    const respond = vi.fn();

    await handlePendingApprovalRequest({
      manager,
      record,
      decisionPromise,
      respond,
      context: {
        broadcast: vi.fn(),
        logGateway: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
        hasExecApprovalClients: () => false,
      } as never,
      requestEventName: "plugin.approval.requested",
      requestEvent: {
        id: record.id,
        request: record.request,
        createdAtMs: record.createdAtMs,
        expiresAtMs: record.expiresAtMs,
      },
      twoPhase: false,
      deliverRequest: () => true,
    });

    expect(mocks.hasApprovalTurnSourceRoute).not.toHaveBeenCalled();
    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ id: record.id, decision: "allow-once" }),
      undefined,
    );
  });

  it("skips turn-source route lookup when approval clients are already connected", async () => {
    const manager = new ExecApprovalManager<ApprovalPayload>();
    const record = createRecord(manager, "approval-clients");
    const decisionPromise = Promise.resolve<ExecApprovalDecision | null>("allow-always");
    const respond = vi.fn();

    await handlePendingApprovalRequest({
      manager,
      record,
      decisionPromise,
      respond,
      context: {
        broadcast: vi.fn(),
        logGateway: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
        hasExecApprovalClients: () => true,
      } as never,
      requestEventName: "plugin.approval.requested",
      requestEvent: {
        id: record.id,
        request: record.request,
        createdAtMs: record.createdAtMs,
        expiresAtMs: record.expiresAtMs,
      },
      twoPhase: false,
      deliverRequest: () => false,
    });

    expect(mocks.hasApprovalTurnSourceRoute).not.toHaveBeenCalled();
    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ id: record.id, decision: "allow-always" }),
      undefined,
    );
  });
});
