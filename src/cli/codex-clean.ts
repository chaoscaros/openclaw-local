import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import JSON5 from "json5";
import { listAgentIds, resolveAgentDir } from "../agents/agent-scope-config.js";
import { resolveConfigPath, resolveNewStateDir, resolveStateDir } from "../config/paths.js";
import type { OpenClawConfig } from "../config/types.js";
import { success } from "../globals.js";
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
  kind: "auth" | "session";
  removedProfiles: string[];
  removedProviderState: string[];
  next: unknown;
};

const CODEX_PROVIDER_ID = "openai-codex";
const AUTH_FILENAMES = ["auth-profiles.json", "auth-state.json", "auth.json"] as const;
const SESSION_STORE_FILENAME = "sessions.json";

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

async function readConfiguredEnv(deps: CodexCleanDeps): Promise<NodeJS.ProcessEnv> {
  const configured: NodeJS.ProcessEnv = { ...deps.env };
  const envPath = resolveDefaultEnvPath(deps);
  try {
    const parsed = dotenv.parse(await deps.fsModule.promises.readFile(envPath, "utf8"));
    return { ...parsed, ...configured };
  } catch {
    return configured;
  }
}

async function resolveConfiguredStateDir(deps: CodexCleanDeps): Promise<string> {
  const env = await readConfiguredEnv(deps);
  return resolveStateDir(env, deps.homedir);
}

function isCodexProfileId(profileId: string): boolean {
  if (profileId === CODEX_PROVIDER_ID || profileId.startsWith(`${CODEX_PROVIDER_ID}:`)) {
    return true;
  }
  return false;
}

function isCodexProfile(profileId: string, value: unknown): boolean {
  if (isCodexProfileId(profileId)) {
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

function cleanSessionStore(raw: unknown): {
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

  function visit(value: unknown): void {
    if (!isRecord(value)) {
      return;
    }
    const profile = value.authProfileOverride;
    if (typeof profile === "string" && isCodexProfileId(profile)) {
      delete value.authProfileOverride;
      delete value.authProfileOverrideSource;
      delete value.authProfileOverrideCompactionCount;
      removedProfiles.push(profile);
    }
    for (const child of Object.values(value)) {
      if (isRecord(child) || Array.isArray(child)) {
        visit(child);
      }
    }
  }

  visit(next);
  return {
    changed: removedProfiles.length > 0,
    next,
    removedProfiles: [...new Set(removedProfiles)],
    removedProviderState: ["session.authProfileOverride"],
  };
}

async function readConfiguredAgentDirs(params: {
  stateDir: string;
  configPath: string;
  deps: Pick<CodexCleanDeps, "env" | "fsModule">;
}): Promise<string[]> {
  let cfg: OpenClawConfig | undefined;
  try {
    const raw = await params.deps.fsModule.promises.readFile(params.configPath, "utf8");
    cfg = JSON5.parse(raw) as OpenClawConfig;
  } catch {
    cfg = undefined;
  }

  const dirs = new Set<string>();
  if (cfg) {
    for (const agentId of listAgentIds(cfg)) {
      dirs.add(resolveAgentDir(cfg, agentId, params.deps.env));
    }
  }

  try {
    const agentsDir = path.join(params.stateDir, "agents");
    const agentNames = await params.deps.fsModule.promises.readdir(agentsDir);
    for (const agentName of agentNames) {
      dirs.add(path.join(agentsDir, agentName, "agent"));
    }
  } catch {
    // Older installs may not have a state-dir agents folder.
  }

  return [...dirs].toSorted();
}

async function listCodexCleanTargets(
  stateDir: string,
  configPath: string,
  deps: Pick<CodexCleanDeps, "env" | "fsModule">,
): Promise<CleanTarget[]> {
  const targets: CleanTarget[] = [];
  const agentAuthDirs = await readConfiguredAgentDirs({ stateDir, configPath, deps });
  for (const agentAuthDir of agentAuthDirs) {
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
          kind: "auth",
          removedProfiles: result.removedProfiles,
          removedProviderState: result.removedProviderState,
          next: result.next,
        });
      }
    }

    const sessionStorePath = path.join(
      path.dirname(agentAuthDir),
      "sessions",
      SESSION_STORE_FILENAME,
    );
    let parsedSessionStore: unknown;
    try {
      parsedSessionStore = JSON.parse(
        await deps.fsModule.promises.readFile(sessionStorePath, "utf8"),
      );
    } catch {
      continue;
    }
    const result = cleanSessionStore(parsedSessionStore);
    if (result.changed) {
      targets.push({
        path: sessionStorePath,
        kind: "session",
        removedProfiles: result.removedProfiles,
        removedProviderState: result.removedProviderState,
        next: result.next,
      });
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
  const configuredEnv = await readConfiguredEnv(deps);
  const stateDir = resolveStateDir(configuredEnv, deps.homedir);
  const configPath = resolveConfigPath(configuredEnv, stateDir, deps.homedir);
  const targets = await listCodexCleanTargets(stateDir, configPath, {
    ...deps,
    env: configuredEnv,
  });
  const removedProfileCount = targets.reduce(
    (sum, target) => sum + target.removedProfiles.length,
    0,
  );
  const payload = {
    provider: CODEX_PROVIDER_ID,
    stateDir,
    configPath,
    dryRun: Boolean(options.dryRun),
    changedFiles: targets.map((target) => ({
      path: target.path,
      kind: target.kind,
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
  cleanSessionStore,
  codexCleanCommand,
  listCodexCleanTargets,
  resolveConfiguredStateDir,
};
