# Local 2026.5.19 Backport Tracker

This tracker starts the conservative local iteration from official OpenClaw
`v2026.5.18` to `v2026.5.19`.

The working branch remains `codex/known-good-b6d3086`. Do not develop from
`main`, and do not merge this iteration into `main` until explicitly confirmed.

## Version Policy

- `package.json` now tracks `2026.5.19`, meaning this local checkpoint is ready
  for branch review. This is not a release tag or publish approval.
- This round only considers the official stable range `v2026.5.18..v2026.5.19`.
  Later tags stay out of scope.
- Local task, archive, mode, session-recovery, Chinese UI, and storage-key
  surfaces are protected from wholesale official replacement.

## Protected Local Surfaces

- `cb5fd453c1397094092d8551515b7e30c1316e60`
  (`修复任务预处理阻塞状态`) remains a hard protection point for task
  preprocessing, blocking-state display, and matching assertions.
- `3e708ae143509235740a987e0c78c58380ca7a9e`
  (`修复任务模式超时重连`) protects timeout reconnect, LLM idle-timeout,
  failover, terminal reconciliation, and task-mode display behavior.
- `dc35617aa90a5d95125a0fd81d92195b13b2ba76`
  (`增强任务模式稳定性`) protects chat abort activity extension, runtime
  subscription activity, server chat agent-event propagation, host-edit
  recovery, tool-image logging, and directive-tag handling.
- `1b5800b894dd247bb9a971699d8706a96998d162`
  (`修复重连重复聊天消息`) was merged to `main` after this local iteration
  started. Treat it as a protected reconnect/session-recovery fix: preserve
  `chat.send` user-turn idempotency keys, gateway-side duplicate user echo
  suppression, UI-side reconnect history dedupe, and the matching regression
  tests while continuing the `v2026.5.19` backport.

## Absorbed In This Iteration

- `9e9feb52f4` equivalent: `models.providers.<id>.timeoutSeconds` is accepted
  by the local config schema and used as an explicit per-provider LLM
  idle/stream watchdog ceiling. The local implementation preserves the
  task-mode timeout reconnect semantics from `3e708ae1`, including memory-flush
  defaults, cron behavior, explicit `llm.idleTimeoutSeconds`, and
  post-tool-result status events.
- `c982358753` equivalent: repeated OpenAI strict schema downgrade diagnostics
  are deduplicated for both Responses and Completions transports, while keeping
  the existing strict:false fallback behavior.
- `5c9a8f33b3` equivalent: `before_compaction` and `after_compaction` plugin
  hooks now get the same 30s fail-open default timeout as `agent_end`, so a
  hung plugin cannot stall serialized compaction notifications indefinitely.
- `9108ae0114` equivalent: subagent announce give-up logs include a bounded
  `lastAnnounceDeliveryError`, and direct announce delivery failure is reported
  as a warning log instead of the error channel.
- `ad925bd43b` equivalent: oversized `AGENTS.md` bootstrap context now keeps a
  bounded policy digest from middle content, and truncation warnings explicitly
  tell the agent to read full `AGENTS.md` before relying on scoped policy.
- `00da318350` equivalent for local subagent runtime: wildcard
  `allowAgents: ["*"]` no longer permits arbitrary unconfigured agent ids.
  It is constrained to configured agents, the requester, and explicitly listed
  mixed allowlist entries. The local `agents_list` tool mirrors that visible
  target set.
- `6048cd43a5` / `7f8141ead9` local equivalent: tool-result diagnostics now
  preserve structured `errorCode` and middleware-error metadata. Recovered
  middleware warnings are marked non-terminal in reply payload metadata so cron
  outcome handling does not convert a recovered warning into a failed run. This
  is intentionally scoped to the local payload/outcome path and does not alter
  task-mode session routing.
- `9eee202a69` local equivalent: main-target cron jobs now enqueue and wake a
  dedicated run lane, `agent:<agent>:cron:<job>:run:<startedAt>`, instead of
  writing directly into the target main/channel session. The local port keeps
  task-ledger child-session keys pointed at that run lane, copies delivery
  context from the target session when available, and routes through the
  existing gateway cron adapter without replacing task/archive/mode modules.
