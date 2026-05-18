import type { ChannelAccountSnapshot } from "openclaw/plugin-sdk/channel-contract";
import { createConnectedChannelStatusPatch } from "openclaw/plugin-sdk/gateway-runtime";

type TelegramPollingStatusSink = (patch: Omit<ChannelAccountSnapshot, "accountId">) => void;

export function createTelegramPollingStatusPublisher(setStatus?: TelegramPollingStatusSink) {
  return {
    notePollingStart() {
      setStatus?.({
        mode: "polling",
        connected: false,
        lastConnectedAt: null,
        lastEventAt: null,
        lastRunActivityAt: null,
      });
    },
    notePollSuccess(at = Date.now()) {
      setStatus?.({
        ...createConnectedChannelStatusPatch(at),
        lastRunActivityAt: at,
        mode: "polling",
        lastError: null,
      });
    },
    notePollingError(error: string) {
      setStatus?.({
        mode: "polling",
        connected: false,
        lastError: error,
      });
    },
    notePollingStop() {
      setStatus?.({
        mode: "polling",
        connected: false,
      });
    },
  };
}
