import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelOutboundAdapter } from "../../channels/plugins/types.public.js";
import type { OpenClawConfig } from "../../config/config.js";
import { setActivePluginRegistry } from "../../plugins/runtime.js";
import { createTestRegistry } from "../../test-utils/channel-plugins.js";
import { runMessageAction } from "./message-action-runner.js";
import {
  runDrySend,
  slackConfig,
  slackTestPlugin,
  telegramTestPlugin,
} from "./message-action-runner.test-helpers.js";

describe("runMessageAction send validation", () => {
  beforeEach(() => {
    setActivePluginRegistry(
      createTestRegistry([
        {
          pluginId: "slack",
          source: "test",
          plugin: slackTestPlugin,
        },
        {
          pluginId: "telegram",
          source: "test",
          plugin: telegramTestPlugin,
        },
      ]),
    );
  });

  afterEach(() => {
    setActivePluginRegistry(createTestRegistry([]));
    vi.restoreAllMocks();
  });

  it("requires message when no media hint is provided", async () => {
    await expect(
      runDrySend({
        cfg: slackConfig,
        actionParams: {
          channel: "slack",
          target: "#C12345678",
        },
        toolContext: { currentChannelId: "C12345678" },
      }),
    ).rejects.toThrow(/message required/i);
  });

  it("allows send when only shared interactive payloads are provided", async () => {
    const result = await runDrySend({
      cfg: {
        channels: {
          telegram: {
            botToken: "telegram-test",
          },
        },
      } as OpenClawConfig,
      actionParams: {
        channel: "telegram",
        target: "123456",
        interactive: {
          blocks: [
            {
              type: "buttons",
              buttons: [{ label: "Approve", value: "approve" }],
            },
          ],
        },
      },
    });

    expect(result.kind).toBe("send");
  });

  it("allows send when only Slack blocks are provided", async () => {
    const result = await runDrySend({
      cfg: slackConfig,
      actionParams: {
        channel: "slack",
        target: "#C12345678",
        blocks: [{ type: "divider" }],
      },
      toolContext: { currentChannelId: "C12345678" },
    });

    expect(result.kind).toBe("send");
  });

  it.each([
    {
      name: "structured poll params",
      actionParams: {
        channel: "slack",
        target: "#C12345678",
        message: "hi",
        pollQuestion: "Ready?",
        pollOption: ["Yes", "No"],
      },
    },
    {
      name: "string-encoded poll params",
      actionParams: {
        channel: "slack",
        target: "#C12345678",
        message: "hi",
        pollDurationSeconds: "60",
        pollPublic: "true",
      },
    },
    {
      name: "snake_case poll params",
      actionParams: {
        channel: "slack",
        target: "#C12345678",
        message: "hi",
        poll_question: "Ready?",
        poll_option: ["Yes", "No"],
        poll_public: "true",
      },
    },
    {
      name: "negative poll duration params",
      actionParams: {
        channel: "slack",
        target: "#C12345678",
        message: "hi",
        pollDurationSeconds: -5,
      },
    },
  ])("rejects send actions that include $name", async ({ actionParams }) => {
    await expect(
      runDrySend({
        cfg: slackConfig,
        actionParams,
        toolContext: { currentChannelId: "C12345678" },
      }),
    ).rejects.toThrow(/use action "poll" instead of "send"/i);
  });

  it.each([
    { alias: "SendMessage", value: "hello from alias" },
    { alias: "content", value: "hello from content" },
    { alias: "text", value: "hello from text" },
  ])("normalizes $alias alias to message for send", async ({ alias, value }) => {
    const result = await runDrySend({
      cfg: slackConfig,
      actionParams: {
        channel: "slack",
        target: "#C12345678",
        [alias]: value,
      },
      toolContext: { currentChannelId: "C12345678" },
    });

    expect(result.kind).toBe("send");
  });

  it("does not overwrite an explicit message with an alias", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await runDrySend({
      cfg: slackConfig,
      actionParams: {
        channel: "slack",
        target: "#C12345678",
        message: "explicit",
        SendMessage: "alias value",
      },
      toolContext: { currentChannelId: "C12345678" },
    });

    expect(result.kind).toBe("send");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("emits a diagnostic warning when normalizing an alias", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await runDrySend({
      cfg: slackConfig,
      actionParams: {
        channel: "slack",
        target: "#C12345678",
        SendMessage: "alias body",
      },
      toolContext: { currentChannelId: "C12345678" },
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[message-tool] normalized alias "SendMessage" to "message"'),
    );
  });

  it("sanitizes formatted reasoning aliases before delivery", async () => {
    const result = await runDrySend({
      cfg: slackConfig,
      actionParams: {
        channel: "slack",
        target: "#C12345678",
        SendMessage: "Reasoning:\n_internal plan_\n\nVisible answer",
      },
      toolContext: { currentChannelId: "C12345678" },
    });

    expect(result.kind).toBe("send");
  });

  it("strips unsupported citation control markers before send delivery", async () => {
    const sentTexts: string[] = [];
    const outbound = {
      deliveryMode: "direct",
      sendText: async ({ text }) => {
        sentTexts.push(text);
        return { messageId: "sent-test" };
      },
    } satisfies ChannelOutboundAdapter;
    setActivePluginRegistry(
      createTestRegistry([
        {
          pluginId: "slack",
          source: "test",
          plugin: {
            ...slackTestPlugin,
            outbound,
          },
        },
      ]),
    );

    const result = await runMessageAction({
      cfg: slackConfig,
      action: "send",
      params: {
        channel: "slack",
        target: "#C12345678",
        message: "Answer citeturn1search0\nNext line citeturn2search1",
      },
      toolContext: { currentChannelId: "C12345678" },
    });

    expect(result.kind).toBe("send");
    expect(sentTexts).toEqual(["Answer\nNext line"]);
  });
});
