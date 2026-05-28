import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Command } from "commander";
import { randomToken } from "../commands/random-token.js";
import { resolveNewStateDir } from "../config/paths.js";
import { danger, success } from "../globals.js";
import { resolveOpenClawPackageRootSync } from "../infra/openclaw-root.js";
import { type RuntimeEnv, defaultRuntime } from "../runtime.js";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";
import { shortenHomePath } from "../utils.js";

export type EnvInitOptions = {
  force?: boolean;
};

export type EnvTokenOptions = {
  print?: boolean;
};

type EnvCommandDeps = {
  cwd: () => string;
  fsModule: typeof fs;
  homedir: () => string;
  packageRoot: () => string | null;
  token: () => string;
};

const defaultEnvCommandDeps: EnvCommandDeps = {
  cwd: () => process.cwd(),
  fsModule: fs,
  homedir: os.homedir,
  packageRoot: () =>
    resolveOpenClawPackageRootSync({
      argv1: process.argv[1],
      cwd: process.cwd(),
      moduleUrl: import.meta.url,
    }),
  token: randomToken,
};

function resolveEnvPath(deps: EnvCommandDeps): string {
  return path.join(
    resolveNewStateDir(() => deps.homedir()),
    ".env",
  );
}

function resolveTemplateCandidates(deps: EnvCommandDeps): string[] {
  const candidates = [path.join(deps.cwd(), ".env.example")];
  const packageRoot = deps.packageRoot();
  if (packageRoot) {
    candidates.push(path.join(packageRoot, ".env.example"));
  }
  return [...new Set(candidates.map((candidate) => path.resolve(candidate)))];
}

async function readEnvTemplate(deps: EnvCommandDeps): Promise<{ path: string; template: string }> {
  const candidates = resolveTemplateCandidates(deps);
  const errors: string[] = [];
  for (const candidate of candidates) {
    try {
      return {
        path: candidate,
        template: await deps.fsModule.promises.readFile(candidate, "utf8"),
      };
    } catch (error) {
      errors.push(`${shortenHomePath(candidate)} (${String(error)})`);
    }
  }
  throw new Error(errors.join("; "));
}

function applyGatewayToken(template: string, token: string): string {
  const line = `OPENCLAW_GATEWAY_TOKEN=${token}`;
  if (/^OPENCLAW_GATEWAY_TOKEN=.*$/m.test(template)) {
    return template.replace(/^OPENCLAW_GATEWAY_TOKEN=.*$/m, line);
  }
  const suffix = template.endsWith("\n") ? "" : "\n";
  return `${template}${suffix}${line}\n`;
}

function updateGatewayToken(envText: string, token: string): string {
  const line = `OPENCLAW_GATEWAY_TOKEN=${token}`;
  const lines = envText.split(/\r?\n/);
  let replaced = false;
  const nextLines: string[] = [];
  for (const rawLine of lines) {
    if (rawLine.startsWith("OPENCLAW_GATEWAY_TOKEN=")) {
      if (!replaced) {
        nextLines.push(line);
        replaced = true;
      }
      continue;
    }
    nextLines.push(rawLine);
  }
  if (!replaced) {
    while (nextLines.length > 0 && nextLines[nextLines.length - 1] === "") {
      nextLines.pop();
    }
    nextLines.push(line);
  }
  return nextLines.join("\n").replace(/\n*$/, "\n");
}

export async function envInitCommand(
  runtime: RuntimeEnv,
  options: EnvInitOptions,
  deps: EnvCommandDeps = defaultEnvCommandDeps,
): Promise<void> {
  const envPath = resolveEnvPath(deps);
  const force = Boolean(options.force);

  if (!force && deps.fsModule.existsSync(envPath)) {
    runtime.error(
      danger(
        `.env already exists at ${shortenHomePath(envPath)}. Re-run with --force to replace it.`,
      ),
    );
    runtime.exit(1);
    return;
  }

  let templateResult: { path: string; template: string };
  try {
    templateResult = await readEnvTemplate(deps);
  } catch (error) {
    runtime.error(danger(`Failed to read .env.example template: ${String(error)}`));
    runtime.exit(1);
    return;
  }

  await deps.fsModule.promises.mkdir(path.dirname(envPath), { recursive: true });
  await deps.fsModule.promises.writeFile(
    envPath,
    applyGatewayToken(templateResult.template, deps.token()),
    {
      encoding: "utf8",
      mode: 0o600,
    },
  );

  runtime.log(success(`Created ${shortenHomePath(envPath)}.`));
  runtime.log(`Template: ${shortenHomePath(templateResult.path)}`);
  runtime.log(
    "Next: edit OPENCLAW_STATE_DIR and OPENCLAW_CONFIG_PATH, then run openclaw config init.",
  );
}

export async function envTokenCommand(
  runtime: RuntimeEnv,
  options: EnvTokenOptions,
  deps: EnvCommandDeps = defaultEnvCommandDeps,
): Promise<void> {
  const envPath = resolveEnvPath(deps);
  let envText: string;
  try {
    envText = await deps.fsModule.promises.readFile(envPath, "utf8");
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

  const token = deps.token();
  await deps.fsModule.promises.writeFile(envPath, updateGatewayToken(envText, token), {
    encoding: "utf8",
    mode: 0o600,
  });

  runtime.log(success(`Updated OPENCLAW_GATEWAY_TOKEN in ${shortenHomePath(envPath)}.`));
  if (options.print) {
    runtime.log(token);
  }
}

export function registerEnvCli(program: Command) {
  const env = program
    .command("env")
    .description("Manage the default OpenClaw .env file")
    .addHelpText(
      "after",
      () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/env", "docs.openclaw.ai/cli/env")}\n`,
    );

  env
    .command("init")
    .description("Create ~/.openclaw/.env from .env.example and generate a gateway token")
    .option("--force", "Replace an existing .env file", false)
    .action(async (opts: EnvInitOptions) => {
      await envInitCommand(defaultRuntime, { force: Boolean(opts.force) });
    });

  env
    .command("token")
    .description("Rotate OPENCLAW_GATEWAY_TOKEN in ~/.openclaw/.env")
    .option("--print", "Print the generated token after writing it", false)
    .action(async (opts: EnvTokenOptions) => {
      await envTokenCommand(defaultRuntime, { print: Boolean(opts.print) });
    });
}

export const __testing = {
  applyGatewayToken,
  envInitCommand,
  envTokenCommand,
  resolveEnvPath,
  resolveTemplateCandidates,
  updateGatewayToken,
};
