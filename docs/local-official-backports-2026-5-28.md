# Local 2026.5.28 Backport Tracker

This tracker starts the conservative local iteration from official OpenClaw
`v2026.5.27` to `v2026.5.28`.

The local branch for development is `codex/dev`. The current local package
version still tracks `2026.5.27`; do not bump it to `2026.5.28` until the
stable-tag audit is closed and the protected local surfaces below have been
verified.

## Branch And Commit Policy

- Develop on `codex/dev`.
- Push completed local slices to `origin/codex/dev`.
- Merge to `codex/qa` only after the scoped local verification for the slice is
  green and the user is ready to validate QA.
- Do not merge `main` into this local line as part of the official-tag audit.
- Keep commits scoped with `scripts/committer "<message>" <file...>`. Do not
  commit broad dirty/untracked official-sync residue.
- If `pnpm check` is blocked by unrelated `extensions/acpx` shrinkwrap drift,
  record that as an unrelated failure instead of repairing it in this
  iteration.

## Version Policy

- This round only considers the official stable range
  `v2026.5.27..v2026.5.28`.
- Alpha and beta tags in the same date range are not separate local iteration
  targets.
- Later official tags, including `v2026.6.1`, stay out of scope until this
  stable checkpoint is closed.
- Broad official refactors should be evaluated by protected surface, then
  absorbed through focused local adapters or cherry-picks rather than wholesale
  replacement.

## Protected Local Surfaces

- Task mode and ordinary mode must stay separated. Ordinary chat must not bind
  or inject task context after leaving task mode.
- The top task-binding entry, current task context, mobile task entry, task
  switching, archived/completed task list, and task-mode send path must keep
  working after each slice.
- Dreaming and Memory must preserve bounded short-term promotion, memory budget
  behavior, and protection against promotion writing unbounded content into
  `MEMORY.md`.
- Control UI error messages must not distort the top toolbar, duplicate tool
  errors should not stack, settings tab navigation must remain consistent, and
  mobile entry points must stay usable.
- Gateway and runtime protections include protocol mismatch diagnostics,
  unknown-method handling, strict `chat.send` parameter handling, native hook
  relay cleanup, native hook relay unavailable fallbacks for both `PreToolUse`
  and `PermissionRequest`, and `dist/build-info.json` matching the current
  source after build-affecting changes.
- `pnpm fast` is a protection point: keep `scripts/fast-gateway.mjs`, preserve
  gateway process-tree shutdown on Windows Ctrl+C, and do not start or restart
  services from the agent side.

## Stable Tag Audit Focus

The official `v2026.5.28` range is very large, so treat it as several small
audit lanes. Each lane should fit in roughly 30 minutes of implementation plus
scoped verification.

## Current Position

- `codex/dev` has absorbed the first pass of timer-safety hardening through
  the local Xiaomi TTS equivalent of `6e125adf3a`.
- The next large unabsorbed protected-surface candidate in stable-tag order is
  `69c3b56bde`, Codex Supervisor session-listing stability, but the local
  branch does not yet include the base `extensions/codex-supervisor` plugin
  from `9dd3bce549`. Treat that as a separate feature/plugin absorption before
  attempting the session-listing stabilization patch.
- Initial Codex Supervisor audit is complete: `9dd3bce549` is a full bundled
  plugin addition, not a narrow runtime fix. The local branch has already
  diverged from the official loader and gateway-client layout, so this lane
  must be re-applied against the current plugin/runtime surfaces rather than
  cherry-picked mechanically.
- If the Codex Supervisor plugin is absorbed, include the `69c3b56bde`
  session-listing stabilization in the same feature package or as the immediate
  follow-up slice. The base plugin alone leaves known unstable behavior around
  stored-session scans and app-server endpoint resolution.
- The Android private-LAN sequence is now absorbed. The iOS gateway/talk
  sequence remains unabsorbed feature work. Verify local mobile environment
  before attempting it.
- The iOS/macOS gateway ping continuation guard is absorbed, but the broader
  iOS gateway/talk flow remains unabsorbed feature work.
- The local Codex native hook relay interruption is closed for both read-style
  `PreToolUse` commands and write/approval-style `PermissionRequest` commands:
  when the relay is unavailable, OpenClaw now defers to the provider approval
  path instead of returning a stale deny.
- Workboard remains unabsorbed as a large optional dashboard/plugin feature
  lane. Do not pull it into a task-mode or Control UI fix opportunistically.

## Next Slice Queue

1. **Audit iOS Pro UI / Gateway Flow Bulk Commit**: keep `f6e51ff99a` as a
   large native/mobile feature lane. Do not cherry-pick it wholesale; identify
   protected gateway/task/talk behaviors first and split into sub-30-minute
   slices.
2. **iOS Talk Tab Realtime Playback UI**: the `6897711d19` Gateway/OpenAI
   realtime metadata contract is absorbed. The native Talk UI/playback files
   depend on `f6e51ff99a` because local `codex/dev` does not yet have the
   `Sources/Design` Pro UI components, the newer `RootTabs` tab model,
   `TalkGatewayPermissionState`, or the earlier `RealtimeTalkRelaySession`
   surface.
3. **Codex Supervisor Package/Workspace Reconciliation**: the plugin feature
   and close/type cleanup are absorbed and pushed. Remaining work is to decide
   whether root workspace metadata, generated plugin inventory, or lockfile
   updates are truly required, because plain `pnpm test
extensions/codex-supervisor` currently stops before tests while pnpm tries
   to reconcile the new workspace package without a TTY.
4. **Workboard / Control UI**: keep `86ed25af34..61031d1b1c` as a separate
   feature lane. Before implementation, inspect local task-mode, archive, and
   mobile entry behavior so the workboard plugin does not mask or regress
   existing task workflows.
5. **Release / CI / Generated Baselines**: leave broad release workflow churn,
   `49d6efc65b`, `ea8c052bcf`, and `420bfad613` until product/runtime slices
   are stable. These may require broader build/check gates and should not be
   bundled with user-facing runtime fixes.

## Absorbed In This Iteration

- `202ccf4cf7` / `c4e1bb30da` local equivalent, first hook-relay slice:
  native hook relay registration now prunes dead or expired same-user foreign
  bridge registry files while preserving live or unknown-liveness foreign
  records, and stable relay-id replacement leaves the previous registry record
  in place briefly so bridge callers can retry stale-registration/connection
  races instead of observing a missing relay. The local port intentionally
  leaves the broader deferred app-server tool approval path for a later
  sub-slice because that patch depends on a wider `agent-tools` approval seam.
