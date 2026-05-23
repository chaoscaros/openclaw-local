import { describe, expect, it, vi } from "vitest";
import { ensureMatrixCryptoRuntime, ensureMatrixSdkInstalled } from "./deps.js";

const logStub = vi.fn();

describe("ensureMatrixCryptoRuntime", () => {
  it("returns immediately when matrix SDK loads", async () => {
    const runCommand = vi.fn();
    const requireFn = vi.fn(() => ({}));

    await ensureMatrixCryptoRuntime({
      log: logStub,
      requireFn,
      runCommand,
      resolveFn: () => "/tmp/download-lib.js",
      nodeExecutable: "/usr/bin/node",
    });

    expect(requireFn).toHaveBeenCalledTimes(1);
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("bootstraps missing crypto runtime and retries matrix SDK load", async () => {
    let bootstrapped = false;
    const requireFn = vi.fn(() => {
      if (!bootstrapped) {
        throw new Error(
          "Cannot find module '@matrix-org/matrix-sdk-crypto-nodejs-linux-x64-gnu' (required by matrix sdk)",
        );
      }
      return {};
    });
    const runCommand = vi.fn(async () => {
      bootstrapped = true;
      return { code: 0, stdout: "", stderr: "" };
    });

    await ensureMatrixCryptoRuntime({
      log: logStub,
      requireFn,
      runCommand,
      resolveFn: () => "/tmp/download-lib.js",
      nodeExecutable: "/usr/bin/node",
    });

    expect(runCommand).toHaveBeenCalledWith({
      argv: ["/usr/bin/node", "/tmp/download-lib.js"],
      cwd: "/tmp",
      timeoutMs: 300_000,
      env: { COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
    });
    expect(requireFn).toHaveBeenCalledTimes(2);
  });

  it("rethrows non-crypto module errors without bootstrapping", async () => {
    const runCommand = vi.fn();
    const requireFn = vi.fn(() => {
      throw new Error("Cannot find module 'not-the-matrix-crypto-runtime'");
    });

    await expect(
      ensureMatrixCryptoRuntime({
        log: logStub,
        requireFn,
        runCommand,
        resolveFn: () => "/tmp/download-lib.js",
        nodeExecutable: "/usr/bin/node",
      }),
    ).rejects.toThrow("Cannot find module 'not-the-matrix-crypto-runtime'");

    expect(runCommand).not.toHaveBeenCalled();
    expect(requireFn).toHaveBeenCalledTimes(1);
  });
});

describe("ensureMatrixSdkInstalled", () => {
  it("returns without error when all required packages resolve", async () => {
    const resolveFn = vi.fn((_id: string) => "/fake/path");

    await expect(ensureMatrixSdkInstalled({ resolveFn })).resolves.toBeUndefined();

    expect(resolveFn).toHaveBeenCalled();
  });

  it("throws actionable repair error listing every missing package", async () => {
    const resolveFn = vi.fn((_id: string) => {
      throw new Error("Cannot find module");
    });

    await expect(ensureMatrixSdkInstalled({ resolveFn })).rejects.toThrow(
      /Matrix plugin dependencies are missing: matrix-js-sdk, @matrix-org\/matrix-sdk-crypto-nodejs, @matrix-org\/matrix-sdk-crypto-wasm\. Repair this plugin with `openclaw plugins update matrix` or run `openclaw doctor --fix`\./,
    );
  });

  it("lists only the packages that fail to resolve", async () => {
    const resolveFn = vi.fn((id: string) => {
      if (id === "@matrix-org/matrix-sdk-crypto-wasm") {
        throw new Error("Cannot find module");
      }
      return "/fake/path";
    });

    await expect(ensureMatrixSdkInstalled({ resolveFn })).rejects.toThrow(
      /Matrix plugin dependencies are missing: @matrix-org\/matrix-sdk-crypto-wasm\./,
    );
  });

  it("does not invoke the install confirm prompt when packages are missing", async () => {
    const confirm = vi.fn(async () => true);
    const resolveFn = vi.fn((_id: string) => {
      throw new Error("Cannot find module");
    });

    await expect(ensureMatrixSdkInstalled({ resolveFn, confirm })).rejects.toThrow(
      /Matrix plugin dependencies are missing/,
    );
    expect(confirm).not.toHaveBeenCalled();
  });
});
