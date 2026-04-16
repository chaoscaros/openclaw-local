import { describe, expect, it } from "vitest";
import { toConversation } from "./channel-shared.js";

describe("toConversation", () => {
  it("keeps webchat sessions visible even without an explicit delivery target", () => {
    const conversation = toConversation({
      key: "agent:solo:controller:dispatch",
      deliveryContext: { channel: "webchat" },
      lastChannel: "webchat",
      displayName: "Hermes Dispatch",
    });

    expect(conversation).toMatchObject({
      sessionKey: "agent:solo:controller:dispatch",
      channel: "webchat",
      to: "agent:solo:controller:dispatch",
    });
  });
});
