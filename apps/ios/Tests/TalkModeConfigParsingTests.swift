import Foundation
import Testing
@testable import OpenClaw

@MainActor
@Suite struct TalkModeManagerTests {
    @Test func resolvesRealtimeVoicePickerOverrides() {
        #expect(TalkModeRealtimeVoiceSelection.resolvedOverride(nil) == nil)
        #expect(TalkModeRealtimeVoiceSelection.resolvedOverride("") == nil)
        #expect(TalkModeRealtimeVoiceSelection.resolvedOverride(" Cedar ") == "cedar")
        #expect(TalkModeRealtimeVoiceSelection.resolvedOverride("unknown") == nil)
    }

    @Test func formatsOpenAIRealtimeVoiceMode() {
        let descriptor = TalkVoiceModeDescriptorBuilder.build(
            providerId: "openai",
            providerLabel: "OpenAI",
            modelId: "gpt-realtime-2",
            voiceId: "marin",
            transport: "webrtc",
            isRealtime: true)

        #expect(descriptor.title == "GPT Realtime 2.0")
        #expect(descriptor.subtitle == "Native WebRTC • Marin")
        #expect(descriptor.accessibilityValue == "GPT Realtime 2.0, Native WebRTC • Marin")
        #expect(descriptor.providerId == "openai")
        #expect(descriptor.modelId == "gpt-realtime-2")
        #expect(descriptor.voiceId == "marin")
        #expect(descriptor.transport == "webrtc")
        #expect(descriptor.isRealtime)
    }

    @Test func formatsGatewayRelayRealtimeVoiceMode() {
        let descriptor = TalkVoiceModeDescriptorBuilder.build(
            providerId: "google",
            providerLabel: "Google Live Voice",
            modelId: "gemini-live-2.5-flash-preview",
            voiceId: nil,
            transport: "gateway-relay",
            isRealtime: true)

        #expect(descriptor.title == "Google Live Voice")
        #expect(descriptor.subtitle == "Gateway Relay • gemini-live-2.5-flash-preview")
    }

    @Test func formatsElevenLabsVoiceMode() {
        let descriptor = TalkVoiceModeDescriptorBuilder.build(
            providerId: "elevenlabs",
            providerLabel: "ElevenLabs",
            modelId: "eleven_v3",
            voiceId: "voice-id",
            transport: "native",
            isRealtime: false)

        #expect(descriptor.title == "ElevenLabs")
        #expect(descriptor.subtitle == "Native • eleven_v3 • voice-id")
    }

    @Test func formatsSystemVoiceFallbackMode() {
        let descriptor = TalkVoiceModeDescriptorBuilder.build(
            providerId: "system",
            providerLabel: "iOS System Voice",
            modelId: nil,
            voiceId: "en-US",
            transport: "native",
            isRealtime: false)

        #expect(descriptor.title == "iOS System Voice")
        #expect(descriptor.subtitle == "Native • en-US")
    }

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
