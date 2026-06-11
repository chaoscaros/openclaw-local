import Foundation
import OpenClawKit

enum TalkModeExecutionMode {
    case native
    case realtimeClient
    case realtimeRelay
}

struct TalkVoiceModeDescriptor: Equatable {
    let title: String
    let subtitle: String?
    let providerId: String?
    let modelId: String?
    let voiceId: String?
    let transport: String?
    let isRealtime: Bool

    var accessibilityValue: String {
        if let subtitle, !subtitle.isEmpty {
            return "\(self.title), \(subtitle)"
        }
        return self.title
    }
}

enum TalkVoiceModeDescriptorBuilder {
    static func build(
        providerId: String,
        providerLabel: String,
        modelId: String?,
        voiceId: String?,
        transport: String?,
        isRealtime: Bool
    ) -> TalkVoiceModeDescriptor {
        let normalizedProvider = providerId.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let trimmedModel = Self.trimmed(modelId)
        let trimmedVoice = Self.trimmed(voiceId)
        let trimmedTransport = Self.trimmed(transport)
        let title = if isRealtime, normalizedProvider == "openai", trimmedModel == "gpt-realtime-2" {
            "GPT Realtime 2.0"
        } else if isRealtime, normalizedProvider == "openai" {
            "OpenAI Realtime"
        } else if isRealtime {
            providerLabel.isEmpty ? "Realtime Voice" : providerLabel
        } else if normalizedProvider == "system" {
            "iOS System Voice"
        } else {
            providerLabel.isEmpty ? "Talk Voice" : providerLabel
        }

        var details: [String] = []
        if isRealtime, normalizedProvider != "openai", !providerLabel.isEmpty, providerLabel != title {
            details.append(providerLabel)
        }
        if let trimmedTransport {
            details.append(Self.transportLabel(trimmedTransport))
        }
        if let trimmedModel, title != "GPT Realtime 2.0" || trimmedModel != "gpt-realtime-2" {
            details.append(trimmedModel)
        }
        if let trimmedVoice {
            details.append(Self.voiceLabel(trimmedVoice))
        }

        return TalkVoiceModeDescriptor(
            title: title,
            subtitle: details.isEmpty ? nil : details.joined(separator: " • "),
            providerId: normalizedProvider.isEmpty ? nil : normalizedProvider,
            modelId: trimmedModel,
            voiceId: trimmedVoice,
            transport: trimmedTransport,
            isRealtime: isRealtime)
    }

    private static func trimmed(_ value: String?) -> String? {
        let trimmed = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private static func voiceLabel(_ voice: String) -> String {
        TalkModeRealtimeVoiceSelection.voices.contains(voice)
            ? TalkModeRealtimeVoiceSelection.label(for: voice)
            : voice
    }

    private static func transportLabel(_ transport: String) -> String {
        switch transport.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "webrtc":
            "Native WebRTC"
        case "gateway-relay":
            "Gateway Relay"
        case "provider-websocket":
            "Provider WebSocket"
        case "managed-room":
            "Managed Room"
        case "native":
            "Native"
        case let value where !value.isEmpty:
            value
        default:
            "Native"
        }
    }
}

enum TalkModeProviderSelection: String, CaseIterable, Identifiable {
    case gatewayDefault = "gateway"
    case nativeElevenLabs = "elevenlabs"
    case openAIRealtime = "openai-realtime"

    static let storageKey = "talk.providerSelection"

    var id: String {
        self.rawValue
    }

    var label: String {
        switch self {
        case .gatewayDefault:
            "Gateway Default"
        case .nativeElevenLabs:
            "ElevenLabs"
        case .openAIRealtime:
            "Realtime-2 (OpenAI)"
        }
    }

    static func resolved(_ raw: String?) -> TalkModeProviderSelection {
        let trimmed = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return TalkModeProviderSelection(rawValue: trimmed) ?? .gatewayDefault
    }
}

enum TalkModeRealtimeVoiceSelection {
    static let storageKey = "talk.realtime.voiceSelection"
    static let voices = [
        "alloy",
        "ash",
        "ballad",
        "coral",
        "echo",
        "sage",
        "shimmer",
        "verse",
        "marin",
        "cedar",
    ]

    static func resolvedOverride(_ raw: String?) -> String? {
        let trimmed = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !trimmed.isEmpty else { return nil }
        return Self.voices.contains(trimmed) ? trimmed : nil
    }

    static func label(for voice: String) -> String {
        voice.prefix(1).uppercased() + String(voice.dropFirst())
    }
}

struct TalkModeGatewayConfigState {
    let activeProvider: String
    let normalizedPayload: Bool
    let missingResolvedPayload: Bool
    let defaultVoiceId: String?
    let voiceAliases: [String: String]
    let defaultModelId: String
    let defaultOutputFormat: String?
    let rawConfigApiKey: String?
    let interruptOnSpeech: Bool?
    let silenceTimeoutMs: Int
}

enum TalkModeGatewayConfigParser {
    static func parse(
        config: [String: Any],
        defaultProvider: String,
        defaultModelIdFallback: String,
        defaultSilenceTimeoutMs: Int
    ) -> TalkModeGatewayConfigState {
        let talk = TalkConfigParsing.bridgeFoundationDictionary(config["talk"] as? [String: Any])
        let selection = TalkConfigParsing.selectProviderConfig(
            talk,
            defaultProvider: defaultProvider,
            allowLegacyFallback: false)
        let activeProvider = selection?.provider ?? defaultProvider
        let activeConfig = selection?.config
        let defaultVoiceId = activeConfig?["voiceId"]?.stringValue?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let voiceAliases: [String: String]
        if let aliases = activeConfig?["voiceAliases"]?.dictionaryValue {
            var resolved: [String: String] = [:]
            for (key, value) in aliases {
                guard let id = value.stringValue else { continue }
                let normalizedKey = key.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                let trimmedId = id.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !normalizedKey.isEmpty, !trimmedId.isEmpty else { continue }
                resolved[normalizedKey] = trimmedId
            }
            voiceAliases = resolved
        } else {
            voiceAliases = [:]
        }
        let model = activeConfig?["modelId"]?.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines)
        let defaultModelId = (model?.isEmpty == false) ? model! : defaultModelIdFallback
        let defaultOutputFormat = activeConfig?["outputFormat"]?.stringValue?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let rawConfigApiKey = activeConfig?["apiKey"]?.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines)
        let interruptOnSpeech = talk?["interruptOnSpeech"]?.boolValue
        let silenceTimeoutMs = TalkConfigParsing.resolvedSilenceTimeoutMs(
            talk,
            fallback: defaultSilenceTimeoutMs)

        return TalkModeGatewayConfigState(
            activeProvider: activeProvider,
            normalizedPayload: selection?.normalizedPayload == true,
            missingResolvedPayload: talk != nil && selection == nil,
            defaultVoiceId: defaultVoiceId,
            voiceAliases: voiceAliases,
            defaultModelId: defaultModelId,
            defaultOutputFormat: defaultOutputFormat,
            rawConfigApiKey: rawConfigApiKey,
            interruptOnSpeech: interruptOnSpeech,
            silenceTimeoutMs: silenceTimeoutMs)
    }
}
