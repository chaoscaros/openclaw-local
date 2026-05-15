import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import type { ManifestContractRuntimePluginResolution } from "./manifest-contract-runtime.js";
import { createEmptyPluginRegistry } from "./registry-empty.js";
import type { PluginRegistry } from "./registry-types.js";

const mocks = vi.hoisted(() => ({
  resolveRuntimePluginRegistry: vi.fn<(params?: unknown) => PluginRegistry | undefined>(
    () => undefined,
  ),
  resolveManifestContractRuntimePluginResolution: vi.fn<
    () => ManifestContractRuntimePluginResolution
  >(() => ({ pluginIds: [], bundledCompatPluginIds: [] })),
  withBundledPluginAllowlistCompat: vi.fn(
    ({ config }: { config?: OpenClawConfig; pluginIds: string[] }) => config,
  ),
  withBundledPluginEnablementCompat: vi.fn(
    ({ config }: { config?: OpenClawConfig; pluginIds: string[] }) => config,
  ),
  withBundledPluginVitestCompat: vi.fn(
    ({ config }: { config?: OpenClawConfig; pluginIds: string[] }) => config,
  ),
}));

vi.mock("./loader.js", () => ({
  resolveRuntimePluginRegistry: mocks.resolveRuntimePluginRegistry,
}));

vi.mock("./manifest-contract-runtime.js", () => ({
  resolveManifestContractRuntimePluginResolution:
    mocks.resolveManifestContractRuntimePluginResolution,
}));

vi.mock("./bundled-compat.js", () => ({
  withBundledPluginAllowlistCompat: mocks.withBundledPluginAllowlistCompat,
  withBundledPluginEnablementCompat: mocks.withBundledPluginEnablementCompat,
  withBundledPluginVitestCompat: mocks.withBundledPluginVitestCompat,
}));

let resolvePluginMigrationProvider: typeof import("./migration-provider-runtime.js").resolvePluginMigrationProvider;
let resolvePluginMigrationProviders: typeof import("./migration-provider-runtime.js").resolvePluginMigrationProviders;

function createMigrationProvider(id: string) {
  return {
    id,
    label: id,
    plan: vi.fn(),
    apply: vi.fn(),
  };
}

describe("migration provider runtime", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.resolveRuntimePluginRegistry.mockReturnValue(createEmptyPluginRegistry());
    mocks.resolveManifestContractRuntimePluginResolution.mockReturnValue({
      pluginIds: [],
      bundledCompatPluginIds: [],
    });
    const runtime = await import("./migration-provider-runtime.js");
    resolvePluginMigrationProvider = runtime.resolvePluginMigrationProvider;
    resolvePluginMigrationProviders = runtime.resolvePluginMigrationProviders;
  });

  it("loads configured external migration-provider plugins from manifest contracts", () => {
    const cfg = {
      plugins: { entries: { "external-migration": { enabled: true } } },
    } as OpenClawConfig;
    const provider = createMigrationProvider("external-import");
    const active = createEmptyPluginRegistry();
    const loaded = createEmptyPluginRegistry();
    loaded.migrationProviders.push({
      pluginId: "external-migration",
      pluginName: "External Migration",
      source: "test",
      provider,
    });
    mocks.resolveRuntimePluginRegistry.mockImplementation((params?: unknown) =>
      params === undefined ? active : loaded,
    );
    mocks.resolveManifestContractRuntimePluginResolution.mockReturnValue({
      pluginIds: ["external-migration"],
      bundledCompatPluginIds: [],
    });

    const resolved = resolvePluginMigrationProvider({ providerId: "external-import", cfg });

    expect(resolved).toBe(provider);
    expect(mocks.resolveManifestContractRuntimePluginResolution).toHaveBeenCalledWith({
      cfg,
      contract: "migrationProviders",
      value: "external-import",
    });
    expect(mocks.resolveRuntimePluginRegistry).toHaveBeenCalledWith();
    expect(mocks.resolveRuntimePluginRegistry).toHaveBeenCalledWith({
      config: cfg,
      onlyPluginIds: ["external-migration"],
      activate: false,
    });
  });

  it("derives bundled compat config when loading bundled migration providers", () => {
    const provider = createMigrationProvider("hermes");
    const active = createEmptyPluginRegistry();
    const loaded = createEmptyPluginRegistry();
    loaded.migrationProviders.push({
      pluginId: "migrate-hermes",
      pluginName: "Hermes Migration",
      source: "test",
      provider,
    });
    mocks.resolveRuntimePluginRegistry.mockImplementation((params?: unknown) =>
      params === undefined ? active : loaded,
    );
    mocks.resolveManifestContractRuntimePluginResolution.mockReturnValue({
      pluginIds: ["migrate-hermes"],
      bundledCompatPluginIds: ["migrate-hermes"],
    });

    const resolved = resolvePluginMigrationProvider({ providerId: "hermes" });

    expect(resolved).toBe(provider);
    expect(mocks.withBundledPluginAllowlistCompat).toHaveBeenCalledWith({
      config: undefined,
      pluginIds: ["migrate-hermes"],
    });
    expect(mocks.withBundledPluginEnablementCompat).toHaveBeenCalledWith({
      config: undefined,
      pluginIds: ["migrate-hermes"],
    });
    expect(mocks.withBundledPluginVitestCompat).toHaveBeenCalledWith({
      config: undefined,
      pluginIds: ["migrate-hermes"],
      env: process.env,
    });
    expect(mocks.resolveRuntimePluginRegistry).toHaveBeenCalledWith({
      onlyPluginIds: ["migrate-hermes"],
      activate: false,
    });
  });

  it("lists configured external migration providers alongside active providers", () => {
    const activeProvider = createMigrationProvider("active-import");
    const externalProvider = createMigrationProvider("external-import");
    const active = createEmptyPluginRegistry();
    active.migrationProviders.push({
      pluginId: "active-migration",
      pluginName: "Active Migration",
      source: "test",
      provider: activeProvider,
    });
    const loaded = createEmptyPluginRegistry();
    loaded.migrationProviders.push({
      pluginId: "external-migration",
      pluginName: "External Migration",
      source: "test",
      provider: externalProvider,
    });
    mocks.resolveRuntimePluginRegistry.mockImplementation((params?: unknown) =>
      params === undefined ? active : loaded,
    );
    mocks.resolveManifestContractRuntimePluginResolution.mockReturnValue({
      pluginIds: ["external-migration"],
      bundledCompatPluginIds: [],
    });

    expect(resolvePluginMigrationProviders().map((provider) => provider.id)).toEqual([
      "active-import",
      "external-import",
    ]);
  });
});
