import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  startGatewayBonjourAdvertiser: vi.fn(),
  pickPrimaryTailnetIPv4: vi.fn(),
  pickPrimaryTailnetIPv6: vi.fn(),
  resolveWideAreaDiscoveryDomain: vi.fn(),
  writeWideAreaGatewayZone: vi.fn(),
  formatBonjourInstanceName: vi.fn(),
  resolveBonjourCliPath: vi.fn(),
  resolveTailnetDnsHint: vi.fn(),
}));

vi.mock("../infra/bonjour.js", () => ({
  startGatewayBonjourAdvertiser: mocks.startGatewayBonjourAdvertiser,
}));

vi.mock("../infra/tailnet.js", () => ({
  pickPrimaryTailnetIPv4: mocks.pickPrimaryTailnetIPv4,
  pickPrimaryTailnetIPv6: mocks.pickPrimaryTailnetIPv6,
}));

vi.mock("../infra/widearea-dns.js", () => ({
  resolveWideAreaDiscoveryDomain: mocks.resolveWideAreaDiscoveryDomain,
  writeWideAreaGatewayZone: mocks.writeWideAreaGatewayZone,
}));

vi.mock("./server-discovery.js", () => ({
  formatBonjourInstanceName: mocks.formatBonjourInstanceName,
  resolveBonjourCliPath: mocks.resolveBonjourCliPath,
  resolveTailnetDnsHint: mocks.resolveTailnetDnsHint,
}));

import { startGatewayDiscovery } from "./server-discovery-runtime.js";

function makeLogs() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
  };
}

describe("startGatewayDiscovery", () => {
  const previousSshPort = { value: undefined as string | undefined };

  beforeEach(() => {
    previousSshPort.value = process.env.OPENCLAW_SSH_PORT;
    process.env.OPENCLAW_SSH_PORT = "2222";
    vi.clearAllMocks();
    mocks.startGatewayBonjourAdvertiser.mockResolvedValue({ stop: vi.fn() });
    mocks.pickPrimaryTailnetIPv4.mockReturnValue("100.64.0.12");
    mocks.pickPrimaryTailnetIPv6.mockReturnValue(undefined);
    mocks.resolveWideAreaDiscoveryDomain.mockImplementation(
      (params?: { configDomain?: string | null }) => params?.configDomain ?? null,
    );
    mocks.writeWideAreaGatewayZone.mockResolvedValue({
      changed: true,
      zonePath: "/tmp/openclaw.internal.db",
    });
    mocks.formatBonjourInstanceName.mockImplementation((name: string) => `${name} (OpenClaw)`);
    mocks.resolveBonjourCliPath.mockReturnValue("/usr/local/bin/openclaw");
    mocks.resolveTailnetDnsHint.mockResolvedValue("lab.tailnet.ts.net");
  });

  afterEach(() => {
    if (previousSshPort.value === undefined) {
      delete process.env.OPENCLAW_SSH_PORT;
    } else {
      process.env.OPENCLAW_SSH_PORT = previousSshPort.value;
    }
  });

  test("omits optional wide-area DNS-SD hints in minimal mode", async () => {
    await startGatewayDiscovery({
      machineDisplayName: "Lab Mac",
      port: 18789,
      gatewayTls: { enabled: false },
      wideAreaDiscoveryEnabled: true,
      wideAreaDiscoveryDomain: "openclaw.internal.",
      tailscaleMode: "serve",
      mdnsMode: "minimal",
      logDiscovery: makeLogs(),
    });

    expect(mocks.writeWideAreaGatewayZone).toHaveBeenCalledWith(
      expect.objectContaining({
        sshPort: undefined,
        cliPath: undefined,
      }),
    );
    expect(mocks.resolveBonjourCliPath).not.toHaveBeenCalled();
  });

  test("publishes optional wide-area DNS-SD hints in full mode", async () => {
    await startGatewayDiscovery({
      machineDisplayName: "Lab Mac",
      port: 18789,
      gatewayTls: { enabled: false },
      wideAreaDiscoveryEnabled: true,
      wideAreaDiscoveryDomain: "openclaw.internal.",
      tailscaleMode: "serve",
      mdnsMode: "full",
      logDiscovery: makeLogs(),
    });

    expect(mocks.writeWideAreaGatewayZone).toHaveBeenCalledWith(
      expect.objectContaining({
        sshPort: 2222,
        cliPath: "/usr/local/bin/openclaw",
      }),
    );
    expect(mocks.resolveBonjourCliPath).toHaveBeenCalledTimes(1);
  });
});
