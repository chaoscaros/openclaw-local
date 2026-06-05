import type { ChannelIngressChannelId } from "../channels/message-access/types.js";
import type { ChannelId } from "../channels/plugins/types.public.js";
import type { PluginRuntime } from "../plugins/runtime/types.js";
import { normalizeAccountId } from "../routing/session-key.js";

type PairingApi = PluginRuntime["channel"]["pairing"];
type ScopedUpsertInput = Omit<
  Parameters<PairingApi["upsertPairingRequest"]>[0],
  "channel" | "accountId"
>;
type DmPolicyStoreInput = {
  channelId: ChannelIngressChannelId;
  accountId: string;
};

function readStoreForDmPolicy(
  core: PluginRuntime,
  provider: ChannelId,
  accountId: string,
): ReturnType<PairingApi["readAllowFromStore"]>;
function readStoreForDmPolicy(
  core: PluginRuntime,
  params: DmPolicyStoreInput,
): ReturnType<PairingApi["readAllowFromStore"]>;
function readStoreForDmPolicy(
  core: PluginRuntime,
  input: ChannelId | DmPolicyStoreInput,
  accountId?: string,
): ReturnType<PairingApi["readAllowFromStore"]> {
  const channel = typeof input === "string" ? input : input.channelId;
  const resolvedAccountId = normalizeAccountId(
    typeof input === "string" ? (accountId ?? "") : input.accountId,
  );
  return core.channel.pairing.readAllowFromStore({
    channel,
    accountId: resolvedAccountId,
  });
}

/** Scope pairing store operations to one channel/account pair for plugin-facing helpers. */
export function createScopedPairingAccess(params: {
  core: PluginRuntime;
  channel: ChannelId;
  accountId: string;
}) {
  const resolvedAccountId = normalizeAccountId(params.accountId);
  return {
    accountId: resolvedAccountId,
    readAllowFromStore: () =>
      params.core.channel.pairing.readAllowFromStore({
        channel: params.channel,
        accountId: resolvedAccountId,
      }),
    readStoreForDmPolicy: (
      input: ChannelId | DmPolicyStoreInput,
      accountId?: string,
    ): ReturnType<PairingApi["readAllowFromStore"]> =>
      typeof input === "string"
        ? readStoreForDmPolicy(params.core, input, accountId ?? resolvedAccountId)
        : readStoreForDmPolicy(params.core, input),
    upsertPairingRequest: (input: ScopedUpsertInput) =>
      params.core.channel.pairing.upsertPairingRequest({
        channel: params.channel,
        accountId: resolvedAccountId,
        ...input,
      }),
  };
}
