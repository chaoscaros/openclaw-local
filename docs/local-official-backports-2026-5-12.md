# Local 2026.5.12 Backport Tracker

This note tracks selective backports from official OpenClaw `v2026.5.6` through
`v2026.5.12` into the local customized branch. It is intentionally not a full
merge plan: local custom modules take priority, and broad official changes
should be split by risk area.

## Version Policy

- `package.json` version tracks the latest official OpenClaw tag that this local
  branch has fully closed out. Partial cherry-picks from later official commits
  stay documented here and must not bump the package version by themselves.
- Current checkpoint: `v2026.5.12`.

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
- Managed npm freshness bypass from `85a3d5312f`
  - Local impact: npm pack metadata reads, staged plugin dependency installs,
    and global npm updates now override stale npm `before` / `min-release-age`
    policies only inside OpenClaw-managed child npm processes, while preserving
    local custom plugin install flow and rollback behavior.
  - Files: `src/infra/npm-install-env.ts`,
    `src/infra/safe-package-install.ts`,
    `src/infra/install-source-utils.ts`,
    `src/infra/install-package-dir.ts`,
    `src/infra/update-global.ts`,
    `src/cli/update-cli/update-command.ts`,
    `src/infra/update-runner.ts`.
- Source-only official plugin reinstall recovery from `0240cc578c`
  - Local impact: official Brave and Slack reinstall requests can use the same
    invalid-config recovery path as Matrix when stale source-only installs make
    plugin entries or web-search provider config invalid.
  - Files: `extensions/brave/package.json`,
    `extensions/slack/package.json`,
    `src/cli/plugins-install-command.ts`,
    `src/cli/plugins-install-config.test.ts`,
    `src/cli/program/preaction.test.ts`.
- Telegram HTML reply preservation from `7c606f834c` / `3c3cef1785`
  - Local impact: supported Telegram HTML tags survive markdown rendering and
    chunking, unsupported tags remain escaped, and durable outbound Telegram
    sends no longer strip HTML formatting before delivery.
  - Files: `extensions/telegram/src/format.ts`,
    `extensions/telegram/src/outbound-adapter.ts`.
- Telegram shared API timeout wrapper from `42f6d90917`
  - Local impact: polling/startup Bot API requests and direct outbound send
    clients now share the same timeout, abort, network-error tagging, and
    fallback-dispatcher promotion path, so direct `deleteMessage` and related
    control-plane sends cannot hang indefinitely on wedged Telegram network
    paths.
  - Files: `extensions/telegram/src/client-fetch.ts`,
    `extensions/telegram/src/bot.ts`, `extensions/telegram/src/send.ts`,
    `extensions/telegram/src/fetch.ts`.
- Telegram 421 fallback retry from `63b728de43`
  - Local impact: Bot API `421 Misdirected Request` responses and wrapped
    Telegram fetch errors can promote the transport to its fallback dispatcher
    and retry once, while strict outbound send retries still avoid broad
    ambiguous network duplicates.
  - Files: `extensions/telegram/src/client-fetch.ts`,
    `extensions/telegram/src/network-errors.ts`,
    `src/infra/retry-policy.ts`.
- Telegram topic media completion handoff from `ff47c51608`
  - Local impact: session-only generated media/video completion handoffs now
    stringify Telegram forum topic thread ids before calling the agent gateway,
    keeping message-tool-only delivery aligned with route metadata expectations.
  - Files: `src/agents/subagent-announce-delivery.ts`.
- Telegram missing topic thread fail-closed behavior from `69cea57f69`
  - Local impact: text, media, sticker, poll, and draft materialization sends no
    longer strip `message_thread_id` after Telegram reports `message thread not
found`, preventing topic-targeted replies from being silently delivered to
    the base chat.
  - Files: `extensions/telegram/src/send.ts`,
    `extensions/telegram/src/draft-stream.ts`.
- Telegram hot reload polling restart recovery from `395bd578d2`
  - Local impact: isolated polling worker exits now restart after recoverable
    failures, stopped workers close their parent port cleanly, and Gateway
    channel hot reload stops no longer mark channels as manually stopped.
  - Files: `extensions/telegram/src/polling-session.ts`,
    `extensions/telegram/src/telegram-ingress-worker.runtime.ts`,
    `src/gateway/server-channels.ts`,
    `src/gateway/server-reload-handlers.ts`.
