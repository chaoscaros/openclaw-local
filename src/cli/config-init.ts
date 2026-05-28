import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import { writeConfigFile } from "../config/config.js";
import { resolveNewStateDir } from "../config/paths.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { DEFAULT_SECRET_PROVIDER_ALIAS } from "../config/types.secrets.js";
import { danger, success } from "../globals.js";
import { resolveHomeRelativePath } from "../infra/home-dir.js";
import type { RuntimeEnv } from "../runtime.js";
import { shortenHomePath } from "../utils.js";

export type ConfigInitOptions = {
  force?: boolean;
};

type ConfigInitDeps = {
  env: NodeJS.ProcessEnv;
  fsModule: typeof fs;
  homedir: () => string;
  platform: NodeJS.Platform;
  writeConfig: typeof writeConfigFile;
};

const defaultConfigInitDeps: ConfigInitDeps = {
  env: process.env,
  fsModule: fs,
  homedir: os.homedir,
  platform: process.platform,
  writeConfig: writeConfigFile,
};

const REQUIRED_ENV_KEYS = ["OPENCLAW_STATE_DIR", "OPENCLAW_CONFIG_PATH"] as const;

function resolveDefaultEnvPath(deps: Pick<ConfigInitDeps, "homedir">): string {
  return path.join(
    resolveNewStateDir(() => deps.homedir()),
    ".env",
  );
}

function isForeignPosixPathOnWindows(raw: string, platform: NodeJS.Platform): boolean {
  if (platform !== "win32") {
    return false;
  }
  return /^\/(?:Users|home)\//i.test(raw.trim());
}

function resolveConfiguredPath(raw: string, deps: ConfigInitDeps): string {
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

function buildDefaultConfig(): OpenClawConfig {
  return {
    gateway: {
      mode: "local",
      bind: "loopback",
      auth: {
        mode: "token",
        token: {
          source: "env",
          provider: DEFAULT_SECRET_PROVIDER_ALIAS,
          id: "OPENCLAW_GATEWAY_TOKEN",
        },
      },
    },
  };
}

function formatMissingEnvMessage(missing: readonly string[], envPath: string): string {
  return [
    `Missing required ${missing.length === 1 ? "entry" : "entries"} in ${shortenHomePath(envPath)}: ${missing.join(", ")}`,
    "Edit .env first, then run openclaw config init again.",
  ].join("\n");
}

export async function configInitCommand(
  runtime: RuntimeEnv,
  options: ConfigInitOptions,
  deps: ConfigInitDeps = defaultConfigInitDeps,
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

  const stateDirRaw = parsed.OPENCLAW_STATE_DIR.trim();
  const configPathRaw = parsed.OPENCLAW_CONFIG_PATH.trim();
  const foreignWindowsPath = [stateDirRaw, configPathRaw].find((value) =>
    isForeignPosixPathOnWindows(value, deps.platform),
  );
  if (foreignWindowsPath) {
    runtime.error(
      danger(
        `OPENCLAW_STATE_DIR and OPENCLAW_CONFIG_PATH must use Windows paths on Windows. Found: ${foreignWindowsPath}`,
      ),
    );
    runtime.exit(1);
    return;
  }

  const stateDir = resolveConfiguredPath(stateDirRaw, deps);
  const configPath = resolveConfiguredPath(configPathRaw, deps);

  if (!options.force && deps.fsModule.existsSync(configPath)) {
    runtime.error(
      danger(
        `Config already exists at ${shortenHomePath(configPath)}. Re-run with --force to replace it.`,
      ),
    );
    runtime.exit(1);
    return;
  }

  await deps.fsModule.promises.mkdir(stateDir, { recursive: true, mode: 0o700 });
  await deps.fsModule.promises.mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
  await withTemporaryProcessEnv(
    {
      OPENCLAW_STATE_DIR: stateDir,
      OPENCLAW_CONFIG_PATH: configPath,
    },
    async () => {
      await deps.writeConfig(buildDefaultConfig());
    },
  );

  runtime.log(success(`Created ${shortenHomePath(configPath)}.`));
  runtime.log(`State directory: ${shortenHomePath(stateDir)}`);
}

export const __testing = {
  buildDefaultConfig,
  configInitCommand,
  isForeignPosixPathOnWindows,
  resolveDefaultEnvPath,
};
