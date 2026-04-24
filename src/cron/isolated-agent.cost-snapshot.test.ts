import "./isolated-agent.mocks.js";
import { describe, expect, it } from "vitest";
import { makeCronSession, resolveCronSessionMock } from "./isolated-agent/run.test-harness.js";
import { setupRunCronIsolatedAgentTurnSuite } from "./isolated-agent/run.suite-helpers.js";
import { runCronTurn, withTempHome } from "./isolated-agent.turn-test-helpers.js";

setupRunCronIsolatedAgentTurnSuite();

describe("runCronIsolatedAgentTurn cost persistence", () => {
  it("snapshots estimatedCostUsd instead of accumulating it on the cron session", async () => {
    await withTempHome(async (home) => {
      const cronSession = makeCronSession({
        sessionEntry: {
          sessionId: "existing-cron-session",
          updatedAt: Date.now(),
          systemSent: false,
          skillsSnapshot: undefined,
          estimatedCostUsd: 0.0015,
        },
      });
      resolveCronSessionMock.mockReturnValueOnce(cronSession);

      await runCronTurn(home, {
        cfgOverrides: {
          models: {
            providers: {
              openai: {
                baseUrl: "https://api.openai.com/v1",
                models: [
                  {
                    id: "gpt-5.4",
                    name: "GPT 5.4",
                    reasoning: true,
                    input: ["text"],
                    cost: { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0.5 },
                    contextWindow: 200_000,
                    maxTokens: 8_192,
                  },
                ],
              },
            },
          },
        },
      });

      expect(cronSession.sessionEntry.estimatedCostUsd).toBeCloseTo(0.0002125, 8);
    });
  });
});