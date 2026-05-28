---
summary: "CLI reference for `openclaw codex` (Codex auth cleanup helpers)"
read_when:
  - You need to switch Codex accounts used by OpenClaw agents
title: "codex"
---

# `openclaw codex`

Helpers for Codex-related local auth state.

## `codex clean`

Remove OpenClaw-side `openai-codex` auth bindings from agent auth state so you
can sign in with a different Codex account cleanly.

The command only touches OpenClaw agent auth files under the configured state
directory. It does not delete Codex CLI auth files such as `~/.codex/auth.json`,
and it does not remove other providers such as OpenAI API keys, Anthropic,
Google, Discord, or Telegram.

Examples:

```bash
openclaw codex clean --dry-run
openclaw codex clean
openclaw codex clean --force
```

Options:

- `--dry-run`: show what would be cleaned without writing files
- `--force`: skip the confirmation prompt
- `--json`: print machine-readable output

Recommended account-switch flow:

```bash
openclaw codex clean
# Sign in or select the new Codex OAuth account.
openclaw configure --section model
```
