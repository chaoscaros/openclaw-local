import { describe, expect, it, vi } from "vitest";

vi.mock("./src/channel.js", () => {
  throw new Error("setup plugin load must not import qqbot runtime channel surface");
});

describe("qqbot setup entry", () => {
  it("loads the setup plugin without importing runtime channel surface", async () => {
    const { default: setupEntry } = await import("./setup-entry.js");

    expect(setupEntry.kind).toBe("bundled-channel-setup-entry");
    expect(setupEntry.loadSetupPlugin().id).toBe("qqbot");
  });
});
