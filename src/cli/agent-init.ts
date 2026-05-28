import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import { listAgentEntries, resolveAgentDir } from "../agents/agent-scope.js";
import { readConfigFileSnapshot, replaceConfigFile } from "../config/config.js";
import { resolveNewStateDir } from "../config/paths.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { danger, success } from "../globals.js";
import { resolveHomeRelativePath } from "../infra/home-dir.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { type RuntimeEnv, defaultRuntime } from "../runtime.js";
import { shortenHomePath } from "../utils.js";

export type AgentsInitOptions = {
  force?: boolean;
};

type AgentsInitDeps = {
  cwd: () => string;
  env: NodeJS.ProcessEnv;
  fsModule: typeof fs;
  homedir: () => string;
  readConfigSnapshot: typeof readConfigFileSnapshot;
  replaceConfig: typeof replaceConfigFile;
};

type AgentEntry = NonNullable<NonNullable<OpenClawConfig["agents"]>["list"]>[number];

const SOLO_AGENT_ID = "solo";
const REQUIRED_ENV_KEYS = ["OPENCLAW_STATE_DIR", "OPENCLAW_CONFIG_PATH"] as const;

const defaultAgentsInitDeps: AgentsInitDeps = {
  cwd: () => process.cwd(),
  env: process.env,
  fsModule: fs,
  homedir: os.homedir,
  readConfigSnapshot: readConfigFileSnapshot,
  replaceConfig: replaceConfigFile,
};

function resolveDefaultEnvPath(deps: Pick<AgentsInitDeps, "homedir">): string {
  return path.join(
    resolveNewStateDir(() => deps.homedir()),
    ".env",
  );
}

function resolveConfiguredPath(raw: string, deps: Pick<AgentsInitDeps, "env" | "homedir">): string {
  return resolveHomeRelativePath(raw, { env: deps.env, homedir: deps.homedir });
}

async function withTemporaryProcessEnv<T>(
  updates: Record<string, string>,
  run: () => Promise<T>,
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(updates)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function formatMissingEnvMessage(missing: readonly string[], envPath: string): string {
  return [
    `Missing required ${missing.length === 1 ? "entry" : "entries"} in ${shortenHomePath(envPath)}: ${missing.join(", ")}`,
    "Edit .env first, then run openclaw agents init again.",
  ].join("\n");
}

function buildSoloAgentConfig(
  cfg: OpenClawConfig,
  params: {
    agentDir: string;
    force?: boolean;
    workspace: string;
  },
): { config: OpenClawConfig; agent: AgentEntry; created: boolean } {
  let created = false;
  let soloAgent: AgentEntry | null = null;
  const force = params.force === true;
  const list = listAgentEntries(cfg);
  const nextList = list.map((entry): AgentEntry => {
    const isSolo = normalizeAgentId(entry.id) === SOLO_AGENT_ID;
    if (!isSolo) {
      return entry.default ? { ...entry, default: false } : entry;
    }

    const nextSolo: AgentEntry = force
      ? {
          id: SOLO_AGENT_ID,
          default: true,
          name: "Solo",
          workspace: params.workspace,
          agentDir: params.agentDir,
        }
      : {
          ...entry,
          id: entry.id?.trim() || SOLO_AGENT_ID,
          default: true,
          workspace: entry.workspace?.trim() || params.workspace,
          agentDir: entry.agentDir?.trim() || params.agentDir,
        };
    soloAgent = nextSolo;
    return nextSolo;
  });

  if (!soloAgent) {
    created = true;
    soloAgent = {
      id: SOLO_AGENT_ID,
      default: true,
      name: "Solo",
      workspace: params.workspace,
      agentDir: params.agentDir,
    };
    nextList.push(soloAgent);
  }

  return {
    config: {
      ...cfg,
      agents: {
        ...cfg.agents,
        list: nextList,
      },
    },
    agent: soloAgent,
    created,
  };
}

export async function agentsInitCommand(
  options: AgentsInitOptions,
  runtime: RuntimeEnv = defaultRuntime,
  deps: AgentsInitDeps = defaultAgentsInitDeps,
): Promise<void> {
  const envPath = resolveDefaultEnvPath(deps);
  let parsed: Record<string, string>;
  try {
    parsed = dotenv.parse(await deps.fsModule.promises.readFile(envPath, "utf8"));
  } catch (error) {
    runtime.error(
      danger(
        `.env does not exist at ${shortenHomePath(envPath)}. Run openclaw env init first. ${String(
          error,
        )}`,
      ),
    );
    runtime.exit(1);
    return;
  }

  const missing = REQUIRED_ENV_KEYS.filter((key) => !parsed[key]?.trim());
  if (missing.length > 0) {
    runtime.error(danger(formatMissingEnvMessage(missing, envPath)));
    runtime.exit(1);
    return;
  }

  const stateDir = resolveConfiguredPath(parsed.OPENCLAW_STATE_DIR.trim(), deps);
  const configPath = resolveConfiguredPath(parsed.OPENCLAW_CONFIG_PATH.trim(), deps);
  const workspace = path.resolve(deps.cwd());
  const agentDir = path.join(stateDir, "agents", SOLO_AGENT_ID, "agent");

  await withTemporaryProcessEnv(
    {
      OPENCLAW_STATE_DIR: stateDir,
      OPENCLAW_CONFIG_PATH: configPath,
    },
    async () => {
      const snapshot = await deps.readConfigSnapshot();
      if (!snapshot.exists) {
        runtime.error(
          danger(
            `Config does not exist at ${shortenHomePath(configPath)}. Run openclaw config init first.`,
          ),
        );
        runtime.exit(1);
        return;
      }
      if (!snapshot.valid) {
        runtime.error(
          danger(`Config invalid at ${shortenHomePath(configPath)}. Run openclaw doctor.`),
        );
        runtime.exit(1);
        return;
      }

      const next = buildSoloAgentConfig(snapshot.sourceConfig ?? snapshot.config, {
        agentDir,
        force: options.force,
        workspace,
      });
      const resolvedAgentDir = resolveConfiguredPath(
        next.agent.agentDir?.trim() || resolveAgentDir(next.config, SOLO_AGENT_ID, deps.env),
        deps,
      );
      const resolvedWorkspace = resolveConfiguredPath(
        next.agent.workspace?.trim() || workspace,
        deps,
      );
      await deps.fsModule.promises.mkdir(resolvedWorkspace, { recursive: true, mode: 0o700 });
      await deps.fsModule.promises.mkdir(resolvedAgentDir, { recursive: true, mode: 0o700 });
      await deps.fsModule.promises.mkdir(path.join(stateDir, "agents", SOLO_AGENT_ID, "sessions"), {
        recursive: true,
        mode: 0o700,
      });

      await deps.replaceConfig({
        nextConfig: next.config,
        ...(snapshot.hash !== undefined ? { baseHash: snapshot.hash } : {}),
      });

      runtime.log(
        success(
          `${next.created ? "Created" : options.force ? "Replaced" : "Updated"} default agent "${SOLO_AGENT_ID}".`,
        ),
      );
      runtime.log(`Config: ${shortenHomePath(configPath)}`);
      runtime.log(`Workspace: ${shortenHomePath(resolvedWorkspace)}`);
      runtime.log(`Agent dir: ${shortenHomePath(resolvedAgentDir)}`);
    },
  );
}

export const __testing = {
  buildSoloAgentConfig,
  resolveDefaultEnvPath,
};
