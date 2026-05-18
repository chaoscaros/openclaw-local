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
- Codex MCP server projection from `1f18e8864d` / `59d7f03eaa`
  - Local impact: Codex app-server threads now receive user-configured
    `mcp.servers` as `config.mcp_servers` during start/resume, binding
    metadata fingerprints that config so changed MCP definitions start a fresh
    thread, and the local OpenClaw loopback MCP server defaults to approved
    tools in Codex.
  - Files: `src/agents/cli-runner/bundle-mcp.ts`,
    `src/plugin-sdk/codex-mcp-projection.ts`,
    `extensions/codex/src/app-server/thread-lifecycle.ts`,
    `extensions/codex/src/app-server/session-binding.ts`.
- Plugin `openclaw` peer link failure handling from `2db6bde617`
  - Local impact: package plugin installs that declare `openclaw` as a peer
    dependency now fail and roll back if OpenClaw cannot create the plugin-local
    `node_modules/openclaw` link, instead of leaving a broken plugin installed.
  - Files: `src/plugins/install.ts`, `src/plugins/install.test.ts`.
- Telegram HTML reply preservation from `7c606f834c` / `3c3cef1785`
  - Local impact: supported Telegram HTML tags survive markdown rendering and
    chunking, unsupported tags remain escaped, and durable outbound Telegram
    sends no longer strip HTML formatting before delivery.
  - Files: `extensions/telegram/src/format.ts`,
    `extensions/telegram/src/outbound-adapter.ts`.

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

## Post-5.12 Follow-Up Alignment

- Official `v2026.5.16-beta.*` did fill the deferred Telegram ingress direction
  with an isolated `getUpdates` worker, durable update spool, claim recovery,
  bounded long-poll timeout, and backlog health reporting.
- Local strategy: migrate the durable spool/worker foundation and main-thread
  drain path, but keep it opt-in for now (`isolatedIngress.enabled`) because the
  local branch already has sticky transport rebuilds and polling watchdog
  behavior that need a staged rollout instead of an immediate default cutover.
- Local impact in this slice: Telegram can drain worker-spooled updates through
  the existing bot middleware without blocking the event loop on long polling;
  long-poll and outbound Telegram API timeouts now follow the safer official
  bounds while preserving local configured timeout expansion for outbound calls.
- Files: `extensions/telegram/src/api-root.ts`,
  `extensions/telegram/src/bot.ts`, `extensions/telegram/src/bot.types.ts`,
  `extensions/telegram/src/monitor.ts`, `extensions/telegram/src/monitor.types.ts`,
  `extensions/telegram/src/polling-session.ts`,
  `extensions/telegram/src/polling-status.ts`,
  `extensions/telegram/src/request-timeouts.ts`,
  `extensions/telegram/src/telegram-ingress-spool.ts`,
  `extensions/telegram/src/telegram-ingress-worker.ts`,
  `extensions/telegram/src/telegram-ingress-worker.runtime.ts`.

## Deferred

- `6104c0cc79` `fix: require heartbeat tool replies`
  - Reason: the official patch depends on heartbeat response tool mode that is
    not present as a complete local contract yet.
- `86885ccc24` `fix(replies): preserve rich outbound content`
  - Reason: partially backported for local `interactive` / `channelData`
    payloads. Remaining official heartbeat response-tool pieces are tracked
    separately because the local contract is not complete yet.
- `f9652c7b09` `Fix Telegram polling ingress under event-loop stalls`
  - Status: first structural migration slice landed as opt-in isolated ingress.
    Remaining work is rollout policy, polling lease cleanup, and any post-beta
    official refinements that prove compatible with local Telegram modules.
- `9798e95786` `fix: reconcile managed plugin peers`
  - Reason: local branch does not have official's managed npm root helper
    module, so only the directly applicable unresolved `openclaw` peer failure
    behavior has been backported so far.

## Suggested Next Batches

1. Reply payload contract batch: evaluate rich outbound content end to end.
2. Codex runtime/auth batch: evaluate app-server auth refresh, MCP server
   projection, and Codex media auth profile fixes.
3. Plugin install/update batch: evaluate managed peer reconciliation and runtime
   install scanning.
4. Telegram batch: continue isolated ingress rollout: evaluate default enablement,
   polling lease cleanup, startup bot info reuse, and group media mention
   refinements against local Telegram customizations.
5. Heartbeat/automation batch: evaluate heartbeat response tool mode together
   with local cron and heartbeat customizations.

## Validation Notes

Use scoped tests for each batch, then run `pnpm tsgo`. If a batch touches build
output, lazy-loading boundaries, protocol metadata, plugin SDK public surfaces,
or release/package output, run `pnpm build` before landing.
