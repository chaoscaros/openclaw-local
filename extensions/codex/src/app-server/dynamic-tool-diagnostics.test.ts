import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  emitDynamicToolErrorDiagnostic,
  emitDynamicToolStartedDiagnostic,
  emitDynamicToolTerminalDiagnostic,
} from "./dynamic-tool-diagnostics.js";
import type { CodexDynamicToolCallParams } from "./protocol.js";

const emitTrustedDiagnosticEvent = vi.hoisted(() => vi.fn());

vi.mock("openclaw/plugin-sdk/diagnostic-runtime", () => ({
  emitTrustedDiagnosticEvent,
}));

const call = {
  threadId: "thread-1",
  turnId: "turn-1",
  callId: "call-1",
  tool: "message",
  arguments: { text: "hello" },
} satisfies CodexDynamicToolCallParams;

describe("Codex dynamic tool diagnostics", () => {
  beforeEach(() => {
    emitTrustedDiagnosticEvent.mockClear();
  });

  it("emits started diagnostics", () => {
    emitDynamicToolStartedDiagnostic({
      call,
      runId: "run-1",
      sessionId: "session-1",
      sessionKey: "agent:solo:main",
    });

    expect(emitTrustedDiagnosticEvent).toHaveBeenCalledWith({
      type: "tool.execution.started",
      runId: "run-1",
      sessionId: "session-1",
      sessionKey: "agent:solo:main",
      toolName: "message",
      toolCallId: "call-1",
    });
  });

  it("maps successful responses to completed diagnostics", () => {
    emitDynamicToolTerminalDiagnostic({
      call,
      durationMs: 25,
      response: {
        success: true,
        contentItems: [{ type: "inputText", text: "sent" }],
      },
    });

    expect(emitTrustedDiagnosticEvent).toHaveBeenCalledWith({
      type: "tool.execution.completed",
      runId: undefined,
      sessionId: undefined,
      sessionKey: undefined,
      toolName: "message",
      toolCallId: "call-1",
      durationMs: 25,
    });
  });

  it("maps blocked responses to blocked diagnostics", () => {
    emitDynamicToolTerminalDiagnostic({
      call,
      durationMs: 30,
      response: {
        success: false,
        diagnosticTerminalType: "blocked",
        contentItems: [{ type: "inputText", text: "blocked" }],
      },
    });

    expect(emitTrustedDiagnosticEvent).toHaveBeenCalledWith({
      type: "tool.execution.blocked",
      runId: undefined,
      sessionId: undefined,
      sessionKey: undefined,
      toolName: "message",
      toolCallId: "call-1",
      durationMs: 30,
      deniedReason: "plugin-before-tool-call",
      reason: "Tool call blocked",
    });
  });

  it("maps failed responses and thrown errors to error diagnostics", () => {
    emitDynamicToolTerminalDiagnostic({
      call,
      durationMs: 40,
      response: {
        success: false,
        contentItems: [{ type: "inputText", text: "failed" }],
      },
    });
    emitDynamicToolErrorDiagnostic({ call, durationMs: 41 });

    expect(emitTrustedDiagnosticEvent).toHaveBeenNthCalledWith(1, {
      type: "tool.execution.error",
      runId: undefined,
      sessionId: undefined,
      sessionKey: undefined,
      toolName: "message",
      toolCallId: "call-1",
      durationMs: 40,
      errorCategory: "codex_dynamic_tool_error",
    });
    expect(emitTrustedDiagnosticEvent).toHaveBeenNthCalledWith(2, {
      type: "tool.execution.error",
      runId: undefined,
      sessionId: undefined,
      sessionKey: undefined,
      toolName: "message",
      toolCallId: "call-1",
      durationMs: 41,
      errorCategory: "codex_dynamic_tool_error",
    });
  });
});