- `9fc0e9659e` local equivalent for Gateway message actions: `message.action`
  now selects the resolved runtime config snapshot when the active source
  snapshot still matches the request config, then re-applies local plugin
  auto-enable metadata to that runtime config before dispatching channel
  actions. Ordinary `send` requests do not read runtime snapshots in this port,
  preserving the existing hot path and dedupe behavior.
- `18f9310844` local equivalent, core stale-buffer cleanup: chat run state now
  owns `clearRun`, tracks raw/suppressed buffer update time, and uses the shared
  cleanup path from abort, finalization, restart, and maintenance sweeps. The
  local port keeps compatibility for older Gateway contexts while ensuring
  orphaned raw buffers and buffered agent events are reaped once their run is no
  longer active.
- `d9051151d7` local equivalent for assistant idempotency dedupe: transcript
  abort partial persistence now dedupes only existing assistant messages, so a
  colliding user or other non-assistant transcript entry no longer suppresses a
  Gateway-injected assistant abort message. Legacy assistant transcript entries
  without a top-level message id are still treated as existing writes and return
  the idempotency key as the fallback message id.
- `42e9504114` / `cc2948d1e1` local core-harness subset: native hook relay
  registration can now intentionally preserve a caller-provided generation and
  accept one bounded bootstrap generation mismatch for resumed Codex hook
  commands. The grace path is disabled by default, expires on schedule, and is
  pinned to the first mismatched generation observed so a second stale
  generation is still rejected. The broader Codex app-server resume binding
  work remains a later sub-slice.
- `c91cbf3f71` / `228bed7da5` local run-attempt timeout subset: Codex
  app-server startup and idle timeout helpers now default non-finite values to
  their existing fallbacks and cap oversized timer delays to the platform timer
  ceiling. This local port keeps the existing `run-attempt.ts` layout instead
  of adopting the official `attempt-timeouts.ts` file split.
- `6950e85605` local focused subset: `sessions_spawn.taskName` now accepts
  lowercase hyphenated task slugs while preserving underscore aliases and
  rejecting uppercase, space-containing, leading-hyphen, and reserved names.
  The direct validator, tool schema description, system-prompt guidance, and
  focused tests are updated. The local `docs/tools/subagents.md` file does not
  currently contain the official taskName parameter text, and generated prompt
  snapshots were intentionally not modified in this chat.
- `5518ac998f` local equivalent: CLI backend turn logs now include
  content-safe output digests (`outBytes` plus a short sha256 hash) for ordinary
  subprocess turns, Claude live-session turns, and synthetic cron
  `before_agent_reply` short-circuits, without logging assistant response text.
- `b5bc752a48` local equivalent: Active Memory recall subagents now run on a
  dedicated `active-memory` lane instead of sharing the parent prompt-build
  lane, preserving recall isolation from ordinary prompt construction work.
- `61c538e2fc` local equivalent: LanceDB `memory_recall.limit` is normalized
  before querying LanceDB, accepting positive integer strings while rejecting
  fractional, non-finite, or otherwise invalid limits.
- `e9cca2d1ef` local equivalent: Memory Core `memory_search.maxResults` is now
  declared as a positive integer in tool schemas and rejected before any memory
  or wiki supplement search when fractional, non-finite, zero, or negative.
- `361753908e` local equivalent: Memory Core `memory_get.from` and
  `memory_get.lines` now use positive-integer tool schemas and fail before
  builtin or QMD/wiki reads when invalid ranges are supplied.
- `30de7874cf` local equivalent: Memory Wiki gateway and tool schemas now
  require positive integers for import-run limits, search result counts, and
  page range parameters before dispatching gateway operations.
- `27cd18748f` local equivalent: LanceDB memory capture and recall query text
  limits now fall back to defaults for non-finite values instead of accidentally
  disabling the length guard.
- `25a5cb3270` local equivalent: QMD-backed memory reads now normalize
  non-finite partial read windows before streaming canonical memory files,
  keeping `from` at line 1 and line counts on bounded defaults.
- `9596b7bd7a` local equivalent: shared memory read-result slicing now
  normalizes non-finite line windows and character budgets to positive defaults.
- `fd643139b1` local equivalent: LanceDB memory config now defaults non-finite
  capture/recall character budgets and rejects non-finite or fractional
  embedding dimensions in both runtime parsing and the manifest schema.
- `c36ba9ea7a` local equivalent: QMD backend numeric overrides now clamp
  positive sub-unit values to 1 and fall back for non-finite session, timeout,
  and result-limit overrides.
- `a7d2d9c6df` local equivalent: `openclaw doctor --fix` now migrates legacy
  `memorySearch.provider: "auto"` values to explicit `openai` after moving
  top-level memory search config into agent defaults.
- `efbd00f282` local equivalent: provider transport retry handling now ignores
  blank or malformed `retry-after-ms` values so `retry-after` fallback headers
  still determine terminal retry behavior.
- `2900c1c25c` local equivalent: inbound metadata and auto-reply envelope
  timestamps now include seconds, with docs updated to show the weekday plus
  second-precision form.
- `cc72519053` local mocked subset: Gateway probing now waits for
  `GatewayClient.stopAndWait()` to drain before resolving, falling back to
  `stop()` if close draining fails. The real socket-handle regression remains a
  later optional validation slice.
- `f3e285126a` local equivalent: restart sentinels now write doctor follow-up
  guidance as an actionable terminal/approvals-capable command instead of a
  terse `Run:` hint.
- `c9151ba902` local equivalent: provider transport now bounds local service
  startup with the resolved model request timeout and combines that timeout
  with any caller abort signal.
- `b4e5038692` local equivalent: root CLI version output now uses the
  root-only version invocation parser, so subcommands that accept their own
  `--version` option no longer trigger top-level OpenClaw version output.
- `00004ca798` local equivalent: CLI respawn and source compile-cache respawn
  signal handling now waits for the child process to exit after force-kill
  before falling back to a hard parent exit. The official root `openclaw.mjs`
  launcher hunk is not applicable because the local launcher no longer carries
  that respawn loop.
- `da5fe990d8` local equivalent: Codex dynamic tools quarantined for
  unsupported input schemas now emit trusted `tool.execution.blocked`
  diagnostic events with run/session context in addition to warning logs and
  bridge telemetry.
