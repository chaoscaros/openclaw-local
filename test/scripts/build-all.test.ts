import { describe, expect, it } from "vitest";
import { BUILD_ALL_STEPS, resolveBuildAllStep } from "../../scripts/build-all.mjs";

describe("scripts/build-all.mjs", () => {
  it("marks A2UI steps as skippable during the default build pipeline", () => {
    const bundleStep = BUILD_ALL_STEPS.find((step) => step.label === "canvas:a2ui:bundle");
    const copyStep = BUILD_ALL_STEPS.find((step) => step.label === "canvas-a2ui-copy");

    expect(bundleStep?.extraEnv).toEqual({ OPENCLAW_A2UI_SKIP_MISSING: "1" });
    expect(copyStep?.extraEnv).toEqual({ OPENCLAW_A2UI_SKIP_MISSING: "1" });
  });

  it("injects the missing-A2UI skip env into build-all step invocations", () => {
    const bundleStep = BUILD_ALL_STEPS.find((step) => step.label === "canvas:a2ui:bundle");
    expect(bundleStep).toBeTruthy();

    const invocation = resolveBuildAllStep(bundleStep, {
      env: {
        PATH: "/usr/bin",
      },
      platform: "linux",
      nodeExecPath: "/usr/bin/node",
    });

    expect(invocation.options.env.OPENCLAW_A2UI_SKIP_MISSING).toBe("1");
  });
});
