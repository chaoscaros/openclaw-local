import type { SessionEntry } from "./types.js";

export type ResetPreservedSelectionState = Pick<
  SessionEntry,
  | "providerOverride"
  | "modelOverride"
  | "modelOverrideSource"
  | "authProfileOverride"
  | "authProfileOverrideSource"
  | "authProfileOverrideCompactionCount"
>;

export function resolveResetPreservedSelection(params: {
  entry?: SessionEntry;
}): Partial<ResetPreservedSelectionState> {
  const { entry } = params;
  if (!entry) {
    return {};
  }

  const preserved: Partial<ResetPreservedSelectionState> = {};
  const preserveLegacyUserModelOverride =
    entry.modelOverrideSource === "user" ||
    (entry.modelOverrideSource === undefined && Boolean(entry.modelOverride));
  if (preserveLegacyUserModelOverride && entry.modelOverride) {
    preserved.providerOverride = entry.providerOverride;
    preserved.modelOverride = entry.modelOverride;
    preserved.modelOverrideSource = "user";
  }

  if (entry.authProfileOverrideSource === "user" && entry.authProfileOverride) {
    preserved.authProfileOverride = entry.authProfileOverride;
    preserved.authProfileOverrideSource = entry.authProfileOverrideSource;
    if (entry.authProfileOverrideCompactionCount !== undefined) {
      preserved.authProfileOverrideCompactionCount = entry.authProfileOverrideCompactionCount;
    }
  }

  return preserved;
}
