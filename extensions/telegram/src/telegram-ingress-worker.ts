import { Worker } from "node:worker_threads";
import type { TelegramNetworkConfig } from "openclaw/plugin-sdk/config-runtime";

export type TelegramIngressWorkerMessage =
  | { type: "poll-start"; offset: number | null; startedAt: number }
  | { type: "poll-success"; offset: number | null; count: number; finishedAt: number }
  | { type: "poll-error"; message: string; finishedAt: number }
  | { type: "spooled"; updateId: number; queued: number };

export type TelegramIngressWorkerOptions = {
  token: string;
  accountId: string;
  initialUpdateId: number | null;
  spoolDir: string;
  apiRoot?: string;
  timeoutSeconds?: number;
  proxy?: string;
  network?: TelegramNetworkConfig;
};

export type TelegramIngressWorkerHandle = {
  onMessage: (listener: (message: TelegramIngressWorkerMessage) => void) => () => void;
  stop: () => Promise<void>;
  task: () => Promise<void>;
};

export type TelegramIngressWorkerFactory = (
  options: TelegramIngressWorkerOptions,
) => TelegramIngressWorkerHandle;

export function createTelegramIngressWorker(
  options: TelegramIngressWorkerOptions,
): TelegramIngressWorkerHandle {
  const worker = new Worker(new URL("./telegram-ingress-worker.runtime.js", import.meta.url), {
    workerData: options,
  });
  const done = new Promise<void>((resolve, reject) => {
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Telegram ingress worker exited with code ${code}`));
    });
  });
  return {
    onMessage(listener) {
      const wrapped = (message: TelegramIngressWorkerMessage) => listener(message);
      worker.on("message", wrapped);
      return () => worker.off("message", wrapped);
    },
    async stop() {
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Node worker_threads ports do not accept a targetOrigin argument.
      worker.postMessage({ type: "stop" });
      const timeout = new Promise<void>((resolve) => {
        const timer = setTimeout(async () => {
          await worker.terminate();
          resolve();
        }, 15_000);
        timer.unref?.();
      });
      await Promise.race([done.catch(() => undefined), timeout]);
    },
    async task() {
      await done;
    },
  };
}
