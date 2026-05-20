import type { OpenClawConfig } from "openclaw/plugin-sdk/config-runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CoreConfig } from "./types.js";

const hoisted = vi.hoisted(() => ({
  listNextcloudTalkAccountIds: vi.fn(),
  resolveNextcloudTalkAccount: vi.fn(),
  sendReactionNextcloudTalk: vi.fn(),
}));

vi.mock("./accounts.js", () => ({
  listNextcloudTalkAccountIds: hoisted.listNextcloudTalkAccountIds,
  resolveNextcloudTalkAccount: hoisted.resolveNextcloudTalkAccount,
}));

vi.mock("./send.js", () => ({
  sendReactionNextcloudTalk: hoisted.sendReactionNextcloudTalk,
}));

const { nextcloudTalkMessageActions } = await import("./message-actions.js");

const configuredAccount = {
  accountId: "default",
  enabled: true,
  baseUrl: "https://nc.example.com",
  secret: "bot-secret",
};

const unconfiguredAccount = {
  accountId: "default",
  enabled: true,
  baseUrl: "",
  secret: "",
};

const disabledAccount = {
  accountId: "default",
  enabled: false,
  baseUrl: "https://nc.example.com",
  secret: "bot-secret",
};

describe("nextcloudTalkMessageActions", () => {
  beforeEach(() => {
    hoisted.listNextcloudTalkAccountIds.mockReset();
    hoisted.resolveNextcloudTalkAccount.mockReset();
    hoisted.sendReactionNextcloudTalk.mockReset();
    hoisted.sendReactionNextcloudTalk.mockResolvedValue({ ok: true });
  });

  describe("describeMessageTool", () => {
    it("returns null when no accounts are configured", () => {
      hoisted.listNextcloudTalkAccountIds.mockReturnValue([]);

      const result = nextcloudTalkMessageActions.describeMessageTool?.({
        cfg: {} as OpenClawConfig,
      });

      expect(result).toBeNull();
    });

    it("returns null when configured account has no secret or baseUrl", () => {
      hoisted.listNextcloudTalkAccountIds.mockReturnValue([unconfiguredAccount.accountId]);
      hoisted.resolveNextcloudTalkAccount.mockReturnValue(unconfiguredAccount);

      const result = nextcloudTalkMessageActions.describeMessageTool?.({
        cfg: {} as OpenClawConfig,
      });

      expect(result).toBeNull();
    });

    it("returns null when the only listed account is disabled", () => {
      hoisted.listNextcloudTalkAccountIds.mockReturnValue([disabledAccount.accountId]);
      hoisted.resolveNextcloudTalkAccount.mockReturnValue(disabledAccount);

      const result = nextcloudTalkMessageActions.describeMessageTool?.({
        cfg: {} as OpenClawConfig,
      });

      expect(result).toBeNull();
    });

    it("advertises send and react when an account is configured", () => {
      hoisted.listNextcloudTalkAccountIds.mockReturnValue([configuredAccount.accountId]);
      hoisted.resolveNextcloudTalkAccount.mockReturnValue(configuredAccount);

      const result = nextcloudTalkMessageActions.describeMessageTool?.({
        cfg: {} as OpenClawConfig,
      });

      expect(result?.actions).toEqual(["send", "react"]);
    });

    it("scopes discovery to a specific accountId when provided", () => {
      hoisted.resolveNextcloudTalkAccount.mockReturnValue(configuredAccount);

      const result = nextcloudTalkMessageActions.describeMessageTool?.({
        cfg: {} as OpenClawConfig,
        accountId: "work",
      });

      expect(hoisted.resolveNextcloudTalkAccount).toHaveBeenCalledWith({
        cfg: {},
        accountId: "work",
      });
      expect(hoisted.listNextcloudTalkAccountIds).not.toHaveBeenCalled();
      expect(result?.actions).toEqual(["send", "react"]);
    });
  });

  describe("supportsAction", () => {
    it("leaves send to outbound and handles react locally", () => {
      expect(nextcloudTalkMessageActions.supportsAction?.({ action: "send" })).toBe(false);
      expect(nextcloudTalkMessageActions.supportsAction?.({ action: "react" })).toBe(true);
    });
  });

  describe("handleAction", () => {
    const cfg = {} as CoreConfig;

    it("invokes sendReactionNextcloudTalk with normalized params for react", async () => {
      const result = await nextcloudTalkMessageActions.handleAction?.({
        channel: "nextcloud-talk",
        action: "react",
        params: { to: "room:abc123", messageId: "42", emoji: "👍" },
        cfg,
        accountId: "work",
      });

      expect(hoisted.sendReactionNextcloudTalk).toHaveBeenCalledWith("room:abc123", "42", "👍", {
        accountId: "work",
        cfg,
      });
      expect(result).toMatchObject({ details: { ok: true, added: "👍" } });
    });

    it("uses toolContext.currentMessageId when params.messageId is missing", async () => {
      await nextcloudTalkMessageActions.handleAction?.({
        channel: "nextcloud-talk",
        action: "react",
        params: { to: "room:abc123", emoji: "✅" },
        cfg,
        accountId: null,
        toolContext: { currentMessageId: 99 },
      });

      expect(hoisted.sendReactionNextcloudTalk).toHaveBeenCalledWith("room:abc123", "99", "✅", {
        accountId: undefined,
        cfg,
      });
    });

    it("requires a target room token, message id, and emoji", async () => {
      await expect(
        nextcloudTalkMessageActions.handleAction?.({
          channel: "nextcloud-talk",
          action: "react",
          params: { messageId: "1", emoji: "👍" },
          cfg,
        }),
      ).rejects.toThrow(/to \(room token\) required/);
      await expect(
        nextcloudTalkMessageActions.handleAction?.({
          channel: "nextcloud-talk",
          action: "react",
          params: { to: "room:abc123", emoji: "👍" },
          cfg,
        }),
      ).rejects.toThrow(/messageId required/);
      await expect(
        nextcloudTalkMessageActions.handleAction?.({
          channel: "nextcloud-talk",
          action: "react",
          params: { to: "room:abc123", messageId: "1" },
          cfg,
        }),
      ).rejects.toThrow(/emoji required/);
      expect(hoisted.sendReactionNextcloudTalk).not.toHaveBeenCalled();
    });

    it("rejects reaction removal requests without calling the sender", async () => {
      await expect(
        nextcloudTalkMessageActions.handleAction?.({
          channel: "nextcloud-talk",
          action: "react",
          params: { to: "room:abc123", messageId: "1", emoji: "👍", remove: true },
          cfg,
        }),
      ).rejects.toThrow(/removal is not supported/);
      expect(hoisted.sendReactionNextcloudTalk).not.toHaveBeenCalled();
    });

    it("rejects unsupported actions", async () => {
      await expect(
        nextcloudTalkMessageActions.handleAction?.({
          channel: "nextcloud-talk",
          action: "delete",
          params: {},
          cfg,
        }),
      ).rejects.toThrow(/Action delete not supported for nextcloud-talk/);
    });
  });
});
