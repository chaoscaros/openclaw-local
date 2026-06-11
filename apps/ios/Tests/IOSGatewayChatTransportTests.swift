import OpenClawKit
import Foundation
import Testing
@testable import OpenClaw

@Suite struct IOSGatewayChatTransportTests {
    private func object(from json: String) throws -> [String: Any] {
        let data = try #require(json.data(using: .utf8))
        let value = try JSONSerialization.jsonObject(with: data)
        return try #require(value as? [String: Any])
    }

    @Test func createSessionParamsIncludeParentKey() throws {
        let json = try IOSGatewayChatTransport.makeCreateSessionParamsJSON(
            key: "agent:aiden:ios-123",
            label: nil,
            parentSessionKey: "agent:aiden:main")
        let data = try #require(json.data(using: .utf8))
        let object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])

        #expect(object["key"] as? String == "agent:aiden:ios-123")
        #expect(object["parentSessionKey"] as? String == "agent:aiden:main")
        #expect(object["label"] == nil)
    }

    @Test func listSessionsParamsIncludeGlobalSessionsButNotUnknown() throws {
        let params = try self.object(from: IOSGatewayChatTransport.makeListSessionsParamsJSON(limit: 12))
        #expect(params["includeGlobal"] as? Bool == true)
        #expect(params["includeUnknown"] as? Bool == false)
        #expect(params["limit"] as? Int == 12)
    }

    @Test func chatSendParamsOmitEmptyAttachmentsAndKeepSessionFields() throws {
        let params = try self.object(
            from: IOSGatewayChatTransport.makeChatSendParamsJSON(
                sessionKey: "agent:main",
                message: "hello",
                thinking: "low",
                idempotencyKey: "send-1",
                attachments: []))
        #expect(params["sessionKey"] as? String == "agent:main")
        #expect(params["message"] as? String == "hello")
        #expect(params["thinking"] as? String == "low")
        #expect(params["idempotencyKey"] as? String == "send-1")
        #expect(params["timeoutMs"] as? Int == IOSGatewayChatTransport.defaultChatSendTimeoutMs)
        #expect(params["attachments"] == nil)
    }

    @Test func agentWaitTimeoutAddsRequestGracePeriod() {
        #expect(IOSGatewayChatTransport.agentWaitRequestTimeoutSeconds(timeoutMs: 1) == 6)
        #expect(IOSGatewayChatTransport.agentWaitRequestTimeoutSeconds(timeoutMs: 30_000) == 35)
    }

    @Test func decodesAgentWaitCompletionStatuses() throws {
        let ok = try IOSGatewayChatTransport.decodeAgentWaitCompletion(
            Data(#"{"runId":"run-1","status":"completed"}"#.utf8),
            fallbackRunId: "fallback")
        #expect(ok == .init(runId: "run-1", status: "completed", completed: true))

        let timeout = try IOSGatewayChatTransport.decodeAgentWaitCompletion(
            Data(#"{"status":"timeout"}"#.utf8),
            fallbackRunId: "fallback")
        #expect(timeout == .init(runId: "fallback", status: "timeout", completed: false))
    }

    @Test func requestsFailFastWhenGatewayNotConnected() async {
        let gateway = GatewayNodeSession()
        let transport = IOSGatewayChatTransport(gateway: gateway)

        do {
            _ = try await transport.createSession(
                key: "agent:aiden:ios-123",
                label: nil,
                parentSessionKey: "agent:aiden:main")
            Issue.record("Expected createSession to throw when gateway not connected")
        } catch {}

        do {
            _ = try await transport.requestHistory(sessionKey: "node-test")
            Issue.record("Expected requestHistory to throw when gateway not connected")
        } catch {}

        do {
            _ = try await transport.sendMessage(
                sessionKey: "node-test",
                message: "hello",
                thinking: "low",
                idempotencyKey: "idempotency",
                attachments: [])
            Issue.record("Expected sendMessage to throw when gateway not connected")
        } catch {}

        do {
            _ = try await transport.requestHealth(timeoutMs: 250)
            Issue.record("Expected requestHealth to throw when gateway not connected")
        } catch {}

        do {
            try await transport.resetSession(sessionKey: "node-test")
            Issue.record("Expected resetSession to throw when gateway not connected")
        } catch {}
    }
}
