export { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { readConfigFileSnapshot as readHostConfigFileSnapshot } from "../config/config.js";
export type { OpenClawConfig } from "../config/types.openclaw.js";

export async function readConfigFileSnapshot(_options?: {
  readonly observe?: boolean;
}): ReturnType<typeof readHostConfigFileSnapshot> {
  return await readHostConfigFileSnapshot();
}

export type HealthFindingSeverity = "info" | "warning" | "error";

const HEALTH_FINDING_SEVERITY_RANK: Record<HealthFindingSeverity, number> = {
  info: 0,
  warning: 1,
  error: 2,
};

export function parseHealthFindingSeverity(
  input: string | undefined,
): HealthFindingSeverity | null {
  return input === "info" || input === "warning" || input === "error" ? input : null;
}

export interface HealthFinding {
  readonly checkId: string;
  readonly severity: HealthFindingSeverity;
  readonly message: string;
  readonly source?: string;
  readonly path?: string;
  readonly line?: number;
  readonly column?: number;
  readonly ocPath?: string;
  readonly target?: string;
  readonly requirement?: string;
  readonly fixHint?: string;
}

export type HealthCheckMode = "doctor" | "lint" | "fix";

export interface HealthCheckContext {
  readonly mode: HealthCheckMode;
  readonly runtime: {
    log(...args: unknown[]): void;
    error(...args: unknown[]): void;
    exit(code?: number): never | void;
  };
  readonly cfg: import("../config/types.openclaw.js").OpenClawConfig;
  readonly cwd?: string;
  readonly configPath?: string;
}

export interface HealthRepairContext extends Omit<HealthCheckContext, "mode"> {
  readonly mode: "fix";
  readonly dryRun?: boolean;
  readonly diff?: boolean;
}

export interface HealthRepairDiff {
  readonly kind: "config" | "file";
  readonly path: string;
  readonly before?: string;
  readonly after?: string;
  readonly unifiedDiff?: string;
}

export interface HealthRepairEffect {
  readonly kind: "config" | "file" | "service" | "process" | "package" | "state" | "other";
  readonly action: string;
  readonly target?: string;
  readonly dryRunSafe?: boolean;
}

export interface HealthRepairResult {
  readonly status?: "repaired" | "skipped" | "failed";
  readonly reason?: string;
  readonly config?: import("../config/types.openclaw.js").OpenClawConfig;
  readonly changes: readonly string[];
  readonly warnings?: readonly string[];
  readonly diffs?: readonly HealthRepairDiff[];
  readonly effects?: readonly HealthRepairEffect[];
}

export interface HealthCheckScope {
  readonly findings?: readonly HealthFinding[];
  readonly paths?: readonly string[];
  readonly ocPaths?: readonly string[];
}

export interface HealthCheck {
  readonly id: string;
  readonly kind: "core" | "plugin";
  readonly description: string;
  readonly source?: string;
  detect(ctx: HealthCheckContext, scope?: HealthCheckScope): Promise<readonly HealthFinding[]>;
  repair?(
    ctx: HealthRepairContext,
    findings: readonly HealthFinding[],
  ): Promise<HealthRepairResult>;
}

export interface DoctorLintRunOptions {
  readonly checks?: readonly HealthCheck[];
  readonly skipIds?: ReadonlySet<string> | readonly string[];
  readonly onlyIds?: ReadonlySet<string> | readonly string[];
}

export interface DoctorLintRunResult {
  readonly findings: readonly HealthFinding[];
  readonly checksRun: number;
  readonly checksSkipped: number;
}

const healthChecks = new Map<string, HealthCheck>();

export function registerHealthCheck(check: HealthCheck): void {
  healthChecks.set(check.id, check);
}

export function getHealthCheck(id: string): HealthCheck | undefined {
  return healthChecks.get(id);
}

export function listHealthChecks(): readonly HealthCheck[] {
  return [...healthChecks.values()].toSorted((left, right) => left.id.localeCompare(right.id));
}

export function registerCoreHealthChecks(): void {
  // Core checks are registered by the host in newer releases. Keep this no-op
  // facade so v20 policy checks can run on the local backport slice.
}

export function configValidationIssuesToHealthFindings(): readonly HealthFinding[] {
  return [];
}

export async function runDoctorLintChecks(
  ctx: HealthCheckContext,
  opts: DoctorLintRunOptions = {},
): Promise<DoctorLintRunResult> {
  const all = opts.checks ?? listHealthChecks();
  const skip = opts.skipIds instanceof Set ? opts.skipIds : new Set(opts.skipIds ?? []);
  const only = opts.onlyIds instanceof Set ? opts.onlyIds : new Set(opts.onlyIds ?? []);
  const allIds = new Set(all.map((check) => check.id));
  const selected = all.filter((check) => {
    if (only.size > 0 && !only.has(check.id)) {
      return false;
    }
    return !skip.has(check.id);
  });
  const findings: HealthFinding[] = [];
  for (const id of only) {
    if (!allIds.has(id)) {
      findings.push({
        checkId: "core/doctor/lint-selection",
        severity: "error",
        message: `Unknown health check id selected by --only: ${id}.`,
        path: id,
      });
    }
  }
  for (const check of selected) {
    try {
      findings.push(...(await check.detect(ctx)));
    } catch (err) {
      findings.push({
        checkId: check.id,
        severity: "error",
        message: `health check threw: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
  findings.sort(compareFindings);
  return {
    findings,
    checksRun: selected.length,
    checksSkipped: all.length - selected.length,
  };
}

export function healthFindingMeetsSeverity(
  finding: Pick<HealthFinding, "severity">,
  severityMin: HealthFindingSeverity,
): boolean {
  return (
    HEALTH_FINDING_SEVERITY_RANK[finding.severity] >= HEALTH_FINDING_SEVERITY_RANK[severityMin]
  );
}

export function exitCodeFromFindings(
  findings: readonly HealthFinding[],
  severityMin: HealthFindingSeverity = "warning",
): 0 | 1 {
  return findings.some((finding) => healthFindingMeetsSeverity(finding, severityMin)) ? 1 : 0;
}

function compareFindings(left: HealthFinding, right: HealthFinding): number {
  const severityDelta =
    HEALTH_FINDING_SEVERITY_RANK[right.severity] - HEALTH_FINDING_SEVERITY_RANK[left.severity];
  if (severityDelta !== 0) {
    return severityDelta;
  }
  const idDelta = left.checkId.localeCompare(right.checkId);
  if (idDelta !== 0) {
    return idDelta;
  }
  return (left.path ?? "").localeCompare(right.path ?? "");
}
