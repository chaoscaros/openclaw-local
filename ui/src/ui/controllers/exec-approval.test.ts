import { describe, expect, it, vi } from "vitest";
import {
  addExecApproval,
  clearResolvedExecApprovalPrompt,
  isStaleApprovalResolutionError,
  parseExecApprovalRequested,
  parsePluginApprovalRequested,
  refreshPendingApprovalQueue,
  type ExecApprovalPromptState,
  type ExecApprovalRequest,
} from "./exec-approval.ts";

type RequestFn = (method: string, params?: unknown) => Promise<unknown>;

function createExecApproval(overrides: Partial<ExecApprovalRequest> = {}): ExecApprovalRequest {
  return {
    id: "approval-1",
    kind: "exec",
    request: { command: "echo hello" },
    createdAtMs: 1000,
    expiresAtMs: Date.now() + 60_000,
    ...overrides,
  };
}

function createPromptState(
  request: RequestFn,
  queue: ExecApprovalRequest[] = [createExecApproval()],
): ExecApprovalPromptState {
  return {
    client: { request },
    execApprovalQueue: queue,
    execApprovalBusy: false,
    execApprovalError: null,
  };
}

function createGatewayError(message: string, details?: unknown): Error {
  const err = new Error(message);
  Object.defineProperty(err, "gatewayCode", {
    value: "INVALID_REQUEST",
    enumerable: true,
  });
  Object.defineProperty(err, "details", {
    value: details,
    enumerable: true,
  });
  return err;
}

describe("parseExecApprovalRequested", () => {
  it("returns entries with kind 'exec'", () => {
    const result = parseExecApprovalRequested({
      id: "exec-1",
      request: { command: "rm -rf /" },
      createdAtMs: 1000,
      expiresAtMs: 2000,
    });
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("exec");
    expect(result!.request.command).toBe("rm -rf /");
  });

  it("preserves allowed approval decisions", () => {
    const result = parseExecApprovalRequested({
      id: "exec-1",
      request: {
        command: "pwd",
        allowedDecisions: ["allow-once", "bad", "deny", "allow-always"],
      },
      createdAtMs: 1000,
      expiresAtMs: 2000,
    });

    expect(result?.request.allowedDecisions).toEqual(["allow-once", "deny", "allow-always"]);
  });
});

describe("parsePluginApprovalRequested", () => {
  // Matches the actual gateway broadcast shape: title/description/severity/pluginId
  // are nested inside payload.request (PluginApprovalRequestPayload)
  const validPayload = {
    id: "plugin-1",
    createdAtMs: 1000,
    expiresAtMs: 120_000,
    request: {
      title: "Dangerous command detected",
      description: "chmod 777 script.sh modifies file permissions",
      severity: "high",
      pluginId: "sage",
      agentId: "agent-1",
      sessionKey: "sess-1",
    },
  };

  it("parses a valid payload", () => {
    const result = parsePluginApprovalRequested(validPayload);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("plugin");
    expect(result!.pluginTitle).toBe("Dangerous command detected");
    expect(result!.pluginDescription).toBe("chmod 777 script.sh modifies file permissions");
    expect(result!.pluginSeverity).toBe("high");
    expect(result!.pluginId).toBe("sage");
    expect(result!.request.command).toBe("Dangerous command detected");
    expect(result!.request.agentId).toBe("agent-1");
    expect(result!.request.sessionKey).toBe("sess-1");
    expect(result!.createdAtMs).toBe(1000);
    expect(result!.expiresAtMs).toBe(120_000);
  });

  it("returns null when title is missing from request", () => {
    const {
      request: { title: _, ...restRequest },
      ...rest
    } = validPayload;
    expect(parsePluginApprovalRequested({ ...rest, request: restRequest })).toBeNull();
  });

  it("returns null when request is missing entirely", () => {
    const { request: _, ...noRequest } = validPayload;
    expect(parsePluginApprovalRequested(noRequest)).toBeNull();
  });

  it("returns null when id is missing", () => {
    const { id: _, ...noId } = validPayload;
    expect(parsePluginApprovalRequested(noId)).toBeNull();
  });

  it("returns null when timestamps are missing", () => {
    const { createdAtMs: _, expiresAtMs: __, ...noTimestamps } = validPayload;
    expect(parsePluginApprovalRequested(noTimestamps)).toBeNull();
  });

  it("returns null for null payload", () => {
    expect(parsePluginApprovalRequested(null)).toBeNull();
  });

  it("returns null for non-object payload", () => {
    expect(parsePluginApprovalRequested("not an object")).toBeNull();
  });

  it("handles missing optional fields gracefully", () => {
    const minimal = {
      id: "plugin-2",
      createdAtMs: 500,
      expiresAtMs: 60_000,
      request: { title: "Alert" },
    };
    const result = parsePluginApprovalRequested(minimal);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("plugin");
    expect(result!.pluginTitle).toBe("Alert");
    expect(result!.pluginDescription).toBeNull();
    expect(result!.pluginSeverity).toBeNull();
    expect(result!.pluginId).toBeNull();
    expect(result!.request.agentId).toBeNull();
    expect(result!.request.sessionKey).toBeNull();
  });
});

describe("isStaleApprovalResolutionError", () => {
  it("detects already-resolved and unknown approval errors", () => {
    expect(
      isStaleApprovalResolutionError(
        createGatewayError("approval already resolved", {
          reason: "APPROVAL_ALREADY_RESOLVED",
        }),
      ),
    ).toBe(true);
    expect(
      isStaleApprovalResolutionError(createGatewayError("unknown or expired approval id")),
    ).toBe(true);
    expect(isStaleApprovalResolutionError(createGatewayError("gateway unavailable"))).toBe(false);
  });
});

describe("refreshPendingApprovalQueue", () => {
  it("keeps approvals received while a refresh is in flight", async () => {
    let resolveExecList: (value: unknown[]) => void = () => {};
    const execApprovalList = new Promise<unknown[]>((resolve) => {
      resolveExecList = resolve;
    });
    const request = vi.fn<RequestFn>(async (method) => {
      if (method === "exec.approval.list") {
        return execApprovalList;
      }
      if (method === "plugin.approval.list") {
        return [];
      }
      return {};
    });
    const state = createPromptState(request, []);

    const refreshPromise = refreshPendingApprovalQueue(state);
    state.execApprovalQueue = addExecApproval(
      state.execApprovalQueue,
      createExecApproval({ id: "approval-arrived-during-refresh", createdAtMs: 2000 }),
    );
    resolveExecList([]);
    await refreshPromise;

    expect(state.execApprovalQueue.map((entry) => entry.id)).toEqual([
      "approval-arrived-during-refresh",
    ]);
  });

  it("does not requeue approvals resolved while a refresh is in flight", async () => {
    let resolveExecList: (value: unknown[]) => void = () => {};
    const execApprovalList = new Promise<unknown[]>((resolve) => {
      resolveExecList = resolve;
    });
    const request = vi.fn<RequestFn>(async (method) => {
      if (method === "exec.approval.list") {
        return execApprovalList;
      }
      if (method === "plugin.approval.list") {
        return [];
      }
      return {};
    });
    const resolvingApproval = createExecApproval({ id: "approval-resolving" });
    const state = createPromptState(request, [resolvingApproval]);

    const refreshPromise = refreshPendingApprovalQueue(state);
    clearResolvedExecApprovalPrompt(state, "approval-resolving");
    resolveExecList([resolvingApproval]);
    await refreshPromise;

    expect(state.execApprovalQueue).toEqual([]);
  });
});
