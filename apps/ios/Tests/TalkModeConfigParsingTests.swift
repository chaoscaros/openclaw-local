import Foundation
import Testing
@testable import OpenClaw

@MainActor
@Suite struct TalkModeManagerTests {
    @Test func speakerphoneDefaultsToEnabledUntilConfigured() {
        let defaults = UserDefaults.standard
        withUserDefaults([
            TalkDefaults.speakerphoneEnabledKey: nil,
        ]) {
            #expect(TalkDefaults.speakerphoneEnabled(defaults: defaults))

            defaults.set(false, forKey: TalkDefaults.speakerphoneEnabledKey)
            #expect(!TalkDefaults.speakerphoneEnabled(defaults: defaults))

            defaults.set(true, forKey: TalkDefaults.speakerphoneEnabledKey)
            #expect(TalkDefaults.speakerphoneEnabled(defaults: defaults))
        }
    }

    @Test func detectsPCMFormatRejectionFromElevenLabsError() {
        let error = NSError(
            domain: "ElevenLabsTTS",
            code: 403,
            userInfo: [
                NSLocalizedDescriptionKey: "ElevenLabs failed: 403 subscription_required output_format=pcm_44100",
            ])
        #expect(TalkModeManager._test_isPCMFormatRejectedByAPI(error))
    }

    @Test func ignoresGenericPlaybackFailuresForPCMFormatRejection() {
        let error = NSError(
            domain: "StreamingAudio",
            code: -1,
            userInfo: [NSLocalizedDescriptionKey: "queue enqueue failed"])
        #expect(TalkModeManager._test_isPCMFormatRejectedByAPI(error) == false)
    }
}
