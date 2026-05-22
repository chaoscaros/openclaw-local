import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __testing as subagentAnnounceDeliveryTesting,
  deliverSubagentAnnouncement,
} from "./subagent-announce-delivery.js";
import { resolveAnnounceOrigin } from "./subagent-announce-origin.js";

type LoadConfigResult = ReturnType<typeof import("../config/config.js").loadConfig>;
type CallGatewayRequest = Parameters<typeof import("../gateway/call.js").callGateway>[0];

afterEach(() => {
  subagentAnnounceDeliveryTesting.setDepsForTest();
});

describe("resolveAnnounceOrigin telegram forum topics", () => {
  it("preserves stored forum topic thread ids when requester origin omits one for the same chat", () => {
    expect(
      resolveAnnounceOrigin(
        {
          lastChannel: "telegram",
          lastTo: "telegram:-1001234567890:topic:99",
          lastThreadId: 99,
        },
        {
          channel: "telegram",
          to: "telegram:-1001234567890",
        },
      ),
    ).toEqual({
      channel: "telegram",
      to: "telegram:-1001234567890",
      threadId: 99,
    });
  });

  it("preserves stored forum topic thread ids for legacy group-prefixed requester targets", () => {
    expect(
      resolveAnnounceOrigin(
        {
          lastChannel: "telegram",
          lastTo: "telegram:-1001234567890:topic:99",
          lastThreadId: 99,
        },
        {
          channel: "telegram",
          to: "group:-1001234567890",
        },
      ),
    ).toEqual({
      channel: "telegram",
      to: "group:-1001234567890",
      threadId: 99,
    });
  });

  it("still strips stale thread ids when the stored telegram route points at a different chat", () => {
    expect(
      resolveAnnounceOrigin(
        {
          lastChannel: "telegram",
          lastTo: "telegram:-1009999999999:topic:99",
          lastThreadId: 99,
        },
        {
          channel: "telegram",
          to: "telegram:-1001234567890",
        },
      ),
    ).toEqual({
      channel: "telegram",
      to: "telegram:-1001234567890",
    });
  });
});

describe("deliverSubagentAnnouncement telegram topic handoff", () => {
  it("stringifies session-only Telegram topic thread ids for completion handoff", async () => {
    const callGatewayMock = vi.fn(async (_request: unknown) => ({}));
    subagentAnnounceDeliveryTesting.setDepsForTest({
      callGateway: async <T = Record<string, unknown>>(request: CallGatewayRequest) => {
        await callGatewayMock(request);
        return {} as T;
      },
      loadConfig: () => ({}) as LoadConfigResult,
    });

    const result = await deliverSubagentAnnouncement({
      requesterSessionKey: "agent:main:telegram:group:-1003970070733:topic:1",
      targetRequesterSessionKey: "agent:main:telegram:group:-1003970070733:topic:1",
      triggerMessage: "video generation completed",
      steerMessage: "video generation completed",
      completionDirectOrigin: {
        channel: "telegram",
        accountId: "bot-1",
        threadId: 1,
      },
      requesterIsSubagent: false,
      expectsCompletionMessage: true,
      bestEffortDeliver: true,
      directIdempotencyKey: "announce-telegram-topic-media",
      sourceTool: "video_generate",
      internalEvents: [
        {
          type: "task_completion",
          source: "video_generation",
          childSessionKey: "video_generate:task-123",
          childSessionId: "task-123",
          announceType: "video generation task",
          taskLabel: "anime corgi skateboard",
          status: "ok",
          statusLabel: "completed successfully",
          result: "Generated 1 video.\nMEDIA:/tmp/generated-corgi.mp4",
          mediaUrls: ["/tmp/generated-corgi.mp4"],
          replyInstruction: "Deliver the generated video through the message tool.",
        },
      ],
    });

    expect(result).toMatchObject({
      delivered: true,
      path: "direct",
    });
    expect(callGatewayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "agent",
        params: expect.objectContaining({
          deliver: false,
          channel: "telegram",
          accountId: "bot-1",
          threadId: "1",
          inputProvenance: expect.objectContaining({
            sourceTool: "video_generate",
          }),
        }),
      }),
    );
  });
});
