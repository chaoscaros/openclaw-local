import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Api, Model } from "@mariozechner/pi-ai";
import {
  abortAgentHarnessRun,
  queueAgentHarnessMessage,
  type AnyAgentTool,
  type EmbeddedRunAttemptParams,
} from "openclaw/plugin-sdk/agent-harness";
import { buildCodexUserMcpServersThreadConfigPatch } from "openclaw/plugin-sdk/codex-mcp-projection";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CodexServerNotification } from "./protocol.js";
import { runCodexAppServerAttempt, __testing } from "./run-attempt.js";
import { writeCodexAppServerBinding } from "./session-binding.js";
import { buildThreadResumeParams, buildTurnStartParams } from "./thread-lifecycle.js";

let tempDir: string;

function createParams(
  sessionFile: string,
  workspaceDir: string,
  config?: EmbeddedRunAttemptParams["config"],
): EmbeddedRunAttemptParams {
  return {
    prompt: "hello",
    sessionId: "session-1",
    sessionKey: "agent:main:session-1",
    sessionFile,
    workspaceDir,
    runId: "run-1",
    provider: "codex",
    modelId: "gpt-5.4-codex",
    model: {
      id: "gpt-5.4-codex",
      name: "gpt-5.4-codex",
      provider: "codex",
      api: "openai-codex-responses",
      input: ["text"],
      reasoning: true,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128_000,
      maxTokens: 8_000,
    } as Model<Api>,
    thinkLevel: "medium",
    disableTools: true,
    timeoutMs: 5_000,
    authStorage: {} as never,
    modelRegistry: {} as never,
    config,
  } as EmbeddedRunAttemptParams;
}

function createTestDynamicTool(name: string, description?: string): AnyAgentTool {
  return {
    name,
    label: name,
    description: description ?? `${name} test tool`,
    parameters: {
      type: "object",
      additionalProperties: false,
    },
    execute: vi.fn(async () => ({
      content: [
        {
          type: "text" as const,
          text: `${name} result. Use process for follow-up.`,
        },
      ],
      details: {},
    })),
  } as AnyAgentTool;
}

function createSandboxContext(backendId: string, options: { network?: string } = {}) {
  return {
    enabled: true,
    backendId,
    sessionKey: "agent:main:session-1",
    workspaceDir: "/tmp/openclaw-sandbox",
    agentWorkspaceDir: "/tmp/openclaw-workspace",
    workspaceAccess: "rw",
    runtimeId: "runtime-1",
    runtimeLabel: backendId,
    containerName: "sandbox-1",
    containerWorkdir: "/workspace",
    docker: { network: options.network ?? "none" },
    tools: {},
    browserAllowHostControl: false,
  } as never;
}

function createDisabledSandboxContext() {
  return { enabled: false } as never;
}

function createDynamicToolBuildInput(
  params: EmbeddedRunAttemptParams,
  workspaceDir: string,
  sandbox = createSandboxContext("ssh"),
) {
  return {
    params,
    resolvedWorkspace: workspaceDir,
    effectiveWorkspace: workspaceDir,
    sandboxSessionKey: params.sessionKey ?? params.sessionId,
    sandbox,
    runAbortController: new AbortController(),
    sessionAgentId: "main",
    onYieldDetected: vi.fn(),
  };
}

function createAppServerHarness(
  requestImpl: (method: string, params: unknown) => Promise<unknown>,
) {
  const requests: Array<{ method: string; params: unknown }> = [];
  let notify: (notification: CodexServerNotification) => Promise<void> = async () => undefined;
  const request = vi.fn(async (method: string, params?: unknown) => {
    requests.push({ method, params });
    return requestImpl(method, params);
  });

  __testing.setCodexAppServerClientFactoryForTests(
    async () =>
      ({
        request,
        addNotificationHandler: (handler: typeof notify) => {
          notify = handler;
          return () => undefined;
        },
        addRequestHandler: () => () => undefined,
      }) as never,
  );

  return {
    request,
    requests,
    async waitForMethod(method: string) {
      await vi.waitFor(() => expect(requests.some((entry) => entry.method === method)).toBe(true));
    },
    async completeTurn(params: { threadId: string; turnId: string }) {
      await notify({
        method: "turn/completed",
        params: {
          threadId: params.threadId,
          turnId: params.turnId,
          turn: { id: params.turnId, status: "completed" },
        },
      });
    },
  };
}

