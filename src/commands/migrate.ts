import type { RuntimeEnv } from "../runtime.js";
import { writeRuntimeJson } from "../runtime.js";
import { loadConfig } from "../config/config.js";
import { resolveStateDir } from "../config/paths.js";
import { resolvePluginMigrationProvider } from "../plugins/migration-provider-runtime.js";
import type {
  MigrationApplyResult,
  MigrationDetection,
  MigrationPlan,
  MigrationProviderContext,
} from "../plugins/types.js";

export type MigrateCommandOptions = {
  providerId: string;
  source?: string;
  plan?: boolean;
  apply?: boolean;
  includeSecrets?: boolean;
  overwrite?: boolean;
  backupPath?: string;
  reportDir?: string;
  json?: boolean;
};

type MigrateCommandMode = "plan" | "apply";

function createMigrationLogger(runtime: RuntimeEnv) {
  return {
    info: (message: string) => runtime.log(message),
    warn: (message: string) => runtime.log(message),
    error: (message: string) => runtime.error(message),
    debug: (_message: string) => {},
  };
}

function formatSummary(summary: MigrationPlan["summary"]): string[] {
  return [
    `  total: ${summary.total}`,
    `  planned: ${summary.planned}`,
    `  migrated: ${summary.migrated}`,
    `  skipped: ${summary.skipped}`,
    `  conflicts: ${summary.conflicts}`,
    `  errors: ${summary.errors}`,
    `  sensitive: ${summary.sensitive}`,
  ];
}

function resolveMigrateMode(runtime: RuntimeEnv, opts: MigrateCommandOptions): MigrateCommandMode {
  if (opts.plan && opts.apply) {
    runtime.error("Cannot use --plan and --apply together.");
    runtime.exit(1);
  }
  return opts.apply ? "apply" : "plan";
}

function buildProviderPayload(params: { id: string; label?: string }) {
  return {
    id: params.id,
    ...(params.label ? { label: params.label } : {}),
  };
}

function buildJsonPayload(params: {
  provider: { id: string; label?: string };
  mode: MigrateCommandMode;
  detection?: MigrationDetection;
  plan?: MigrationPlan;
  result?: MigrationApplyResult;
}) {
  return {
    provider: buildProviderPayload(params.provider),
    mode: params.mode,
    ...(params.detection ? { detection: params.detection } : {}),
    ...(params.plan ? { plan: params.plan } : {}),
    ...(params.result ? { result: params.result } : {}),
  };
}

function logDetection(runtime: RuntimeEnv, detection: MigrationDetection | undefined): void {
  if (!detection) {
    return;
  }
  runtime.log(`Detection: ${detection.found ? "found" : "not found"}`);
  if (detection.label) {
    runtime.log(`  label: ${detection.label}`);
  }
  if (detection.source) {
    runtime.log(`  source: ${detection.source}`);
  }
  if (detection.confidence) {
    runtime.log(`  confidence: ${detection.confidence}`);
  }
  if (detection.message) {
    runtime.log(`  message: ${detection.message}`);
  }
}

function logPlan(runtime: RuntimeEnv, plan: MigrationPlan): void {
  runtime.log(`Migration provider: ${plan.providerId}`);
  runtime.log(`Source: ${plan.source}`);
  if (plan.target) {
    runtime.log(`Target: ${plan.target}`);
  }
  runtime.log("Summary:");
  for (const line of formatSummary(plan.summary)) {
    runtime.log(line);
  }
  if (plan.warnings?.length) {
    runtime.log("Warnings:");
    for (const warning of plan.warnings) {
      runtime.log(`  - ${warning}`);
    }
  }
  if (plan.nextSteps?.length) {
    runtime.log("Next steps:");
    for (const step of plan.nextSteps) {
      runtime.log(`  - ${step}`);
    }
  }
}

function logApplyResult(runtime: RuntimeEnv, result: MigrationApplyResult): void {
  runtime.log("Apply result:");
  for (const line of formatSummary(result.summary)) {
    runtime.log(line);
  }
  if (result.backupPath) {
    runtime.log(`Backup: ${result.backupPath}`);
  }
  if (result.reportDir) {
    runtime.log(`Report dir: ${result.reportDir}`);
  }
}

export async function migrateCommand(runtime: RuntimeEnv, opts: MigrateCommandOptions): Promise<void> {
  const mode = resolveMigrateMode(runtime, opts);
  const cfg = loadConfig();
  const provider = resolvePluginMigrationProvider({
    providerId: opts.providerId,
    cfg,
  });
  if (!provider) {
    runtime.error(`Unknown migration provider: ${opts.providerId}`);
    runtime.exit(1);
    return;
  }

  const context: MigrationProviderContext = {
    config: cfg,
    logger: createMigrationLogger(runtime),
    stateDir: resolveStateDir(process.env),
    source: opts.source,
    includeSecrets: Boolean(opts.includeSecrets),
    overwrite: Boolean(opts.overwrite),
    backupPath: opts.backupPath,
    reportDir: opts.reportDir,
  };

  const detection = provider.detect ? await provider.detect(context) : undefined;
  if (opts.json) {
    writeRuntimeJson(
      runtime,
      buildJsonPayload({
        provider: { id: provider.id, label: provider.label },
        mode,
        detection,
      }),
    );
  } else {
    runtime.log(`Provider: ${provider.id}${provider.label ? ` (${provider.label})` : ""}`);
    runtime.log(`Mode: ${mode}`);
    logDetection(runtime, detection);
  }

  if (detection && !detection.found) {
    if (mode === "apply") {
      runtime.error(`Migration source not found for provider: ${provider.id}`);
      runtime.exit(1);
      return;
    }
    return;
  }

  const plan = await provider.plan(context);
  if (opts.json) {
    writeRuntimeJson(
      runtime,
      buildJsonPayload({
        provider: { id: provider.id, label: provider.label },
        mode,
        detection,
        plan,
      }),
    );
  } else {
    logPlan(runtime, plan);
  }

  if (mode !== "apply") {
    return;
  }

  const result = await provider.apply(context, plan);
  if (opts.json) {
    writeRuntimeJson(
      runtime,
      buildJsonPayload({
        provider: { id: provider.id, label: provider.label },
        mode,
        detection,
        plan,
        result,
      }),
    );
    return;
  }
  logApplyResult(runtime, result);
}
