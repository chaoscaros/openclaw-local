// Diagnostic flag/event helpers for plugins that want narrow runtime gating.

export { isDiagnosticFlagEnabled } from "../infra/diagnostic-flags.js";
export {
  emitDiagnosticEvent,
  emitDiagnosticEvent as emitTrustedDiagnosticEvent,
  isDiagnosticsEnabled,
} from "../infra/diagnostic-events.js";
export type { DiagnosticEventInput, DiagnosticEventPayload } from "../infra/diagnostic-events.js";