- `65e2120f8c` local equivalent: plugin `message_received` hook events now
  receive canonical inbound media metadata (`mediaPath`, `mediaUrl`,
  `mediaType`, and their array forms), matching the fields already exposed to
  inbound claim hooks.
- `11ffe36441` local equivalent: plugin CLI node invocation now caps the
  gateway call timeout after adding grace time while preserving the original
  node-level timeout parameter. The local port keeps the clamp helper private
  because the official shared numeric coercion helper has not been absorbed yet.
- `9d12dbb00b` local equivalent: cron agent-turn timeoutSeconds values now use
  a cron-local timer-safe seconds-to-milliseconds helper, capping oversized
  explicit job timeouts and the isolated-run timeout override before they reach
  timer-backed runtime paths.
- `82560fa1ba` local equivalent: provider-level request timeout metadata for
  embedded agent models now caps oversized `timeoutSeconds` values at the
  timer-safe ceiling. The local path is `pi-embedded-runner` rather than the
  official `embedded-agent-runner` directory.
- `4e2d9b0b76` local equivalent: provider transport model request timeouts now
  use a shared timer-safe clamp before arming `AbortSignal.timeout`, passing
  local service startup signals, or forwarding guarded-fetch timeout options.
- `fca7f220a7` local equivalent: provider transport retry-after handling now
  treats unsafe oversized retry delays as terminal bypasses and ignores unsafe
  `OPENCLAW_SDK_RETRY_MAX_WAIT_SECONDS` overrides instead of allowing very long
  SDK retry waits.
- `95e898bf05` local equivalent: exec process timeouts now normalize
  non-finite values away and clamp oversized positive values to the timer-safe
  delay ceiling before spawning supervised processes.
- `2106714f6b` local equivalent: node-host exec timeouts now normalize
  non-finite explicit values to the configured default and clamp oversized
  invoke/run timeout values before forwarding `system.run` through the node
  gateway.
- `f440121a49` local equivalent: node-host `withTimeout` now caps huge finite
  timeout delays before scheduling the abort timer while preserving the
  existing finite/positive timeout behavior.
- `4eeb7bfa57` local equivalent: shared retry helpers now fall back for
  malformed numeric overload attempts and cap retry/backoff delays at the
  timer-safe ceiling before sleeping.
- `75ef73d4f7` local equivalent: realtime talk fast-context lookup timeouts
  now clamp huge finite timeout values before scheduling the lookup abort
  timer.
- `7aca070723` local equivalent: `gh-read` now reads successful GitHub JSON
  responses through a bounded local reader capped at 1 MiB, cancels oversized
  bodies, and preserves request timeout behavior. The local port keeps the
  helper private because the official shared script bounded-response helper has
  not been absorbed yet.
- `e8217cbb7a` local equivalent: transitive manifest risk reporting now reads
  npm packuments through a bounded 16 MiB registry text reader, sends an
  explicit JSON Accept header, and cancels oversized registry responses before
  parsing.
- `bf42c73d18` local equivalent: agent run waits and `sessions_send`
  `timeoutSeconds` now clamp oversized wait timers to the timer-safe ceiling
  before calling `agent.wait`. The local port uses the existing
  `clampTimerTimeoutMs` helper instead of the later upstream seconds helper.
- `81533ff9d9` local equivalent: shared web tool timeout parsing now caps
  provider `timeoutSeconds` values at the timer-safe seconds ceiling before
  callers convert them to milliseconds.
- `ca78397386` local equivalent: Telegram request and startup probe timeout
  resolution now caps oversized configured `timeoutSeconds` before scheduling
  Bot API timers. The local port keeps the timer ceiling inside the Telegram
  plugin to preserve extension import boundaries.
- `bc1db759ac` local equivalent: ACPX service timeoutSeconds values now resolve
  through a plugin-local timer-safe milliseconds helper before constructing the
  default runtime or arming the startup probe watchdog.
- `4b9a80d895` local equivalent: Discord API request timeout options now clamp
  oversized values before creating `AbortSignal.timeout` signals. The local
  port keeps the timer ceiling inside the Discord plugin to preserve extension
  import boundaries.
- `f8ad20b87e` local equivalent: Signal container REST and receive checks now
  cap configured `timeoutMs` values before arming fetch and WebSocket timers.
  The local port keeps the timer ceiling inside the Signal plugin to preserve
  extension import boundaries.
- `f66d14def5` local equivalent: Zalo Bot API request timeout options now
  clamp oversized values before scheduling abort timers. The local port keeps
  the timer ceiling inside the Zalo plugin to preserve extension import
  boundaries.
- `0983e763fe` local equivalent: QA Matrix substrate JSON requests now clamp
  oversized timeout values before constructing `AbortSignal.timeout` signals.
  The local port keeps the timer ceiling inside the QA Matrix plugin to
  preserve extension import boundaries.
- `6e125adf3a` local equivalent: Xiaomi MiMo TTS requests now clamp oversized
  timeout values before scheduling abort timers or passing timeouts into the
  SSRF-guarded fetch path. The local port keeps the timer ceiling inside the
  Xiaomi plugin to preserve extension import boundaries.
- `ec3ac182c5`, `633c40aa65`, `5f3d6cde19`, and `771ddcf184` local equivalent:
  Android manual and setup-code pairing now allows cleartext gateway URLs for
  localhost, emulator bridge hosts, and private LAN IPs while keeping
  discovered non-loopback gateways on TLS unless they are explicitly trusted.
  Bootstrap handoff credentials are trusted for local-cleartext hosts, and
  manual private-LAN cleartext can intentionally override a previously stored
  TLS pin.
- `7965644da0` local equivalent: shared iOS/macOS gateway WebSocket ping
  handling now guards checked continuations so duplicate ping callbacks caused
  by cancellation races cannot resume the same continuation twice.
- Local Codex native hook relay guard follow-up: unavailable relay handling now
  returns no-op output for both `PreToolUse` and `PermissionRequest`. This keeps
  `exec_command`, `pwd`, `apply_patch`, and write-file flows from being blocked
  by a stale relay while still letting Codex's native approval path handle
  authorization when OpenClaw cannot decide.
- `9dd3bce549` plus the `69c3b56bde` stabilized shape, local first slice:
  added the default-off `codex-supervisor` bundled plugin directory with
  endpoint probing, loaded-session listing, bounded state-DB-only stored-session
  listing, opt-in raw transcript reads, and opt-in send/interrupt controls.
  The local port keeps dependency metadata inside
  `extensions/codex-supervisor/package.json` and aligns the plugin version with
  the current local package version instead of bumping the tree to `2026.5.28`.
