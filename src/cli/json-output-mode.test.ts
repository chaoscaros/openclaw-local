import { afterEach, describe, expect, it } from "vitest";
import { loggingState } from "../logging/state.js";
import { hasJsonOutputFlag, withConsoleLogsRoutedToStderrForJson } from "./json-output-mode.js";

describe("json output mode", () => {
  const originalForceConsoleToStderr = loggingState.forceConsoleToStderr;

  afterEach(() => {
    loggingState.forceConsoleToStderr = originalForceConsoleToStderr;
  });

  it("detects --json before the argument terminator only", () => {
    expect(hasJsonOutputFlag(["node", "openclaw", "nodes", "list", "--json"])).toBe(true);
    expect(hasJsonOutputFlag(["node", "openclaw", "nodes", "invoke", "--", "--json"])).toBe(false);
  });

  it("routes console logs to stderr while a json command registers plugins", async () => {
    loggingState.forceConsoleToStderr = false;
    let forceStderrDuringRun = false;

    await withConsoleLogsRoutedToStderrForJson(["openclaw", "status", "--json"], async () => {
      forceStderrDuringRun = loggingState.forceConsoleToStderr;
    });

    expect(forceStderrDuringRun).toBe(true);
    expect(loggingState.forceConsoleToStderr).toBe(false);
  });
});
