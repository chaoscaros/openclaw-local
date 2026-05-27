import { parseStrictPositiveInteger } from "../../infra/parse-finite-number.js";

const MAX_TCP_PORT = 65_535;

export function parsePort(raw: unknown): number | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  const parsed = parseStrictPositiveInteger(raw);
  if (parsed === undefined || parsed > MAX_TCP_PORT) {
    return null;
  }
  return parsed;
}
