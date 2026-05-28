---
summary: "CLI reference for `openclaw env` (default .env creation and gateway token rotation)"
read_when:
  - You want to create the default OpenClaw .env file
  - You need to rotate the local Gateway token stored in .env
title: "env"
---

# `openclaw env`

Manage the default OpenClaw `.env` file at `~/.openclaw/.env`.

This command group is meant for local workstation setup. It creates the env file only
when you ask it to, then other init commands can read that file to create config and
agent state.

## Recommended flow

```bash
openclaw env init
# edit ~/.openclaw/.env and set OPENCLAW_STATE_DIR plus OPENCLAW_CONFIG_PATH
openclaw config init
openclaw agents init
```

## `env init`

Create `~/.openclaw/.env` from `.env.example` and generate a fresh
`OPENCLAW_GATEWAY_TOKEN`.

Template lookup order:

1. `.env.example` in the current working directory
2. `.env.example` bundled with the OpenClaw package

Options:

- `--force`: replace an existing `~/.openclaw/.env`

Examples:

```bash
openclaw env init
openclaw env init --force
```

After creation, edit at least these values:

```env
OPENCLAW_STATE_DIR=/path/to/openclaw/state
OPENCLAW_CONFIG_PATH=/path/to/openclaw/config/openclaw.runtime.json5
```

On Windows, use Windows paths or environment-variable expansion:

```env
OPENCLAW_STATE_DIR=%USERPROFILE%\openclaw-state
OPENCLAW_CONFIG_PATH=%USERPROFILE%\openclaw-config\openclaw.runtime.json5
```

Do not copy macOS paths such as `/Users/name/...` into Windows `.env` files.

## `env token`

Rotate `OPENCLAW_GATEWAY_TOKEN` in `~/.openclaw/.env`.

Options:

- `--print`: print the generated token after writing it

Examples:

```bash
openclaw env token
openclaw env token --print
```

By default, the command does not print the new token to avoid accidental secret
leaks in terminal logs.