- `8c2a390fbc` local equivalent: isolated cron task ledger records now point
  `childSessionKey` at the stable backing cron session
  `agent:<agent>:cron:<job>` when no explicit session key is set, while local
  main-target cron runs continue to use isolated per-run lanes.
- `61d583d59d` equivalent: Discord thread-bound subagent spawning now returns
  the bound thread delivery origin alongside `threadBindingReady`, so follow-up
  delivery can target the created Discord thread without relying on a later
  ambiguous lookup.
- `a7ab09fa4e` local equivalent already present: paired iOS/iPadOS and Android
  clients can refresh same-family OS version metadata on authenticated
  reconnect without requiring a metadata-upgrade approval, while device-family
  and non-mobile platform changes remain approval-bound.
- `c49d909b60` partial local equivalent already present: Slack same-channel
  replies from thread-required contexts fail closed when the thread timestamp
  is missing, and explicit top-level sends remain allowed. The persistent
  inbound delivery dedupe portion depends on the newer trusted plugin keyed
  state runtime, which this local baseline has not absorbed yet.
- `a4f80f905d` local equivalent already present: the local Control UI no longer
  renders the legacy chat reading-indicator bubble for empty streams or pending
  runs. It uses the task/activity strip instead, with tests asserting
  `.chat-reading-indicator` stays absent.
- `3e6f7494af` local equivalent already present: Browser profile resolution
  preserves an explicit `cdpPort` when `cdpUrl` omits a port, while explicitly
  written URL ports, including protocol-default ports, still win.
- `78f3985c60` local equivalent for the existing-session route surface:
  current-tab URL checks now run before existing-session browser `evaluate`
  actions and `/highlight` execution. Local existing-session `batch` actions
  are still unsupported, so there is no matching batch execution path to guard.
- `38f11a0844` equivalent: NVIDIA NIM requests to the verified official
  `https://integrate.api.nvidia.com/v1` endpoint now receive the documented
  `X-BILLING-INVOKE-ORIGIN: OpenClaw` attribution header, while custom NVIDIA
  proxy routes keep caller-supplied headers unchanged.
- `d916f176e1` equivalent: root CLI option parsing now preserves `=` characters
  after the first separator, so values such as `--token=abc=def` are not
  truncated before command routing or auth/config handling sees them.
- `e2c8e7c8ae` equivalent: shared CLI port parsing now rejects values above
  `65535`, so gateway/node/daemon callers fail at option parsing instead of
  passing invalid ports down to bind/startup paths.
- `4e60ad7212` equivalent: remote media fallback filenames now decode valid URL
  path escapes, keep malformed escapes unchanged, and replace decoded path
  separators with underscores so saved remote attachments get human-readable
  but path-safe names.
- `b7ba7c3f2a` equivalent: `openclaw channels logs` now preserves the first
  complete line in the 1 MB tail window when the read window starts exactly on
  a newline boundary.
- `b9a2c11521` equivalent: ClawHub request URL construction now preserves a
  configured base URL path prefix, so deployments hosted under paths like
  `https://internal.example.com/clawhub` request `/clawhub/api/v1/...` instead
  of dropping the prefix.
- `5d19beb547` equivalent: `openclaw acp client` errors now use
  `formatErrorMessage`, so plain-object failures render useful JSON instead of
  `[object Object]`.
- `d7b23d5bca` equivalent: ACP CLI now honors Commander's negated
  `--no-prefix-cwd` option and defaults to prefixing the working directory when
  the flag is absent.
- `70e51b81cf` equivalent: `tools.web.search` now preserves extension-owned
  records while still rejecting blocked prototype keys and keeping known legacy
  provider records on the doctor migration path. The local port updates both
  validation and legacy migration, then refreshes generated config baselines.
- `bf95f762b5` already present as local equivalent: gateway agent runs detect
  failed sessions whose transcript file is missing, rotate to a fresh session
  id, and clear failed-run lifecycle fields rather than attempting to resume a
  broken transcript.
