import { createHash } from "node:crypto";
import { resolveOAuthPath } from "../../config/paths.js";
import { coerceSecretRef } from "../../config/types.secrets.js";
import { loadJsonFile } from "../../infra/json-file.js";
import { normalizeProviderId } from "../provider-id.js";
import { AUTH_STORE_VERSION, log } from "./constants.js";
import {
  isLegacyOAuthRef,
  loadLegacyOAuthSidecarMaterial,
  type LegacyOAuthSecretMaterial,
} from "./legacy-oauth-sidecar.js";
import { resolveAuthStorePath, resolveLegacyAuthStorePath } from "./paths.js";
import {
  coerceAuthProfileState,
  loadPersistedAuthProfileState,
  mergeAuthProfileState,
} from "./state.js";
import type {
  AuthProfileCredential,
  AuthProfileSecretsStore,
  AuthProfileStore,
  OAuthCredential,
  OAuthCredentials,
} from "./types.js";

export type LegacyAuthStore = Record<string, AuthProfileCredential>;

type LoadPersistedAuthProfileStoreOptions = {
  allowKeychainPrompt?: boolean;
  resolveLegacyOAuthSidecars?: boolean;
};

type CredentialRejectReason = "non_object" | "invalid_type" | "missing_provider";
type RejectedCredentialEntry = { key: string; reason: CredentialRejectReason };

const AUTH_PROFILE_TYPES = new Set<AuthProfileCredential["type"]>(["api_key", "oauth", "token"]);
const LEGACY_OAUTH_REF_PROVIDER = "openai-codex";
const runtimeLegacyOAuthSidecarCredentials = new WeakSet<OAuthCredential>();
const runtimeLegacyOAuthSidecarMaterialFingerprints = new Map<string, string>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasInlineOAuthTokenMaterial(credential: OAuthCredential): boolean {
  return [credential.access, credential.refresh, credential.idToken].some(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
}

function buildRuntimeLegacyOAuthSidecarFingerprintKey(params: {
  storeKey?: string;
  profileId: string;
}): string {
  return `${params.storeKey ?? ""}\0${params.profileId}`;
}

function buildLegacyOAuthSecretMaterialFingerprint(
  material: Pick<OAuthCredential, "access" | "refresh" | "idToken">,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify([material.access ?? null, material.refresh ?? null, material.idToken ?? null]),
    )
    .digest("hex");
}

function normalizeSecretBackedField(params: {
  entry: Record<string, unknown>;
  valueField: "key" | "token";
  refField: "keyRef" | "tokenRef";
}): void {
  const value = params.entry[params.valueField];
  if (value == null || typeof value === "string") {
    return;
  }
  const ref = coerceSecretRef(value);
  if (ref && !coerceSecretRef(params.entry[params.refField])) {
    params.entry[params.refField] = ref;
  }
  delete params.entry[params.valueField];
}

function normalizeRawCredentialEntry(raw: Record<string, unknown>): Partial<AuthProfileCredential> {
  const entry = { ...raw } as Record<string, unknown>;
  if (!("type" in entry) && typeof entry["mode"] === "string") {
    entry["type"] = entry["mode"];
  }
  if (!("key" in entry) && typeof entry["apiKey"] === "string") {
    entry["key"] = entry["apiKey"];
  }
  normalizeSecretBackedField({ entry, valueField: "key", refField: "keyRef" });
  normalizeSecretBackedField({ entry, valueField: "token", refField: "tokenRef" });
  return entry as Partial<AuthProfileCredential>;
}

function parseCredentialEntry(
  raw: unknown,
  fallbackProvider?: string,
): { ok: true; credential: AuthProfileCredential } | { ok: false; reason: CredentialRejectReason } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "non_object" };
  }
  const typed = normalizeRawCredentialEntry(raw as Record<string, unknown>);
  if (!AUTH_PROFILE_TYPES.has(typed.type as AuthProfileCredential["type"])) {
    return { ok: false, reason: "invalid_type" };
  }
  const provider = typed.provider ?? fallbackProvider;
  if (typeof provider !== "string" || provider.trim().length === 0) {
    return { ok: false, reason: "missing_provider" };
  }
  return {
    ok: true,
    credential: {
      ...typed,
      provider,
    } as AuthProfileCredential,
  };
}

