import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import { resolveNewStateDir, resolveStateDir } from "../config/paths.js";
import { success } from "../globals.js";
import { resolveHomeRelativePath } from "../infra/home-dir.js";
import { type RuntimeEnv, defaultRuntime, writeRuntimeJson } from "../runtime.js";
import { shortenHomePath } from "../utils.js";
import { createClackPrompter } from "../wizard/clack-prompter.js";

export type CodexCleanOptions = {
  dryRun?: boolean;
  force?: boolean;
  json?: boolean;
};

type CodexCleanDeps = {
  confirm: (message: string) => Promise<boolean>;
  env: NodeJS.ProcessEnv;
  fsModule: typeof fs;
  homedir: () => string;
};

type JsonRecord = Record<string, unknown>;

type CleanTarget = {
  path: string;
  removedProfiles: string[];
  removedProviderState: string[];
  next: unknown;
};

const CODEX_PROVIDER_ID = "openai-codex";
const AUTH_FILENAMES = ["auth-profiles.json", "auth-state.json", "auth.json"] as const;

const defaultCodexCleanDeps: CodexCleanDeps = {
  confirm: async (message) => {
    const prompter = createClackPrompter();
    return await prompter.confirm({ message, initialValue: false });
  },
  env: process.env,
  fsModule: fs,
  homedir: os.homedir,
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolveDefaultEnvPath(deps: Pick<CodexCleanDeps, "homedir">): string {
  return path.join(
    resolveNewStateDir(() => deps.homedir()),
    ".env",
  );
}

async function resolveConfiguredStateDir(deps: CodexCleanDeps): Promise<string> {
  const envPath = resolveDefaultEnvPath(deps);
  try {
    const parsed = dotenv.parse(await deps.fsModule.promises.readFile(envPath, "utf8"));
    const configured = parsed.OPENCLAW_STATE_DIR?.trim();
    if (configured) {
      return resolveHomeRelativePath(configured, { env: deps.env, homedir: deps.homedir });
    }
  } catch {
    // Fall back to normal state-dir resolution for older installs without the new .env flow.
  }
  return resolveStateDir(deps.env, deps.homedir);
}

function isCodexProfile(profileId: string, value: unknown): boolean {
  if (profileId === CODEX_PROVIDER_ID || profileId.startsWith(`${CODEX_PROVIDER_ID}:`)) {
    return true;
  }
  if (!isRecord(value)) {
    return false;
  }
  return value.provider === CODEX_PROVIDER_ID || value.managedBy === "codex-cli";
}

function cleanProviderMap(value: unknown, providerId: string): boolean {
  if (!isRecord(value)) {
    return false;
  }
  if (Object.hasOwn(value, providerId)) {
    delete value[providerId];
    return true;
  }
  return false;
}

function cleanAuthStore(raw: unknown): {
  changed: boolean;
  next: unknown;
  removedProfiles: string[];
  removedProviderState: string[];
} {
  if (!isRecord(raw)) {
    return { changed: false, next: raw, removedProfiles: [], removedProviderState: [] };
  }

  const next = structuredClone(raw);
  const removedProfiles: string[] = [];
  const removedProviderState: string[] = [];
  const profiles = next.profiles;
  if (isRecord(profiles)) {
    for (const [profileId, profile] of Object.entries(profiles)) {
      if (isCodexProfile(profileId, profile)) {
        delete profiles[profileId];
        removedProfiles.push(profileId);
      }
    }
  }

  for (const key of ["order", "lastGood"] as const) {
    if (cleanProviderMap(next[key], CODEX_PROVIDER_ID)) {
      removedProviderState.push(key);
    }
  }

  const usageStats = next.usageStats;
  if (isRecord(usageStats)) {
    for (const profileId of Object.keys(usageStats)) {
      if (removedProfiles.includes(profileId) || profileId.startsWith(`${CODEX_PROVIDER_ID}:`)) {
        delete usageStats[profileId];
      }
    }
  }

  return {
    changed: removedProfiles.length > 0 || removedProviderState.length > 0,
    next,
    removedProfiles,
    removedProviderState,
  };
}

async function listCodexCleanTargets(
  stateDir: string,
  deps: Pick<CodexCleanDeps, "fsModule">,
): Promise<CleanTarget[]> {
  const agentsDir = path.join(stateDir, "agents");
  let agentNames: string[];
  try {
    agentNames = await deps.fsModule.promises.readdir(agentsDir);
  } catch {
    return [];
  }

  const targets: CleanTarget[] = [];
  for (const agentName of agentNames.toSorted()) {
    const agentAuthDir = path.join(agentsDir, agentName, "agent");
    for (const filename of AUTH_FILENAMES) {
      const targetPath = path.join(agentAuthDir, filename);
      let parsed: unknown;
      try {
        parsed = JSON.parse(await deps.fsModule.promises.readFile(targetPath, "utf8"));
      } catch {
        continue;
      }
      const result = cleanAuthStore(parsed);
      if (result.changed) {
        targets.push({
          path: targetPath,
          removedProfiles: result.removedProfiles,
          removedProviderState: result.removedProviderState,
          next: result.next,
        });
      }
    }
  }
  return targets;
}

async function writeCleanTargets(
  targets: readonly CleanTarget[],
  deps: Pick<CodexCleanDeps, "fsModule">,
) {
  for (const target of targets) {
    const json = JSON.stringify(target.next, null, 2).trimEnd().concat("\n");
    await deps.fsModule.promises.writeFile(target.path, json, { encoding: "utf8", mode: 0o600 });
  }
}

export async function codexCleanCommand(
  options: CodexCleanOptions,
  runtime: RuntimeEnv = defaultRuntime,
  deps: CodexCleanDeps = defaultCodexCleanDeps,
): Promise<void> {
  const stateDir = await resolveConfiguredStateDir(deps);
  const targets = await listCodexCleanTargets(stateDir, deps);
  const removedProfileCount = targets.reduce(
    (sum, target) => sum + target.removedProfiles.length,
    0,
  );
  const payload = {
    provider: CODEX_PROVIDER_ID,
    stateDir,
    dryRun: Boolean(options.dryRun),
    changedFiles: targets.map((target) => ({
      path: target.path,
      removedProfiles: target.removedProfiles,
      removedProviderState: target.removedProviderState,
    })),
    removedProfileCount,
  };

  if (options.json) {
    writeRuntimeJson(runtime, payload);
  } else if (targets.length === 0) {
    runtime.log(`No ${CODEX_PROVIDER_ID} auth profiles found under ${shortenHomePath(stateDir)}.`);
  } else {
    runtime.log(
      [
        `Found ${removedProfileCount} ${CODEX_PROVIDER_ID} profile${removedProfileCount === 1 ? "" : "s"} in ${targets.length} file${targets.length === 1 ? "" : "s"}:`,
        ...targets.map((target) => `- ${shortenHomePath(target.path)}`),
      ].join("\n"),
    );
  }

  if (targets.length === 0 || options.dryRun) {
    return;
  }

  if (!options.force) {
    const ok = await deps.confirm(
      `Remove ${removedProfileCount} ${CODEX_PROVIDER_ID} profile${removedProfileCount === 1 ? "" : "s"} from OpenClaw auth state?`,
    );
    if (!ok) {
      runtime.log("Cancelled.");
      return;
    }
  }

  await writeCleanTargets(targets, deps);
  if (!options.json) {
    runtime.log(success(`Cleaned ${CODEX_PROVIDER_ID} auth state.`));
    runtime.log("Codex CLI auth was left unchanged; log in/out with Codex separately if needed.");
  }
}

export const __testing = {
  cleanAuthStore,
  codexCleanCommand,
  listCodexCleanTargets,
  resolveConfiguredStateDir,
};