- `1bb0ebab0b` equivalent: `openclaw message ... --json` now promotes a direct
  or nested outbound receipt `messageId` to a stable top-level `messageId`
  field while preserving the original payload.
- Local main protection absorbed: `1b5800b894` is present in the working tree
  as the reconnect duplicate-message fix. The local copy keeps
  `idempotencyKey` on user transcript echoes, skips repeated pending user
  echoes in the gateway, and dedupes consecutive repeated user messages when
  UI chat history reloads after reconnect.
- `f4e17a4b54` equivalent: memory host `ensureDir` now propagates directory
  creation failures instead of silently continuing after `mkdirSync` fails.
- `d761b98adc` local equivalent already present: memory-core fallback vector
  search scans chunk embeddings in bounded rowid batches and yields to the
  event loop between full batches, so large fallback scans do not monopolize
  channel/task I/O while the vec0 path is unavailable.
- `6a5a1353c7` local equivalent already present: model fallback aborts on
  local runtime coordination errors such as session write-lock timeouts and
  embedded session takeovers instead of exhausting every fallback candidate for
  a non-provider failure.
- `35cd2af159` local equivalent already present: `config.schema.lookup`
  includes `reloadKind` on the selected node and child summaries, and the
  gateway handler resolves it through the existing config reload metadata
  planner.
- `ff871e162a` equivalent: bundled model provider overlays can now declare
  `timeoutSeconds` without re-declaring `baseUrl` and `models`, while custom
  providers still must provide both fields. Generated config schema/docs
  baselines were refreshed for the public config surface change.
- `5e0850fc54` equivalent: Ollama model definitions default unknown
  capability metadata to tool support while preserving streaming usage support,
  so models without `/api/show` capability details are not unnecessarily
  treated as tool-incapable.
- `6f18decb7a` equivalent: GitHub Copilot resolved models now receive the
  Copilot IDE request headers through the provider request config path,
  including dynamic/default models and configured provider overlays.
- `98cc6df7ff` / `33fc2375f8` equivalent: Anthropic Claude 4.x model rows
  that were saved as stale `text`-only entries are normalized back to
  `text+image` through the provider-owned resolved-model hook. The local port
  covers the plugin hook, runner fallback resolution, and configured
  `models list` rows without changing unrelated provider list behavior.
- `44c6ad7dce` local equivalent already present: collect-mode follow-up queues
  allow unresolved-origin items to batch with an otherwise single resolved
  route, and resume batching compatible items after draining one true
  cross-channel item. This preserves subagent/task announce batching without
  weakening per-route separation.
- `583a60f8b5` local equivalent already present: Control UI gateway handling
  routes `session.tool` frames through the same live tool-stream path as
  `agent` events, so externally started/session-scoped runs render tool
  activity without requiring a chat history reload.
- `424c6d0a5f` local equivalent already present: outbound chunk resolution
  honors `channels.webchat.textChunkLimit` and
  `channels.webchat.chunkMode` overrides for internal webchat replies, with
  chunk tests covering the webchat-specific limit and newline mode.
- `b2c5ba6d4c` local equivalent already present: channel registry loaders fall
  back from a pinned setup-only channel entry to the active runtime registry
  when the pinned entry cannot provide the requested outbound adapter, while
  keeping pinned send-capable entries stable across active registry swaps.
- `721ad1587a` local equivalent already present: inter-session provenance is
  preserved as message metadata/runtime context rather than being prefixed into
  the persisted transcript prompt. Model-facing replay/sanitization still
  annotates provenance when needed, but the local port does not touch the
  protected `run/attempt` prompt-submission path.
- `85a3d5312f` already absorbed in the earlier local 5.12 closure: managed npm
  child processes bypass stale npm `before` / `min-release-age` policies with
  scoped config-path handling for pack, staged dependency install, and update
  flows. The local branch does not need a second port in this 5.19 pass.
- `8477a67faf` / `02f8fb7147` / `17eab1ed4d` / `cde6d60c18`
  local equivalent already present: channel route projection is centralized in
  `src/channels/route-projection.ts`, session entries persist normalized route
  metadata, stale thread routes are cleared for non-thread system events, and
  session-store normalization compares route fields structurally instead of
  relying on JSON serialization.
