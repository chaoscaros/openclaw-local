import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  canRunPlaywrightChromium,
  installMockGateway,
  startControlUiE2eServer,
  type ControlUiE2eServer,
  type MockGatewayControls,
  type MockGatewayRequest,
} from "../../test-helpers/control-ui-e2e.ts";

const chromiumExecutablePath = chromium.executablePath();
const chromiumAvailable = canRunPlaywrightChromium(chromiumExecutablePath);
const allowMissingChromium = process.env.OPENCLAW_UI_E2E_ALLOW_MISSING_CHROMIUM === "1";
const describeControlUiE2e = chromiumAvailable || !allowMissingChromium ? describe : describe.skip;

let browser: Browser;
let server: ControlUiE2eServer;

function cronListResponse(name: string) {
  return {
    hasMore: false,
    jobs: [
      {
        createdAtMs: Date.parse("2026-05-28T08:00:00.000Z"),
        enabled: true,
        id: `job-${name}`,
        name,
        payload: { kind: "systemEvent", text: "run health check" },
        schedule: { expr: "0 9 * * *", kind: "cron" },
        sessionTarget: "main",
        state: {
          lastRunAtMs: Date.parse("2026-05-28T09:00:00.000Z"),
          lastRunStatus: "error",
          nextRunAtMs: Date.parse("2026-05-29T09:00:00.000Z"),
        },
        updatedAtMs: Date.parse("2026-05-28T09:01:00.000Z"),
        wakeMode: "next-heartbeat",
      },
    ],
    nextOffset: null,
    offset: 0,
    total: 1,
  };
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected object value");
  }
  return value as Record<string, unknown>;
}

function requestParams(request: MockGatewayRequest): Record<string, unknown> {
  return requireRecord(request.params);
}

async function waitForCronListRequest(
  gateway: MockGatewayControls,
  predicate: (params: Record<string, unknown>) => boolean,
): Promise<MockGatewayRequest> {
  const deadline = Date.now() + 10_000;
  let requests: MockGatewayRequest[] = [];
  while (Date.now() < deadline) {
    requests = await gateway.getRequests("cron.list");
    const match = requests.find((request) => predicate(requestParams(request)));
    if (match) {
      return match;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`No matching cron.list request found: ${JSON.stringify(requests)}`);
}

describeControlUiE2e("Control UI cron filters mocked Gateway E2E", () => {
  beforeAll(async () => {
    if (!chromiumAvailable) {
      throw new Error(
        `Playwright Chromium is not installed at ${chromiumExecutablePath}. Run \`pnpm --dir ui exec playwright install chromium\`, or set OPENCLAW_UI_E2E_ALLOW_MISSING_CHROMIUM=1 only when intentionally skipping this lane.`,
      );
    }
    server = await startControlUiE2eServer();
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  it("sends table filters through cron.list", async () => {
    const context = await browser.newContext({
      locale: "en-US",
      serviceWorkers: "block",
      viewport: { height: 900, width: 1280 },
    });
    const page = await context.newPage();
    const gateway = await installMockGateway(page, {
      methodResponses: {
        "cron.list": {
          cases: [
            {
              match: { lastRunStatus: "error", scheduleKind: "cron" },
              response: cronListResponse("Filtered failing cron"),
            },
            {
              match: { scheduleKind: "cron" },
              response: cronListResponse("Filtered cron"),
            },
            {
              match: {},
              response: cronListResponse("Daily cron"),
            },
          ],
        },
        "cron.runs": { entries: [], hasMore: false, nextOffset: null, offset: 0, total: 0 },
        "cron.status": {
          enabled: true,
          jobs: 1,
          nextWakeAtMs: Date.parse("2026-05-29T09:00:00.000Z"),
        },
      },
    });

    try {
      await page.goto(`${server.baseUrl}cron`);
      await page.getByText("Daily cron").waitFor({ timeout: 10_000 });

      const initialRequest = await waitForCronListRequest(
        gateway,
        (params) => params.scheduleKind === "all" && params.lastRunStatus === "all",
      );
      expect(requestParams(initialRequest)).toMatchObject({
        enabled: "all",
        includeDisabled: true,
        lastRunStatus: "all",
        limit: 20,
        offset: 0,
        scheduleKind: "all",
        sortBy: "nextRunAtMs",
        sortDir: "asc",
      });

      await page.locator('[data-test-id="cron-jobs-schedule-filter"]').selectOption("cron");
      await page.getByText("Filtered cron").waitFor({ timeout: 10_000 });

      const scheduleRequest = await waitForCronListRequest(
        gateway,
        (params) => params.scheduleKind === "cron" && params.lastRunStatus === "all",
      );
      expect(requestParams(scheduleRequest)).toMatchObject({
        lastRunStatus: "all",
        scheduleKind: "cron",
      });

      await page.locator('[data-test-id="cron-jobs-last-status-filter"]').selectOption("error");
      await page.getByText("Filtered failing cron").waitFor({ timeout: 10_000 });

      const statusRequest = await waitForCronListRequest(
        gateway,
        (params) => params.scheduleKind === "cron" && params.lastRunStatus === "error",
      );
      expect(requestParams(statusRequest)).toMatchObject({
        lastRunStatus: "error",
        scheduleKind: "cron",
      });
    } finally {
      await context.close();
    }
  });
});
