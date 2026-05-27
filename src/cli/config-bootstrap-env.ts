import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import { readConfigFileSnapshot, replaceConfigFile } from "../config/config.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { DEFAULT_SECRET_PROVIDER_ALIAS, type SecretRef } from "../config/types.secrets.js";
import { success, warn } from "../globals.js";
import { type RuntimeEnv, defaultRuntime } from "../runtime.js";
import { shortenHomePath } from "../utils.js";

export type ConfigBootstrapEnvOptions = {
  envFile?: string;
  force?: boolean;
  dryRun?: boolean;
};

type DotEnvMap = Record<string, string>;
type PlatformName = NodeJS.Platform;
type PathOverride = {
  key: "OPENCLAW_STATE_DIR" | "OPENCLAW_CONFIG_PATH";
  value: string;
};

type BootstrapPlan = {
  nextConfig: OpenClawConfig;
  changes: string[];
  notes: string[];
  pathOverrides: PathOverride[];
};

const PROVIDER_ENV_KEYS: Array<{ provider: string; envKeys: string[] }> = [
  { provider: "openai", envKeys: ["OPENAI_API_KEY"] },
  { provider: "anthropic", envKeys: ["ANTHROPIC_API_KEY"] },
  { provider: "google", envKeys: ["GEMINI_API_KEY", "GOOGLE_API_KEY"] },
  { provider: "openrouter", envKeys: ["OPENROUTER_API_KEY"] },
  { provider: "xai", envKeys: ["XAI_API_KEY"] },
  { provider: "minimax", envKeys: ["MINIMAX_API_KEY"] },
  { provider: "synthetic", envKeys: ["SYNTHETIC_API_KEY"] },
  { provider: "dabo", envKeys: ["DABO_API_KEY"] },
];

function envRef(id: string): SecretRef {
  return { source: "env", provider: DEFAULT_SECRET_PROVIDER_ALIAS, id };
}

function hasNonEmptyEnv(env: DotEnvMap, key: string): boolean {
  return typeof env[key] === "string" && env[key].trim().length > 0;
}

function resolveDefaultEnvFile(): string {
  return path.join(os.homedir(), ".openclaw", ".env");
}

function readEnvFile(filePath: string): DotEnvMap {
  const raw = fs.readFileSync(filePath, "utf8");
  return dotenv.parse(raw);
}

function isForeignPosixPathOnWindows(raw: string, platform: PlatformName): boolean {
  return platform === "win32" && raw.startsWith("/") && !raw.startsWith("//");
}

export function resolveBootstrapEnvPathOverrides(params: {
  env: DotEnvMap;
  platform?: PlatformName;
}): { overrides: PathOverride[]; notes: string[] } {
  const platform = params.platform ?? process.platform;
  const overrides: PathOverride[] = [];
  const notes: string[] = [];

  for (const key of ["OPENCLAW_STATE_DIR", "OPENCLAW_CONFIG_PATH"] as const) {
    const raw = params.env[key]?.trim();
    if (!raw) {
      continue;
    }
    if (isForeignPosixPathOnWindows(raw, platform)) {
      notes.push(
        `${key} from .env looks like a POSIX/macOS path and was not applied on Windows: ${raw}`,
      );
      continue;
    }
    overrides.push({ key, value: raw });
  }

  return { overrides, notes };
}

function setIfMissing<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: NonNullable<T[K]>,
  force: boolean,
): boolean {
  if (!force && target[key] !== undefined) {
    return false;
  }
  target[key] = value;
  return true;
}

function ensureChannelConfig(config: OpenClawConfig, channelId: string): Record<string, unknown> {
  const channels = (config.channels ??= {});
  const existing = channels[channelId];
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing as Record<string, unknown>;
  }
  const next: Record<string, unknown> = {};
  channels[channelId] = next;
  return next;
}

function setSecretField(params: {
  object: Record<string, unknown>;
  field: string;
  envKey: string;
  changes: string[];
  label: string;
  force: boolean;
}): void {
  if (!params.force && params.object[params.field] !== undefined) {
    return;
  }
  params.object[params.field] = envRef(params.envKey);
  params.changes.push(`${params.label} -> env:${params.envKey}`);
}

