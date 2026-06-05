/* @vitest-environment jsdom */

import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import type { AppViewState } from "../app-view-state.ts";
import type { ExecApprovalRequest } from "../controllers/exec-approval.ts";
import { renderExecApprovalPrompt } from "./exec-approval.ts";

function createExecRequest(overrides: Partial<ExecApprovalRequest> = {}): ExecApprovalRequest {
  return {
    id: "approval-1",
    kind: "exec",
    request: { command: "echo hello" },
    createdAtMs: Date.now() - 1_000,
    expiresAtMs: Date.now() + 60_000,
    ...overrides,
  };
}

function createExecState(overrides: Partial<AppViewState> = {}): AppViewState {
  return {
    execApprovalQueue: [createExecRequest()],
    execApprovalBusy: false,
    execApprovalError: null,
    handleExecApprovalDecision: vi.fn(async () => undefined),
    ...overrides,
  } as AppViewState;
}

function renderedButtonLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll(".exec-approval-actions button")).map(
    (button) => button.textContent?.trim() ?? "",
  );
}

describe("renderExecApprovalPrompt", () => {
  it("hides unavailable exec approval decisions", async () => {
    const container = document.createElement("div");
    const request = createExecRequest({
      request: {
        command: "pwd",
        ask: "always",
        allowedDecisions: ["allow-once", "deny"],
      },
    });

    render(renderExecApprovalPrompt(createExecState({ execApprovalQueue: [request] })), container);
    await Promise.resolve();

    expect(renderedButtonLabels(container)).toEqual(["Allow once", "Deny"]);
    expect(container.querySelector(".exec-approval-warning")?.textContent?.trim()).toBe(
      "The effective approval policy requires approval every time, so Allow Always is unavailable.",
    );
  });

  it("falls back to ask when exec approval decisions are omitted", async () => {
    const container = document.createElement("div");
    const request = createExecRequest({
      request: {
        command: "pwd",
        ask: "always",
      },
    });

    render(renderExecApprovalPrompt(createExecState({ execApprovalQueue: [request] })), container);
    await Promise.resolve();

    expect(renderedButtonLabels(container)).toEqual(["Allow once", "Deny"]);
  });

  it("keeps durable exec approval when the request allows it", async () => {
    const container = document.createElement("div");
    const request = createExecRequest({
      request: {
        command: "pwd",
        allowedDecisions: ["allow-once", "allow-always", "deny"],
      },
    });

    render(renderExecApprovalPrompt(createExecState({ execApprovalQueue: [request] })), container);
    await Promise.resolve();

    expect(renderedButtonLabels(container)).toEqual(["Allow once", "Always allow", "Deny"]);
    expect(container.querySelector(".exec-approval-warning")).toBeNull();
  });

  it("does not show exec policy warning for restricted plugin approvals", async () => {
    const container = document.createElement("div");
    const request: ExecApprovalRequest = {
      id: "plugin-approval-1",
      kind: "plugin",
      request: {
        command: "Plugin approval",
        allowedDecisions: ["allow-once", "deny"],
      },
      pluginTitle: "Plugin approval",
      createdAtMs: Date.now() - 1_000,
      expiresAtMs: Date.now() + 60_000,
    };

    render(renderExecApprovalPrompt(createExecState({ execApprovalQueue: [request] })), container);
    await Promise.resolve();

    expect(renderedButtonLabels(container)).toEqual(["Allow once", "Deny"]);
    expect(container.querySelector(".exec-approval-warning")).toBeNull();
  });
});
