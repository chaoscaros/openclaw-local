import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNonExitingRuntime } from "../runtime.js";

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(() => ({})),
  resolveStateDir: vi.fn(() => "/tmp/openclaw-state"),
  resolvePluginMigrationProvider: vi.fn(() => undefined),
}));

vi.mock("../config/config.js", () => ({
  loadConfig: mocks.loadConfig,
}));

vi.mock("../config/paths.js", () => ({
  resolveStateDir: mocks.resolveStateDir,
}));

vi.mock("../plugins/migration-provider-runtime.js", () => ({
  resolvePluginMigrationProvider: mocks.resolvePluginMigrationProvider,
}));

let migrateCommand: typeof import("./migrate.js").migrateCommand;

describe("migrateCommand", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./migrate.js");
    migrateCommand = mod.migrateCommand;
  });

  it("fails when provider is missing", async () => {
    const runtime = createNonExitingRuntime();
    const errorSpy = vi.spyOn(runtime, "error").mockImplementation(() => {});

    await expect(migrateCommand(runtime, { providerId: "missing" })).rejects.toThrow("exit 1");
    expect(errorSpy).toHaveBeenCalledWith("Unknown migration provider: missing");
  });

  it("returns early when detect reports not found in plan mode", async () => {
    const runtime = createNonExitingRuntime();
    const plan = vi.fn();
    mocks.resolvePluginMigrationProvider.mockReturnValue({
      id: "demo",
      label: "Demo",
      detect: vi.fn(async () => ({ found: false, message: "no source" })),
      plan,
      apply: vi.fn(),
    });

    await migrateCommand(runtime, { providerId: "demo" });
    expect(plan).not.toHaveBeenCalled();
  });

  it("runs plan only by default", async () => {
    const runtime = createNonExitingRuntime();
    const planResult = {
      providerId: "demo",
      source: "source-dir",
      summary: {
        total: 1,
        planned: 1,
        migrated: 0,
        skipped: 0,
        conflicts: 0,
        errors: 0,
        sensitive: 0,
      },
      items: [],
    };
    const plan = vi.fn(async () => planResult);
    const apply = vi.fn();
    mocks.resolvePluginMigrationProvider.mockReturnValue({
      id: "demo",
      label: "Demo",
      detect: vi.fn(async () => ({ found: true })),
      plan,
      apply,
    });

    await migrateCommand(runtime, { providerId: "demo", source: "source-dir" });
    expect(plan).toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("runs apply when requested", async () => {
    const runtime = createNonExitingRuntime();
    const planResult = {
      providerId: "demo",
      source: "source-dir",
      summary: {
        total: 1,
        planned: 1,
        migrated: 0,
        skipped: 0,
        conflicts: 0,
        errors: 0,
        sensitive: 0,
      },
      items: [],
    };
    const applyResult = {
      ...planResult,
      summary: {
        ...planResult.summary,
        migrated: 1,
      },
      backupPath: "/tmp/backup.json",
    };
    const plan = vi.fn(async () => planResult);
    const apply = vi.fn(async () => applyResult);
    mocks.resolvePluginMigrationProvider.mockReturnValue({
      id: "demo",
      label: "Demo",
      detect: vi.fn(async () => ({ found: true })),
      plan,
      apply,
    });

    await migrateCommand(runtime, { providerId: "demo", source: "source-dir", apply: true });
    expect(plan).toHaveBeenCalled();
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({ source: "source-dir", stateDir: "/tmp/openclaw-state" }),
      planResult,
    );
  });
});
