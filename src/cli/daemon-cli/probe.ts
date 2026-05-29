import { formatErrorMessage } from "../../infra/errors.js";
import { withProgress } from "../progress.js";

function resolveProbeFailureMessage(result: {
  error?: string | null;
  close?: { code: number; reason: string } | null;
}): string {
  const closeHint = result.close
    ? `gateway closed (${result.close.code}): ${result.close.reason}`
    : null;
  if (closeHint && (!result.error || result.error === "timeout")) {
    return closeHint;
  }
  return result.error ?? closeHint ?? "gateway probe failed";
}

function readRuntimeVersionFromStatusPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const runtimeVersion = (payload as { runtimeVersion?: unknown }).runtimeVersion;
  return typeof runtimeVersion === "string" && runtimeVersion.trim()
    ? runtimeVersion.trim()
    : undefined;
}

export async function probeGatewayStatus(opts: {
  url: string;
  token?: string;
  password?: string;
  tlsFingerprint?: string;
  timeoutMs: number;
  json?: boolean;
  requireRpc?: boolean;
  configPath?: string;
}) {
  try {
    let runtimeVersion: string | undefined;
    const result = await withProgress(
      {
        label: "Checking gateway status...",
        indeterminate: true,
        enabled: opts.json !== true,
      },
      async () => {
        if (opts.requireRpc) {
          const { callGateway } = await import("../../gateway/call.js");
          const statusPayload = await callGateway({
            url: opts.url,
            token: opts.token,
            password: opts.password,
            tlsFingerprint: opts.tlsFingerprint,
            method: "status",
            timeoutMs: opts.timeoutMs,
            ...(opts.configPath ? { configPath: opts.configPath } : {}),
          });
          runtimeVersion = readRuntimeVersionFromStatusPayload(statusPayload);
          return { ok: true } as const;
        }
        const { probeGateway } = await import("../../gateway/probe.js");
        return await probeGateway({
          url: opts.url,
          auth: {
            token: opts.token,
            password: opts.password,
          },
          tlsFingerprint: opts.tlsFingerprint,
          timeoutMs: opts.timeoutMs,
          includeDetails: false,
        });
      },
    );
    if (result.ok) {
      return {
        ok: true,
        ...(runtimeVersion ? { version: runtimeVersion } : {}),
      } as const;
    }
    return {
      ok: false,
      error: resolveProbeFailureMessage(result),
    } as const;
  } catch (err) {
    return {
      ok: false,
      error: formatErrorMessage(err),
    } as const;
  }
}