- `2bb448908d` local equivalent: active runtime config refreshes can skip
  auth-profile SecretRef resolution for gateway control-plane config writes,
  preserving live auth stores while still refreshing the source/runtime config
  snapshot. This keeps config edits independent of unrelated auth profile refs.
- `67f8683ca3` local equivalent already present: strict-agentic activation is
  logged only when the contract is triggered, using warning-level retry logs
  rather than a noisy run-start info log.

## Iteration Slices

Keep each follow-up slice to roughly 30 minutes of implementation plus scoped
verification.

- Slice 1, runtime stability: provider timeout watchdog, OpenAI strict-schema
  diagnostic dedupe, compaction hook timeout, and subagent announce give-up
  logging. This slice is present in the working tree and has focused test
  coverage recorded below.
- Slice 1b, policy and target safety: AGENTS bootstrap truncation policy digest
  and wildcard subagent target constraints. This slice is present in the
  working tree and has focused test coverage recorded below.
- Slice 2, cron/task routing: compare `9eee202a69`, `6048cd43a5`, and
  `7f8141ead9` against local task-mode wake lanes, tool-warning diagnostics,
  and denial-signal behavior before porting. This slice is present in the
  working tree through local adapters rather than raw official hunks, with
  task-mode protection coverage recorded below.
- Slice 2a, cron diagnostic semantics: structured tool error codes and
  recovered-warning non-terminal payload metadata. This slice is present in the
  working tree.
- Slice 3, Codex/channel prompt surfaces: compare `47eb4ca14f`,
  `a54c73687f`, and related Codex harness changes against local mode controls,
  visible reply behavior, and session transcript protection.
- Slice 4, plugin/update/config maintenance: evaluate update repair, official
  plugin warning dedupe, provider overlay, and hook/context-engine timeout
  changes that do not require local UI/task replacement. Low-conflict provider,
  CLI, media, ClawHub, memory-host, and browser/Discord plugin fixes are
  present in the working tree.
- Slice 4a, runtime auth/config refresh: gateway config writes skip
  auth-profile SecretRef re-resolution during active runtime refresh while
  preserving live auth-store snapshots. This slice touches secops-owned files
  and must be retained only with explicit security-owner review.
- Slice 5, release closure: update local version metadata to `2026.5.19` only
  after required slices are either absorbed, locally equivalent, or explicitly
  deferred with protection notes.

## Current Working Tree Grouping

- Runtime/task-mode stability: `src/agents/pi-embedded-runner/**`,
  `src/agents/openai-transport-stream.ts`,
  `src/agents/pi-embedded-subscribe.handlers.tools.ts`,
  `src/auto-reply/reply-payload.ts`, and matching agent/auto-reply tests.
- Subagent policy and Discord delivery: `src/agents/subagent-*`,
  `src/agents/tools/agents-list-tool.ts`, and
  `extensions/discord/src/subagent-hooks.ts`.
- Cron/task routing: `src/cron/**`, `src/gateway/server-cron.ts`, and cron
  tests.
- Reconnect duplicate-message protection:
  `src/gateway/server-methods/chat.ts`, `ui/src/ui/controllers/chat.ts`, and
  matching gateway/UI tests. Browser validation on `localhost:18789` found a
  transient live-view duplicate user bubble after a send completed, even though
  refresh/reload collapsed it to one persisted message. The local UI controller
  now also dedupes adjacent repeated user echoes when terminal chat events
  append the final/aborted assistant message.
- Config/provider/CLI maintenance: config schema/runtime files,
  provider-model rows, CLI parsing/logging/message output, media fetch,
  ClawHub URL handling, `config bootstrap-env`, Codex OAuth account ordering,
  and generated config baseline hash.
- Bundled plugin/runtime fixes: browser existing-session navigation guard,
  NVIDIA endpoint metadata, Ollama capability defaults, Discord thread-bound
  subagent origin, and memory host directory creation failure propagation.