- `bac13419a6` local equivalent: Codex Supervisor release-lint cleanup is
  absorbed by normalizing WebSocket raw data in the close-path test and removing
  the non-null assertion from endpoint-id resolution.
- `806dac4f3d` Codex Supervisor subset: the release-test typecheck tail for
  WebSocket raw data handling is absorbed without pulling unrelated Xiaomi,
  Zalo, or node-host test updates into this slice.
- `0167f0a6df` local focused subset: APNs relay registrations now carry
  `relayOrigin`, gateway relay resolution defaults to the hosted OpenClaw relay
  only when the stored registration came from that hosted origin, and push test,
  node wake, and exec-approval push paths reject mismatched relay origins rather
  than silently sending through a different relay.
- `0167f0a6df` remaining local equivalent: hosted iOS push relay is now the
  documented/default beta and gateway path, custom relay configuration is
  marked optional, config help/placeholders point at the hosted relay, the beta
  preparation script defaults to the hosted relay, and node-event relay
  registrations preserve the reported `relayOrigin`.
- `6897711d19` backend subset: realtime voice bridge events can now carry
  `itemId` and `responseId`, the bundled OpenAI realtime provider forwards
  those identifiers from server events, and the Gateway Talk realtime relay
  attaches them to audio deltas plus emits `audioDone` when provider output
  completes or is cancelled. The native iOS Talk tab UI/playback files remain
  a separate slice.
- `6897711d19` native UI audit: `TalkProTab.swift` cannot be absorbed on the
  current local UI tree by itself. It imports the Pro UI design layer from
  `f6e51ff99a` (`OpenClawBrand`, `CommandPanel`, `OpenClawProMetric`), relies
  on that commit's RootTabs rewrite, and uses Talk permission/runtime state
  that is absent from the current branch. Resume by splitting `f6e51ff99a`
  first, then return to the native Talk tab.
- `f6e51ff99a` backend sessions subset: `sessions.create` now inherits the
  parent session runtime/model/auth/level selection when a new child session
  omits an explicit model. The local equivalent also preserves `traceLevel`
  and model fallback origin metadata, covering the follow-up noted in the
  official commit message.
- `f6e51ff99a` backend Talk relay subset: provider-direct realtime sessions now
  leave assistant audio responses to provider/server VAD by default, forced
  consult mode still disables provider auto-response, final transcripts are
  recorded for echo detection, and assistant echo/control-like transcripts are
  no longer duplicated back into the realtime model.

### Lane 1: Gateway, Codex, And Hook Relay

High-priority official changes to compare against the local branch:

- `42e9504114` and `202ccf4cf7`: native hook relay restart and stale bridge-file
  cleanup.
- `c4e1bb30da`: native hook relay replacement-race handling.
- `cc2948d1e1`: narrower legacy hook generation grace.
- `9fc0e9659e`: message actions resolved against runtime config.
- `18f9310844`: stale chat stream buffer cleanup.
- `21d9609866`: quarantine unsupported effective tool schemas.
- `7a36bb37af`: warm MCP tools in effective inventory.
- `c923b07784`: browser tokens expire after auth rotation.
- `d9051151d7`: assistant idempotency dedupe scoping.
- `74f9d6b96d` and `7f7eca1ad2`: shared Codex app-server survival when helper
  startup fails.
- `228bed7da5`, `e5845dd452`, and `c91cbf3f71`: bounded Codex app-server and
  response timeout parsing.

Local check before editing this lane:

- Confirm the recent local fix still clears `hooks.state` when native hook relay
  is disabled.
- Confirm an unavailable native hook relay does not block either `PreToolUse`
  commands or `PermissionRequest`/`apply_patch` flows; the hook must no-op so
  Codex's provider approval path can continue.
- Confirm `scripts/fast-gateway.mjs` is still present before and after the
  slice.
- Prefer scoped gateway/Codex tests over full `pnpm check` when the unrelated
  dirty workspace is still present.

### Lane 2: Task Mode, Sessions, And Agent Runtime

High-priority official changes to compare:

- `5f68291f4f`: move session write lock into owned session runtime.
- `0dbdaf98ea`: release session lock before runtime teardown.
- `65fb56513f`: release session lock on timeout abort.
- `d8641a661b`: avoid stale restart continuation reuse.
- `5f88932806`: recover empty preflight compaction.
- `960117259d`: preserve rotated compaction session identity.
- `6950e85605`: allow hyphenated subagent task names.
- `5518ac998f`: add CLI turn output digests.
- `689e8ec893`: forward ACP spawn attachments.
- `8b7a4826a1`: keep hook context prompt-local.
- `73cf516def`: preserve embedded base system prompts.

Local check before editing this lane:

- Verify ordinary-mode chat does not carry a previous task context.
- Verify task switching does not remove the task-mode entry.
- Verify archived/completed task lists do not render blank when data exists.

### Lane 3: Dreaming And Memory

High-priority official changes to compare:

- `6fbdae1c51`: cap Dreaming short-term recall growth.
- `3029326a56`: compact short-term promotion entries.
- `b5bc752a48`: isolate active-memory recall lane.
- `d93524d1cc`: route Codex workspace memory through tools.
- `a7d2d9c6df`: migrate legacy memory auto provider.
- `61c538e2fc`, `361753908e`, `e9cca2d1ef`, and `30de7874cf`: strict numeric
  parsing for memory recall/get/search/wiki parameters.
- `27cd18748f`, `25a5cb3270`, `9596b7bd7a`, `fd643139b1`, and `c36ba9ea7a`:
  non-finite and positive-bound memory option handling.

Local check before editing this lane:

- Memory promotion should remain bounded and must not grow `MEMORY.md`
  unboundedly.
- Dreaming recall should not starve task-mode or gateway I/O.

### Lane 4: Control UI And Workboard

High-priority official changes to compare:

- `31a46638ad`: show chat errors as visible messages.
- `7d0347b6de`: shared UI chat send wrapper.
- `99bd275359`: usage scoped by agent filter.
- `8bd4736f03`: replay pending cron filter reloads.
- `e9655b9fdc`: preserve session picker on empty search blur.
- `13c1aa7fb9`: cron table filter e2e coverage.
- `86ed25af34` through `61031d1b1c`: workboard dashboard plugin, session-card
  sync, card execution actions, metadata, events, localization, and opt-in
  behavior.

