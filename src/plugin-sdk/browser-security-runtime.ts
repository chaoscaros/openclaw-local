import { root as fsRoot, type OpenResult } from "../infra/fs-safe.js";

export { hasConfiguredSecretInput } from "../config/types.secrets.js";
export { extractErrorCode, formatErrorMessage } from "../infra/errors.js";
export {
  FsSafeError as SafeOpenError,
  type FsSafeErrorCode as SafeOpenErrorCode,
} from "../infra/fs-safe.js";
export { hasProxyEnvConfigured } from "../infra/net/proxy-env.js";
export {
  SsrFBlockedError,
  isBlockedHostnameOrIp,
  matchesHostnameAllowlist,
  isPrivateNetworkAllowedByPolicy,
  resolvePinnedHostnameWithPolicy,
  type LookupFn,
  type SsrFPolicy,
} from "../infra/net/ssrf.js";
export { normalizeHostname } from "../infra/net/hostname.js";
export { isNotFoundPathError, isPathInside } from "../infra/path-guards.js";
export { ensurePortAvailable } from "../infra/ports.js";
export { generateSecureToken } from "../infra/secure-random.js";
export { resolvePreferredOpenClawTmpDir } from "../infra/tmp-openclaw-dir.js";
export { createSubsystemLogger } from "../logging/subsystem.js";
export { redactSensitiveText } from "../logging/redact.js";
export { wrapExternalContent } from "../security/external-content.js";
export { safeEqualSecret } from "../security/secret-equal.js";

export async function openFileWithinRoot(params: {
  rootDir: string;
  relativePath: string;
  rejectHardlinks?: boolean;
  nonBlockingRead?: boolean;
  allowSymlinkTargetWithinRoot?: boolean;
}): Promise<OpenResult> {
  const root = await fsRoot(params.rootDir);
  return await root.open(params.relativePath, {
    hardlinks: params.rejectHardlinks === false ? "allow" : "reject",
    nonBlockingRead: params.nonBlockingRead,
    symlinks: params.allowSymlinkTargetWithinRoot === true ? "follow-within-root" : "reject",
  });
}

export async function writeFileFromPathWithinRoot(params: {
  rootDir: string;
  relativePath: string;
  sourcePath: string;
  mkdir?: boolean;
}): Promise<void> {
  const root = await fsRoot(params.rootDir);
  await root.copyIn(params.relativePath, params.sourcePath, {
    mkdir: params.mkdir,
    sourceHardlinks: "reject",
  });
}