function warnRejectedCredentialEntries(source: string, rejected: RejectedCredentialEntry[]): void {
  if (rejected.length === 0) {
    return;
  }
  const reasons = rejected.reduce(
    (acc, current) => {
      acc[current.reason] = (acc[current.reason] ?? 0) + 1;
      return acc;
    },
    {} as Partial<Record<CredentialRejectReason, number>>,
  );
  log.warn("ignored invalid auth profile entries during store load", {
    source,
    dropped: rejected.length,
    reasons,
    keys: rejected.slice(0, 10).map((entry) => entry.key),
  });
}

export function coerceLegacyAuthStore(raw: unknown): LegacyAuthStore | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if ("profiles" in record) {
    return null;
  }
  const entries: LegacyAuthStore = {};
  const rejected: RejectedCredentialEntry[] = [];
  for (const [key, value] of Object.entries(record)) {
    const parsed = parseCredentialEntry(value, key);
    if (!parsed.ok) {
      rejected.push({ key, reason: parsed.reason });
      continue;
    }
    entries[key] = parsed.credential;
  }
  warnRejectedCredentialEntries("auth.json", rejected);
  return Object.keys(entries).length > 0 ? entries : null;
}

function resolveLegacyOAuthSidecarCredential(params: {
  profileId: string;
  raw: unknown;
  credential: AuthProfileCredential;
  storeKey?: string;
  options?: LoadPersistedAuthProfileStoreOptions;
}): AuthProfileCredential {
  if (
    params.credential.type !== "oauth" ||
    normalizeProviderId(params.credential.provider) !== LEGACY_OAUTH_REF_PROVIDER ||
    hasInlineOAuthTokenMaterial(params.credential) ||
    !isRecord(params.raw) ||
    !isLegacyOAuthRef(params.raw.oauthRef)
  ) {
    return params.credential;
  }

  const material = loadLegacyOAuthSidecarMaterial({
    ref: params.raw.oauthRef,
    profileId: params.profileId,
    provider: params.credential.provider,
    allowKeychainPrompt: params.options?.allowKeychainPrompt,
  });
  if (!material) {
    return params.credential;
  }

  const credential: OAuthCredential = {
    ...params.credential,
    ...(material.access ? { access: material.access } : {}),
    ...(material.refresh ? { refresh: material.refresh } : {}),
    ...(material.idToken ? { idToken: material.idToken } : {}),
  };
  runtimeLegacyOAuthSidecarCredentials.add(credential);
  runtimeLegacyOAuthSidecarMaterialFingerprints.set(
    buildRuntimeLegacyOAuthSidecarFingerprintKey({
      storeKey: params.storeKey,
      profileId: params.profileId,
    }),
    buildLegacyOAuthSecretMaterialFingerprint(credential),
  );
  return credential;
}

export function isRuntimeLegacyOAuthSidecarCredential(
  credential: AuthProfileCredential | undefined,
): boolean {
  return credential?.type === "oauth" && runtimeLegacyOAuthSidecarCredentials.has(credential);
}

export function matchesRuntimeLegacyOAuthSidecarMaterial(params: {
  authPath?: string;
  profileId: string;
  credential: AuthProfileCredential | undefined;
}): boolean {
  if (params.credential?.type !== "oauth") {
    return false;
  }
  if (runtimeLegacyOAuthSidecarCredentials.has(params.credential)) {
    return true;
  }
  const fingerprint = runtimeLegacyOAuthSidecarMaterialFingerprints.get(
    buildRuntimeLegacyOAuthSidecarFingerprintKey({
      storeKey: params.authPath,
      profileId: params.profileId,
    }),
  );
  return (
    fingerprint !== undefined &&
    fingerprint === buildLegacyOAuthSecretMaterialFingerprint(params.credential)
  );
}

export function coercePersistedAuthProfileStore(
  raw: unknown,
  options?: LoadPersistedAuthProfileStoreOptions,
  storeKey?: string,
): AuthProfileStore | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if (!record.profiles || typeof record.profiles !== "object") {
    return null;
  }
  const profiles = record.profiles as Record<string, unknown>;
  const normalized: Record<string, AuthProfileCredential> = {};
  const rejected: RejectedCredentialEntry[] = [];
  for (const [key, value] of Object.entries(profiles)) {
    const parsed = parseCredentialEntry(value);
    if (!parsed.ok) {
      rejected.push({ key, reason: parsed.reason });
      continue;
    }
    normalized[key] =
      options?.resolveLegacyOAuthSidecars === true
        ? resolveLegacyOAuthSidecarCredential({
            profileId: key,
            raw: value,
            credential: parsed.credential,
            storeKey,
            options,
          })
        : parsed.credential;
  }
  warnRejectedCredentialEntries("auth-profiles.json", rejected);
  return {
    version: Number(record.version ?? AUTH_STORE_VERSION),
    profiles: normalized,
    ...coerceAuthProfileState(record),
  };
}