export function buildBootstrapEnvConfigPlan(params: {
  baseConfig: OpenClawConfig;
  env: DotEnvMap;
  force?: boolean;
  platform?: PlatformName;
}): BootstrapPlan {
  const force = params.force ?? false;
  const nextConfig = structuredClone(params.baseConfig);
  const changes: string[] = [];
  const notes: string[] = [];

  const { overrides, notes: pathNotes } = resolveBootstrapEnvPathOverrides({
    env: params.env,
    platform: params.platform,
  });
  notes.push(...pathNotes);

  nextConfig.gateway ??= {};
  if (setIfMissing(nextConfig.gateway, "mode", "local", force)) {
    changes.push("gateway.mode -> local");
  }
  if (setIfMissing(nextConfig.gateway, "bind", "loopback", force)) {
    changes.push("gateway.bind -> loopback");
  }

  const gatewayPort = params.env.OPENCLAW_GATEWAY_PORT?.trim();
  if (gatewayPort && /^\d+$/.test(gatewayPort)) {
    const port = Number.parseInt(gatewayPort, 10);
    if (port > 0 && port <= 65535 && setIfMissing(nextConfig.gateway, "port", port, force)) {
      changes.push(`gateway.port -> ${port}`);
    }
  }

  if (hasNonEmptyEnv(params.env, "OPENCLAW_GATEWAY_TOKEN")) {
    nextConfig.gateway.auth ??= {};
    if (force || nextConfig.gateway.auth.mode === undefined) {
      nextConfig.gateway.auth.mode = "token";
      changes.push("gateway.auth.mode -> token");
    }
    setSecretField({
      object: nextConfig.gateway.auth as Record<string, unknown>,
      field: "token",
      envKey: "OPENCLAW_GATEWAY_TOKEN",
      changes,
      label: "gateway.auth.token",
      force,
    });
  } else if (hasNonEmptyEnv(params.env, "OPENCLAW_GATEWAY_PASSWORD")) {
    nextConfig.gateway.auth ??= {};
    if (force || nextConfig.gateway.auth.mode === undefined) {
      nextConfig.gateway.auth.mode = "password";
      changes.push("gateway.auth.mode -> password");
    }
    setSecretField({
      object: nextConfig.gateway.auth as Record<string, unknown>,
      field: "password",
      envKey: "OPENCLAW_GATEWAY_PASSWORD",
      changes,
      label: "gateway.auth.password",
      force,
    });
  }

  if (hasNonEmptyEnv(params.env, "TELEGRAM_BOT_TOKEN")) {
    setSecretField({
      object: ensureChannelConfig(nextConfig, "telegram"),
      field: "botToken",
      envKey: "TELEGRAM_BOT_TOKEN",
      changes,
      label: "channels.telegram.botToken",
      force,
    });
  }
  if (hasNonEmptyEnv(params.env, "DISCORD_BOT_TOKEN")) {
    setSecretField({
      object: ensureChannelConfig(nextConfig, "discord"),
      field: "token",
      envKey: "DISCORD_BOT_TOKEN",
      changes,
      label: "channels.discord.token",
      force,
    });
  }
  if (hasNonEmptyEnv(params.env, "SLACK_BOT_TOKEN")) {
    setSecretField({
      object: ensureChannelConfig(nextConfig, "slack"),
      field: "botToken",
      envKey: "SLACK_BOT_TOKEN",
      changes,
      label: "channels.slack.botToken",
      force,
    });
  }
  if (hasNonEmptyEnv(params.env, "SLACK_APP_TOKEN")) {
    setSecretField({
      object: ensureChannelConfig(nextConfig, "slack"),
      field: "appToken",
      envKey: "SLACK_APP_TOKEN",
      changes,
      label: "channels.slack.appToken",
      force,
    });
  }

  if (params.env.OPENCLAW_LOAD_SHELL_ENV?.trim() === "1") {
    nextConfig.env ??= {};
    const shellEnv = (nextConfig.env.shellEnv ??= {});
    if (force || shellEnv.enabled === undefined) {
      shellEnv.enabled = true;
      changes.push("env.shellEnv.enabled -> true");
    }
    const timeoutRaw = params.env.OPENCLAW_SHELL_ENV_TIMEOUT_MS?.trim();
    if (timeoutRaw && /^\d+$/.test(timeoutRaw) && (force || shellEnv.timeoutMs === undefined)) {
      shellEnv.timeoutMs = Number.parseInt(timeoutRaw, 10);
      changes.push(`env.shellEnv.timeoutMs -> ${shellEnv.timeoutMs}`);
    }
  }

  const configuredProviderEnv = PROVIDER_ENV_KEYS.flatMap(({ provider, envKeys }) =>
    envKeys
      .filter((envKey) => hasNonEmptyEnv(params.env, envKey))
      .map((envKey) => ({
        provider,
        envKey,
      })),
  );
  if (configuredProviderEnv.length > 0) {
    notes.push(
      `Provider env keys detected (${configuredProviderEnv
        .map(({ provider, envKey }) => `${provider}:${envKey}`)
        .join(", ")}); provider auth will resolve them from the runtime environment.`,
    );
  }

  return { nextConfig, changes, notes, pathOverrides: overrides };
}

async function withTemporaryProcessEnv<T>(
  overrides: PathOverride[],
  fn: () => Promise<T>,
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const { key, value } of overrides) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    return await fn();
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

export async function runConfigBootstrapEnv(
  options: ConfigBootstrapEnvOptions,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  const envFile = path.resolve(options.envFile ?? resolveDefaultEnvFile());
  let env: DotEnvMap;
  try {
    env = readEnvFile(envFile);
  } catch (error) {
    runtime.error(`Failed to read .env file ${shortenHomePath(envFile)}: ${String(error)}`);
    runtime.exit(1);
    return;
  }

  const pathResult = resolveBootstrapEnvPathOverrides({ env });
  await withTemporaryProcessEnv(pathResult.overrides, async () => {
    const snapshot = await readConfigFileSnapshot();
    const plan = buildBootstrapEnvConfigPlan({
      baseConfig: snapshot.sourceConfig,
      env,
      force: Boolean(options.force),
    });
    const allNotes = [...new Set([...pathResult.notes, ...plan.notes])];

    if (options.dryRun) {
      runtime.log(
        success(
          `Dry run: ${plan.changes.length} config change(s) would be written to ${shortenHomePath(snapshot.path)}.`,
        ),
      );
    } else {
      await replaceConfigFile({ nextConfig: plan.nextConfig, snapshot });
      runtime.log(success(`Bootstrapped config from ${shortenHomePath(envFile)}.`));
      runtime.log(`Wrote ${shortenHomePath(snapshot.path)}.`);
    }

    if (plan.changes.length > 0) {
      runtime.log("Changes:");
      for (const change of plan.changes) {
        runtime.log(`- ${change}`);
      }
    } else {
      runtime.log("No config changes were needed.");
    }

    for (const note of allNotes) {
      runtime.log(warn(`Note: ${note}`));
    }
  });
}
