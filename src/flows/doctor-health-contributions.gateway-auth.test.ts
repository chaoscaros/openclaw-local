import { beforeEach, describe, expect, it, vi } from "vitest";

const noteMock = vi.fn();

vi.mock("../terminal/note.js", () => ({
  note: (...args: unknown[]) => noteMock(...args),
}));

const { resolveDoctorHealthContributions } = await import("./doctor-health-contributions.js");

function createCtx(mode: "none" | "trusted-proxy") {
  const confirmAutoFix = vi.fn(async () => false);
  return {
    ctx: {
      runtime: {} as never,
      options: {} as never,
      prompter: {
        confirmAutoFix,
      } as never,
      configResult: { cfg: {} } as never,
      cfg: {
        gateway: {
          mode: "local",
          auth: {
            mode,
            ...(mode === "trusted-proxy"
              ? {
                  trustedProxy: {
                    userHeader: "x-user",
                  },
                }
              : {}),
          },
        },
      } as never,
      cfgForPersistence: {} as never,
      sourceConfigValid: true,
      configPath: "/tmp/openclaw.json",
    },
    confirmAutoFix,
  };
}

describe("doctor gateway auth health", () => {
  beforeEach(() => {
    noteMock.mockReset();
  });

  it("does not ask for a token in trusted-proxy mode", async () => {
    const entry = resolveDoctorHealthContributions().find((item) => item.id === "doctor:gateway-auth");
    expect(entry).toBeDefined();
    const { ctx, confirmAutoFix } = createCtx("trusted-proxy");

    await entry!.run(ctx as never);

    expect(confirmAutoFix).not.toHaveBeenCalled();
    expect(noteMock).not.toHaveBeenCalled();
  });

  it("does not ask for a token in none mode", async () => {
    const entry = resolveDoctorHealthContributions().find((item) => item.id === "doctor:gateway-auth");
    expect(entry).toBeDefined();
    const { ctx, confirmAutoFix } = createCtx("none");

    await entry!.run(ctx as never);

    expect(confirmAutoFix).not.toHaveBeenCalled();
    expect(noteMock).not.toHaveBeenCalled();
  });
});