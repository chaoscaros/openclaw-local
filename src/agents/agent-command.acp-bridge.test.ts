import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  persistAcpTurnTranscriptMock: vi.fn(async (_params?: unknown) => undefined),
  deliverAgentCommandResultMock: vi.fn(async (_params?: unknown) => undefined),
  updateSessionStoreAfterAgentRunMock: vi.fn(async (_params?: unknown) => undefined),
  runWithModelFallbackMock: vi.fn(),
  emitAgentEventMock: vi.fn((..._args: unknown[]) => undefined),
  registerAgentRunContextMock: vi.fn((..._args: unknown[]) => undefined),
  clearAgentRunContextMock: vi.fn((..._args: unknown[]) => undefined),
  acpRunTurnMock: vi.fn((_params?: unknown) => undefined),
  resolveAcpDispatchPolicyErrorMock: vi.fn((_cfg?: unknown): Error | null => null),
  resolveAcpExplicitTurnPolicyErrorMock: vi.fn((_cfg?: unknown): Error | null => null),
  resolveAcpAgentPolicyErrorMock: vi.fn((_cfg?: unknown, _agent?: unknown): Error | null => null),
}));

vi.mock("./model-fallback.js", () => ({
  runWithModelFallback: (params: unknown) => state.runWithModelFallbackMock(params),
}));

vi.mock("./command/attempt-execution.runtime.js", () => ({
  buildAcpResult: vi.fn(({ payloadText }: { payloadText: string }) => ({
    payloads: [{ text: payloadText }],
    meta: { durationMs: 1, aborted: false, stopReason: "end_turn", agentMeta: {} },
  })),
  createAcpVisibleTextAccumulator: () => {
    let text = "";
    return {
      consume(chunk: string) {
        text += chunk;
        return { text, delta: chunk };
      },
      finalize: () => text.trim(),
      finalizeRaw: () => text,
    };
  },
  emitAcpAssistantDelta: vi.fn(),
  emitAcpLifecycleEnd: vi.fn(),
  emitAcpLifecycleError: vi.fn(),
  emitAcpLifecycleStart: vi.fn(),
  persistAcpTurnTranscript: (params: unknown) => state.persistAcpTurnTranscriptMock(params),
  runAgentAttempt: vi.fn(),
  sessionFileHasContent: vi.fn(async () => false),
}));

vi.mock("./command/delivery.runtime.js", () => ({
  deliverAgentCommandResult: (params: unknown) => state.deliverAgentCommandResultMock(params),
}));

vi.mock("./command/session-store.runtime.js", () => ({
  updateSessionStoreAfterAgentRun: (params: unknown) =>
    state.updateSessionStoreAfterAgentRunMock(params),
}));

vi.mock("./command/session.js", () => ({
  resolveSession: () => ({
    sessionId: "session-1",
    sessionKey: "agent:main:acp:session-1",
    sessionEntry: { sessionId: "session-1", updatedAt: Date.now() },
    sessionStore: {},
    storePath: "/tmp/store.json",
    isNewSession: true,
    persistedThinking: undefined,
    persistedVerbose: undefined,
  }),
}));

vi.mock("./command/run-context.js", () => ({
  resolveAgentRunContext: () => ({ hasRepliedRef: { current: false } }),
}));

vi.mock("../acp/control-plane/manager.js", () => ({
  getAcpSessionManager: () => ({
    resolveSession: () => ({ kind: "ready", meta: { agent: "codex", cwd: "/tmp" } }),
    runTurn: (params: { onEvent?: (event: unknown) => void }) => {
      state.acpRunTurnMock(params);
      params.onEvent?.({ type: "text_delta", text: "ok", stream: "output" });
      params.onEvent?.({ type: "done", stopReason: "end_turn" });
      return Promise.resolve();
    },
  }),
}));

vi.mock("../acp/policy.js", () => ({
  resolveAcpDispatchPolicyError: (cfg: unknown) => state.resolveAcpDispatchPolicyErrorMock(cfg),
  resolveAcpExplicitTurnPolicyError: (cfg: unknown) =>
    state.resolveAcpExplicitTurnPolicyErrorMock(cfg),
  resolveAcpAgentPolicyError: (cfg: unknown, agent: unknown) =>
    state.resolveAcpAgentPolicyErrorMock(cfg, agent),
}));

vi.mock("../acp/runtime/errors.js", () => ({
  toAcpRuntimeError: ({ error }: { error: Error }) => error,
}));

vi.mock("../acp/runtime/session-identifiers.js", () => ({
  resolveAcpSessionCwd: () => "/tmp/acp-cwd",
}));

vi.mock("../auto-reply/thinking.js", () => ({
  formatThinkingLevels: () => "",
  isThinkingLevelSupported: () => true,
  normalizeThinkLevel: (v?: string) => v || undefined,
  normalizeVerboseLevel: (v?: string) => v || undefined,
  resolveSupportedThinkingLevel: (v?: string) => v || undefined,
}));

