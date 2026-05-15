import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import type { PluginManifestRecord, PluginManifestRegistry } from "./manifest-registry.js";
import type { PluginRegistrySnapshot } from "./plugin-registry.js";

const mocks = vi.hoisted(() => ({
  loadPluginRegistrySnapshot: vi.fn<() => PluginRegistrySnapshot>(() => ({
    plugins: [],
    diagnostics: [],
  })),
  loadPluginManifestRegistry: vi.fn<() => PluginManifestRegistry>(() => ({
    plugins: [],
    diagnostics: [],
  })),
}));

vi.mock("./plugin-registry.js", () => ({
  loadPluginRegistrySnapshot: mocks.loadPluginRegistrySnapshot,
}));

vi.mock("./manifest-registry.js", () => ({
  loadPluginManifestRegistry: mocks.loadPluginManifestRegistry,
}));

let resolveManifestContractRuntimePluginResolution: typeof import("./manifest-contract-runtime.js").resolveManifestContractRuntimePluginResolution;

function createManifestPlugin(
  params: Pick<PluginManifestRecord, "id" | "origin" | "contracts">,
): PluginManifestRecord {
  return {
    id: params.id,
    channels: [],
    providers: [],
    cliBackends: [],
    skills: [],
    hooks: [],
    origin: params.origin,
    rootDir: `/tmp/${params.id}`,
    source: params.origin,
    manifestPath: `/tmp/${params.id}/openclaw.plugin.json`,
    contracts: params.contracts,
  };
}

describe("manifest contract runtime", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const runtime = await import("./manifest-contract-runtime.js");
    resolveManifestContractRuntimePluginResolution =
      runtime.resolveManifestContractRuntimePluginResolution;
  });

  it("returns bundled compat ids plus enabled contract owners", () => {
    const cfg = {
      plugins: { entries: { workspaceMigration: { enabled: true } } },
    } as OpenClawConfig;
    mocks.loadPluginRegistrySnapshot.mockReturnValue({
      plugins: [
        { pluginId: "bundledMigration", origin: "bundled", enabled: false },
        { pluginId: "workspaceMigration", origin: "workspace", enabled: true },
        { pluginId: "disabledMigration", origin: "workspace", enabled: false },
      ],
      diagnostics: [],
    });
    mocks.loadPluginManifestRegistry.mockReturnValue({
      plugins: [
        createManifestPlugin({
          id: "bundledMigration",
          origin: "bundled",
          contracts: { migrationProviders: ["bundled-import"] },
        }),
        createManifestPlugin({
          id: "workspaceMigration",
          origin: "workspace",
          contracts: { migrationProviders: ["workspace-import"] },
        }),
        createManifestPlugin({
          id: "disabledMigration",
          origin: "workspace",
          contracts: { migrationProviders: ["disabled-import"] },
        }),
      ],
      diagnostics: [],
    });

    expect(
      resolveManifestContractRuntimePluginResolution({
        cfg,
        contract: "migrationProviders",
      }),
    ).toEqual({
      pluginIds: ["bundledMigration", "workspaceMigration"],
      bundledCompatPluginIds: ["bundledMigration"],
    });
    expect(mocks.loadPluginRegistrySnapshot).toHaveBeenCalledWith({
      config: cfg,
      env: process.env,
      preferPersisted: false,
    });
  });

  it("filters contract owners by specific value", () => {
    mocks.loadPluginRegistrySnapshot.mockReturnValue({
      plugins: [{ pluginId: "workspaceMigration", origin: "workspace", enabled: true }],
      diagnostics: [],
    });
    mocks.loadPluginManifestRegistry.mockReturnValue({
      plugins: [
        createManifestPlugin({
          id: "workspaceMigration",
          origin: "workspace",
          contracts: { migrationProviders: ["workspace-import", "other-import"] },
        }),
      ],
      diagnostics: [],
    });

    expect(
      resolveManifestContractRuntimePluginResolution({
        contract: "migrationProviders",
        value: "workspace-import",
      }),
    ).toEqual({
      pluginIds: ["workspaceMigration"],
      bundledCompatPluginIds: [],
    });
  });
});