- Secops-owned runtime auth refresh: `src/agents/auth-profiles.ts`,
  `src/gateway/server-methods/config.shared-auth.test.ts`,
  `src/secrets/runtime-request-secret-refs.test.ts`, and
  `src/secrets/runtime.ts`. These files are covered by CODEOWNERS secops rules
  and need owner review before being included in any final commit.

## Local Equivalent Or Deferred

- Local equivalent: the LLM idle-timeout port is adapted through the existing
  dynamic post-tool-result wrapper instead of replacing
  `src/agents/pi-embedded-runner/run/attempt.ts` with official structure.
- Local equivalent: `00da318350` was applied to the local direct subagent
  runtime. ACP spawn is not using the same subagent target-policy path in this
  local version, so no raw ACP hunk was ported.
- Slice 2 audit note: local cron already diverges substantially from official
  timer/session routing (`tasks/task-executor`, local `task-session-key`, local
  delivery helpers, and local gateway cron notification flow). Do not port
  `9eee202a69` as raw hunks. It needs a dedicated local adapter pass that
  preserves task ledger child-session keys, archive visibility, and task-mode
  status semantics.
- Local equivalent: `9eee202a69` was applied through local cron service
  adapters. For main-target cron jobs, the target session remains the source of
  delivery context, while the actual cron wake runs in an isolated cron run
  session so main chat history and local archive/task views are not overwritten.
- Local equivalent: the diagnostic portion of `6048cd43a5` and `7f8141ead9`
  was applied through the existing local payload metadata and cron outcome
  helper instead of introducing the official `failure-signal` module, which is
  not present in this local baseline.
- Deferred for comparison: `47eb4ca14f` visible channel reply prompting may
  overlap with local mode controls and chat/task reply expectations. Compare
  behavior before replacing prompt or channel-routing text.
- Deferred for comparison: `4b35003051`, `c32878d1b7`, `880b39f061`, and
  `47eb4ca14f` together reshape Codex/direct/source reply routing. This is a
  protected local behavior area because it can change visible channel replies,
  source-gated message tool usage, and task-mode reply expectations. Keep it as
  a dedicated prompt/reply slice with before/after behavior notes before any
  code port.
- Deferred for comparison: `a54c73687f` provenance-bound Codex reasoning replay
  changes OpenAI transport replay, session history projection, and compact/run
  metadata. It is valuable, but broad enough to require a separate adapter pass
  against local session recovery and task/archive transcript semantics.
- Deferred for comparison: official update-repair and mobile/desktop release
  automation changes are mostly packaging/CI surfaces. They should not block
  local runtime closure unless the local app updater path is being changed.
- Deferred for comparison: `2ab3a4e422` heartbeat response-tool transcript
  filtering depends on official heartbeat response-tool plumbing that is not
  present in this local baseline. Treat it as a future dedicated comparison
  rather than raw-porting the large heartbeat filter rewrite into local
  task/reply paths.
- Deferred for comparison: `3132969c68` official ClawHub artifact fallback is
  useful but broad. It touches plugin update/install fallback semantics, so keep
  it for a dedicated adapter slice instead of mixing it into this small runtime
  pass.
- Deferred for comparison: `5d799c2d20` diagnostic event drain yielding depends
  on the newer official async diagnostic event surface
  (`waitForDiagnosticEventsDrained`, trusted/internal listeners, async queues,
  and high-frequency event priorities). The local `src/infra/diagnostic-events.ts`
  still uses synchronous listener dispatch with a smaller event union, so
  raw-porting the drain would change local diagnostic semantics without the
  upstream foundations. Revisit only as a dedicated diagnostic SDK slice.
- Deferred for comparison: `1c1c75df72` local embedding provider close-on-timeout
  spans Active Memory, memory-core, memory-host SDK, plugin SDK, and runtime
  provider lifecycle contracts. It is valuable but too broad for this small
  slice; compare it separately before changing memory provider lifecycle.
- Deferred as not applicable: `87aa319568` targets an `export-trajectory`
  command surface that is not present in this local baseline.
- Deferred as not applicable: `8eb0a1777f` targets the `src/commands/migrate`
  command tree, which is not present in this local baseline.
