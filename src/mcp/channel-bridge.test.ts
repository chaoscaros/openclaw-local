import { describe, expect, it, vi } from "vitest";
import { OpenClawChannelBridge } from "./channel-bridge.js";

describe("OpenClawChannelBridge.sendMessage", () => {
  it("uses chat.send for webchat conversations", async () => {
    const bridge = new OpenClawChannelBridge({} as never, {
      claudeChannelMode: "auto",
      verbose: false,
    });

    const requestGateway = vi.fn().mockResolvedValue({ ok: true });
    (bridge as any).requestGateway = requestGateway;
    vi.spyOn(bridge, "getConversation").mockResolvedValue({
      sessionKey: "agent:solo:main2",
      channel: "webchat",
      to: "heartbeat",
    });

    await bridge.sendMessage({ sessionKey: "agent:solo:main2", text: "ACK" });

    expect(requestGateway).toHaveBeenCalledWith(
      "chat.send",
      expect.objectContaining({
        sessionKey: "agent:solo:main2",
        message: "ACK",
      }),
    );
  });

  it("uses send for deliverable channels", async () => {
    const bridge = new OpenClawChannelBridge({} as never, {
      claudeChannelMode: "auto",
      verbose: false,
    });

    const requestGateway = vi.fn().mockResolvedValue({ ok: true });
    (bridge as any).requestGateway = requestGateway;
    vi.spyOn(bridge, "getConversation").mockResolvedValue({
      sessionKey: "agent:solo:telegram:direct:1128117172",
      channel: "telegram",
      to: "telegram:1128117172",
      accountId: "default",
      threadId: "42",
    });

    await bridge.sendMessage({ sessionKey: "agent:solo:telegram:direct:1128117172", text: "ACK" });

    expect(requestGateway).toHaveBeenCalledWith(
      "send",
      expect.objectContaining({
        to: "telegram:1128117172",
        channel: "telegram",
        accountId: "default",
        threadId: "42",
        message: "ACK",
        sessionKey: "agent:solo:telegram:direct:1128117172",
      }),
    );
  });
});
