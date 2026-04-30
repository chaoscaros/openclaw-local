import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolvePluginMigrationProviders: vi.fn(() => []),
  note: vi.fn(),
}));

vi.mock("../plugins/migration-provider-runtime.js", () => ({
  resolvePluginMigrationProviders: mocks.resolvePluginMigrationProviders,
}));

vi.mock("../terminal/note.js", () => ({
  note: mocks.note,
}));

let collectMigrationProviderHealthLines: typeof import("./doctor-migration-providers.js").collectMigrationProviderHealthLines;
let noteMigrationProviderHealth: typeof import("./doctor-migration-providers.js").noteMigrationProviderHealth;
let resolveDoctorHealthContributions: typeof import("../flows/doctor-health-contributions.js").resolveDoctorHealthContributions;

describe("doctor migration providers", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    ({ collectMigrationProviderHealthLines, noteMigrationProviderHealth } = await import(
      "./doctor-migration-providers.js"
    ));
    ({ resolveDoctorHealthContributions } = await import("../flows/doctor-health-contributions.js"));
  });

  it("returns a stable empty-state line when no migration providers are available", () => {
    mocks.resolvePluginMigrationProviders.mockReturnValue([]);

    expect(collectMigrationProviderHealthLines()).toEqual(["No migration providers available."]);
  });

  it("formats migration provider labels capabilities and description", () => {
    mocks.resolvePluginMigrationProviders.mockReturnValue([
      {
        id: "anthropic-import",
        label: "Anthropic Import",
        description: "Imports Anthropic settings",
        detect: vi.fn(),
        plan: vi.fn(),
        apply: vi.fn(),
      },
      {
        id: "plain-import",
        label: "plain-import",
        plan: vi.fn(),
        apply: vi.fn(),
      },
    ]);

    expect(collectMigrationProviderHealthLines()).toEqual([
      "- anthropic-import (Anthropic Import)",
      "  supports: detect=yes plan=yes apply=yes",
      "  description: Imports Anthropic settings",
      "- plain-import",
      "  supports: detect=no plan=yes apply=yes",
    ]);
  });

  it("notes provider health under the migration providers title", async () => {
    mocks.resolvePluginMigrationProviders.mockReturnValue([
      {
        id: "demo",
        label: "Demo",
        plan: vi.fn(),
        apply: vi.fn(),
      },
    ]);

    await noteMigrationProviderHealth();

    expect(mocks.note).toHaveBeenCalledWith(
      "- demo (Demo)\n  supports: detect=no plan=yes apply=yes",
      "Migration providers",
    );
  });

  it("notes a readable failure instead of throwing when provider inspection fails", async () => {
    mocks.resolvePluginMigrationProviders.mockImplementation(() => {
      throw new Error("broken registry");
    });

    await expect(noteMigrationProviderHealth()).resolves.toBeUndefined();
    expect(mocks.note).toHaveBeenCalledWith(
      "Failed to inspect migration providers.\n- broken registry",
      "Migration providers",
    );
  });

  it("registers migration providers as a doctor health contribution", () => {
    expect(resolveDoctorHealthContributions().some((entry) => entry.id === "doctor:migration-providers")).toBe(
      true,
    );
  });
});
