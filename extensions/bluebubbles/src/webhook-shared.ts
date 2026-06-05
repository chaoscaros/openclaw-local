import { normalizeOptionalString } from "openclaw/plugin-sdk/string-coerce-runtime";
import { normalizeWebhookPath } from "openclaw/plugin-sdk/webhook-ingress";
import type { BlueBubblesAccountConfig } from "./types.js";

export { normalizeWebhookPath };

export const DEFAULT_WEBHOOK_PATH = "/bluebubbles-webhook";

export function resolveWebhookPathFromConfig(config?: BlueBubblesAccountConfig): string {
  const raw = normalizeOptionalString(config?.webhookPath);
  if (raw) {
    return normalizeWebhookPath(raw);
  }
  return DEFAULT_WEBHOOK_PATH;
}
