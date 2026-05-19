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
- WebChat chunk override and outbound channel registry fallback from
  `424c6d0a5f` / `b2c5ba6d4c`
  - Local impact: WebChat outbound replies now honor configured
    `textChunkLimit` / `chunkMode` overrides, and plugin channel sends can fall
    back from a pinned setup-only registry entry to the active runtime registry
    when the setup shell cannot send.
  - Files: `src/auto-reply/chunk.ts`,
    `src/auto-reply/chunk.test.ts`,
    `src/channels/plugins/registry-loader.ts`,
    `src/infra/outbound/channel-bootstrap.runtime.ts`,
    `src/infra/outbound/channel-bootstrap.runtime.test.ts`,
    `src/plugins/runtime.channel-pin.test.ts`.

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
  drain path first, then turn on the safer default only after the local sticky
  transport rebuilds and polling watchdog behavior have matching coverage.
- Local impact in the first slice: Telegram can drain worker-spooled updates through
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
- Current local alignment slice:
  - Default Telegram polling now uses isolated ingress while tests can still
    force legacy polling for coverage.
  - Same-token polling monitors take a process-local lease, preventing duplicate
    `getUpdates` consumers while allowing quick replacement of already-aborted
    pollers.
  - Gateway startup reuses cached Telegram `getMe` bot info and passes it into
    the monitor so the polling bot can skip redundant identity probes.
  - Captionless or empty-text group media can match catch-all mention patterns,
    which makes media-only mention rules viable.
  - Control UI now routes session-scoped tool events into the live tool stream,
    so pages that attach to an already running session can render tool activity
    without waiting for transcript history to reload.
  - Anthropic provider normalization now preserves native image input for
    current Claude rows when stale local catalog data marks them text-only.
  - `/models openai` provider headers now prefer the effective Codex OAuth
    profile label when the OpenAI page is backed by openai-codex auth order.
  - Isolated cron task ledger entries now point at the stable backing cron
    session, including the local manual-run path, so cleanup and task details can
    follow the real agent run.
  - `openclaw skills info` now resolves unique case/separator-normalized skill
    names while returning not-found for ambiguous matches and sanitized input.
  - Codex app-server now exposes non-Docker OpenClaw sandbox shell access under
    `sandbox_exec` / `sandbox_process`, preserving native Codex shell naming
    while keeping OpenClaw sandbox sessions usable from app-server turns.
  - Codex app-server turn start now mirrors the active OpenClaw sandbox writable
    root and network-egress policy, so Docker `network=none` continues to hold
    even though the app-server process itself runs on the gateway host.
  - Queued followup runs now preserve current-turn image attachments as native
    image payloads instead of relying only on prompt file references, which keeps
    deferred Codex/agent image understanding intact.
  - Control UI sidebar groups now stay collapsed when the active page belongs to
    that group, matching the official navigation behavior while preserving the
    local sidebar layout.
  - Browser CDP profile resolution now keeps a configured `cdpPort` when
    `cdpUrl` omits the port, but still gives explicitly written URL ports
    precedence.
  - Memory host SDK directory creation now propagates filesystem failures so
    permission or disk errors are visible at the real source.
  - Memory-core fallback vector search now scans chunk embeddings in bounded
    rowid batches and yields between full batches, avoiding long Node.js
    event-loop stalls when sqlite-vec is unavailable or unusable.
  - Memory Wiki `wiki_lint` tool output now reports vault-internal lint reports
    as relative paths while keeping the lower-level linter result absolute for
    CLI/file callers.
  - Session write-lock timeouts and embedded attempt takeover errors now stay
    classified as local runtime coordination failures, so model fallback does
    not retry every candidate against the same locked session while still
    preserving explicit provider rate-limit metadata when present.
  - Gateway agent sends now rotate failed sessions whose transcript file is
    missing, clearing stale failure/runtime fields while preserving reusable
    failed sessions when the transcript still exists.
  - LM Studio provider auth now resolves arbitrary `${ENV_VAR}` apiKey templates
    through the config secret runtime, and header-only Authorization flows can
    ignore intentionally unused unresolved apiKey templates.
  - Paired iOS/iPadOS and Android clients can refresh same-family OS version
    labels on reconnect without triggering metadata-upgrade approval, while
    device-family and non-mobile platform changes remain approval-bound.
  - Strict-agentic embedded runs now log execution-contract diagnostics only
    when a planning-only retry is triggered, reducing normal activation noise
    while keeping blocked-run debugging context.
  - `config.schema.lookup` now includes optional `reloadKind` metadata for the
    requested path and child fields, letting local UI/CLI surfaces tell users
    whether a config edit is hot-reloadable, no-op, or restart-required.
  - Skill quick validation now rejects empty or whitespace-only `name` and
    `description` frontmatter values instead of accepting a skill with missing
    display metadata.
  - Browser CLI `evaluate` now accepts `--timeout-ms`, forwards it to the
    browser action body, and keeps the outer request timeout slightly longer so
    long-running page functions do not race the transport timeout.
  - Onboarding model checks now treat Codex OAuth profiles as valid auth for
    canonical OpenAI provider models, while still keeping custom
    OpenAI-compatible `models.providers.openai.baseUrl` endpoints separate.
  - Control UI markdown rendering now highlights common code block languages
    using the existing WebChat code-block wrapper, while keeping local copy and
    JSON-collapse controls intact.
  - Files: `extensions/telegram/src/bot-info.ts`,
    `extensions/telegram/src/bot-info-cache.ts`,
    `extensions/telegram/src/channel.ts`, `extensions/telegram/src/monitor.ts`,
    `extensions/telegram/src/polling-lease.ts`, `extensions/telegram/src/probe.ts`,
    `extensions/telegram/src/request-timeouts.ts`, `extensions/anthropic/register.runtime.ts`,
    `extensions/telegram/src/token-fingerprint.ts`, `src/agents/model-auth-label.ts`,
    `src/auto-reply/reply/commands-models.ts`, `src/auto-reply/reply/mentions.ts`,
    `src/auto-reply/reply/agent-runner-execution.ts`,
    `src/auto-reply/reply/current-turn-images.ts`,
    `src/auto-reply/reply/followup-runner.ts`,
    `src/auto-reply/reply/get-reply-run.ts`,
    `src/auto-reply/reply/queue/types.ts`,
    `src/cron/service/task-session-key.ts`, `src/cron/service/timer.ts`,
    `src/cron/service/ops.ts`, `src/cli/skills-cli.format.ts`,
    `extensions/codex/src/app-server/protocol.ts`,
    `extensions/codex/src/app-server/run-attempt.ts`,
    `extensions/codex/src/app-server/thread-lifecycle.ts`, `ui/src/ui/app-gateway.ts`,
    `ui/src/ui/app-render.ts`, `extensions/browser/src/browser/cdp.helpers.ts`,
    `extensions/browser/src/browser/config.ts`,
    `extensions/browser/src/cli/browser-cli-actions-input/register.form-wait-eval.ts`,
    `extensions/browser/src/cli/browser-cli-actions-input/shared.ts`,
    `src/commands/auth-choice.model-check.ts`,
    `src/commands/auth-choice.model-check.test.ts`,
    `src/memory-host-sdk/host/internal.ts`,
    `src/agents/session-write-lock-error.ts`, `src/agents/session-write-lock.ts`,
    `src/agents/failover-error.ts`, `src/agents/model-fallback.ts`,
    `src/gateway/server-methods/agent.ts`, `extensions/lmstudio/src/runtime.ts`,
    `extensions/lmstudio/src/setup.ts`,
    `src/gateway/server/ws-connection/message-handler.ts`,
    `ui/src/ui/markdown.ts`, `ui/src/styles/components.css`,
    `ui/src/types/highlight-js-subpaths.d.ts`.