- Deferred as not applicable: `567fe2957d` targets the release configured
  plugin install doctor step (`release-configured-plugin-installs`), which is
  not present in this local baseline.
- Deferred as not applicable: `023e33cb07` targets
  `readTailAssistantTextFromSessionTranscript`, which is not present in this
  local baseline's transcript helper surface.
- Deferred as not applicable: `9657b8e8ce` targets detached/session-backed
  image generation task duplicate-guard plumbing. This local baseline's
  `image_generate` tool still runs through the synchronous generation path and
  does not expose the image task-status surface.
- Deferred as not applicable: `68c5a892d0` deduplicates official external
  plugin install-hint warnings, but this local baseline does not have that
  official install-hint warning path. Do not introduce the broader warning
  mechanism just to port the dedupe.
- Deferred as not applicable: `1fb09069c3` targets
  `src/commands/doctor-whatsapp-responsiveness.ts`, which is not present in
  this local baseline.
- Deferred as not applicable: `03c303d953` gates Telegram transcript mirrors
  to durable/final deliveries, but this local Telegram delivery baseline does
  not expose the official `transcriptMirror` delivery option. The non-final
  progress mirror bug surface is therefore absent locally; do not introduce
  the broader transcript mirror pipeline just to carry the one-line guard.
- Deferred for protection review: `40a5942091` QMD archived session visibility
  and `5613f5fd05` session reset CLI-binding cleanup both touch local
  archive/session-recovery behavior. Review them in a dedicated protected
  session/archive slice before changing code.
- Deferred for protection review: `1b82c0e3d9` prevents model-fallback retries
  from duplicating queued user and assistant-error transcript entries, but it
  changes protected runtime surfaces (`run/attempt`, `agent-runner-execution`,
  and `followup-runner`). Treat it as a dedicated task/reply fallback slice so
  the local task-mode timeout reconnect and blocking-state fixes are preserved.

## Current Gap List

- Finish reviewing the remaining `v2026.5.18..v2026.5.19` official fixes after
  the low-conflict runtime/config/logging items above are validated.
- Compare ACP-specific target policy and resume/session ownership changes only
  if the local ACP spawn surface is being iterated; the direct subagent wildcard
  risk is already closed for this slice.
- If branch review accepts the current secops-owned runtime auth refresh slice,
  this tracker can be treated as closed for the local `2026.5.19` checkpoint.

## Validation Plan

- Focused runtime/agent/config/cron/chat/CLI/provider tests passed:
  `OPENCLAW_LOCAL_CHECK=0 pnpm test src/agents/pi-embedded-runner/run/llm-idle-timeout.test.ts src/agents/openai-transport-stream.test.ts src/agents/bootstrap-budget.test.ts src/agents/pi-embedded-helpers.buildbootstrapcontextfiles.test.ts src/agents/openclaw-tools.subagents.sessions-spawn.allowlist.test.ts src/agents/openclaw-tools.agents.test.ts src/agents/pi-embedded-runner/run/payloads.test.ts src/agents/pi-embedded-runner/run/payloads.errors.test.ts src/agents/pi-embedded-subscribe.handlers.tools.test.ts src/cron/isolated-agent.helpers.test.ts src/cron/service/timer.test.ts src/gateway/server-cron.test.ts ui/src/ui/controllers/chat.test.ts src/gateway/server-methods/chat.directive-tags.test.ts`
- Focused CLI/provider/config/media/runtime tests passed:
  `OPENCLAW_LOCAL_CHECK=0 pnpm test src/cli/root-option-value.test.ts src/cli/shared/parse-port.test.ts src/commands/channels.logs.test.ts src/media/fetch.test.ts src/infra/clawhub.test.ts src/cli/acp-cli.option-collisions.test.ts src/commands/doctor/shared/legacy-web-search-migrate.test.ts src/config/web-search-codex-config.test.ts src/config/config-misc.test.ts src/config/schema.test.ts extensions/ollama/src/provider-models.test.ts src/agents/pi-embedded-runner/model.test.ts src/secrets/runtime-request-secret-refs.test.ts src/gateway/server-methods/config.shared-auth.test.ts packages/memory-host-sdk/src/host/internal.test.ts src/plugins/hooks.compaction-timeout.test.ts extensions/browser/src/browser/routes/agent.act.existing-session-navigation-guard.test.ts extensions/discord/src/subagent-hooks.test.ts src/agents/provider-attribution.test.ts src/agents/provider-request-config.test.ts src/commands/message.test.ts src/commands/models/list.list-command.forward-compat.test.ts`
