---
summary: "CLI reference for `openclaw skills` (search/install/update/list/info/check)"
read_when:
  - You want to see which skills are available and ready to run
  - You want to search, install, or update skills from ClawHub
  - You want to debug missing binaries/env/config for skills
title: "skills"
---

# `openclaw skills`

Inspect local skills and install/update skills from ClawHub.

Related:

- Skills system: [Skills](/tools/skills)
- Skills config: [Skills config](/tools/skills-config)
- ClawHub installs: [ClawHub](/tools/clawhub)

## Commands

```bash
openclaw skills search "calendar"
openclaw skills search --limit 20 --json
openclaw skills install <slug>
openclaw skills install <slug> --version <version>
openclaw skills install <slug> --force
openclaw skills install <slug> --global
openclaw skills update <slug>
openclaw skills update <slug> --global
openclaw skills update --all
openclaw skills update --all --global
openclaw skills list
openclaw skills list --eligible
openclaw skills list --json
openclaw skills list --verbose
openclaw skills info <name>
openclaw skills info <name> --json
openclaw skills check
openclaw skills check --json
```

`search`/`install`/`update` use ClawHub directly. By default, `install` and
`update` target the active workspace `skills/` directory; with `--global`, they
target the shared managed skills directory. `list`/`info`/`check` still inspect
the local skills visible to the current workspace and config.

This CLI `install` command downloads skill folders from ClawHub. Gateway-backed
skill dependency installs triggered from onboarding or Skills settings use the
separate `skills.install` request path instead.

Notes:

- `search [query...]` accepts an optional query; omit it to browse the default
  ClawHub search feed.
- `search --limit <n>` caps returned results.
- `install --force` overwrites an existing workspace skill folder for the same
  slug.
- `--global` targets the shared managed skills directory.
- `update <slug>` updates a single tracked skill. Add `--global` to target the
  shared managed skills directory instead of the workspace.
- `update --all` updates tracked ClawHub installs in the active workspace, or
  in the shared managed skills directory when combined with `--global`.
- `list` is the default action when no subcommand is provided.
- `list`, `info`, and `check` write their rendered output to stdout. With
  `--json`, that means the machine-readable payload stays on stdout for pipes
  and scripts.
