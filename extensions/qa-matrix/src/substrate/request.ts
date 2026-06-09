export type MatrixQaFetchLike = typeof fetch;

const MATRIX_QA_TIMER_TIMEOUT_MAX_MS = 2_147_483_647;

type MatrixQaRequestResult<T> = {
  status: number;
  body: T;
};

export async function requestMatrixJson<T>(params: {
  accessToken?: string;
  baseUrl: string;
  body?: unknown;
  endpoint: string;
  fetchImpl: MatrixQaFetchLike;
  method: "DELETE" | "GET" | "POST" | "PUT";
  okStatuses?: number[];
  query?: Record<string, string | number | undefined>;
  timeoutMs?: number;
}): Promise<MatrixQaRequestResult<T>> {
  const url = new URL(params.endpoint, params.baseUrl);
  for (const [key, value] of Object.entries(params.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  const response = await params.fetchImpl(url, {
    method: params.method,
    headers: {
      accept: "application/json",
      ...(params.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(params.accessToken ? { authorization: `Bearer ${params.accessToken}` } : {}),
    },
    ...(params.body !== undefined ? { body: JSON.stringify(params.body) } : {}),
    signal: AbortSignal.timeout(resolveMatrixQaTimerTimeoutMs(params.timeoutMs, 20_000)),
  });
  let body: unknown = {};
  try {
    body = (await response.json()) as unknown;
  } catch {
    body = {};
  }
  const okStatuses = params.okStatuses ?? [200];
  if (!okStatuses.includes(response.status)) {
    const details =
      typeof body === "object" &&
      body !== null &&
      typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : `${params.method} ${params.endpoint} failed with status ${response.status}`;
    throw new Error(details);
  }
  return {
    status: response.status,
    body: body as T,
  };
}

function resolveMatrixQaTimerTimeoutMs(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(MATRIX_QA_TIMER_TIMEOUT_MAX_MS, Math.max(1, Math.floor(value)));
}