- Config drift checks passed:
  `pnpm config:schema:check`
  `pnpm config:docs:check`
- Task-mode/reconnect protection tests passed:
  `OPENCLAW_LOCAL_CHECK=0 pnpm test src/auto-reply/reply/agent-runner-execution.test.ts src/auto-reply/reply/agent-runner-direct-runtime-config.test.ts src/gateway/server.chat.gateway-server-chat.test.ts ui/src/ui/controllers/sessions.test.ts ui/src/ui/app-chat.task-mode.test.ts`
- Cron/runtime snapshot tests passed:
  `OPENCLAW_LOCAL_CHECK=0 pnpm test src/cron/service/ops.test.ts src/cron/session-reaper.test.ts src/gateway/session-utils.search.test.ts src/config/runtime-snapshot.test.ts src/config/io.runtime-snapshot-write.test.ts`
- Agent event/change-review regression tests passed:
  `OPENCLAW_LOCAL_CHECK=0 pnpm test src/agents/pi-embedded-subscribe.subscribe-embedded-pi-session.subscribeembeddedpisession.test.ts src/agents/pi-embedded-subscribe.subscribe-embedded-pi-session.calls-onblockreplyflush-before-tool-execution-start-preserve.test.ts src/agents/pi-embedded-subscribe.subscribe-embedded-pi-session.suppresses-message-end-block-replies-message-tool.test.ts src/agents/pi-embedded-subscribe.subscribe-embedded-pi-session.waits-multiple-compaction-retries-before-resolving.test.ts src/agents/pi-tool-definition-adapter.after-tool-call.fires-once.test.ts`
- Change-review capture tests passed:
  `OPENCLAW_LOCAL_CHECK=0 pnpm test src/agents/pi-embedded-subscribe.handlers.tools.test.ts src/gateway/change-review-store.test.ts src/agents/pi-tools.change-review-preview.test.ts src/agents/pi-tools.change-review-mode.test.ts`
- Browser smoke on the running local Chrome page passed the basic send path:
  `validation ping please reply OK` produced one `OK` assistant reply, gateway
  stayed online, task-mode-off text remained visible, and refresh/reload showed
  one persisted user message. The live-view duplicate observed before refresh
  is covered by the additional UI controller regression test.
- UI controller focused test after browser smoke passed:
  `OPENCLAW_LOCAL_CHECK=0 pnpm test ui/src/ui/controllers/chat.test.ts`
- Config bootstrap/auth choice focused tests passed:
  `OPENCLAW_LOCAL_CHECK=0 pnpm test src/cli/config-cli.test.ts src/commands/auth-choice.test.ts`
- Local gates passed:
  `OPENCLAW_LOCAL_CHECK=0 pnpm tsgo`
  `OPENCLAW_LOCAL_CHECK=0 pnpm check`
  `git diff --check`
- Full `OPENCLAW_LOCAL_CHECK=0 pnpm test` was attempted and is not green on
  this worktree. The failures are broad baseline/environment or unrelated
  drift candidates; do not use them as permission to ignore scoped failures,
  but do not fold them into this backport slice without a separate triage pass.

## Original Validation Checklist

- Run focused tests for this iteration:
  `OPENCLAW_LOCAL_CHECK=0 pnpm test src/agents/pi-embedded-runner/run/llm-idle-timeout.test.ts src/agents/openai-transport-stream.test.ts`
