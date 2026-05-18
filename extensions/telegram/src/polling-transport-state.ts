import type { TelegramTransport } from "./fetch.js";

type TelegramPollingTransportStateOpts = {
  log: (line: string) => void;
  initialTransport?: TelegramTransport;
  createTelegramTransport?: () => TelegramTransport;
};

export class TelegramPollingTransportState {
  #telegramTransport: TelegramTransport | undefined;
  #transportDirty = false;
  #disposed = false;

  constructor(private readonly opts: TelegramPollingTransportStateOpts) {
    this.#telegramTransport = opts.initialTransport;
  }

  markDirty() {
    this.#transportDirty = true;
  }

  acquireForNextCycle(): TelegramTransport | undefined {
    if (this.#disposed) {
      return undefined;
    }
    const previous = this.#telegramTransport;
    const shouldCreateTransport = this.#transportDirty || !previous;
    const nextTransport = shouldCreateTransport
      ? (this.opts.createTelegramTransport?.() ?? previous)
      : previous;
    if (this.#transportDirty && previous && nextTransport !== previous) {
      this.opts.log("[telegram][diag] closing stale transport before rebuild");
      this.#closeTransportAsync(previous, "stale-transport rebuild");
    }
    if (this.#transportDirty && nextTransport) {
      this.opts.log("[telegram][diag] rebuilding transport for next polling cycle");
    }
    this.#telegramTransport = nextTransport;
    this.#transportDirty = false;
    return nextTransport;
  }

  async dispose(): Promise<void> {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    const transport = this.#telegramTransport;
    this.#telegramTransport = undefined;
    if (!transport?.close) {
      return;
    }
    try {
      await transport.close();
    } catch (err) {
      this.opts.log(
        `[telegram][diag] failed to close transport during dispose: ${formatCloseError(err)}`,
      );
    }
  }

  #closeTransportAsync(transport: TelegramTransport, context: string) {
    void transport.close?.().catch((err) => {
      this.opts.log(
        `[telegram][diag] failed to close transport (${context}): ${formatCloseError(err)}`,
      );
    });
  }
}

function formatCloseError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