- Telegram raw update log redaction from `74949eda2f`
  - Local impact: verbose raw update logging keeps diagnostic shape while
    redacting user/chat identifiers, names, text, callbacks, links, file ids,
    location fields, and uncommon Telegram update identifiers.
  - Files: `extensions/telegram/src/bot.ts`,
    `extensions/telegram/src/raw-update-log.ts`.
- Runtime message tool allowlist preservation from `06e85d5eaf`
  - Local impact: restrictive tool profiles no longer filter out `message` when
    the runtime explicitly allows `message`, `group:messaging`,
    `group:openclaw`, or `*`, preserving Codex/channel delivery paths that
    intentionally expose the messaging tool.
  - Files: `src/agents/pi-tools.ts`.
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
- Cron source-delivery exact-match fast path from `e750f481f9`
  - Local impact: isolated scheduled runs no longer call plugin target
    normalizers when the message-tool target and resolved delivery recipient
    already match after Telegram topic suffix trimming. The local version also
    trims before topic stripping so whitespace-padded topic targets still match.
  - Files: `src/cron/isolated-agent/delivery-dispatch.ts`,
    `src/cron/isolated-agent/delivery-dispatch.named-agent.test.ts`.

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
- Control UI chat action placement
  - Local impact: when the full sidebar is visible, the sidebar owns the primary
    new-session action and the composer toolbar keeps reset/export/send actions;
    collapsed-sidebar and focus-mode layouts still expose a composer new-session
    action so users do not lose the entry point.
  - Files: `ui/src/ui/app-render.ts`, `ui/src/ui/views/chat.ts`,
    `ui/src/ui/chat/run-controls.ts`.
- Manual session compaction progress from `e71d10fd4d`
  - Local impact: manual compaction now emits subscribed `session.operation`
    start/end events, and the Control UI maps those events into the existing
    compaction progress indicator with default-session alias matching preserved.
  - Files: `src/gateway/protocol/schema/sessions.ts`,
    `src/gateway/server-methods/sessions.ts`, `ui/src/ui/app-tool-stream.ts`,
    `ui/src/ui/app-gateway.ts`.
- Gateway protocol mismatch diagnostics from `a535978352`
  - Local impact: handshake failures now include structured protocol mismatch
    details, and the Control UI formats both explicit and legacy bare mismatch
    errors with the Control UI and Gateway protocol versions.
  - Files: `src/gateway/protocol/connect-error-details.ts`,
    `src/gateway/server/ws-connection/message-handler.ts`,
    `ui/src/ui/gateway.ts`.
