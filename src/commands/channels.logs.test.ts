import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetLogger, setLoggerOverride } from "../logging.js";
import { createNonExitingRuntime, type OutputRuntimeEnv } from "../runtime.js";
import { channelsLogsCommand } from "./channels.js";

function logLine(params: { module: string; message: string }) {
  return JSON.stringify({
    0: params.message,
    _meta: {
      name: JSON.stringify({ module: params.module }),
      logLevelName: "INFO",
      date: "2026-05-19T00:00:00.000Z",
    },
  });
}

function createRuntimeCapture(): { runtime: OutputRuntimeEnv; json: unknown[] } {
  const runtime = createNonExitingRuntime();
  const json: unknown[] = [];
  return {
    runtime: {
      ...runtime,
      writeJson: (value) => {
        json.push(value);
      },
    },
    json,
  };
}

describe("channelsLogsCommand", () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-channels-logs-"));
    logPath = path.join(tempDir, "openclaw.log");
    setLoggerOverride({ file: logPath });
  });

  afterEach(async () => {
    resetLogger();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns the first line of the tail window when start aligns with a line boundary", async () => {
    const lineSize = 200;
    const totalLines = 10_000;
    const firstIndex = 5_000;

    const buildLine = (message: string) => {
      const base = logLine({
        module: "gateway/channels/slack/send",
        message,
      });
      const payloadLength = lineSize - 1;
      const padNeeded = payloadLength - Buffer.byteLength(base);
      if (padNeeded < 0) {
        throw new Error(`base log line too long: ${Buffer.byteLength(base)} > ${payloadLength}`);
      }
      const padded = logLine({
        module: "gateway/channels/slack/send",
        message: message + " ".repeat(padNeeded),
      });
      if (Buffer.byteLength(padded) !== payloadLength) {
        throw new Error(`padded line wrong size: ${Buffer.byteLength(padded)} vs ${payloadLength}`);
      }
      return `${padded}\n`;
    };

    const handle = await fs.open(logPath, "w");
    try {
      for (let i = 0; i < totalLines; i += 1) {
        const message =
          i === firstIndex ? "first-line-in-window" : i === totalLines - 1 ? "last-line" : "filler";
        await handle.write(buildLine(message));
      }
    } finally {
      await handle.close();
    }

    const { runtime, json } = createRuntimeCapture();
    await channelsLogsCommand({ json: true, lines: String(totalLines) }, runtime);

    const payload = json[0] as { lines: Array<{ message: string }> };
    const messages = payload.lines.map((line) => line.message.trimEnd());
    expect(messages[0]).toBe("first-line-in-window");
    expect(messages[messages.length - 1]).toBe("last-line");
  });
});