function mergeRecord<T>(
  base?: Record<string, T>,
  override?: Record<string, T>,
): Record<string, T> | undefined {
  if (!base && !override) {
    return undefined;
  }
  if (!base) {
    return { ...override };
  }
  if (!override) {
    return { ...base };
  }
  return { ...base, ...override };
}

export function mergeAuthProfileStores(
  base: AuthProfileStore,
  override: AuthProfileStore,
): AuthProfileStore {
  if (
    Object.keys(override.profiles).length === 0 &&
    !override.order &&
    !override.lastGood &&
    !override.usageStats
  ) {
    return base;
  }
  return {
    version: Math.max(base.version, override.version ?? base.version),
    profiles: { ...base.profiles, ...override.profiles },
    order: mergeRecord(base.order, override.order),
    lastGood: mergeRecord(base.lastGood, override.lastGood),
    usageStats: mergeRecord(base.usageStats, override.usageStats),
  };
}

export function buildPersistedAuthProfileSecretsStore(
  store: AuthProfileStore,
  shouldPersistProfile?: (params: {
    profileId: string;
    credential: AuthProfileCredential;
  }) => boolean,
  options?: {
    existingRaw?: unknown;
    runtimeLegacyOAuthSidecarProfileIds?: ReadonlySet<string>;
  },
): AuthProfileSecretsStore {
  const profiles = Object.fromEntries(
    Object.entries(store.profiles).flatMap(([profileId, credential]) => {
      if (shouldPersistProfile && !shouldPersistProfile({ profileId, credential })) {
        return [];
      }
      if (credential.type === "api_key" && credential.keyRef && credential.key !== undefined) {
        const sanitized = { ...credential } as Record<string, unknown>;
        delete sanitized.key;
        return [[profileId, sanitized]];
      }
      if (credential.type === "token" && credential.tokenRef && credential.token !== undefined) {
        const sanitized = { ...credential } as Record<string, unknown>;
        delete sanitized.token;
        return [[profileId, sanitized]];
      }
      return [[profileId, credential]];
    }),
  ) as AuthProfileSecretsStore["profiles"];

  const payload: AuthProfileSecretsStore = {
    version: AUTH_STORE_VERSION,
    profiles,
  };
  return preserveLegacyOAuthRefsForDoctorMigration(payload, options);
}

function preserveLegacyOAuthRefsForDoctorMigration(
  payload: AuthProfileSecretsStore,
  options:
    | {
        existingRaw?: unknown;
        runtimeLegacyOAuthSidecarProfileIds?: ReadonlySet<string>;
      }
    | undefined,
): AuthProfileSecretsStore {
  const existingRaw = options?.existingRaw;
  if (!isRecord(existingRaw) || !isRecord(existingRaw.profiles)) {
    return payload;
  }
  let profiles: AuthProfileSecretsStore["profiles"] | undefined;
  for (const [profileId, rawProfile] of Object.entries(existingRaw.profiles)) {
    if (!isRecord(rawProfile) || !isLegacyOAuthRef(rawProfile.oauthRef)) {
      continue;
    }
    const credential = payload.profiles[profileId];
    if (
      credential?.type !== "oauth" ||
      normalizeProviderId(credential.provider) !== LEGACY_OAUTH_REF_PROVIDER
    ) {
      continue;
    }
    if (hasInlineOAuthTokenMaterial(credential)) {
      const isRuntimeSidecarMaterial =
        options?.runtimeLegacyOAuthSidecarProfileIds?.has(profileId) === true;
      if (
        !isRuntimeSidecarMaterial &&
        !isUnchangedLegacyOAuthSidecarMaterial({ profileId, rawProfile, credential })
      ) {
        continue;
      }
    }
    profiles ??= { ...payload.profiles };
    const sanitized = { ...credential } as Record<string, unknown>;
    delete sanitized.access;
    delete sanitized.refresh;
    delete sanitized.idToken;
    profiles[profileId] = {
      ...sanitized,
      oauthRef: rawProfile.oauthRef,
    } as unknown as AuthProfileCredential;
  }
  return profiles ? { ...payload, profiles } : payload;
}