function expectResumeRequest(
  requests: Array<{ method: string; params: unknown }>,
  params: Record<string, unknown>,
) {
  expect(requests).toEqual(
    expect.arrayContaining([
      {
        method: "thread/resume",
        params,
      },
    ]),
  );
}

function createResumeHarness() {
  return createAppServerHarness(async (method) => {
    if (method === "thread/resume") {
      return { thread: { id: "thread-existing" }, modelProvider: "openai" };
    }
    if (method === "turn/start") {
      return { turn: { id: "turn-1", status: "inProgress" } };
    }
    return {};
  });
}

describe("runCodexAppServerAttempt", () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-codex-run-"));
  });

  afterEach(async () => {
    __testing.resetCodexAppServerClientFactoryForTests();
    __testing.resetOpenClawCodingToolsFactoryForTests();
    vi.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("forwards queued user input and aborts the active app-server turn", async () => {
    const { requests, waitForMethod } = createAppServerHarness(async (method, _params) => {
      if (method === "thread/start") {
        return { thread: { id: "thread-1" }, model: "gpt-5.4-codex", modelProvider: "openai" };
      }
      if (method === "turn/start") {
        return { turn: { id: "turn-1", status: "inProgress" } };
      }
      return {};
    });

    const run = runCodexAppServerAttempt(
      createParams(path.join(tempDir, "session.jsonl"), path.join(tempDir, "workspace")),
    );
    await waitForMethod("turn/start");

    expect(queueAgentHarnessMessage("session-1", "more context")).toBe(true);
    await vi.waitFor(() =>
      expect(requests.some((entry) => entry.method === "turn/steer")).toBe(true),
    );
    expect(abortAgentHarnessRun("session-1")).toBe(true);
    await vi.waitFor(() =>
      expect(requests.some((entry) => entry.method === "turn/interrupt")).toBe(true),
    );

    const result = await run;
    expect(result.aborted).toBe(true);
    expect(requests).toEqual(
      expect.arrayContaining([
        {
          method: "thread/start",
          params: expect.objectContaining({
            model: "gpt-5.4-codex",
            modelProvider: "openai",
          }),
        },
        {
          method: "turn/steer",
          params: {
            threadId: "thread-1",
            expectedTurnId: "turn-1",
            input: [{ type: "text", text: "more context" }],
          },
        },
        {
          method: "turn/interrupt",
          params: { threadId: "thread-1", turnId: "turn-1" },
        },
      ]),
    );
  });

  it("does not leak unhandled rejections when shutdown closes before interrupt", async () => {
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason);
    };
    process.on("unhandledRejection", onUnhandledRejection);
    try {
      const { waitForMethod } = createAppServerHarness(async (method, _params) => {
        if (method === "thread/start") {
          return { thread: { id: "thread-1" }, model: "gpt-5.4-codex", modelProvider: "openai" };
        }
        if (method === "turn/start") {
          return { turn: { id: "turn-1", status: "inProgress" } };
        }
        if (method === "turn/interrupt") {
          throw new Error("codex app-server client is closed");
        }
        return {};
      });
      const abortController = new AbortController();
      const params = createParams(
        path.join(tempDir, "session.jsonl"),
        path.join(tempDir, "workspace"),
      );
      params.abortSignal = abortController.signal;

      const run = runCodexAppServerAttempt(params);
      await waitForMethod("turn/start");
      abortController.abort("shutdown");

      await expect(run).resolves.toMatchObject({ aborted: true });
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });

  it("forwards image attachments to the app-server turn input", async () => {
    const { requests, waitForMethod, completeTurn } = createAppServerHarness(async (method) => {
      if (method === "thread/start") {
        return { thread: { id: "thread-1" }, model: "gpt-5.4-codex", modelProvider: "openai" };
      }
      if (method === "turn/start") {
        return { turn: { id: "turn-1", status: "inProgress" } };
      }
      return {};
    });
    const params = createParams(
      path.join(tempDir, "session.jsonl"),
      path.join(tempDir, "workspace"),
    );
    params.model = {
      ...params.model,
      input: ["text", "image"],
    } as Model<Api>;
    params.images = [
      {
        type: "image",
        mimeType: "image/png",
        data: "aW1hZ2UtYnl0ZXM=",
      },
    ];

    const run = runCodexAppServerAttempt(params);
    await waitForMethod("turn/start");
    await completeTurn({ threadId: "thread-1", turnId: "turn-1" });
    await run;

    expect(requests).toEqual(
      expect.arrayContaining([
        {
          method: "turn/start",
          params: expect.objectContaining({
            input: [
              { type: "text", text: "hello" },
              { type: "image", url: "data:image/png;base64,aW1hZ2UtYnl0ZXM=" },
            ],
          }),
        },
      ]),
    );
  });

  it("does not drop turn completion notifications emitted while turn/start is in flight", async () => {
    let notify: (notification: CodexServerNotification) => Promise<void> = async () => undefined;
    const request = vi.fn(async (method: string) => {
      if (method === "thread/start") {
        return { thread: { id: "thread-1" }, model: "gpt-5.4-codex", modelProvider: "openai" };
      }
      if (method === "turn/start") {
        await notify({
          method: "turn/completed",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            turn: { id: "turn-1", status: "completed" },
          },
        });
        return { turn: { id: "turn-1", status: "completed" } };
      }
      return {};
    });
    __testing.setCodexAppServerClientFactoryForTests(
      async () =>
        ({
          request,
          addNotificationHandler: (handler: typeof notify) => {
            notify = handler;
            return () => undefined;
          },
          addRequestHandler: () => () => undefined,
        }) as never,
    );

    await expect(
      runCodexAppServerAttempt(
        createParams(path.join(tempDir, "session.jsonl"), path.join(tempDir, "workspace")),
      ),
    ).resolves.toMatchObject({
      aborted: false,
      timedOut: false,
    });
  });

  it("times out app-server startup before thread setup can hang forever", async () => {
    __testing.setCodexAppServerClientFactoryForTests(() => new Promise<never>(() => undefined));
    const params = createParams(
      path.join(tempDir, "session.jsonl"),
      path.join(tempDir, "workspace"),
    );
    params.timeoutMs = 1;

    await expect(runCodexAppServerAttempt(params)).rejects.toThrow(
      "codex app-server startup timed out",
    );
    expect(queueAgentHarnessMessage("session-1", "after timeout")).toBe(false);
  });

  it("times out turn start before the active run handle is installed", async () => {
    const request = vi.fn(
      async (method: string, _params?: unknown, options?: { timeoutMs?: number }) => {
        if (method === "thread/start") {
          return { thread: { id: "thread-1" }, model: "gpt-5.4-codex", modelProvider: "openai" };
        }
        if (method === "turn/start") {
          return await new Promise<never>((_, reject) => {
            setTimeout(
              () => reject(new Error("turn/start timed out")),
              Math.max(100, options?.timeoutMs ?? 0),
            );
          });
        }
        return {};
      },
    );
    __testing.setCodexAppServerClientFactoryForTests(
      async () =>
        ({
          request,
          addNotificationHandler: () => () => undefined,
          addRequestHandler: () => () => undefined,
        }) as never,
    );
    const params = createParams(
      path.join(tempDir, "session.jsonl"),
      path.join(tempDir, "workspace"),
    );
    params.timeoutMs = 1;

    await expect(runCodexAppServerAttempt(params)).rejects.toThrow("turn/start timed out");
    expect(queueAgentHarnessMessage("session-1", "after timeout")).toBe(false);
  });

  it("keeps extended history enabled when resuming a bound Codex thread", async () => {
    const sessionFile = path.join(tempDir, "session.jsonl");
    const workspaceDir = path.join(tempDir, "workspace");
    await writeCodexAppServerBinding(sessionFile, {
      threadId: "thread-existing",
      cwd: workspaceDir,
      model: "gpt-5.4-codex",
      modelProvider: "openai",
      dynamicToolsFingerprint: "[]",
    });
    const { requests, waitForMethod, completeTurn } = createResumeHarness();

    const run = runCodexAppServerAttempt(createParams(sessionFile, workspaceDir));
    await waitForMethod("turn/start");
    await completeTurn({ threadId: "thread-existing", turnId: "turn-1" });
    await run;

    expectResumeRequest(requests, {
      threadId: "thread-existing",
      model: "gpt-5.4-codex",
      modelProvider: "openai",
      approvalPolicy: "never",
      approvalsReviewer: "user",
      sandbox: "workspace-write",
      persistExtendedHistory: true,
    });
  });

  it("projects configured MCP servers into Codex thread/start config", async () => {
    const { requests, waitForMethod, completeTurn } = createAppServerHarness(async (method) => {
      if (method === "thread/start") {
        return { thread: { id: "thread-1" }, model: "gpt-5.4-codex", modelProvider: "openai" };
      }
      if (method === "turn/start") {
        return { turn: { id: "turn-1", status: "inProgress" } };
      }
      return {};
    });
    const config = {
      mcp: {
        servers: {
          notes: {
            command: "node",
            args: ["/opt/notes-mcp/dist/index.js"],
          },
        },
      },
    } as EmbeddedRunAttemptParams["config"];

    const run = runCodexAppServerAttempt(
      createParams(path.join(tempDir, "session.jsonl"), path.join(tempDir, "workspace"), config),
    );
    await waitForMethod("turn/start");
    await completeTurn({ threadId: "thread-1", turnId: "turn-1" });
    await run;

    expect(requests).toEqual(
      expect.arrayContaining([
        {
          method: "thread/start",
          params: expect.objectContaining({
            config: {
              mcp_servers: {
                notes: {
                  command: "node",
                  args: ["/opt/notes-mcp/dist/index.js"],
                },
              },
            },
          }),
        },
      ]),
    );
  });

  it("starts a fresh Codex thread when configured MCP servers differ from the binding", async () => {
    const sessionFile = path.join(tempDir, "session.jsonl");
    const workspaceDir = path.join(tempDir, "workspace");
    await writeCodexAppServerBinding(sessionFile, {
      threadId: "thread-existing",
      cwd: workspaceDir,
      model: "gpt-5.4-codex",
      modelProvider: "openai",
      dynamicToolsFingerprint: "[]",
    });
    const { requests, waitForMethod, completeTurn } = createAppServerHarness(async (method) => {
      if (method === "thread/start") {
        return { thread: { id: "thread-fresh" }, model: "gpt-5.4-codex", modelProvider: "openai" };
      }
      if (method === "turn/start") {
        return { turn: { id: "turn-1", status: "inProgress" } };
      }
      throw new Error(`unexpected method: ${method}`);
    });
    const config = {
      mcp: {
        servers: {
          notes: {
            command: "node",
            args: ["/opt/notes-mcp/dist/index.js"],
          },
        },
      },
    } as EmbeddedRunAttemptParams["config"];

    const run = runCodexAppServerAttempt(createParams(sessionFile, workspaceDir, config));
    await waitForMethod("turn/start");
    await completeTurn({ threadId: "thread-fresh", turnId: "turn-1" });
    await run;

    expect(requests.some((entry) => entry.method === "thread/resume")).toBe(false);
    expect(requests).toEqual(
      expect.arrayContaining([
        {
          method: "thread/start",
          params: expect.objectContaining({
            config: expect.objectContaining({
              mcp_servers: expect.objectContaining({
                notes: expect.objectContaining({ command: "node" }),
              }),
            }),
          }),
        },
      ]),
    );
  });

  it("preserves configured MCP servers in Codex thread/resume config", async () => {
    const sessionFile = path.join(tempDir, "session.jsonl");
    const workspaceDir = path.join(tempDir, "workspace");
    const config = {
      mcp: {
        servers: {
          notes: {
            command: "node",
            args: ["/opt/notes-mcp/dist/index.js"],
          },
        },
      },
    } as EmbeddedRunAttemptParams["config"];
    const patch = buildCodexUserMcpServersThreadConfigPatch(config);
    await writeCodexAppServerBinding(sessionFile, {
      threadId: "thread-existing",
      cwd: workspaceDir,
      model: "gpt-5.4-codex",
      modelProvider: "openai",
      dynamicToolsFingerprint: "[]",
      userMcpServersFingerprint: patch
        ? JSON.stringify({
            mcp_servers: {
              notes: {
                args: ["/opt/notes-mcp/dist/index.js"],
                command: "node",
              },
            },
          })
        : undefined,
    });
    const { requests, waitForMethod, completeTurn } = createResumeHarness();

    const run = runCodexAppServerAttempt(createParams(sessionFile, workspaceDir, config));
    await waitForMethod("turn/start");
    await completeTurn({ threadId: "thread-existing", turnId: "turn-1" });
    await run;

    expectResumeRequest(requests, {
      threadId: "thread-existing",
      model: "gpt-5.4-codex",
      modelProvider: "openai",
      approvalPolicy: "never",
      approvalsReviewer: "user",
      sandbox: "workspace-write",
      config: {
        mcp_servers: {
          notes: {
            command: "node",
            args: ["/opt/notes-mcp/dist/index.js"],
          },
        },
      },
      persistExtendedHistory: true,
    });
  });

  it("passes configured app-server policy, sandbox, service tier, and model on resume", async () => {
    const sessionFile = path.join(tempDir, "session.jsonl");
    const workspaceDir = path.join(tempDir, "workspace");
    await writeCodexAppServerBinding(sessionFile, {
      threadId: "thread-existing",
      cwd: workspaceDir,
      model: "gpt-5.2",
      modelProvider: "openai",
    });
    const { requests, waitForMethod, completeTurn } = createResumeHarness();

    const run = runCodexAppServerAttempt(createParams(sessionFile, workspaceDir), {
      pluginConfig: {
        appServer: {
          approvalPolicy: "on-request",
          approvalsReviewer: "guardian_subagent",
          sandbox: "danger-full-access",
          serviceTier: "priority",
        },
      },
    });
    await waitForMethod("turn/start");
    await completeTurn({ threadId: "thread-existing", turnId: "turn-1" });
    await run;

    expectResumeRequest(requests, {
      threadId: "thread-existing",
      model: "gpt-5.4-codex",
      modelProvider: "openai",
      approvalPolicy: "on-request",
      approvalsReviewer: "guardian_subagent",
      sandbox: "danger-full-access",
      serviceTier: "priority",
      persistExtendedHistory: true,
    });
    expect(requests).toEqual(
      expect.arrayContaining([
        {
          method: "turn/start",
          params: expect.objectContaining({
            approvalPolicy: "on-request",
            approvalsReviewer: "guardian_subagent",
            serviceTier: "priority",
            model: "gpt-5.4-codex",
          }),
        },
      ]),
    );
  });

  it("forces on-request native approvals during change-review runs", () => {
    const params = createParams("/tmp/session.jsonl", "/tmp/workspace");
    params.changeReviewModeEnabled = true;
    const appServer = {
      start: {
        transport: "stdio" as const,
        command: "codex",
        args: ["app-server", "--listen", "stdio://"],
        headers: {},
      },
      requestTimeoutMs: 60_000,
      approvalPolicy: "never" as const,
      approvalsReviewer: "user" as const,
      sandbox: "workspace-write" as const,
    };

    expect(buildThreadResumeParams(params, { threadId: "thread-1", appServer })).toEqual(
      expect.objectContaining({ approvalPolicy: "on-request" }),
    );
    expect(
      buildTurnStartParams(params, { threadId: "thread-1", cwd: "/tmp/workspace", appServer }),
    ).toEqual(expect.objectContaining({ approvalPolicy: "on-request" }));
  });

  it("builds resume and turn params from the currently selected OpenClaw model", () => {
    const params = createParams("/tmp/session.jsonl", "/tmp/workspace");
    const appServer = {
      start: {
        transport: "stdio" as const,
        command: "codex",
        args: ["app-server", "--listen", "stdio://"],
        headers: {},
      },
      requestTimeoutMs: 60_000,
      approvalPolicy: "on-request" as const,
      approvalsReviewer: "guardian_subagent" as const,
      sandbox: "danger-full-access" as const,
      serviceTier: "priority",
    };

    expect(buildThreadResumeParams(params, { threadId: "thread-1", appServer })).toEqual({
      threadId: "thread-1",
      model: "gpt-5.4-codex",
      modelProvider: "openai",
      approvalPolicy: "on-request",
      approvalsReviewer: "guardian_subagent",
      sandbox: "danger-full-access",
      serviceTier: "priority",
      persistExtendedHistory: true,
    });
    expect(
      buildTurnStartParams(params, { threadId: "thread-1", cwd: "/tmp/workspace", appServer }),
    ).toEqual(
      expect.objectContaining({
        threadId: "thread-1",
        cwd: "/tmp/workspace",
        model: "gpt-5.4-codex",
        approvalPolicy: "on-request",
        approvalsReviewer: "guardian_subagent",
        serviceTier: "priority",
      }),
    );
  });

  it("passes explicit sandbox policy to Codex turn start params", () => {
    const params = createParams("/tmp/session.jsonl", "/tmp/workspace");
    const appServer = {
      start: {
        transport: "stdio" as const,
        command: "codex",
        args: ["app-server", "--listen", "stdio://"],
        headers: {},
      },
      requestTimeoutMs: 60_000,
      approvalPolicy: "on-request" as const,
      approvalsReviewer: "user" as const,
      sandbox: "danger-full-access" as const,
    };
    const sandboxPolicy = {
      type: "workspaceWrite",
      writableRoots: ["/tmp/workspace"],
      networkAccess: false,
      excludeTmpdirEnvVar: false,
      excludeSlashTmp: false,
    };

    expect(
      buildTurnStartParams(params, {
        threadId: "thread-1",
        cwd: "/tmp/workspace",
        appServer,
        sandboxPolicy,
      }),
    ).toEqual(expect.objectContaining({ sandboxPolicy }));
  });

  it("preserves OpenClaw sandbox egress in Codex app-server sandbox policy", () => {
    const appServer = {
      start: {
        transport: "stdio" as const,
        command: "codex",
        args: ["app-server", "--listen", "stdio://"],
        headers: {},
      },
      requestTimeoutMs: 60_000,
      approvalPolicy: "on-request" as const,
      approvalsReviewer: "user" as const,
      sandbox: "workspace-write" as const,
    };

    expect(
      __testing.resolveCodexAppServerSandboxPolicyForOpenClawSandbox(
        appServer,
        createSandboxContext("docker", { network: "none" }),
        "/tmp/workspace",
      ),
    ).toEqual({
      type: "workspaceWrite",
      writableRoots: ["/tmp/workspace"],
      networkAccess: false,
      excludeTmpdirEnvVar: false,
      excludeSlashTmp: false,
    });
    expect(
      __testing.resolveCodexAppServerSandboxPolicyForOpenClawSandbox(
        appServer,
        createSandboxContext("ssh"),
        "/tmp/workspace",
      ),
    ).toEqual(
      expect.objectContaining({
        type: "workspaceWrite",
        networkAccess: true,
      }),
    );
    expect(
      __testing.resolveCodexAppServerSandboxPolicyForOpenClawSandbox(
        { ...appServer, sandbox: "read-only" },
        createSandboxContext("docker", { network: "bridge" }),
        "/tmp/workspace",
      ),
    ).toBeUndefined();
  });

  it("adds sandbox shell dynamic tools for non-Docker sandbox backends", async () => {
    const sessionFile = path.join(tempDir, "session.jsonl");
    const workspaceDir = path.join(tempDir, "workspace");
    const params = createParams(sessionFile, workspaceDir);
    params.disableTools = false;
    __testing.setOpenClawCodingToolsFactoryForTests(() => [
      createTestDynamicTool("exec", "Run shell commands. Use process for follow-up."),
      createTestDynamicTool("process", "Use process to inspect command sessions."),
      createTestDynamicTool("message"),
    ]);

    const tools = await __testing.buildDynamicTools(
      createDynamicToolBuildInput(params, workspaceDir),
    );

    expect(tools.map((tool) => tool.name)).toEqual(["message", "sandbox_exec", "sandbox_process"]);
    expect(tools.find((tool) => tool.name === "sandbox_exec")?.description).toContain(
      "configured ssh sandbox backend",
    );
    expect(tools.find((tool) => tool.name === "sandbox_exec")?.description).toContain(
      "Use sandbox_process for follow-up.",
    );
  });

  it("does not add sandbox shell dynamic tools for Docker or disabled sandboxes", async () => {
    const sessionFile = path.join(tempDir, "session.jsonl");
    const workspaceDir = path.join(tempDir, "workspace");
    const params = createParams(sessionFile, workspaceDir);
    params.disableTools = false;
    __testing.setOpenClawCodingToolsFactoryForTests(() => [
      createTestDynamicTool("exec"),
      createTestDynamicTool("process"),
    ]);

    await expect(
      __testing.buildDynamicTools(
        createDynamicToolBuildInput(params, workspaceDir, createSandboxContext("docker")),
      ),
    ).resolves.toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ name: "sandbox_exec" }),
        expect.objectContaining({ name: "sandbox_process" }),
      ]),
    );
    await expect(
      __testing.buildDynamicTools(
        createDynamicToolBuildInput(params, workspaceDir, createDisabledSandboxContext()),
      ),
    ).resolves.toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ name: "sandbox_exec" }),
        expect.objectContaining({ name: "sandbox_process" }),
      ]),
    );
  });

  it("maps exec allowlist entries to sandbox shell dynamic tools", async () => {
    const sessionFile = path.join(tempDir, "session.jsonl");
    const workspaceDir = path.join(tempDir, "workspace");
    const params = createParams(sessionFile, workspaceDir);
    params.disableTools = false;
    params.toolsAllow = ["exec"];
    __testing.setOpenClawCodingToolsFactoryForTests(() => [
      createTestDynamicTool("exec"),
      createTestDynamicTool("process"),
      createTestDynamicTool("message"),
    ]);

    const tools = await __testing.buildDynamicTools(
      createDynamicToolBuildInput(params, workspaceDir),
    );

    expect(tools.map((tool) => tool.name)).toEqual(["sandbox_exec", "sandbox_process"]);
  });

  it("keeps sandbox exec result guidance pointed at sandbox_process", async () => {
    const execTool = createTestDynamicTool(
      "exec",
      "Run shell commands. Use process for follow-up.",
    );
    const processTool = createTestDynamicTool("process");
    const [sandboxExec] = __testing.addSandboxShellDynamicToolsIfAvailable(
      [],
      [execTool, processTool],
      { sandbox: createSandboxContext("ssh") },
    );

    const result = await sandboxExec.execute("call-1", {}, new AbortController().signal);

    expect(result.content).toEqual([
      {
        type: "text",
        text: "exec result. Use sandbox_process for follow-up.",
      },
    ]);
  });
});