Local check before editing this lane:

- Do not replace the local task/archive/mode UI wholesale.
- Use the user's open Chrome for visual QA when UI verification is needed.
- Avoid sandboxed UI e2e unless there is no smaller proof path.

### Lane 5: Mobile, iOS, And Android

High-priority official changes to compare:

- `f6e51ff99a`: iOS pro UI and gateway flows.
- `6897711d19`: iOS talk tab realtime playback.
- `0167f0a6df`: iOS hosted push relay default.
- `7965644da0`: iOS websocket ping continuation guard.
- `ec3ac182c5`, `633c40aa65`, `5f3d6cde19`, and `771ddcf184`: Android private
  LAN pairing, TLS pin preservation, cleartext handling, and private LAN
  credential trust.

Local check before editing this lane:

- Treat Android scope as OpenClaw mobile/native, not the unrelated
  `supply_vue` app.
- Confirm Java and Android SDK availability before attempting Android-specific
  verification.

### Lane 6: Release, CI, And Tooling

High-priority official changes to compare:

- `49d6efc65b`: root `sharp` dependency removal.
- `ea8c052bcf`: serialize gateway server Vitest project.
- `420bfad613`: generated 2026.5.28 baselines.
- Release hardening commits around live probes, candidate polling, Parallels
  Discord smoke, plugin npm readmes, and beta smoke commands.
- Test/runtime hardening that bounds captured process output, subprocesses,
  release checks, and startup benchmark helpers.

Local check before editing this lane:

- Do not absorb broad CI/release workflow churn unless it protects local
  verification or package correctness.
- If a change touches build output, packaging, lazy-loading/module boundaries,
  or published surfaces, run `pnpm build` and report that the user needs to
  restart services before acceptance testing.

## Current Execution Plan

1. Record the dirty/untracked baseline before each implementation slice, and
   keep commits scoped to the touched files plus this tracker.
2. Do not attempt Codex Supervisor session-listing stability until the base
   codex-supervisor extension is intentionally absorbed or explicitly skipped.
3. Keep each slice under 30 minutes. Split Codex Supervisor into base plugin,
   stored-session listing, and WebSocket close cleanup if needed.
4. For every completed slice, add an "Absorbed In This Iteration" entry with
   the exact official commit or local-equivalent explanation.
5. Run the most focused test for the slice. Use `FAST_COMMIT=1` only after
   scoped verification, and report any unrelated `pnpm check` blocker instead
   of repairing it in passing.

## Resume Order After Hook Relay Interruption

The hook relay interruption is a closed protection fix, not a reason to change
the official-tag execution order. Codex Supervisor is now absorbed through its
first stability/type-cleanup slices, so resume the 2026.5.28 audit in this
order:

1. Reconfirm `codex/dev` is at or beyond the hook relay protection commit and
   that task-related files are not carrying accidental uncommitted edits.
2. Keep the large `f6e51ff99a` iOS pro UI/gateway-flow commit as its own
   multi-slice native/mobile lane before returning to the remaining native
   Talk UI/playback slice from `6897711d19`.
3. Revisit Codex Supervisor only for workspace/package metadata, generated
   plugin inventory, or lockfile reconciliation after deciding whether those
   surfaces are required locally.
4. Keep Workboard/Control UI and broad release/CI/generated-baseline changes as
   later lanes unless the user explicitly pulls one forward.

## Codex Supervisor Absorption Notes

- Treat Codex Supervisor as a new bundled plugin feature, not as a hotfix.
  Default-off activation is required for the first local port.
- Port from the stabilized shape after `69c3b56bde`, even if the commit log
  order records `9dd3bce549` first. The unstable base behavior should not be
  landed as an independently validated local state.
- Keep raw transcript reads and write controls opt-in. The default local
  acceptance path should prove endpoint probing and loaded-session listing
  before enabling send or interrupt flows.
- Do not reuse the official `src/agents/sessions/extensions/loader.ts` hunk:
  that file is absent in the current local branch. Reconcile any required
  loader or virtual-module behavior with the current plugin loader instead.
- Avoid broad package or lockfile churn until the extension files compile
  locally. If dependency metadata must change, keep it scoped to the plugin and
  the minimal generated/runtime artifacts required by the current repo checks.
- Validation should start with the plugin's own unit tests
  (`supervisor`, `json-rpc-client`, MCP tools, and plugin tools). Only widen to
  build or plugin inventory generation if the touched files affect build output
  or generated plugin docs.
- First-slice validation: `OPENCLAW_LOCAL_CHECK=0 node scripts/test-projects.mjs
extensions/codex-supervisor` passed 4 test files / 40 tests. Plain
  `pnpm test extensions/codex-supervisor` currently tries to run `pnpm install`
  because a new workspace package was added, then aborts without a TTY before
  tests start; do not treat that as a plugin test failure.

## Absorbed In This Iteration

- `f6e51ff99a` shared mobile support subset:
  - Increased shared Gateway connect timeout to tolerate slower remote
    challenge delivery.
  - Added `GatewayNodeSession.send(method:paramsJSON:)` so native callers can
    forward fire-and-forget gateway methods through the same JSON decoding path
    as request calls.
  - Removed the share-extension fallback instruction so empty shared content no
    longer opens an agent task with a synthetic "help me" message.
  - Added OpenClawKit regression tests for empty share deeplinks, explicit share
    instructions, and decoded fire-and-forget node sends.
- Deferred from this slice:
  - The Swift protocol generator / generated `GatewayModels.swift` cleanup from
    `f6e51ff99a` is intentionally left for a separate generated-file slice
    because those files already have broader local sync drift.
  - The large iOS Pro UI refresh remains split out; it depends on local design
    modules and chat/session surfaces that are not safe to absorb as a narrow
    support patch.
- `f6e51ff99a` shared Chat session-key subset:
  - Extended ChatViewModel event filtering so a UI currently using the `main`
    alias also accepts the configured resolved main session key, such as
    `agent:<id>:main`.
  - Added a regression test for external run completion events emitted under a
    resolved main session key, preventing the mobile/chat UI from missing
    canonical Gateway events.
- `f6e51ff99a` iOS Chat transport subset:
  - Added the shared Chat transport contract for `sessions.create` and
    `agent.wait` completion observation with defaults for existing transports.
  - Implemented the iOS Gateway transport wrappers for `sessions.create` and
    `agent.wait`, including request-timeout grace for long waits.
  - Added iOS transport unit coverage for create-session params, agent-wait
    timeout sizing, completion status parsing, and disconnected create-session
    failure.
