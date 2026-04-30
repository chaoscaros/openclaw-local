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

function collectLogs(spy: ReturnType<typeof vi.spyOn>) {
  return spy.mock.calls.map(([message]) => String(message));
}

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
      detect: vi.fn(async () => ({
        found: false,
        label: "Old Agent",
        source: "/tmp/old",
        confidence: "low" as const,
        message: "no source",
      })),
      plan,
      apply: vi.fn(),
    });

    await migrateCommand(runtime, { providerId: "demo" });
    const logs = collectLogs(logSpy);

    expect(plan).not.toHaveBeenCalled();
    expect(logs).toEqual([
      "Provider: demo (Demo)",
      "Mode: plan",
      "Detection: not found",
      "  label: Old Agent",
      "  source: /tmp/old",
      "  confidence: low",
      "  message: no source",
    ]);
  });

  it("fails when detect reports not found in apply mode", async () => {
    const runtime = createNonExitingRuntime();
    const errorSpy = vi.spyOn(runtime, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(runtime, "log").mockImplementation(() => {});
    const plan = vi.fn();
    mocks.resolvePluginMigrationProvider.mockReturnValue({
      id: "demo",
      label: "Demo",
      detect: vi.fn(async () => ({
        found: false,
        label: "Old Agent",
        source: "/tmp/old",
        confidence: "low" as const,
        message: "no source",
      })),
      plan,
      apply: vi.fn(),
    });

    await expect(migrateCommand(runtime, { providerId: "demo", apply: true })).rejects.toThrow("exit 1");
    const logs = collectLogs(logSpy);

    expect(plan).not.toHaveBeenCalled();
    expect(logs).toEqual([
      "Provider: demo (Demo)",
      "Mode: apply",
      "Detection: not found",
      "  label: Old Agent",
      "  source: /tmp/old",
      "  confidence: low",
      "  message: no source",
    ]);
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

  it("logs plan text output in stable order with target warnings and next steps", async () => {
    const runtime = createNonExitingRuntime();
    const logSpy = vi.spyOn(runtime, "log").mockImplementation(() => {});
    const planResult = {
      providerId: "demo",
      source: "source-dir",
      target: "target-dir",
      summary: {
        total: 3,
        planned: 2,
        migrated: 0,
        skipped: 1,
        conflicts: 0,
        errors: 0,
        sensitive: 1,
      },
      warnings: ["warn a", "warn b"],
      nextSteps: ["step a", "step b"],
      items: [],
    };
    mocks.resolvePluginMigrationProvider.mockReturnValue({
      id: "demo",
      label: "Demo",
      detect: vi.fn(async () => ({ found: true, confidence: "high" as const })),
      plan: vi.fn(async () => planResult),
      apply: vi.fn(),
    });

    await migrateCommand(runtime, { providerId: "demo", source: "source-dir" });
    const logs = collectLogs(logSpy);

    expect(logs).toEqual([
      "Provider: demo (Demo)",
      "Mode: plan",
      "Detection: found",
      "  confidence: high",
      "Migration provider: demo",
      "Source: source-dir",
      "Target: target-dir",
      "Summary:",
      "  total: 3",
      "  planned: 2",
      "  migrated: 0",
      "  skipped: 1",
      "  conflicts: 0",
      "  errors: 0",
      "  sensitive: 1",
      "Warnings:",
      "  - warn a",
      "  - warn b",
      "Next steps:",
      "  - step a",
      "  - step b",
    ]);
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

  it("logs apply text output with plan before result and backup/report fields", async () => {
    const runtime = createNonExitingRuntime();
    const logSpy = vi.spyOn(runtime, "log").mockImplementation(() => {});
    const planResult = {
      providerId: "demo",
      source: "source-dir",
      target: "target-dir",
      summary: {
        total: 2,
        planned: 2,
        migrated: 0,
        skipped: 0,
        conflicts: 0,
        errors: 0,
        sensitive: 1,
      },
      warnings: ["warn a"],
      nextSteps: ["step a"],
      items: [],
    };
    const applyResult = {
      ...planResult,
      summary: {
        total: 2,
        planned: 2,
        migrated: 2,
        skipped: 0,
        conflicts: 0,
        errors: 0,
        sensitive: 1,
      },
      backupPath: "/tmp/backup.json",
      reportDir: "/tmp/report",
    };
    mocks.resolvePluginMigrationProvider.mockReturnValue({
      id: "demo",
      label: "Demo",
      detect: vi.fn(async () => ({ found: true, source: "source-dir" })),
      plan: vi.fn(async () => planResult),
      apply: vi.fn(async () => applyResult),
    });

    await migrateCommand(runtime, { providerId: "demo", source: "source-dir", apply: true });
    const logs = collectLogs(logSpy);

    expect(logs).toEqual([
      "Provider: demo (Demo)",
      "Mode: apply",
      "Detection: found",
      "  source: source-dir",
      "Migration provider: demo",
      "Source: source-dir",
      "Target: target-dir",
      "Summary:",
      "  total: 2",
      "  planned: 2",
      "  migrated: 0",
      "  skipped: 0",
      "  conflicts: 0",
      "  errors: 0",
      "  sensitive: 1",
      "Warnings:",
      "  - warn a",
      "Next steps:",
      "  - step a",
      "Apply result:",
      "  total: 2",
      "  planned: 2",
      "  migrated: 2",
      "  skipped: 0",
      "  conflicts: 0",
      "  errors: 0",
      "  sensitive: 1",
      "Backup: /tmp/backup.json",
      "Report dir: /tmp/report",
    ]);
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
