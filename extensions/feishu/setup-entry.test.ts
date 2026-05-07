import { describe, expect, it, vi } from "vitest";

vi.mock("@larksuiteoapi/node-sdk", () => {
  throw new Error("setup plugin load must not load Lark SDK");
});

describe("feishu setup entry", () => {
  it("loads the setup plugin without importing runtime SDK", async () => {
    const { default: setupEntry } = await import("./setup-entry.js");

    expect(setupEntry.kind).toBe("bundled-channel-setup-entry");
    expect(setupEntry.loadSetupPlugin({ installRuntimeDeps: false }).id).toBe("feishu");
  });
});
