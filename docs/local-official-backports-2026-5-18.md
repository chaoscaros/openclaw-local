# Local 2026.5.18 Backport Tracker

This note closes the selective local backport from official OpenClaw
`v2026.5.12` through the next stable official tag, `v2026.5.18`.

The branch baseline is `codex/known-good-b6d3086`; `main` is deprecated for the
local line and must not be used as the source of truth for this iteration.

## Version Policy

- `package.json` now tracks `2026.5.18`, meaning the local branch has closed the
  official `v2026.5.18` checkpoint.
- Later official tags remain out of scope for this round: do not include
  `v2026.5.19`, `v2026.5.20`, `v2026.5.22`, or any alpha/beta tag in this
  checkpoint.
- Future backports should continue from this branch, not from `main`.

## Closed-Out Areas

- Gateway/session/config fixes recorded in the 5.12 tracker are included in the
  local branch, including protocol mismatch diagnostics, manual compaction
  progress events, channel configured-state detection, Gateway token retry
  bounds, OpenAI HTTP token caps, wide-area DNS-SD minimal mode, and channel
  route metadata.
- Codex app-server alignment is included for the local 5.18 checkpoint:
  MCP projection, app-server session binding, sandbox shell exposure, sandbox
  writable-root/network policy mirroring, queued image hydration, native task
  and tool-progress behavior, and auth/profile handling.
- Cron/task alignment is included while preserving local task surfaces:
  isolated cron task session linking, exact-match source delivery, task ledger
  continuity, and local task-mode pending/status UI behavior.
- UI alignment is included while preserving local task/archive/mode controls:
  chat run status recovery, task context popover, session picker agent filter,
  usage tooltip/layout fixes, code highlighting, auto-scroll/text-size controls,
  and mobile safe-area/input zoom fixes.
- Memory/archive alignment is included for the local branch:
  memory-host directory error surfacing, fallback vector search batching,
  memory-wiki relative lint report paths, failed-session transcript rotation,
  and export HTML unsafe-link flattening.
- Channel/plugin alignment is included for the local branch:
  Telegram isolated polling/hot-reload/topic handling, Feishu webhook limiter
  key normalization, Matrix dependency repair guidance, Slack thread
  fail-closed behavior, Nextcloud Talk reactions, and default account
  preservation.

## Protected Local Surfaces

These local surfaces are intentionally preserved and must stay protected in
future official-tag iterations:

- Task entry points, task board/detail links, task-mode status strip, and task
  context popover naming.
- Archive/history behavior, transcript retention, and local session naming.
- Mode controls and persisted state for chat, code, task, focus, and active-run
  flows.
- Local Control UI navigation, storage keys, Chinese UI copy, and existing local
  release/backport docs.

When an official patch touches these areas, prefer focused hunks and adapters
over wholesale replacement.

## Deferred Beyond 5.18

- Official `v2026.5.19+` release train changes are intentionally deferred.
- Alpha/beta tags after `v2026.5.18` are intentionally ignored for this
  checkpoint.
- Any remaining broad official refactors that would replace local task,
  archive, or mode modules should be re-evaluated in the next stable-tag round.

## Validation Plan

- Run scoped tests first for changed local surfaces:
  `OPENCLAW_LOCAL_CHECK=0 pnpm test ui/src/ui/app-chat.test.ts ui/src/ui/views/chat.test.ts ui/src/ui/controllers/sessions.test.ts src/cron/service/timer.test.ts extensions/codex/src/app-server/run-attempt.test.ts`
- Then run `pnpm build`.
- Run the full `OPENCLAW_LOCAL_CHECK=0 pnpm test` only if scoped tests and build
  are green or if the next round touches shared protocol/schema surfaces.
