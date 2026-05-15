# Local 2026.5.12 Backport Tracker

This note tracks selective backports from official OpenClaw `v2026.5.6` through
`v2026.5.12` into the local customized branch. It is intentionally not a full
merge plan: local custom modules take priority, and broad official changes
should be split by risk area.

## Already Backported

- `2e6916571e` `fix: resolve SecretRef catalog auth`
  - Local impact: provider catalog discovery can resolve configured env
    SecretRef API keys while honoring secret provider allowlists.
  - Files: `src/agents/models-config.providers.secrets.ts`,
    `src/agents/models-config.providers.auth-provenance.test.ts`.
- `df43026427` `fix(cli): preserve lazy sender formatting`
  - Local impact: lazy channel sends keep explicit formatting and HTML text mode.
  - Files: `src/cli/send-runtime/channel-outbound-send.ts`,
    `src/cli/send-runtime/channel-outbound-send.test.ts`.
- `f561768a7c` `fix(agents): preserve reply metadata through tool media`
  - Local impact: tool media merged into visible replies keeps reply metadata.
  - Files: `src/auto-reply/reply-payload.ts`,
    `src/agents/pi-embedded-runner/run/tool-media-payloads.ts`,
    `src/agents/pi-embedded-runner/run/tool-media-payloads.test.ts`.
- `0904505071` `fix(cli): preserve multiline table colors`
  - Local impact: wrapped multiline ANSI table cells keep styling on continuation
    lines without leaking style into borders or padding.
  - Files: `src/terminal/table.ts`, `src/terminal/table.test.ts`.

## Deferred

- `6104c0cc79` `fix: require heartbeat tool replies`
  - Reason: the official patch depends on heartbeat response tool mode that is
    not present as a complete local contract yet.
- `e91d682b22` `fix(replies): preserve rich coalesced block replies`
  - Reason: the official patch depends on a broader rich `ReplyPayload` content
    contract. The local content helper currently recognizes text and media only.
- `86885ccc24` `fix(replies): preserve rich outbound content`
  - Reason: larger reply-payload contract change spanning runtime plans, cron,
    reply delivery, and plugin SDK tests.
- `f9652c7b09` `Fix Telegram polling ingress under event-loop stalls`
  - Reason: large Telegram ingress worker change; should be its own batch.
- `9798e95786` `fix: reconcile managed plugin peers`
  - Reason: install/update behavior change; useful, but needs a dedicated
    plugin-install validation pass.

## Suggested Next Batches

1. Reply payload contract batch: evaluate rich outbound content end to end.
2. Codex runtime/auth batch: evaluate app-server auth refresh, MCP server
   projection, and Codex media auth profile fixes.
3. Plugin install/update batch: evaluate managed peer reconciliation and runtime
   install scanning.
4. Telegram batch: evaluate HTML reply preservation and polling ingress worker.
5. Heartbeat/automation batch: evaluate heartbeat response tool mode together
   with local cron and heartbeat customizations.

## Validation Notes

Use scoped tests for each batch, then run `pnpm tsgo`. If a batch touches build
output, lazy-loading boundaries, protocol metadata, plugin SDK public surfaces,
or release/package output, run `pnpm build` before landing.
