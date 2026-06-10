import OpenClawKit
import Foundation
import Testing
@testable import OpenClaw

@Suite struct IOSGatewayChatTransportTests {
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
