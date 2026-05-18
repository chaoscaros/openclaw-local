import type { UserFromGetMe } from "grammy/types";
import type {
  ChannelAccountSnapshot,
  ChannelRuntimeSurface,
} from "openclaw/plugin-sdk/channel-contract";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-runtime";
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";

export type MonitorTelegramOpts = {
  token?: string;
  accountId?: string;
  config?: OpenClawConfig;
  runtime?: RuntimeEnv;
  channelRuntime?: ChannelRuntimeSurface;
  abortSignal?: AbortSignal;
  useWebhook?: boolean;
  webhookPath?: string;
  webhookPort?: number;
  webhookSecret?: string;
  webhookHost?: string;
  proxyFetch?: typeof fetch;
  webhookUrl?: string;
  webhookCertPath?: string;
  botInfo?: UserFromGetMe;
  setStatus?: (patch: Omit<ChannelAccountSnapshot, "accountId">) => void;
  isolatedIngress?: {
    enabled?: boolean;
  };
};

export type TelegramMonitorFn = (opts?: MonitorTelegramOpts) => Promise<void>;
