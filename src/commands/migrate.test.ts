import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNonExitingRuntime } from "../runtime.js";

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(() => ({})),
  resolveStateDir: vi.fn(() => "/tmp/openclaw-state"),
  resolvePluginMigrationProvider: vi.fn(() => undefined),
  writeRuntimeJson: vi.fn(),
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

vi.mock("../runtime.js", async () => {
  const actual = await vi.importActual<typeof import("../runtime.js")>("../runtime.js");
  return {
    ...actual,
    writeRuntimeJson: mocks.writeRuntimeJson,
  };
});

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
    const logSpy = vi.spyOn(runtime, "log").mockImplementation(() => {});
    mocks.resolvePluginMigrationProvider.mockReturnValue({
      id: "demo",
      label: "Demo",
      detect: vi.fn(async () => ({ found: false, message: "no source" })),
      plan,
      apply: vi.fn(),
    });

    await migrateCommand(runtime, { providerId: "demo" });
    expect(plan).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith("Detection: not found");
  });

  it("fails when detect reports not found in apply mode", async () => {
    const runtime = createNonExitingRuntime();
    const errorSpy = vi.spyOn(runtime, "error").mockImplementation(() => {});
    const plan = vi.fn();
    mocks.resolvePluginMigrationProvider.mockReturnValue({
      id: "demo",
      label: "Demo",
      detect: vi.fn(async () => ({ found: false, message: "no source" })),
      plan,
      apply: vi.fn(),
    });

    await expect(migrateCommand(runtime, { providerId: "demo", apply: true })).rejects.toThrow("exit 1");
    expect(plan).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith("Migration source not found for provider: demo");
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

  it("fails when --plan and --apply are both set", async () => {
    const runtime = createNonExitingRuntime();
    const errorSpy = vi.spyOn(runtime, "error").mockImplementation(() => {});

    await expect(
      migrateCommand(runtime, { providerId: "demo", plan: true, apply: true }),
    ).rejects.toThrow("exit 1");
    expect(errorSpy).toHaveBeenCalledWith("Cannot use --plan and --apply together.");
  });

  it("writes one structured json payload for detect-not-found plan mode", async () => {
    const runtime = createNonExitingRuntime();
    mocks.resolvePluginMigrationProvider.mockReturnValue({
      id: "demo",
      label: "Demo",
      detect: vi.fn(async () => ({ found: false, confidence: "low" as const, message: "no source" })),
      plan: vi.fn(),
      apply: vi.fn(),
    });

    await migrateCommand(runtime, { providerId: "demo", source: "source-dir", json: true });

    expect(mocks.writeRuntimeJson).toHaveBeenCalledTimes(1);
    expect(mocks.writeRuntimeJson).toHaveBeenCalledWith(
      runtime,
      expect.objectContaining({
        provider: { id: "demo", label: "Demo" },
        mode: "plan",
        detection: expect.objectContaining({ found: false, confidence: "low" }),
      }),
    );
  });

  it("writes one structured json payload for plan mode", async () => {
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
    mocks.resolvePluginMigrationProvider.mockReturnValue({
      id: "demo",
      label: "Demo",
      detect: vi.fn(async () => ({ found: true, confidence: "high" as const })),
      plan: vi.fn(async () => planResult),
      apply: vi.fn(),
    });

    await migrateCommand(runtime, { providerId: "demo", source: "source-dir", json: true });

    expect(mocks.writeRuntimeJson).toHaveBeenCalledTimes(1);
    expect(mocks.writeRuntimeJson).toHaveBeenLastCalledWith(
      runtime,
      expect.objectContaining({
        provider: { id: "demo", label: "Demo" },
        mode: "plan",
        detection: expect.objectContaining({ found: true }),
        plan: planResult,
      }),
    );
  });

  it("writes one structured json payload for apply mode", async () => {
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
      summary: { ...planResult.summary, migrated: 1 },
      reportDir: "/tmp/report",
    };
    mocks.resolvePluginMigrationProvider.mockReturnValue({
      id: "demo",
      label: "Demo",
      detect: vi.fn(async () => ({ found: true })),
      plan: vi.fn(async () => planResult),
      apply: vi.fn(async () => applyResult),
    });

    await migrateCommand(runtime, { providerId: "demo", source: "source-dir", apply: true, json: true });

    expect(mocks.writeRuntimeJson).toHaveBeenCalledTimes(1);
    expect(mocks.writeRuntimeJson).toHaveBeenLastCalledWith(
      runtime,
      expect.objectContaining({
        provider: { id: "demo", label: "Demo" },
        mode: "apply",
        plan: planResult,
        result: applyResult,
      }),
    );
  });
});
