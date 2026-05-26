import type { SessionEntry } from "../config/sessions.js";
import { updateSessionStoreEntry } from "../config/sessions.js";
import { derivePersistedSessionLifecyclePatch } from "./session-lifecycle-state.js";
import { loadSessionEntry } from "./session-utils.js";

export type SessionRunTerminalReason = "done" | "failed" | "timeout" | "aborted";

function isRunningSession(entry: Pick<SessionEntry, "status" | "endedAt">) {
  return entry.status === "running" && typeof entry.endedAt !== "number";
}

function resolveLifecycleEvent(params: {
  entry: SessionEntry;
  endedAt: number;
  reason: SessionRunTerminalReason;
}) {
  const stopReason = params.reason === "aborted" ? "aborted" : undefined;
  return {
    ts: params.endedAt,
    data: {
      phase: params.reason === "failed" ? "error" : "end",
      startedAt: params.entry.startedAt,
      endedAt: params.endedAt,
      ...(params.reason === "timeout" ? { aborted: true } : {}),
      ...(stopReason ? { stopReason } : {}),
    },
  } as const;
}

export async function markSessionRunTerminal(params: {
  sessionKey: string;
  reason: SessionRunTerminalReason;
  endedAt?: number;
  runId?: string;
  log?: { warn?: (message: string) => void };
}): Promise<{ updated: boolean; sessionKey?: string }> {
  const loaded = loadSessionEntry(params.sessionKey);
  if (!loaded.entry) {
    return { updated: false };
  }
  if (!isRunningSession(loaded.entry)) {
    return { updated: false, sessionKey: loaded.canonicalKey };
  }

  const endedAt = params.endedAt ?? Date.now();
  try {
    const updated = await updateSessionStoreEntry({
      storePath: loaded.storePath,
      sessionKey: loaded.canonicalKey,
      update: async (entry) => {
        if (!isRunningSession(entry)) {
          return null;
        }
        return derivePersistedSessionLifecyclePatch({
          entry,
          event: resolveLifecycleEvent({
            entry,
            endedAt,
            reason: params.reason,
          }),
        });
      },
    });
    return {
      updated: Boolean(updated && !isRunningSession(updated)),
      sessionKey: loaded.canonicalKey,
    };
  } catch (err) {
    params.log?.warn?.(
      `failed to mark session run terminal for ${params.sessionKey}: ${String(err)}`,
    );
    return { updated: false, sessionKey: loaded.canonicalKey };
  }
}
