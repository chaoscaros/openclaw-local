import { embeddedAgentLog, type EmbeddedRunAttemptParams } from "openclaw/plugin-sdk/agent-harness";
import { buildCodexUserMcpServersThreadConfigPatch } from "openclaw/plugin-sdk/codex-mcp-projection";
import type { CodexAppServerClient } from "./client.js";
import type { CodexAppServerRuntimeOptions } from "./config.js";
import {
  isJsonObject,
  type CodexThreadResumeParams,
  type CodexThreadResumeResponse,
  type CodexThreadStartResponse,
  type CodexSandboxPolicy,
  type CodexTurnStartParams,
  type CodexUserInput,
  type JsonObject,
  type JsonValue,
} from "./protocol.js";
import {
  clearCodexAppServerBinding,
  readCodexAppServerBinding,
  writeCodexAppServerBinding,
  type CodexAppServerThreadBinding,
} from "./session-binding.js";

export async function startOrResumeThread(params: {
  client: CodexAppServerClient;
  params: EmbeddedRunAttemptParams;
  cwd: string;
  dynamicTools: JsonValue[];
  appServer: CodexAppServerRuntimeOptions;
}): Promise<CodexAppServerThreadBinding> {
  const dynamicToolsFingerprint = fingerprintDynamicTools(params.dynamicTools);
  const userMcpServersConfigPatch = buildCodexUserMcpServersThreadConfigPatch(params.params.config);
  const userMcpServersFingerprint = fingerprintUserMcpServersConfigPatch(userMcpServersConfigPatch);
  let binding = await readCodexAppServerBinding(params.params.sessionFile);
  if (binding?.threadId && binding.userMcpServersFingerprint !== userMcpServersFingerprint) {
    embeddedAgentLog.debug("codex app-server user MCP config changed; starting a new thread", {
      threadId: binding.threadId,
    });
    await clearCodexAppServerBinding(params.params.sessionFile);
    binding = undefined;
  }
  if (binding?.threadId) {
    // `/codex resume <thread>` writes a binding before the next turn can know
    // the dynamic tool catalog, so only invalidate fingerprints we actually have.
    if (
      binding.dynamicToolsFingerprint &&
      binding.dynamicToolsFingerprint !== dynamicToolsFingerprint
    ) {
      embeddedAgentLog.debug(
        "codex app-server dynamic tool catalog changed; starting a new thread",
        {
          threadId: binding.threadId,
        },
      );
      await clearCodexAppServerBinding(params.params.sessionFile);
    } else {
      try {
        const response = await params.client.request<CodexThreadResumeResponse>(
          "thread/resume",
          buildThreadResumeParams(params.params, {
            threadId: binding.threadId,
            appServer: params.appServer,
            config: userMcpServersConfigPatch,
          }),
        );
        await writeCodexAppServerBinding(params.params.sessionFile, {
          threadId: response.thread.id,
          cwd: params.cwd,
          model: params.params.modelId,
          modelProvider: response.modelProvider ?? normalizeModelProvider(params.params.provider),
          dynamicToolsFingerprint,
          userMcpServersFingerprint,
          createdAt: binding.createdAt,
        });
        return {
          ...binding,
          threadId: response.thread.id,
          cwd: params.cwd,
          model: params.params.modelId,
          modelProvider: response.modelProvider ?? normalizeModelProvider(params.params.provider),
          dynamicToolsFingerprint,
          userMcpServersFingerprint,
        };
      } catch (error) {
        embeddedAgentLog.warn("codex app-server thread resume failed; starting a new thread", {
          error,
        });
        await clearCodexAppServerBinding(params.params.sessionFile);
      }
    }
  }

  const response = await params.client.request<CodexThreadStartResponse>("thread/start", {
    model: params.params.modelId,
    modelProvider: normalizeModelProvider(params.params.provider),
    cwd: params.cwd,
    approvalPolicy: params.appServer.approvalPolicy,
    approvalsReviewer: params.appServer.approvalsReviewer,
    sandbox: params.appServer.sandbox,
    ...(params.appServer.serviceTier ? { serviceTier: params.appServer.serviceTier } : {}),
    ...(userMcpServersConfigPatch ? { config: userMcpServersConfigPatch } : {}),
    serviceName: "OpenClaw",
    developerInstructions: buildDeveloperInstructions(params.params),
    dynamicTools: params.dynamicTools,
    experimentalRawEvents: true,
    persistExtendedHistory: true,
  });
  const createdAt = new Date().toISOString();
  await writeCodexAppServerBinding(params.params.sessionFile, {
    threadId: response.thread.id,
    cwd: params.cwd,
    model: response.model ?? params.params.modelId,
    modelProvider: response.modelProvider ?? normalizeModelProvider(params.params.provider),
    dynamicToolsFingerprint,
    userMcpServersFingerprint,
    createdAt,
  });
  return {
    schemaVersion: 1,
    threadId: response.thread.id,
    sessionFile: params.params.sessionFile,
    cwd: params.cwd,
    model: response.model ?? params.params.modelId,
    modelProvider: response.modelProvider ?? normalizeModelProvider(params.params.provider),
    dynamicToolsFingerprint,
    userMcpServersFingerprint,
    createdAt,
    updatedAt: createdAt,
  };
}

