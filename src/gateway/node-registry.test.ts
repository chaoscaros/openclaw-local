import { describe, expect, it, vi } from "vitest";
import { onDiagnosticEvent, resetDiagnosticEventsForTest } from "../infra/diagnostic-events.js";
import { NodeRegistry } from "./node-registry.js";
import { MAX_BUFFERED_BYTES } from "./server-constants.js";
import type { GatewayWsClient } from "./server/ws-types.js";

function makeClient(
  connId: string,
  nodeId: string,
  socket: GatewayWsClient["socket"],
): GatewayWsClient {
  return {
    connId,
    socket,
    usesSharedGatewayAuth: false,
    connect: {
      minProtocol: 1,
      maxProtocol: 1,
      client: {
        id: "node-host",
        mode: "node",
        version: "test",
        platform: "test",
      },
      device: {
        id: nodeId,
        publicKey: "key",
        signature: "sig",
        signedAt: 1,
        nonce: "nonce",
      },
      caps: [],
    },
  };
}

describe("gateway/node-registry", () => {
  it("rejects event sends when the node socket buffer is saturated", () => {
    resetDiagnosticEventsForTest();
    const diagnosticEvents: unknown[] = [];
    const stopDiagnostics = onDiagnosticEvent((event) => diagnosticEvents.push(event));
    const registry = new NodeRegistry();
    const socket = {
      bufferedAmount: MAX_BUFFERED_BYTES + 1,
      send: vi.fn(),
      close: vi.fn(),
    };
    registry.register(makeClient("conn-1", "node-1", socket as never), {});

    try {
      expect(registry.sendEvent("node-1", "chat", { foo: "bar" })).toBe(false);
      expect(socket.send).not.toHaveBeenCalled();
      expect(socket.close).toHaveBeenCalledWith(1008, "slow consumer");
      expect(diagnosticEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "payload.large",
            action: "rejected",
            surface: "gateway.ws.outbound_buffer",
            bytes: MAX_BUFFERED_BYTES + 1,
            limitBytes: MAX_BUFFERED_BYTES,
            reason: "ws_send_buffer_close",
          }),
        ]),
      );
    } finally {
      stopDiagnostics();
      resetDiagnosticEventsForTest();
    }
  });
});
