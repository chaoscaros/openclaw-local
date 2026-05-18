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
- `91a8fdd079` `fix(cli): keep plugin parent help lightweight`
  - Local impact: bare plugin parent help no longer preloads plugin CLI
    registrations, and bare parent help commands skip PATH bootstrap.
  - Files: `src/cli/program/register.subclis-core.ts`,
    `src/cli/program/register.subclis.test.ts`, `src/cli/run-main.ts`,
    `src/cli/run-main.test.ts`.
  - Note: the official bundled catalog sub-change was not needed because this
    local branch already reads bundled channel package metadata directly.
- Reply payload contract batch, first slice from `86885ccc24` /
  `e91d682b22`
  - Local impact: outbound reply normalization, block reply dedupe, block
    streaming, and delivery checks now preserve local rich reply fields
    (`interactive` and `channelData`) instead of treating rich-only payloads as
    empty text/media.
  - Files: `src/plugin-sdk/reply-payload.ts`,
    `src/auto-reply/reply/block-reply-pipeline.ts`,
    `src/auto-reply/reply/reply-delivery.ts`,
    `src/auto-reply/reply/dispatch-from-config.ts`,
    `src/cron/heartbeat-policy.ts`.

## Local Hardening

- OpenAI Codex OAuth credential persistence fallback
  - Local impact: when `openclaw models auth login --provider openai-codex`
    completes OAuth but the returned credential shape cannot be normalized for
    OpenClaw storage, the provider now imports the Codex CLI auth file from
    `~/.codex/auth.json` and returns a normal auth result so the outer login
    command still writes the OpenClaw auth profile/config entry.
  - Files: `extensions/openai/openai-codex-provider.ts`,
    `extensions/openai/openai-codex-provider.test.ts`.
- Codex app-server auth refresh detail handling
  - Local impact: Codex app-server JSON-RPC relogin errors now include the
    actionable relogin detail in the thrown message, and OpenClaw classifies
    Codex-style refresh failures such as "access token could not be refreshed"
    as auth refresh/permanent auth failures.
  - Files: `extensions/codex/src/app-server/client.ts`,
    `src/agents/auth-profiles/oauth-refresh-failure.ts`,
    `src/agents/pi-embedded-helpers/errors.ts`.

## Deferred

- `6104c0cc79` `fix: require heartbeat tool replies`
  - Reason: the official patch depends on heartbeat response tool mode that is
    not present as a complete local contract yet.
- `86885ccc24` `fix(replies): preserve rich outbound content`
  - Reason: partially backported for local `interactive` / `channelData`
    payloads. Remaining official pieces touch broader runtime-plan, cron, and
    heartbeat surfaces that should be evaluated separately.
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
