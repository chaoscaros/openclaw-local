import Foundation

struct GatewaySetupPayload: Codable {
    var url: String?
    var host: String?
    var port: Int?
    var tls: Bool?
    var bootstrapToken: String?
    var token: String?
    var password: String?
}

enum GatewaySetupCode {
    static func decode(raw: String) -> GatewaySetupPayload? {
        if let payload = decodeFromJSON(raw) {
            return payload
        }
        if let decoded = decodeBase64Payload(raw),
           let payload = decodeFromJSON(decoded)
        {
            return payload
        }
        for candidate in setupCodeCandidates(in: raw) where candidate != raw.trimmingCharacters(in: .whitespacesAndNewlines) {
            if let decoded = decodeBase64Payload(candidate),
               let payload = decodeFromJSON(decoded)
            {
                return payload
            }
        }
        return nil
    }

    private static func decodeFromJSON(_ json: String) -> GatewaySetupPayload? {
        guard let data = json.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(GatewaySetupPayload.self, from: data)
    }

    private static func decodeBase64Payload(_ raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let normalized = trimmed
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let padding = normalized.count % 4
        let padded = padding == 0 ? normalized : normalized + String(repeating: "=", count: 4 - padding)
        guard let data = Data(base64Encoded: padded) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func setupCodeCandidates(in input: String) -> [String] {
        let surroundingPunctuation = CharacterSet(charactersIn: "`'\"“”‘’()[]{}<>.,;:")
        return input
            .components(separatedBy: .whitespacesAndNewlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines.union(surroundingPunctuation)) }
            .filter { candidate in
                guard candidate.count >= 24 else { return false }
                return candidate.allSatisfy { ch in
                    ch.isLetter || ch.isNumber || ch == "-" || ch == "_" || ch == "="
                }
            }
    }
}
