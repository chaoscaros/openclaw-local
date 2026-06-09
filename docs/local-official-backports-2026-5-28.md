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
  relay cleanup, and `dist/build-info.json` matching the current source after
  build-affecting changes.
- `pnpm fast` is a protection point: keep `scripts/fast-gateway.mjs`, preserve
  gateway process-tree shutdown on Windows Ctrl+C, and do not start or restart
  services from the agent side.

## Stable Tag Audit Focus

The official `v2026.5.28` range is very large, so treat it as several small
audit lanes. Each lane should fit in roughly 30 minutes of implementation plus
scoped verification.

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

## First Slice Execution Plan

1. Record the dirty/untracked baseline before each implementation slice.
2. Start with Lane 1 because hook relay, gateway protocol behavior, and
   `pnpm fast` are active protection points.
3. After Lane 1, continue with Lane 2 task/session separation before absorbing
   workboard or mobile feature changes.
4. Keep each slice under 30 minutes. If a lane is larger, split by one commit
   family and leave the rest in this tracker.
5. For each completed lane, add an "Absorbed In This Iteration" entry with the
   exact official commit or local-equivalent explanation.

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