## Deferred

- `6104c0cc79` `fix: require heartbeat tool replies`
  - Reason: the official patch depends on heartbeat response tool mode that is
    not present as a complete local contract yet.
- `86885ccc24` `fix(replies): preserve rich outbound content`
  - Reason: partially backported for local `interactive` / `channelData`
    payloads. Remaining official heartbeat response-tool pieces are tracked
    separately because the local contract is not complete yet.
- `f9652c7b09` `Fix Telegram polling ingress under event-loop stalls`
  - Status: local has now completed the staged isolated ingress rollout, polling
    lease cleanup, bounded long-poll behavior, and startup bot info reuse. Keep
    monitoring post-beta Telegram refinements for group media/topic routing
    behavior that can safely strengthen local custom routing.
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
4. Telegram batch: evaluate the remaining post-5.12 group media and forum-topic
   routing refinements against local Telegram customizations.
5. Heartbeat/automation batch: evaluate heartbeat response tool mode together
   with local cron and heartbeat customizations.

## Local Product Backlog

- Session queue guided insertion
  - Goal: when a session already has a running or queued turn, allow a new user
    message to be inserted as guided follow-up context, similar to the Codex app
    session flow, instead of requiring the user to wait for the previous turn to
    finish.
  - Design notes: define the safe insertion windows for running versus queued
    turns, expose the pending/inserted state through the gateway/UI protocol,
    and preserve channel delivery semantics for Telegram, cron, approvals, and
    tool calls before implementing the scheduler change.
  - Status: keep as a dedicated follow-up after the current official alignment
    iteration is closed, because it crosses session scheduling, gateway state,
    and UI behavior.

## Validation Notes

Use scoped tests for each batch, then run `pnpm tsgo`. If a batch touches build
output, lazy-loading boundaries, protocol metadata, plugin SDK public surfaces,
or release/package output, run `pnpm build` before landing.
