import { describe, expect, it } from "vitest";
import {
  doSessionKeysMatch,
  findSessionRowByKey,
  toAgentRequestSessionKey,
} from "./session-key.ts";

describe("session key helpers", () => {
  it("normalizes agent store keys back to request keys", () => {
    expect(toAgentRequestSessionKey("agent:solo:main")).toBe("main");
    expect(toAgentRequestSessionKey("main")).toBe("main");
    expect(toAgentRequestSessionKey("")).toBeUndefined();
  });

  it("matches current request keys with stored agent session keys", () => {
    expect(doSessionKeysMatch("main", "agent:solo:main")).toBe(true);
    expect(doSessionKeysMatch("agent:solo:main", "main")).toBe(true);
    expect(doSessionKeysMatch("agent:solo:main", "agent:solo:branch")).toBe(false);
  });

  it("prefers exact session rows before falling back to request-key aliases", () => {
    const rows = [
      { key: "agent:solo:main", label: "agent row" },
      { key: "main", label: "exact row" },
    ];

    expect(findSessionRowByKey(rows, "main")?.label).toBe("exact row");
    expect(findSessionRowByKey(rows, "agent:solo:main")?.label).toBe("agent row");
    expect(findSessionRowByKey(rows, "missing")).toBeUndefined();
  });
});