- `f6e51ff99a` shared Chat pending-run subset:
  - After `chat.send` accepts a run, ChatViewModel now uses the transport's
    run-completion observer as a non-event fallback to refresh history and clear
    pending state when Gateway chat events are missed.
  - Added shared ChatViewModel coverage for the completion-observer fallback so
    mobile chat does not remain stuck in a pending state after a completed run.
- `f6e51ff99a` shared Chat new-session subset:
  - Changed `/new` from resetting the current conversation to creating a fresh
    session through `sessions.create`, preserving the parent session key for
    model/runtime inheritance.
  - Added coverage that `/new` generates an agent-scoped iOS session key and
    does not call `sessions.reset` on the parent session.
- `f6e51ff99a` shared Chat foreground-resume subset:
  - Added a foreground resume hook so ChatView refreshes pending runs when the
    app becomes active again.
  - Added ViewModel coverage that a run completed while backgrounded refreshes
    history and clears pending state on foreground resume.
- `f6e51ff99a` shared Chat pending-send guard subset:
  - Blocked direct `send()` calls while a run is already pending so non-button
    paths cannot enqueue a second main chat request.
  - Added ViewModel coverage that the second input stays in the composer and no
    additional transport send occurs while the first run remains pending.
- `f6e51ff99a` shared Chat final-event render subset:
  - Added a lightweight final-event text extractor so assistant text carried on
    `chat` final events can render before the next history refresh catches up.
  - Added ViewModel coverage that a stale history response does not hide the
    final event's assistant reply.
- `f6e51ff99a` shared Chat stale-health send subset:
  - Changed send flow to refresh stale health before sending instead of
    fail-closing on a cached unhealthy status.
  - Added ViewModel coverage that a stale `healthOK == false` cache does not
    prevent the message from reaching the transport.
- `f6e51ff99a` shared Chat session-message subset:
  - Added shared transport support for `session.message` events and appending
    external user messages for the active session when no run is pending.
  - Added coverage for active-session transcript append and other-session
    filtering so cross-client/mobile transcripts do not bleed between sessions.
- `f6e51ff99a` shared Chat assistant-error display subset:
  - Preserved decoded assistant `errorMessage` values and rendered them when
    the assistant error turn has no meaningful text body.
  - Added coverage so provider errors replace empty/fallback text without
    overriding partial assistant content or non-error stops.
- `f6e51ff99a` shared Chat agent-run event subset:
  - Matched agent stream and lifecycle events against pending run IDs while
    retaining the older session-id stream compatibility path.
  - Added lifecycle-end coverage so pending runs clear, tool/streaming state is
    reset, and history refreshes when Gateway emits a terminal run event.
- `f6e51ff99a` shared Chat thinking-metadata model subset:
  - Added Codable session/default fields for provider and thinking option
    metadata returned by Gateway session lists.
  - Added decode coverage for `thinkingLevels`, legacy `thinkingOptions`, and
    `thinkingDefault` so later picker UI can consume the contract safely.
- `f6e51ff99a` shared Chat thinking-options ViewModel subset:
  - Added ViewModel `thinkingLevelOptions` derived from current session metadata,
    matching defaults, or baseline levels while keeping the current level visible.
  - Added coverage for session-specific thinking levels and fallback legacy
    thinking options that preserve unsupported current levels such as `xhigh`.
- `f6e51ff99a` shared Chat completion-wait guard subset:
  - Changed `agent.wait` completion refresh to clear pending state only after
    refreshed history contains an assistant reply after the optimistic user turn.
  - Added coverage that completion without synced assistant history keeps the
    run pending instead of prematurely hiding the waiting state.
- `f6e51ff99a` shared Chat dynamic-thinking picker subset:
  - Switched the shared composer thinking picker from fixed labels to
    ViewModel-provided thinking options, with a baseline fallback.
  - Kept this as a wiring-only UI slice; the broader Pro composer redesign is
    still deferred to the larger visual refresh lane.
- `f6e51ff99a` shared Chat draft-state subset:
  - Split ViewModel draft detection from send eligibility via `hasDraftToSend`
    and `canSendDraft`, preserving `canSend` as the pending-aware gate.
  - This prepares the clean composer/talk-control UI without changing current
    send button behavior.
- `f6e51ff99a` shared Chat session-change callback subset:
  - Added an optional ViewModel `onSessionChanged` callback and invoked it when
    switching sessions or creating a fresh `/new` session.
  - Existing callers keep the same behavior because the callback defaults to
    nil; later embedded chat surfaces can track session-key changes explicitly.
- `f6e51ff99a` shared Chat diagnostics callback subset:
  - Added an optional ViewModel diagnostics callback for send attempts,
    transport acceptance/failure, foreground recovery, run events, timeouts, and
    pending-run cleanup.
  - Kept the callback defaulted to nil so existing Chat surfaces behave the
    same while mobile/debug hosts can observe stuck-run state transitions.
- `f6e51ff99a` shared Chat attachment processing subset:
  - Added a shared `ChatImageProcessor` that transcodes chat image attachments
    to bounded JPEG payloads, strips source metadata, and flattens transparent
    sources before upload.
  - Split ViewModel attachment staging into a dedicated extension and added
    coverage for processed attachment filenames, MIME type, payload budget, and
    longest-edge limits.
- `f6e51ff99a` shared Chat session-key helper split subset:
  - Moved current-session alias matching into a dedicated ViewModel extension
    without changing the accepted `main`/resolved-main/`agent:main:main` cases.
  - This keeps the main ViewModel smaller before the larger Chat UI refresh and
    leaves the matching helper callable by follow-up tests.
- `f6e51ff99a` shared Chat final-event text coverage subset:
  - Added focused coverage for extracting assistant text from final chat events,
    ignoring user messages, and handling plain string content.
  - Kept the existing `Foundation` import because this local implementation
    still uses whitespace trimming helpers.
- `f6e51ff99a` shared Talk locale parsing subset:
  - Added speech locale normalization plus supported-locale fallback selection
    helpers used by the iOS talk flow.
  - Added focused parsing coverage, while leaving the contract fixture path
    change out because this local tree currently does not contain the fixture.
- `f6e51ff99a` shared Chat iOS theme palette subset:
  - Added adaptive iOS light/dark palette colors for chat canvas, panels,
    assistant bubbles, composer surfaces, and composer borders.
  - Kept macOS theme behavior unchanged; this prepares the larger clean
    composer and Pro ChatView visual refresh.