- Run config/schema checks if generated config metadata is updated.
- Re-run task-mode protection tests before closing the checkpoint:
  `OPENCLAW_LOCAL_CHECK=0 pnpm test src/auto-reply/reply/agent-runner-execution.test.ts src/auto-reply/reply/agent-runner-direct-runtime-config.test.ts src/gateway/server.chat.gateway-server-chat.test.ts ui/src/ui/controllers/chat.test.ts ui/src/ui/controllers/sessions.test.ts ui/src/ui/app-chat.task-mode.test.ts`
- Slice 1b scoped validation:
  `OPENCLAW_LOCAL_CHECK=0 pnpm test src/agents/bootstrap-budget.test.ts src/agents/pi-embedded-helpers.buildbootstrapcontextfiles.test.ts src/agents/openclaw-tools.subagents.sessions-spawn.allowlist.test.ts src/agents/openclaw-tools.agents.test.ts`
- Slice 2a scoped validation:
  `OPENCLAW_LOCAL_CHECK=0 pnpm test src/agents/pi-embedded-runner/run/payloads.test.ts src/agents/pi-embedded-runner/run/payloads.errors.test.ts src/agents/pi-embedded-subscribe.handlers.tools.test.ts src/cron/isolated-agent.helpers.test.ts`
- Slice 2 cron routing scoped validation:
  `OPENCLAW_LOCAL_CHECK=0 pnpm test src/cron/service/timer.test.ts src/cron/service/ops.test.ts src/cron/session-reaper.test.ts src/gateway/session-utils.search.test.ts src/gateway/server-cron.test.ts`
- CLI root option scoped validation:
  `OPENCLAW_LOCAL_CHECK=0 pnpm test src/cli/root-option-value.test.ts`
- CLI parse helpers scoped validation:
  `OPENCLAW_LOCAL_CHECK=0 pnpm test src/cli/shared/parse-port.test.ts src/cli/root-option-value.test.ts`
- Media/log tail scoped validation:
  `OPENCLAW_LOCAL_CHECK=0 pnpm test src/media/fetch.test.ts src/commands/channels.logs.test.ts`
- ClawHub URL scoped validation:
  `OPENCLAW_LOCAL_CHECK=0 pnpm test src/infra/clawhub.test.ts`
- ACP CLI scoped validation:
  `OPENCLAW_LOCAL_CHECK=0 pnpm test src/cli/acp-cli.option-collisions.test.ts`
- Web search config scoped validation:
  `OPENCLAW_LOCAL_CHECK=0 pnpm test src/commands/doctor/shared/legacy-web-search-migrate.test.ts src/config/web-search-codex-config.test.ts`
- Memory scoped validation:
  `OPENCLAW_LOCAL_CHECK=0 pnpm test extensions/memory-core/src/memory/manager-search.test.ts packages/memory-host-sdk/src/host/internal.test.ts`
- Bundled provider overlay scoped validation:
  `OPENCLAW_LOCAL_CHECK=0 pnpm test src/config/config-misc.test.ts src/config/schema.test.ts`
- Ollama provider scoped validation:
  `OPENCLAW_LOCAL_CHECK=0 pnpm test extensions/ollama/src/provider-models.test.ts`
- Copilot resolved model scoped validation:
  `OPENCLAW_LOCAL_CHECK=0 pnpm test src/agents/pi-embedded-runner/model.test.ts`
- Runtime secret/config refresh scoped validation:
  `OPENCLAW_LOCAL_CHECK=0 pnpm test src/secrets/runtime-request-secret-refs.test.ts`
  `OPENCLAW_LOCAL_CHECK=0 pnpm test src/gateway/server-methods/config.shared-auth.test.ts`
  `OPENCLAW_LOCAL_CHECK=0 pnpm test src/config/runtime-snapshot.test.ts src/config/io.runtime-snapshot-write.test.ts`
- Config drift validation after web search schema changes:
  `pnpm config:schema:check`
  `pnpm config:docs:check`
- Gateway failed-session scoped validation:
  `OPENCLAW_LOCAL_CHECK=0 pnpm test src/gateway/server-methods/agent.test.ts`
- Message CLI JSON scoped validation:
  `OPENCLAW_LOCAL_CHECK=0 pnpm test src/commands/message.test.ts`