export function buildThreadResumeParams(
  params: EmbeddedRunAttemptParams,
  options: {
    threadId: string;
    appServer: CodexAppServerRuntimeOptions;
    config?: JsonObject;
  },
): CodexThreadResumeParams {
  return {
    threadId: options.threadId,
    model: params.modelId,
    modelProvider: normalizeModelProvider(params.provider),
    approvalPolicy: resolveApprovalPolicyForRun(params, options.appServer),
    approvalsReviewer: options.appServer.approvalsReviewer,
    sandbox: options.appServer.sandbox,
    ...(options.appServer.serviceTier ? { serviceTier: options.appServer.serviceTier } : {}),
    ...(options.config ? { config: options.config } : {}),
    persistExtendedHistory: true,
  };
}

function fingerprintUserMcpServersConfigPatch(
  configPatch: JsonObject | undefined,
): string | undefined {
  return configPatch ? JSON.stringify(stabilizeJsonValue(configPatch)) : undefined;
}

export function buildTurnStartParams(
  params: EmbeddedRunAttemptParams,
  options: {
    threadId: string;
    cwd: string;
    appServer: CodexAppServerRuntimeOptions;
    sandboxPolicy?: CodexSandboxPolicy;
  },
): CodexTurnStartParams {
  return {
    threadId: options.threadId,
    input: buildUserInput(params),
    cwd: options.cwd,
    approvalPolicy: resolveApprovalPolicyForRun(params, options.appServer),
    approvalsReviewer: options.appServer.approvalsReviewer,
    ...(options.sandboxPolicy !== undefined ? { sandboxPolicy: options.sandboxPolicy } : {}),
    model: params.modelId,
    ...(options.appServer.serviceTier ? { serviceTier: options.appServer.serviceTier } : {}),
    effort: resolveReasoningEffort(params.thinkLevel),
  };
}

function fingerprintDynamicTools(dynamicTools: JsonValue[]): string {
  return JSON.stringify(dynamicTools.map(stabilizeJsonValue));
}

function stabilizeJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(stabilizeJsonValue);
  }
  if (!isJsonObject(value)) {
    return value;
  }
  const stable: JsonObject = {};
  for (const [key, child] of Object.entries(value).toSorted(([left], [right]) =>
    left.localeCompare(right),
  )) {
    stable[key] = stabilizeJsonValue(child);
  }
  return stable;
}

function buildDeveloperInstructions(params: EmbeddedRunAttemptParams): string {
  const sections = [
    "You are running inside OpenClaw. Use OpenClaw dynamic tools for messaging, cron, sessions, and host actions when available.",
    "Preserve the user's existing channel/session context. If sending a channel reply, use the OpenClaw messaging tool instead of describing that you would reply.",
    params.changeReviewModeEnabled === true
      ? "Change-review mode is active. Do not use Codex native command/file mutation tools or Python execution for project edits. Use the OpenClaw dynamic write/edit tools so changes stay staged until the user applies them."
      : undefined,
    params.extraSystemPrompt,
    params.skillsSnapshot?.prompt,
  ];
  return sections.filter((section) => typeof section === "string" && section.trim()).join("\n\n");
}

function resolveApprovalPolicyForRun(
  params: EmbeddedRunAttemptParams,
  appServer: CodexAppServerRuntimeOptions,
): CodexAppServerRuntimeOptions["approvalPolicy"] {
  if (params.changeReviewModeEnabled === true) {
    return "on-request";
  }
  return appServer.approvalPolicy;
}

function buildUserInput(params: EmbeddedRunAttemptParams): CodexUserInput[] {
  return [
    { type: "text", text: params.prompt },
    ...(params.images ?? []).map(
      (image): CodexUserInput => ({
        type: "image",
        url: `data:${image.mimeType};base64,${image.data}`,
      }),
    ),
  ];
}

function normalizeModelProvider(provider: string): string {
  return provider === "codex" || provider === "openai-codex" ? "openai" : provider;
}

function resolveReasoningEffort(
  thinkLevel: EmbeddedRunAttemptParams["thinkLevel"],
): "minimal" | "low" | "medium" | "high" | "xhigh" | null {
  if (
    thinkLevel === "minimal" ||
    thinkLevel === "low" ||
    thinkLevel === "medium" ||
    thinkLevel === "high" ||
    thinkLevel === "xhigh"
  ) {
    return thinkLevel;
  }
  return null;
}
