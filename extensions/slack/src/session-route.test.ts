import { describe, expect, it } from "vitest";
import { slackPlugin } from "./channel.js";

describe("slack session route", () => {
  it("uses explicit replyToId for channel thread routes", async () => {
    const route = await slackPlugin.messaging?.resolveOutboundSessionRoute?.({
      cfg: {},
      agentId: "main",
      target: "channel:C123",
      replyToId: "1712345678.123456",
    });

    expect(route).toMatchObject({
      sessionKey: "agent:main:slack:channel:c123:thread:1712345678.123456",
      baseSessionKey: "agent:main:slack:channel:c123",
      threadId: "1712345678.123456",
    });
  });

  it("recovers channel thread routes from currentSessionKey", async () => {
    const route = await slackPlugin.messaging?.resolveOutboundSessionRoute?.({
      cfg: {},
      agentId: "main",
      target: "channel:C123",
      currentSessionKey: "agent:main:slack:channel:C123:thread:1712345678.123456",
    });

    expect(route).toMatchObject({
      sessionKey: "agent:main:slack:channel:c123:thread:1712345678.123456",
      baseSessionKey: "agent:main:slack:channel:c123",
      threadId: "1712345678.123456",
    });
  });

  it('does not recover currentSessionKey threads for shared dmScope "main" DMs', async () => {
    const route = await slackPlugin.messaging?.resolveOutboundSessionRoute?.({
      cfg: {},
      agentId: "main",
      target: "user:U123",
      currentSessionKey: "agent:main:main:thread:1712345678.123456",
    });

    expect(route).toMatchObject({
      sessionKey: "agent:main:main",
      baseSessionKey: "agent:main:main",
    });
    expect(route?.threadId).toBeUndefined();
  });
});