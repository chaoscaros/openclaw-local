import { describe, expect, it } from "vitest";
import { parsePort } from "./parse-port.js";

describe("parsePort", () => {
  it("returns null for nullish inputs", () => {
    expect(parsePort(undefined)).toBeNull();
    expect(parsePort(null)).toBeNull();
  });

  it("returns null for zero and negative values", () => {
    expect(parsePort(0)).toBeNull();
    expect(parsePort(-1)).toBeNull();
    expect(parsePort("0")).toBeNull();
  });

  it("accepts valid TCP port values", () => {
    expect(parsePort(1)).toBe(1);
    expect(parsePort(8080)).toBe(8080);
    expect(parsePort("3000")).toBe(3000);
    expect(parsePort(65535)).toBe(65535);
  });

  it("rejects port numbers above 65535", () => {
    expect(parsePort(65536)).toBeNull();
    expect(parsePort(99999)).toBeNull();
    expect(parsePort("100000")).toBeNull();
  });

  it("rejects non-integer and non-finite inputs", () => {
    expect(parsePort(1.5)).toBeNull();
    expect(parsePort(Number.NaN)).toBeNull();
    expect(parsePort(Number.POSITIVE_INFINITY)).toBeNull();
    expect(parsePort("abc")).toBeNull();
  });
});
