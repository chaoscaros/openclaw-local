import { describe, expect, it } from "vitest";
import { normalizeDeclaredNodeCommands, resolveNodeCommandAllowlist } from "./node-command-policy.js";

describe("gateway/node-command-policy", () => {
  it("normalizes declared node commands against the allowlist", () => {
    const allowlist = new Set(["canvas.snapshot", "system.run"]);
    expect(
      normalizeDeclaredNodeCommands({
        declaredCommands: [" canvas.snapshot ", "", "system.run", "system.run", "screen.record"],
        allowlist,
      }),
    ).toEqual(["canvas.snapshot", "system.run"]);
  });

  it("allows safe Windows companion defaults without auto-enabling dangerous commands", () => {
    const allowlist = resolveNodeCommandAllowlist(
      {},
      {
        platform: "windows",
        deviceFamily: "windows desktop",
      },
    );

    expect(allowlist.has("canvas.snapshot")).toBe(true);
    expect(allowlist.has("camera.list")).toBe(true);
    expect(allowlist.has("location.get")).toBe(true);
    expect(allowlist.has("device.info")).toBe(true);
    expect(allowlist.has("system.run")).toBe(true);
    expect(allowlist.has("screen.snapshot")).toBe(true);
    expect(allowlist.has("screen.record")).toBe(false);
    expect(allowlist.has("camera.snap")).toBe(false);
  });
});
