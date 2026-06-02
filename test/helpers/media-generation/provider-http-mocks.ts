import type { resolveProviderHttpRequestConfig } from "openclaw/plugin-sdk/provider-http";
import { afterEach, vi } from "vitest";

type ResolveProviderHttpRequestConfigParams = Parameters<
  typeof resolveProviderHttpRequestConfig
>[0];

const providerHttpMocks = vi.hoisted(() => ({
  resolveApiKeyForProviderMock: vi.fn(async () => ({ apiKey: "provider-key" })),
  postJsonRequestMock: vi.fn(),
  fetchWithTimeoutMock: vi.fn(),
  fetchWithTimeoutGuardedMock: vi.fn(),
  assertOkOrThrowHttpErrorMock: vi.fn(async () => {}),
  resolveProviderHttpRequestConfigMock: vi.fn((params: ResolveProviderHttpRequestConfigParams) => ({
    baseUrl: params.baseUrl ?? params.defaultBaseUrl,
    allowPrivateNetwork: params.request?.allowPrivateNetwork === true,
    headers: new Headers(params.defaultHeaders),
    dispatcherPolicy: undefined,
  })),
}));

vi.mock("openclaw/plugin-sdk/provider-auth-runtime", () => ({
  resolveApiKeyForProvider: providerHttpMocks.resolveApiKeyForProviderMock,
}));

vi.mock("openclaw/plugin-sdk/provider-http", () => ({
  assertOkOrThrowHttpError: providerHttpMocks.assertOkOrThrowHttpErrorMock,
  fetchWithTimeout: providerHttpMocks.fetchWithTimeoutMock,
  fetchWithTimeoutGuarded: providerHttpMocks.fetchWithTimeoutGuardedMock,
  postJsonRequest: providerHttpMocks.postJsonRequestMock,
  resolveProviderHttpRequestConfig: providerHttpMocks.resolveProviderHttpRequestConfigMock,
  sanitizeConfiguredModelProviderRequest: (value: unknown) =>
    value && typeof value === "object" ? value : undefined,
}));

export function getProviderHttpMocks() {
  return providerHttpMocks;
}

export function installProviderHttpMockCleanup(): void {
  afterEach(() => {
    providerHttpMocks.resolveApiKeyForProviderMock.mockClear();
    providerHttpMocks.postJsonRequestMock.mockReset();
    providerHttpMocks.fetchWithTimeoutMock.mockReset();
    providerHttpMocks.fetchWithTimeoutGuardedMock.mockReset();
    providerHttpMocks.assertOkOrThrowHttpErrorMock.mockClear();
    providerHttpMocks.resolveProviderHttpRequestConfigMock.mockClear();
  });
}
