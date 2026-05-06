import { afterEach, describe, expect, it } from "vitest";
import { clearFallbackGatewayContext, createGatewaySubagentRuntime } from "./server-plugins.js";
import { getFreePort, installGatewayTestHooks, startGatewayServer } from "./test-helpers.js";

installGatewayTestHooks({ scope: "suite" });

afterEach(() => {
  clearFallbackGatewayContext();
});

describe("gateway plugin fallback context lifecycle", () => {
  it("clears the fallback gateway context after server close", async () => {
    const runtime = createGatewaySubagentRuntime();
    const server = await startGatewayServer(await getFreePort());

    try {
      await expect(runtime.getSessionMessages({ sessionKey: "agent:main:main", limit: 1 })).resolves.toEqual({
        messages: [],
      });
    } finally {
      await server.close({ reason: "fallback context lifecycle test done" });
    }

    await expect(runtime.getSessionMessages({ sessionKey: "agent:main:main", limit: 1 })).rejects.toThrow(
      "No scope set and no fallback context available",
    );
  });
});