- `f6e51ff99a` shared Chat assistant avatar bubble subset:
  - Added reusable assistant avatar rendering plus optional ChatView parameters
    for assistant name, avatar text, tint, and avatar visibility.
  - Wired assistant messages, pending typing, and streaming assistant bubbles to
    the avatar parameters while keeping avatars disabled by default for the
    current desktop Control Chat surface.
- `f6e51ff99a` shared Chat embeddable background subset:
  - Added a `drawsBackground` ChatView option, defaulting to the current
    behavior, so embedded hosts can provide their own backdrop in later UI
    slices without duplicating the Control Chat background.
- `f6e51ff99a` shared Chat composer undo subset:
  - Centralized macOS composer text-view defaults behind a factory and enabled
    native undo support for the chat input.
  - Added focused macOS coverage so future composer refactors keep undo enabled.
- `f6e51ff99a` shared Chat display-text subset:
  - Reused `OpenClawChatMessage.displayText(...)` when deriving visible text in
    `ChatView`, keeping message-list visibility aligned with assistant error and
    stop-reason rendering rules.
- `f6e51ff99a` shared Chat clean intro subset:
  - Added the `OpenClawChatView.ComposerChrome` entry point and optional clean
    empty-state assistant intro without changing the default full composer
    behavior.
- `f6e51ff99a` shared Chat clean loading subset:
  - Added an inline clean-mode loading bubble while keeping the default full
    composer spinner behavior unchanged.
- `f6e51ff99a` shared Chat clean error subset:
  - Rendered initial clean-mode errors as inline notice rows so embedded chat
    hosts can keep the conversation surface anchored instead of showing the
    full overlay card.
- `f6e51ff99a` shared Chat placeholder subset:
  - Threaded an optional message placeholder from `OpenClawChatView` into the
    composer while preserving the existing default `Message OpenClaw…` copy.
- `f6e51ff99a` shared Chat talk-control model subset:
  - Added the public `OpenClawChatTalkControl` value type as the narrow UI
    contract for later realtime talk composer controls, without wiring it into
    the default composer yet.
- `f6e51ff99a` shared Chat talk-control plumbing subset:
  - Threaded the optional `OpenClawChatTalkControl` from `OpenClawChatView` into
    the composer as inert plumbing so later Talk UI slices can remain scoped.
- `f6e51ff99a` shared Chat composer chrome subset:
  - Passed `OpenClawChatView.ComposerChrome` into the composer and made the
    existing outer composer background conditional on the default `.full`
    chrome, preparing clean composer rendering without changing current callers.
- `f6e51ff99a` shared Chat composer toolbar extraction subset:
  - Extracted the existing composer toolbar into `composerToolbar` with the same
    full-mode ordering, reducing noise before clean toolbar layout changes.
- `f6e51ff99a` shared Chat composer toolbar layout subset:
  - Put the full composer selector group in a horizontal scroll container so
    compact widths do not squeeze refresh and attachment controls.
- `f6e51ff99a` shared Chat thinking picker subset:
  - Let the composer render `viewModel.thinkingLevelOptions` directly, relying
    on the ViewModel's default and session-derived option normalization.
- `f6e51ff99a` shared Chat composer view extraction subset:
  - Extracted `OpenClawChatView`'s composer construction into a dedicated
    computed view before the mobile safe-area layout slice.
- `f6e51ff99a` shared Chat mobile safe-area composer subset:
  - Kept the macOS chat layout unchanged while moving the non-macOS composer
    into a bottom `safeAreaInset` so mobile chat input is not part of the
    scroll stack.
- `f6e51ff99a` shared Chat notice card subset:
  - Updated shared chat notice cards to the compact horizontal presentation used
    by the refreshed mobile chat surfaces.
- `f6e51ff99a` shared Chat clean attachment subset:
  - Switched the composer attachment picker to plain button styling only when
    `composerChrome == .clean`, preserving the default full composer controls.
- `f6e51ff99a` shared Chat composer identity plumbing subset:
  - Threaded chat accent and assistant identity values into the composer as
    inert plumbing for upcoming clean send and talk controls.
- `f6e51ff99a` shared Chat full editor extraction subset:
  - Extracted the existing composer editor body into `fullEditor` without
    changing layout, preparing a separate clean editor branch.
- `f6e51ff99a` shared Chat clean editor subset:
  - Added the first compact `composerChrome == .clean` editor branch with a
    horizontal attachment, input, and send layout while leaving `.full`
    rendering untouched.
- `f6e51ff99a` shared Chat clean editor overlay subset:
  - Added clean-mode editor overlay alignment and inset helpers so placeholder
    text sits correctly in the compact field while full-mode padding stays
    unchanged.
- `f6e51ff99a` shared Chat talk and send controls subset:
  - Wired the existing optional Talk control into full and clean composer
    layouts, added compact Talk/accessory styling, and restored refreshed
    send/stop button sizing while keeping the default composer mode unchanged.
- `f6e51ff99a` shared Chat clean connection pill subset:
  - Restored the clean composer connection-status row below the compact input
    controls so embedded chat hosts keep gateway status visible.
- `f6e51ff99a` shared Chat mobile input subset:
  - Restored the non-macOS vertical `TextField` composer path with clean-mode
    text metrics and alignment while leaving the macOS text-view bridge
    untouched.
- `f6e51ff99a` shared Chat draft-send subset:
  - Kept the send button available while a run is pending when the user has a
    draft, matching the refreshed composer behavior without changing abort
    handling for empty drafts.
- `f6e51ff99a` shared Chat send-refresh fallback subset:
  - Added the native Chat post-send history refresh fallback sequence so
    accepted sends still reconcile assistant replies when completion events are
    delayed or missed.
- `f6e51ff99a` shared Chat pending-run foreground subset:
  - Tightened foreground pending-run cleanup to require a non-empty assistant
    reply after the latest user message before clearing pending state.
- `f6e51ff99a` shared Chat new-session error subset:
  - Limited `/new` fallback-to-reset behavior to transports that do not support
    `sessions.create`, while surfacing other create-session errors to the user.
- `f6e51ff99a` iOS chat transport params subset:
  - Restored typed JSON helper coverage for `sessions.list` and `chat.send`,
    and re-added chat-send Gateway diagnostics around start, success, and
    failure.
