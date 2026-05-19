import { describe, expect, it } from "vitest";
import { GATEWAY_CLIENT_IDS } from "../../protocol/client-info.js";
import { __testing } from "./message-handler.js";

describe("resolvePinnedClientMetadata", () => {
  it.each([
    [GATEWAY_CLIENT_IDS.IOS_APP, "iOS 26.5.0", "iOS 26.4.2", "iPhone"],
    [GATEWAY_CLIENT_IDS.IOS_APP, "iPadOS 26.5.0", "iPadOS 26.4.2", "iPad"],
    [GATEWAY_CLIENT_IDS.IOS_APP, "iPadOS 26.5.0", "iOS 26.4.2", "iPad"],
    [GATEWAY_CLIENT_IDS.ANDROID_APP, "Android 16", "Android 15", "Android"],
  ])(
    "allows %s platform version refresh without metadata-upgrade approval",
    (clientId, claimedPlatform, pairedPlatform, deviceFamily) => {
      expect(
        __testing.resolvePinnedClientMetadata({
          clientId,
          claimedPlatform,
          claimedDeviceFamily: deviceFamily,
          pairedPlatform,
          pairedDeviceFamily: deviceFamily,
        }),
      ).toEqual({
        platformMismatch: false,
        deviceFamilyMismatch: false,
        pinnedPlatform: claimedPlatform,
        pinnedDeviceFamily: deviceFamily,
        refreshPairedPlatform: claimedPlatform,
      });
    },
  );

  it("still requires approval when an iOS device family changes", () => {
    expect(
      __testing.resolvePinnedClientMetadata({
        clientId: GATEWAY_CLIENT_IDS.IOS_APP,
        claimedPlatform: "iOS 26.5.0",
        claimedDeviceFamily: "iPad",
        pairedPlatform: "iOS 26.4.2",
        pairedDeviceFamily: "iPhone",
      }),
    ).toEqual({
      platformMismatch: false,
      deviceFamilyMismatch: true,
      pinnedPlatform: "iOS 26.5.0",
      pinnedDeviceFamily: "iPhone",
      refreshPairedPlatform: "iOS 26.5.0",
    });
  });

  it("keeps non-mobile platform version changes approval-bound", () => {
    expect(
      __testing.resolvePinnedClientMetadata({
        clientId: "node-host",
        claimedPlatform: "linux 6.9",
        claimedDeviceFamily: "Linux",
        pairedPlatform: "linux 6.8",
        pairedDeviceFamily: "Linux",
      }),
    ).toEqual({
      platformMismatch: true,
      deviceFamilyMismatch: false,
      pinnedPlatform: undefined,
      pinnedDeviceFamily: "Linux",
    });
  });
});