vi.mock("../cli/command-format.js", () => ({ formatCliCommand: (v: string) => v }));
vi.mock("../cli/deps.js", () => ({ createDefaultDeps: () => ({}) }));
vi.mock("../infra/agent-events.js", () => ({
  emitAgentEvent: (...args: unknown[]) => state.emitAgentEventMock(...args),
  registerAgentRunContext: (...args: unknown[]) => state.registerAgentRunContextMock(...args),
  clearAgentRunContext: (...args: unknown[]) => state.clearAgentRunContextMock(...args),
}));
vi.mock("../infra/outbound/session-context.js", () => ({
  buildOutboundSessionContext: () => ({}),
}));
vi.mock("../logging/subsystem.js", () => ({ createSubsystemLogger: () => ({ warn: vi.fn() }) }));
vi.mock("../routing/session-key.js", () => ({
  normalizeAgentId: (v: string) => v,
  resolveAgentIdFromSessionKey: () => "codex",
}));
vi.mock("../runtime.js", () => ({ defaultRuntime: {} }));
vi.mock("../sessions/level-overrides.js", () => ({ applyVerboseOverride: vi.fn() }));
vi.mock("../sessions/model-overrides.js", () => ({
  applyModelOverrideToSessionEntry: () => ({ updated: false }),
}));
vi.mock("../sessions/send-policy.js", () => ({ resolveSendPolicy: () => "allow" }));
vi.mock("../shared/string-coerce.js", async () => {
  const actual = await vi.importActual<typeof import("../shared/string-coerce.js")>(
    "../shared/string-coerce.js",
  );
  return {
    ...actual,
    normalizeOptionalString: (v?: string) => v?.trim() || undefined,
  };
});
vi.mock("../terminal/ansi.js", () => ({ sanitizeForLog: (s: string) => s }));
vi.mock("../trajectory/runtime.js", () => ({ createTrajectoryRuntimeRecorder: () => ({}) }));
vi.mock("../utils/message-channel.js", () => ({ resolveMessageChannel: () => "test" }));
vi.mock("./agent-runtime-config.js", () => ({
  resolveAgentRuntimeConfig: async () => ({ cfg: {} }),
}));
vi.mock("./agent-scope.js", () => ({
  listAgentIds: () => ["codex"],
  resolveAgentDir: () => "/tmp/agent",
  resolveEffectiveModelFallbacks: () => undefined,
  resolveSessionAgentId: () => "codex",
  resolveAgentSkillsFilter: () => undefined,
  resolveAgentWorkspaceDir: () => "/tmp/workspace",
}));
vi.mock("./command/attempt-execution.shared.js", async () => {
  const actual = await vi.importActual<typeof import("./command/attempt-execution.shared.js")>(
    "./command/attempt-execution.shared.js",
  );
  return actual;
});
vi.mock("./defaults.js", () => ({ DEFAULT_MODEL: "gpt-5.4", DEFAULT_PROVIDER: "openai" }));
vi.mock("./model-catalog.js", () => ({ loadModelCatalog: async () => ({}) }));
vi.mock("./model-selection.js", () => ({
  buildAllowedModelSet: () => new Set(),
  modelKey: (p: string, m: string) => `${p}/${m}`,
  normalizeModelRef: (v: string) => v,
  parseModelRef: (v: string) => ({ provider: "openai", model: v }),
  resolveConfiguredModelRef: () => ({ provider: "openai", model: "gpt-5.4" }),
  resolveDefaultModelForAgent: () => ({ provider: "openai", model: "gpt-5.4" }),
  resolveThinkingDefault: () => undefined,
}));
vi.mock("./pi-embedded-runner/result-fallback-classifier.js", () => ({
  classifyEmbeddedPiRunResultForModelFallback: () => null,
}));
vi.mock("./provider-auth-aliases.js", () => ({ resolveProviderIdForAuth: (v: string) => v }));
vi.mock("./spawned-context.js", () => ({ normalizeSpawnedRunMetadata: (v: unknown) => v ?? {} }));
vi.mock("./timeout.js", () => ({ resolveAgentTimeoutMs: () => 30000 }));
vi.mock("./workspace.js", () => ({
  ensureAgentWorkspace: async () => ({ dir: "/tmp/workspace" }),
}));

describe("agent-command ACP bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.deliverAgentCommandResultMock.mockResolvedValue(undefined);
    state.updateSessionStoreAfterAgentRunMock.mockResolvedValue(undefined);
    state.runWithModelFallbackMock.mockImplementation(
      async (params: {
        run: (provider: string, model: string) => Promise<unknown>;
        provider: string;
        model: string;
      }) => {
        const result = await params.run(params.provider, params.model);
        return { result, provider: params.provider, model: params.model, attempts: [] };
      },
    );
    state.resolveAcpDispatchPolicyErrorMock.mockReturnValue(null);
    state.resolveAcpExplicitTurnPolicyErrorMock.mockReturnValue(null);
    state.resolveAcpAgentPolicyErrorMock.mockReturnValue(null);
  });

  it("persists transcriptMessage instead of runtime-context body for ACP turns", async () => {
    const { agentCommand } = await import("./agent-command.js");
    await agentCommand({
      message: "[[internal runtime context]] visible body",
      transcriptMessage: "visible transcript",
      sessionKey: "agent:main:acp:session-1",
      senderIsOwner: true,
      acpTurnSource: "manual_spawn",
    });

    expect(state.persistAcpTurnTranscriptMock).toHaveBeenCalledWith(
      expect.objectContaining({ body: "visible transcript" }),
    );
  });

  it("uses explicit-turn ACP policy for manual spawn turns", async () => {
    state.resolveAcpDispatchPolicyErrorMock.mockReturnValue(new Error("dispatch disabled"));
    state.resolveAcpExplicitTurnPolicyErrorMock.mockReturnValue(null);
    const { agentCommand } = await import("./agent-command.js");

    await expect(
      agentCommand({
        message: "hello",
        sessionKey: "agent:main:acp:session-1",
        senderIsOwner: true,
        acpTurnSource: "manual_spawn",
      }),
    ).resolves.toBeUndefined();
  });
});
