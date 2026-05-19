import { beforeEach, describe, expect, it, vi } from "vitest";
import * as browserCliSharedModule from "../browser-cli-shared.js";
import * as cliCoreApiModule from "../core-api.js";

const mocks = vi.hoisted(() => ({
  callBrowserRequest: vi.fn(async (..._args: unknown[]) => ({ result: true })),
}));

vi.spyOn(browserCliSharedModule, "callBrowserRequest").mockImplementation(mocks.callBrowserRequest);

const { createBrowserProgram, getBrowserCliRuntime, getBrowserCliRuntimeCapture } =
  await import("../browser-cli.test-support.js");
const browserCliRuntime = getBrowserCliRuntime();
vi.spyOn(cliCoreApiModule.defaultRuntime, "log").mockImplementation(browserCliRuntime.log);
vi.spyOn(cliCoreApiModule.defaultRuntime, "writeJson").mockImplementation(
  browserCliRuntime.writeJson,
);
vi.spyOn(cliCoreApiModule.defaultRuntime, "error").mockImplementation(browserCliRuntime.error);
vi.spyOn(cliCoreApiModule.defaultRuntime, "exit").mockImplementation(browserCliRuntime.exit);

const { registerBrowserFormWaitEvalCommands } = await import("./register.form-wait-eval.js");

function createActionInputProgram() {
  const { program, browser, parentOpts } = createBrowserProgram();
  registerBrowserFormWaitEvalCommands(browser, parentOpts);
  return program;
}

describe("browser action input evaluate command", () => {
  beforeEach(() => {
    mocks.callBrowserRequest.mockClear();
    getBrowserCliRuntimeCapture().resetRuntimeCapture();
  });

  it("passes timeout-ms through to the evaluate action and outer request", async () => {
    const program = createActionInputProgram();

    await program.parseAsync(
      ["browser", "evaluate", "--fn", "() => true", "--timeout-ms", "30000"],
      { from: "user" },
    );

    const request = mocks.callBrowserRequest.mock.calls.at(-1)?.[1] as
      | { body?: { timeoutMs?: number } }
      | undefined;
    const options = mocks.callBrowserRequest.mock.calls.at(-1)?.[2] as
      | { timeoutMs?: number }
      | undefined;
    expect(request?.body?.timeoutMs).toBe(30000);
    expect(options?.timeoutMs).toBe(35000);
  });
});
