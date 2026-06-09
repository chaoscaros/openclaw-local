import { afterEach, describe, expect, it, vi } from "vitest";
import { requestMatrixJson, type MatrixQaFetchLike } from "./request.js";

const MATRIX_QA_TIMER_TIMEOUT_MAX_MS = 2_147_483_647;

describe("requestMatrixJson", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("caps oversized request timeouts before creating the abort signal", async () => {
    const signal = AbortSignal.abort();
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockReturnValue(signal);
    const fetchImpl = vi.fn<MatrixQaFetchLike>(async () => Response.json({ ok: true }));

    await requestMatrixJson({
      baseUrl: "https://matrix.example.test",
      endpoint: "/_matrix/client/v3/account/whoami",
      fetchImpl,
      method: "GET",
      timeoutMs: Number.MAX_SAFE_INTEGER,
    });

    expect(timeoutSpy).toHaveBeenCalledWith(MATRIX_QA_TIMER_TIMEOUT_MAX_MS);
    expect(fetchImpl).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ signal }));
  });
});
