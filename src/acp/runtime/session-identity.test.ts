import { describe, expect, it } from "vitest";
import {
  createIdentityFromEnsure,
  createIdentityFromHandleEvent,
  createIdentityFromStatus,
  identityHasStableSessionId,
  mergeSessionIdentity,
  resolveRuntimeResumeSessionId,
  resolveRuntimeHandleIdentifiersFromIdentity,
  resolveSessionIdentityFromMeta,
} from "./session-identity.js";

describe("acp/runtime/session-identity", () => {
  it("builds pending ensure identities from runtime handles", () => {
    expect(
      createIdentityFromEnsure({
        handle: {
          backendSessionId: "acpx-1",
          agentSessionId: "agent-1",
          acpxRecordId: "record-1",
        } as never,
        now: 123,
      }),
    ).toEqual({
      state: "pending",
      acpxRecordId: "record-1",
      acpxSessionId: "acpx-1",
      agentSessionId: "agent-1",
      source: "ensure",
      lastUpdatedAt: 123,
    });
  });

  it("marks handle event identities resolved only when an agent session id is present", () => {
    expect(
      createIdentityFromHandleEvent({
        handle: { backendSessionId: "acpx-1" } as never,
        now: 1,
      }),
    ).toMatchObject({ state: "pending", source: "event" });

    expect(
      createIdentityFromHandleEvent({
        handle: { backendSessionId: "acpx-1", agentSessionId: "agent-1" } as never,
        now: 2,
      }),
    ).toMatchObject({ state: "resolved", source: "event" });
  });

  it("merges resolved identities without regressing stable ids", () => {
    expect(
      mergeSessionIdentity({
        current: {
          state: "resolved",
          acpxSessionId: "acpx-1",
          agentSessionId: "agent-1",
          source: "status",
          lastUpdatedAt: 1,
        },
        incoming: {
          state: "pending",
          acpxSessionId: "acpx-2",
          source: "ensure",
          lastUpdatedAt: 2,
        },
        now: 3,
      }),
    ).toEqual({
      state: "resolved",
      acpxSessionId: "acpx-1",
      agentSessionId: "agent-1",
      source: "status",
      lastUpdatedAt: 3,
    });
  });

  it("prefers agent session ids for resume and runtime handle identifiers", () => {
    const identity = {
      state: "resolved",
      acpxSessionId: "acpx-1",
      agentSessionId: "agent-1",
      source: "status",
      lastUpdatedAt: 1,
    } as const;

    expect(identityHasStableSessionId(identity)).toBe(true);
    expect(resolveRuntimeResumeSessionId(identity)).toBe("agent-1");
    expect(resolveRuntimeHandleIdentifiersFromIdentity(identity)).toEqual({
      backendSessionId: "acpx-1",
      agentSessionId: "agent-1",
    });
  });

  it("normalizes identities projected from status and meta", () => {
    expect(
      createIdentityFromStatus({
        status: {
          details: { acpxRecordId: "record-2", acpxSessionId: "acpx-2", agentSessionId: "agent-2" },
        } as never,
        now: 44,
      }),
    ).toEqual({
      state: "resolved",
      acpxRecordId: "record-2",
      acpxSessionId: "acpx-2",
      agentSessionId: "agent-2",
      source: "status",
      lastUpdatedAt: 44,
    });

    expect(
      resolveSessionIdentityFromMeta({
        identity: {
          state: "resolved",
          acpxSessionId: "acpx-3",
          source: "status",
          lastUpdatedAt: 9,
        },
      } as never),
    ).toEqual({
      state: "resolved",
      acpxSessionId: "acpx-3",
      source: "status",
      lastUpdatedAt: 9,
    });
  });
});
