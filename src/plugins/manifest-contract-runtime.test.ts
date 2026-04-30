import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/types.openclaw.js";

const mocks = vi.hoisted(() => ({
  loadPluginRegistrySnapshot: vi.fn(() => ({ plugins: [], diagnostics: [] })),
  loadPluginManifestRegistry: vi.fn(() => ({ plugins: [], diagnostics: [] })),
}));

vi.mock("./plugin-registry.js", () => ({
  loadPluginRegistrySnapshot: mocks.loadPluginRegistrySnapshot,
}));

vi.mock("./manifest-registry.js", () => ({
  loadPluginManifestRegistry: mocks.loadPluginManifestRegistry,
}));

let resolveManifestContractRuntimePluginResolution: typeof import("./manifest-contract-runtime.js").resolveManifestContractRuntimePluginResolution;

describe("manifest contract runtime", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const runtime = await import("./manifest-contract-runtime.js");
    resolveManifestContractRuntimePluginResolution = runtime.resolveManifestContractRuntimePluginResolution;
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
        {
          id: "bundledMigration",
          origin: "bundled",
          contracts: { migrationProviders: ["bundled-import"] },
        },
        {
          id: "workspaceMigration",
          origin: "workspace",
          contracts: { migrationProviders: ["workspace-import"] },
        },
        {
          id: "disabledMigration",
          origin: "workspace",
          contracts: { migrationProviders: ["disabled-import"] },
        },
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
        {
          id: "workspaceMigration",
          origin: "workspace",
          contracts: { migrationProviders: ["workspace-import", "other-import"] },
        },
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