- Local task-mode pending UI polish
  - Local impact: chats now rely on the bottom running status bar as the single
    pending indicator before streamed text arrives, instead of also showing an
    assistant "Thinking" placeholder bubble. The legacy reading-indicator
    renderer is also disabled so stale pending items cannot redraw the duplicate
    bubble.
    The client also requests an immediate redraw after staging the local pending
    run, and active-run history refreshes keep that pending stream state so the
    status bar appears before the Gateway send acknowledgement and does not
    flicker idle before lifecycle events arrive. Local run lifecycle state now
    overrides stale session-list rows on both start and terminal events, so the
    status strip is not hidden by an old terminal row or kept alive by an old
    running row. If a refreshed history payload already contains the assistant
    reply for the local optimistic user turn, the UI treats that visible reply
    as a completion signal, clears the local pending run, and marks the current
    session row terminal instead of waiting for a later lifecycle cleanup event.
    Chat final events also no longer restore a separate agent lifecycle pending
    marker after the final assistant response is visible. The local terminal
    marker is preserved across later stale `sessions.list` refreshes until the
    server reports its own terminal row or the user starts a new turn, preventing
    delayed session metadata from re-showing "任务进行中" after the reply is
    already visible. Freshly staged local runs also get a short reconcile grace
    window, so stale `sessions.list` results from task switching cannot hide the
    running strip before the Gateway has reported the new run as active. The
    chat header task controls are also collapsed into a compact task context
    popover so task switching, task details, and the task board entry remain
    available without occupying the full toolbar width.
  - Files: `ui/src/ui/chat/grouped-render.ts`, `ui/src/ui/views/chat.ts`,
    `ui/src/ui/controllers/chat.ts`, `ui/src/ui/session-run-state.ts`,
    `ui/src/ui/session-run-terminal-overrides.ts`, `ui/src/ui/app-gateway.ts`,
    `ui/src/ui/controllers/sessions.ts`, `ui/src/ui/app-render.helpers.ts`,
    `ui/src/styles/layout.css`, `ui/src/styles/chat/layout.css`.

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
  - Control UI now includes the official browser-local text size setting in the
    local Appearance page, scaling chat text, inputs, sidebars, and tool cards
    without replacing local task/session controls.
  - Control UI run-state recovery now gives terminal session rows precedence
    over stale active-run flags while preserving legacy active-run recovery when
    no terminal status is available.
  - Control UI logs now use a viewport-responsive stream height with a minimum
    floor, so larger screens can show more lines without collapsing on short
    viewports.
  - Touch-primary Control UI form/config/usage text inputs now stay at 16px to
    avoid iOS focus zoom, while the chat composer keeps the text-scale input-size
    variable.
  - Desktop chat header dropdowns now size to the selected option text while the
    local task context bar keeps the remaining flexible space.
  - Assistant chat bubbles now apply the existing copy/open-action spacing class
    whenever those action buttons render, preventing short replies from
    overlapping hover controls.
  - Sessions table styling now preserves key-column spacing, reuses the shared
    checkpoint detail classes, and keeps local task/mode columns accounted for
    in expanded rows.
  - Session refresh reconciliation now clears stale local chat run state when the
    current session row has reached a terminal status, so busy controls do not
    linger after the backend finishes.
  - Control UI and gateway clients now stop stale token-mismatch reconnect loops
    unless a bounded device-token retry has actually been prepared.
  - Control UI loopback retry checks now validate `127.x.y.z` as numeric IPv4
    addresses instead of trusting arbitrary DNS names that begin with `127.`.
  - CLI auto-reply runs now bridge Claude CLI assistant text stream events into
    the reasoning preview lane, while keeping Codex CLI and silent runs out of
    reasoning previews.
  - Channel configuration detection now treats explicit `enabled: true` channel
    sections as configured across both the generic config check and the local
    potential-channel presence scanner, while keeping `enabled: false` ignored.
  - `openclaw channels list` text output now prefers live Gateway
    `channels.status` account snapshots when available, including runtime-only
    account names and unavailable credential-source markers, while JSON output
    stays config-derived and offline text output falls back to local snapshots.
  - Telegram HTML send/edit parse fallbacks now strip markup into readable
    plain text, preserving link labels plus URLs instead of retrying raw anchor
    tags when Telegram rejects parse mode HTML.
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
  - Assistant failover decisions now ignore stale classified error text unless
    the current turn actually observed a failover failure, avoiding unnecessary
    profile rotation or model fallback after a normal assistant response.
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
  - Control UI chat composer now focuses from non-interactive composer chrome,
    wraps long inline code inside chat bubbles, and clamps message delete
    confirmations to the viewport while preserving the local task/mode toolbar.
  - Control UI new-session creation now asks for a session name and target
    agent, shows busy states for new/reset actions, and refreshes chat session
    options without the active-minutes filter so switching sessions does not
    make older options disappear until a manual refresh.
  - Update CLI EACCES recovery hints now tell supervised-install operators to
    stop the Gateway before sudo/manual npm replacement and include the
    reinstall/restart outline, with matching install documentation and split
    recovery verification commands.
  - `openclaw skills install/update` now accepts `--global` for ClawHub-managed
    skills, targeting the shared managed skills directory instead of the active
    workspace while preserving the existing workspace default.
  - Control UI chat sends can now guide text into an already established active
    run using the existing soft-steer path, while preserving a visible pending
    marker and falling back to the queued next-turn path during the initial send
    acknowledgement window.
  - Slack threaded turns now carry a `sameChannelThreadRequired` tool-context
    hint so same-channel replies fail closed if the original Slack thread
    timestamp is missing, while `topLevel` and `threadId: null` remain explicit
    root-post escape hatches.
  - Nextcloud Talk now registers a channel-owned `react` message action adapter
    that dispatches to the existing Talk reaction sender, while keeping sends
    on the outbound path and rejecting unsupported reaction removal explicitly.
  - Follow-up queue collect mode now batches unresolved-origin messages with the
    compatible resolved route and resumes batching after a true cross-channel
    drain, improving the running/queued message insertion path.
  - TUI normal-message submits now preserve the draft while an active or
    optimistic chat run is busy, show the existing abort-first hint, and keep
    slash commands routable during the busy state.
  - Channel delivery state now has a normalized route metadata layer, preserving
    target, account, and thread/topic details while keeping local legacy
    `deliveryContext` and built-in Telegram/Slack/Mattermost parent-thread
    fallback behavior.
  - Channel account listing now preserves implicit `default` accounts when
    top-level credentials coexist with named accounts, keeping legacy
    single-account setups active during Discord, Slack, Telegram, WhatsApp,
    Zalo, and other multi-account migrations.
  - Control UI chat session controls now include a separate agent filter, keep
    session options scoped to the selected agent, and switch to that agent's
    latest ordinary session instead of mixing subagent/cron/other-agent entries
    into one dropdown.
  - Usage details context lists now truncate long skill/tool/file names in the
    row layout while preserving the full name as a hover title.
  - Usage daily chart tooltips now render as one viewport-floating popover with
    focus/keyboard support, avoiding clipped tooltip content inside compact
    chart containers.
  - Mobile standalone PWA chat layouts now keep the composer above
    under-reported iOS safe-area insets, preserving the local composer/task
    toolbar structure.
  - Control UI run indicators now use the session row status as the source of
    truth after refresh: `running` rows recover the visible in-progress state,
    while terminal rows suppress stale stop controls from an orphaned local run
    id.
  - WebChat optimistic image sends now render a lightweight attachment
    placeholder instead of embedding the full `data:` URL in chat state, while
    preserving the attachment payload sent to the Gateway.
  - Usage view now relies on the shared dashboard shell title and removes the
    duplicated inner page heading.
  - Overview recent sessions now reuse the chat session display-name resolver,
    avoiding raw compound channel keys when label/displayName fallbacks are
    available.
  - Timestamped Control UI live stream/tool rows now sort before newer history
    fallbacks, preserving the visible chat order when active runs and refreshed
    transcript history overlap.
  - Control UI chat now exposes a browser-local auto-scroll mode selector
    (`always`, `near-bottom`, `off`) in desktop and mobile controls, defaulting
    to the previous near-bottom behavior while still letting manual scroll-to-bottom
    override `off`.
  - Embedded Pi runner retry-loop bounds can now be tuned with
    `agents.defaults.runRetries` or per-agent `runRetries`, while preserving the
    existing default guard when no override is configured.
  - OpenAI-compatible Gateway chat completions now forward
    `max_completion_tokens` / `max_tokens` into agent stream params, preserving
    client token caps for `/v1/chat/completions` callers.
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
    `ui/src/ui/app-render.ts`, `ui/src/ui/app-chat.ts`,
    `ui/src/ui/chat/run-controls.ts`, `extensions/browser/src/browser/cdp.helpers.ts`,
    `extensions/browser/src/browser/config.ts`,
    `extensions/browser/src/cli/browser-cli-actions-input/register.form-wait-eval.ts`,
    `extensions/browser/src/cli/browser-cli-actions-input/shared.ts`,
    `src/commands/auth-choice.model-check.ts`,
    `src/commands/auth-choice.model-check.test.ts`,
    `src/memory-host-sdk/host/internal.ts`,
    `src/agents/session-write-lock-error.ts`, `src/agents/session-write-lock.ts`,
    `src/agents/failover-error.ts`, `src/agents/model-fallback.ts`,
    `src/agents/agent-scope-config.ts`,
    `src/agents/pi-embedded-runner/run.ts`,
    `src/agents/pi-embedded-runner/run/helpers.ts`,
    `src/config/types.agent-defaults.ts`, `src/config/types.agents.ts`,
    `src/config/zod-schema.agent-defaults.ts`,
    `src/config/zod-schema.agent-runtime.ts`,
    `src/config/schema.help.ts`, `src/config/schema.labels.ts`,
    `src/gateway/openai-http.ts`, `src/gateway/openai-http.test.ts`,
    `docs/gateway/openai-http-api.md`,
    `src/gateway/server-methods/agent.ts`, `extensions/lmstudio/src/runtime.ts`,
    `extensions/lmstudio/src/setup.ts`,
    `src/gateway/server/ws-connection/message-handler.ts`,
    `ui/src/ui/markdown.ts`, `ui/src/styles/components.css`,
    `ui/src/styles/layout.css`, `ui/src/styles/layout.mobile.css`,
    `ui/src/ui/controllers/config.ts`, `ui/src/ui/controllers/config.test.ts`,
    `ui/src/ui/controllers/config/form-utils.ts`,
    `ui/src/ui/controllers/config/form-utils.node.test.ts`,
    `docs/web/control-ui.md`,
    `src/tui/tui-submit.ts`, `src/tui/tui.ts`,
    `src/tui/tui-command-handlers.ts`,
    `ui/src/types/highlight-js-subpaths.d.ts`,
    `src/cli/update-cli/progress.ts`, `src/cli/update-cli/progress.test.ts`,
    `docs/install/updating.md`, `src/cli/skills-cli.ts`,
    `src/cli/skills-cli.commands.test.ts`, `docs/cli/skills.md`,
    `docs/tools/skills.md`, `docs/help/faq.md`,
    `src/channels/plugins/account-helpers.ts`,
    `src/channels/plugins/account-helpers.test.ts`,
    `src/plugin-sdk/account-core.ts`, `src/plugin-sdk/account-helpers.ts`,
    `extensions/discord/src/accounts.ts`, `extensions/feishu/src/accounts.ts`,
    `extensions/googlechat/src/accounts.ts`, `extensions/imessage/src/accounts.ts`,
    `extensions/irc/src/accounts.ts`, `extensions/mattermost/src/mattermost/accounts.ts`,
    `extensions/nextcloud-talk/src/accounts.ts`, `extensions/qa-channel/src/accounts.ts`,
    `extensions/signal/src/accounts.ts`, `extensions/slack/src/accounts.ts`,
    `extensions/telegram/src/accounts.ts`, `extensions/telegram/src/accounts.test.ts`,
    `extensions/whatsapp/src/accounts.ts`,
    `extensions/zalo/src/accounts.ts`, `extensions/zalouser/src/accounts.ts`,
    `src/plugin-sdk/channel-route.ts`, `src/channels/route-projection.ts`,
    `src/utils/delivery-context.shared.ts`, `src/config/sessions/store.ts`,
    `src/config/sessions/store-load.ts`, `src/config/sessions/types.ts`,
    `src/channels/session.ts`, `src/channels/session.types.ts`,
    `src/agents/subagent-announce-delivery.ts`, `src/agents/acp-spawn.ts`,
    `src/agents/tools/sessions-list-tool.ts`,
    `ui/src/i18n/locales/en.ts`, `ui/src/i18n/locales/zh-CN.ts`,
    `ui/src/ui/app-render.helpers.ts`,
    `ui/src/ui/app-render.helpers.node.test.ts`,
    `ui/src/ui/views/chat.test.ts`, `ui/src/styles/chat/layout.css`,
    `ui/src/styles/chat-layout.test.ts`,
    `ui/src/ui/views/usage-render-details.ts`,
    `ui/src/ui/views/usage-render-details.test.ts`,
    `ui/src/ui/views/usage-render-overview.ts`,
    `ui/src/ui/views/usage-render-overview.test.ts`,
    `ui/src/styles/usage.css`, `ui/src/styles/chat/layout.css`,
    `ui/src/styles/chat-layout.test.ts`, `ui/src/ui/session-run-state.ts`,
    `ui/src/ui/session-run-state.test.ts`, `ui/src/ui/app-chat.ts`,
    `ui/src/ui/app-chat.test.ts`, `ui/src/ui/app-gateway.ts`,
    `ui/src/ui/app-render.ts`, `ui/src/ui/controllers/chat.ts`,
    `ui/src/ui/controllers/chat.test.ts`, `ui/src/ui/views/usage.ts`,
    `ui/src/ui/views/usage.test.ts`, `ui/src/ui/views/overview-cards.ts`,
    `ui/src/ui/views/overview-cards.test.ts`, `ui/src/ui/views/chat.ts`,
    `ui/src/ui/views/chat.test.ts`, `ui/src/ui/app-scroll.ts`,
    `ui/src/ui/app-scroll.test.ts`, `ui/src/ui/storage.ts`,
    `ui/src/ui/storage.node.test.ts`, `ui/src/ui/app-render.helpers.browser.test.ts`,
    `ui/src/i18n/locales/*.ts`, `ui/src/i18n/.i18n/*.meta.json`.

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
3. Plugin install/update batch: evaluate remaining runtime install scanning and
   managed npm root reconciliation pieces that are not present in the local
   structure yet.
4. Telegram batch: evaluate the remaining post-5.12 group media and forum-topic
   routing refinements against the new local route metadata layer and Telegram
   customizations.
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
  - Status: first Control UI slice is implemented for already established active
    runs by reusing the existing soft-steer path. Remaining work should address
    queued pre-start turns, gateway-level inserted state, channel delivery
    semantics, and richer UI affordances.

## Validation Notes

Use scoped tests for each batch, then run `pnpm tsgo`. If a batch touches build
output, lazy-loading boundaries, protocol metadata, plugin SDK public surfaces,
or release/package output, run `pnpm build` before landing.
