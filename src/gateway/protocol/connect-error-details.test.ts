import { describe, expect, it } from "vitest";
import {
  formatConnectErrorMessage,
  readConnectErrorDetailCode,
  readConnectErrorRecoveryAdvice,
} from "./connect-error-details.js";

describe("readConnectErrorDetailCode", () => {
  it("reads structured detail codes", () => {
    expect(readConnectErrorDetailCode({ code: "AUTH_TOKEN_MISMATCH" })).toBe("AUTH_TOKEN_MISMATCH");
  });

  it("returns null for invalid detail payloads", () => {
    expect(readConnectErrorDetailCode(null)).toBeNull();
    expect(readConnectErrorDetailCode("AUTH_TOKEN_MISMATCH")).toBeNull();
  });
});

describe("readConnectErrorRecoveryAdvice", () => {
  it("reads retry advice fields when present", () => {
    expect(
      readConnectErrorRecoveryAdvice({
        canRetryWithDeviceToken: true,
        recommendedNextStep: "retry_with_device_token",
      }),
    ).toEqual({
      canRetryWithDeviceToken: true,
      recommendedNextStep: "retry_with_device_token",
    });
  });

  it("returns empty advice for invalid payloads", () => {
    expect(readConnectErrorRecoveryAdvice(null)).toEqual({});
    expect(readConnectErrorRecoveryAdvice("x")).toEqual({});
    expect(readConnectErrorRecoveryAdvice({ canRetryWithDeviceToken: "yes" })).toEqual({});
    expect(
      readConnectErrorRecoveryAdvice({
        canRetryWithDeviceToken: true,
        recommendedNextStep: "retry_with_magic",
      }),
    ).toEqual({ canRetryWithDeviceToken: true, recommendedNextStep: undefined });
  });
});

describe("formatConnectErrorMessage", () => {
  it("formats protocol mismatch details with both client and gateway versions", () => {
    expect(
      formatConnectErrorMessage({
        message: "protocol mismatch",
        details: {
          code: "PROTOCOL_MISMATCH",
          clientMinProtocol: 5,
          clientMaxProtocol: 5,
          expectedProtocol: 4,
          minimumProbeProtocol: 4,
        },
      }),
    ).toBe("protocol mismatch: Control UI v5, Gateway v4, probe min v4");
  });

  it("falls back to the raw message for unstructured errors", () => {
    expect(formatConnectErrorMessage({ message: "unauthorized" })).toBe("unauthorized");
    expect(formatConnectErrorMessage({})).toBe("gateway request failed");
  });
});
