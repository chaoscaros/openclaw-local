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
  return [
    `detect=${provider.detect ? "yes" : "no"}`,
    `plan=${provider.plan ? "yes" : "no"}`,
    `apply=${provider.apply ? "yes" : "no"}`,
  ].join(" ");
}

function collectMigrationProviderHints(provider: MigrationProviderPlugin): string[] {
  const hints: string[] = [];
  if (provider.detect) {
    hints.push("  ready: yes");
  } else {
    hints.push("  ready: partial");
    hints.push("  hint: detect unavailable; run migrate with an explicit source path.");
  }
  if (!provider.description) {
    hints.push("  hint: provider has no description.");
  }
  hints.push(`  next: ${formatCliCommand(`openclaw migrate ${provider.id} --plan`)}`);
  return hints;
}

export function collectMigrationProviderHealthLines(params: {
  cfg?: OpenClawConfig;
} = {}): string[] {
  const providers = resolvePluginMigrationProviders({ cfg: params.cfg });
  if (providers.length === 0) {
    return ["No migration providers available."];
  }
  return providers.flatMap((provider) => [
    formatMigrationProviderLabel(provider),
    `  supports: ${formatMigrationProviderCapabilities(provider)}`,
    ...(provider.description ? [`  description: ${provider.description}`] : []),
    ...collectMigrationProviderHints(provider),
  ]);
}

export async function noteMigrationProviderHealth(params: {
  cfg?: OpenClawConfig;
} = {}): Promise<void> {
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
