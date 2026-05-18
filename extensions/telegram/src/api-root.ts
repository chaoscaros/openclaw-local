export const DEFAULT_TELEGRAM_API_ROOT = "https://api.telegram.org";

const TELEGRAM_BOT_ENDPOINT_SEGMENT_RE = /^bot\d+:[^/]+$/u;

function isTelegramBotEndpointSegment(segment: string): boolean {
  try {
    return TELEGRAM_BOT_ENDPOINT_SEGMENT_RE.test(decodeURIComponent(segment));
  } catch {
    return TELEGRAM_BOT_ENDPOINT_SEGMENT_RE.test(segment);
  }
}

export function normalizeTelegramApiRoot(apiRoot?: string): string {
  const trimmed = apiRoot?.trim();
  if (!trimmed) {
    return DEFAULT_TELEGRAM_API_ROOT;
  }

  let normalized = trimmed.replace(/\/+$/u, "");
  try {
    const url = new URL(normalized);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length > 0 && isTelegramBotEndpointSegment(segments[segments.length - 1] ?? "")) {
      segments.pop();
      url.pathname = segments.length > 0 ? `/${segments.join("/")}` : "/";
      url.search = "";
      url.hash = "";
      normalized = url.toString().replace(/\/+$/u, "");
    }
  } catch {
    // Config validation catches invalid URLs. Keep legacy runtime behavior if unchecked input arrives.
  }
  return normalized;
}
