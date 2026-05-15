import { formatCliCommand } from "../cli/command-format.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { resolvePluginMigrationProviders } from "../plugins/migration-provider-runtime.js";
import type { MigrationProviderPlugin } from "../plugins/types.js";
import { note } from "../terminal/note.js";

function formatMigrationProviderLabel(provider: MigrationProviderPlugin): string {
  return provider.label && provider.label !== provider.id
    ? `- ${provider.id} (${provider.label})`
    : `- ${provider.id}`;
}

function formatMigrationProviderCapabilities(provider: MigrationProviderPlugin): string {
  return [`detect=${provider.detect ? "yes" : "no"}`, "plan=yes", "apply=yes"].join(" ");
}

function collectMigrationProviderPurpose(provider: MigrationProviderPlugin): string[] {
  if (provider.description) {
    return [`  purpose: ${provider.description}`];
  }
  return ["  hint: provider purpose is undocumented; inspect plugin docs before apply."];
}

function collectMigrationProviderHints(provider: MigrationProviderPlugin): string[] {
  const hints: string[] = [];
  if (provider.detect) {
    hints.push("  ready: yes");
    hints.push(
      "  hint: detection is available; start with a plan run to inspect the source safely.",
    );
  } else {
    hints.push("  ready: partial");
    hints.push("  hint: detect unavailable; run migrate with an explicit source path.");
  }
  hints.push(`  next: ${formatCliCommand(`openclaw migrate ${provider.id} --plan`)}`);
  return hints;
}

export function collectMigrationProviderHealthLines(
  params: {
    cfg?: OpenClawConfig;
  } = {},
): string[] {
  const providers = resolvePluginMigrationProviders({ cfg: params.cfg });
  if (providers.length === 0) {
    return ["No migration providers available."];
  }
  return providers.flatMap((provider) => [
    formatMigrationProviderLabel(provider),
    `  supports: ${formatMigrationProviderCapabilities(provider)}`,
    ...collectMigrationProviderPurpose(provider),
    ...collectMigrationProviderHints(provider),
  ]);
}

export async function noteMigrationProviderHealth(
  params: {
    cfg?: OpenClawConfig;
  } = {},
): Promise<void> {
  try {
    note(collectMigrationProviderHealthLines(params).join("\n"), "Migration providers");
  } catch (error) {
    note(
      [
        "Failed to inspect migration providers.",
        `- ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
      "Migration providers",
    );
  }
}
