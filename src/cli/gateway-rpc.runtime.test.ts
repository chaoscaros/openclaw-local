import { beforeEach, describe, expect, it, vi } from "vitest";
import { callGatewayFromCliRuntime } from "./gateway-rpc.runtime.js";

const callGateway = vi.fn(async (_opts: unknown) => ({ ok: true }));

vi.mock("../gateway/call.js", () => ({
  callGateway: (opts: unknown) => callGateway(opts),
}));

vi.mock("./progress.js", () => ({
  withProgress: (_opts: unknown, fn: () => unknown) => fn(),
}));

function firstGatewayCall(): Record<string, unknown> {
  const [callOpts] = callGateway.mock.calls[0] ?? [];
  if (!callOpts || typeof callOpts !== "object") {
    throw new Error("expected gateway call");
  }
  return callOpts as Record<string, unknown>;
}

describe("gateway RPC runtime", () => {
  beforeEach(() => {
    callGateway.mockClear();
  });

  it("uses the CLI default timeout when omitted", async () => {
    await callGatewayFromCliRuntime("health", {}, {});

    expect(firstGatewayCall().timeoutMs).toBe(30_000);
  });

  it("rejects malformed timeout values before calling Gateway", async () => {
    await expect(callGatewayFromCliRuntime("health", { timeout: "1000ms" }, {})).rejects.toThrow(
      "Invalid --timeout",
    );

    expect(callGateway).not.toHaveBeenCalled();
  });
});