- `f6e51ff99a` iOS gateway config comparison subset:
  - Added reusable `GatewayConnectConfig` connection-input comparison with
    normalized scope/capability/command arrays to prepare safer reconnect
    decisions.
- `f6e51ff99a` iOS gateway same-config reconnect subset:
  - Skipped restarting active gateway loops when the next connect request uses
    identical inputs, while preserving explicit force reconnect and different
    gateway handoff behavior.
- `f6e51ff99a` iOS manual LAN gateway TLS subset:
  - Allowed manual `.local` and private-LAN gateway hosts to stay plaintext
    while preserving forced TLS for public hosts, tailnet DNS, and CGNAT-like
    remote addresses.
- `f6e51ff99a` iOS location permission subset:
  - Added a testable location permission helper so gateway registration only
    advertises location access when both global services and app authorization
    are available.
- `f6e51ff99a` iOS saved manual endpoint fallback subset:
  - Added a testable saved-manual-endpoint fallback so auto-connect can recover
    to the configured manual gateway after discovery candidates fail, while
    requiring both auto-connect and manual gateway mode to be enabled.
  - Also routes `connectLastKnown()` through the same fallback when the saved
    discovered gateway is not present in the current discovery list.
- `f6e51ff99a` iOS operator explicit scopes subset:
  - Added the shared `GatewayConnectOptions.scopesAreExplicit` field and
    operator helper plumbing so later Talk permission upgrades can request an
    explicit scope set without changing existing reconnect defaults.
- `f6e51ff99a` iOS gateway credentials storage subset:
  - Added a keychain-backed `currentInstanceID()` helper and routed gateway
    credential reads through it so reconnects keep working after defaults are
    restored from keychain.
  - Trim gateway token, bootstrap token, and password saves, deleting existing
    keychain entries when the saved value is blank.
- `f6e51ff99a` shared gateway setup input subset:
  - Expanded gateway setup parsing to accept raw JSON, copied setup messages,
    raw websocket URLs, and `.local`/private LAN plaintext endpoints.
  - Narrowed local-network plaintext checks so tailnet and public hosts still
    require TLS, preserving the manual Gateway TLS guardrails.
- `f6e51ff99a` legacy iOS setup decoder compatibility subset:
  - Kept the older `GatewaySetupCode` decoder used by existing onboarding and
    settings forms, but taught it to extract setup-code candidates from copied
    setup messages.
- `f6e51ff99a` shared Share-to-Agent empty payload subset:
  - Avoid treating empty URL/text fields as shared content, and isolate default
    instruction state in the deep-link tests so empty payloads stay nil.
- `f6e51ff99a` shared gateway stored-scope subset:
  - Reuse stored device-token scopes on reconnect unless the caller marks the
    requested scope set as explicit, preserving older paired operator tokens
    while allowing deliberate scope upgrades.
- `f6e51ff99a` shared gateway password auth subset:
  - Prefer explicit password auth over stale bootstrap tokens when both are
    present on a connect attempt.
- `f6e51ff99a` iOS Talk speakerphone default subset:
  - Added a testable Talk speakerphone preference helper that defaults to
    enabled until explicitly configured.
- `f6e51ff99a` shared Talk speech locale test subset:
  - Added coverage for trimming and preserving configured Talk speech locale
    IDs from gateway config payloads.
- `f6e51ff99a` iOS Talk voice descriptor subset:
  - Added Talk provider and realtime voice selection helpers plus a testable
    voice-mode descriptor builder for realtime, relay, ElevenLabs, and iOS
    system voice labels without changing the existing gateway config parser
    call sites.
- `f6e51ff99a` iOS Talk realtime config parsing subset:
  - Extended the Talk gateway config parser to expose realtime execution mode,
    provider, model, voice, and speech-locale fields while keeping the existing
    manager call site compatible through a default realtime model fallback.
  - Added focused coverage for OpenAI realtime payloads, single-provider
    inference, default realtime model fallback, redacted config payloads, and
    managed-room native fallback.
- `31a46638ad` local equivalent:
  - Gateway chat error broadcasts now include assistant-shaped visible error
    messages for both `chat.send` setup failures and agent lifecycle errors.
  - Control UI appends a visible assistant error bubble for active chat runs,
    while preserving the local suppression for command-shaped tool failures so
    tool errors do not duplicate as global chat errors.
- `274a8116af` local equivalent:
  - Session lifecycle commands now route bare numeric durations through the
    shared duration parser instead of multiplying raw hours locally, rejecting
    unsafe oversized `/session idle` and `/session max-age` values before
    persistence.
- `30c1ca5c7b` local equivalent:
  - Text slash command detection now treats command names case-insensitively
    for `/new`, `/reset`, registry aliases, and control-command detection while
    preserving the original argument casing.
- `28a719f3da` local equivalent:
  - Subagent steering now treats `sessions_yield` paused attempts as restartable
    even when the paused run has an `endedAt` timestamp, instead of reporting
    the yielded subagent as already finished.
- `736e04cb90` local equivalent:
  - Media downloads now drain ignored redirect and HTTP error response bodies
    before following a redirect or failing the request, so unused bodies do not
    leave sockets/backpressure hanging around.
- `96b8df75d5` local equivalent:
  - Input-file URL fetches now cancel ignored HTTP error bodies and oversized
    content-length bodies before returning errors, while still releasing the
    SSRF guard handle.
- `a0ba9f2b72` local equivalent:
  - Remote media buffer reads and saved-response media writes now cancel
    oversized content-length response bodies before surfacing max-byte errors.
- `c841218ace` local equivalent:
  - Native PDF provider API errors now read bounded response-body snippets and
    cancel truncated error bodies before surfacing Anthropic/Gemini failures.

## Validation Plan

- For documentation-only tracker updates, run no build or service restart.
- For Gateway/Codex changes, prefer scoped tests around
  `src/gateway/server-methods/chat.ts`, `src/gateway/server-chat.ts`,
  `extensions/codex/src/app-server`, and native-hook-relay coverage.
- For task/session changes, prefer scoped tests around task context injection,
  session reset/recovery, and `chat.send` idempotency.
- For Memory/Dreaming changes, prefer scoped tests in `extensions/memory-core`,
  `extensions/active-memory`, `src/hooks/bundled/session-memory`, and any
  `MEMORY.md` promotion guard coverage.
- For Control UI changes, prefer focused node/browser unit tests and Chrome
  visual QA over broad sandboxed e2e.
- For mobile changes, verify environment first and avoid Android/iOS build
  attempts unless the slice actually touches native code.