function isUnchangedLegacyOAuthSidecarMaterial(params: {
  profileId: string;
  rawProfile: Record<string, unknown>;
  credential: OAuthCredential;
}): boolean {
  if (!isLegacyOAuthRef(params.rawProfile.oauthRef)) {
    return false;
  }
  const material = loadLegacyOAuthSidecarMaterial({
    ref: params.rawProfile.oauthRef,
    profileId: params.profileId,
    provider: params.credential.provider,
    allowKeychainPrompt: false,
  });
  if (!material) {
    return false;
  }
  return isSameLegacyOAuthSecretMaterial(params.credential, material);
}

function isSameLegacyOAuthSecretMaterial(
  credential: OAuthCredential,
  material: LegacyOAuthSecretMaterial,
): boolean {
  return (["access", "refresh", "idToken"] as const).every(
    (field) => (credential[field] ?? undefined) === (material[field] ?? undefined),
  );
}

export function applyLegacyAuthStore(store: AuthProfileStore, legacy: LegacyAuthStore): void {
  for (const [provider, cred] of Object.entries(legacy)) {
    const profileId = `${provider}:default`;
    const credentialProvider = cred.provider ?? provider;
    if (cred.type === "api_key") {
      store.profiles[profileId] = {
        type: "api_key",
        provider: credentialProvider,
        key: cred.key,
        ...(cred.email ? { email: cred.email } : {}),
      };
      continue;
    }
    if (cred.type === "token") {
      store.profiles[profileId] = {
        type: "token",
        provider: credentialProvider,
        token: cred.token,
        ...(typeof cred.expires === "number" ? { expires: cred.expires } : {}),
        ...(cred.email ? { email: cred.email } : {}),
      };
      continue;
    }
    store.profiles[profileId] = {
      type: "oauth",
      provider: credentialProvider,
      access: cred.access,
      refresh: cred.refresh,
      expires: cred.expires,
      ...(cred.enterpriseUrl ? { enterpriseUrl: cred.enterpriseUrl } : {}),
      ...(cred.projectId ? { projectId: cred.projectId } : {}),
      ...(cred.accountId ? { accountId: cred.accountId } : {}),
      ...(cred.email ? { email: cred.email } : {}),
      ...(cred.managedBy ? { managedBy: cred.managedBy } : {}),
    };
  }
}

export function mergeOAuthFileIntoStore(store: AuthProfileStore): boolean {
  const oauthPath = resolveOAuthPath();
  const oauthRaw = loadJsonFile(oauthPath);
  if (!oauthRaw || typeof oauthRaw !== "object") {
    return false;
  }
  const oauthEntries = oauthRaw as Record<string, OAuthCredentials>;
  let mutated = false;
  for (const [provider, creds] of Object.entries(oauthEntries)) {
    if (!creds || typeof creds !== "object") {
      continue;
    }
    const profileId = `${provider}:default`;
    if (store.profiles[profileId]) {
      continue;
    }
    store.profiles[profileId] = {
      type: "oauth",
      provider,
      ...creds,
    };
    mutated = true;
  }
  return mutated;
}

export function loadPersistedAuthProfileStore(
  agentDir?: string,
  options?: LoadPersistedAuthProfileStoreOptions,
): AuthProfileStore | null {
  const authPath = resolveAuthStorePath(agentDir);
  const raw = loadJsonFile(authPath);
  const store = coercePersistedAuthProfileStore(
    raw,
    {
      resolveLegacyOAuthSidecars: options?.resolveLegacyOAuthSidecars ?? true,
      ...(options?.allowKeychainPrompt !== undefined
        ? { allowKeychainPrompt: options.allowKeychainPrompt }
        : {}),
    },
    authPath,
  );
  if (!store) {
    return null;
  }
  return {
    ...store,
    ...mergeAuthProfileState(coerceAuthProfileState(raw), loadPersistedAuthProfileState(agentDir)),
  };
}

export function loadLegacyAuthProfileStore(agentDir?: string): LegacyAuthStore | null {
  return coerceLegacyAuthStore(loadJsonFile(resolveLegacyAuthStorePath(agentDir)));
}
