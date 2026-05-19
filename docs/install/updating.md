---
summary: "Updating OpenClaw safely (global install or source), plus rollback strategy"
read_when:
  - Updating OpenClaw
  - Something breaks after an update
title: "Updating"
---

# Updating

Keep OpenClaw up to date.

## Recommended: `openclaw update`

The fastest way to update. It detects your install type (npm or git), fetches the latest version, runs `openclaw doctor`, and restarts the gateway.

```bash
openclaw update
```

To switch channels or target a specific version:

```bash
openclaw update --channel beta
openclaw update --tag main
openclaw update --dry-run   # preview without applying
```

`--channel beta` prefers beta, but the runtime falls back to stable/latest when
the beta tag is missing or older than the latest stable release. Use `--tag beta`
if you want the raw npm beta dist-tag for a one-off package update.

See [Development channels](/install/development-channels) for channel semantics.

## Alternative: re-run the installer

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

Add `--no-onboard` to skip onboarding. For source installs, pass `--install-method git --no-onboard`.

## Alternative: manual npm, pnpm, or bun

```bash
npm i -g openclaw@latest
```

```bash
pnpm add -g openclaw@latest
```

```bash
bun add -g openclaw@latest
```

Prefer `openclaw update` for supervised installs because it can coordinate the
package swap with the running Gateway service. If you update manually on a
supervised install, stop the managed Gateway before the package manager starts.
Package managers replace files in place, and a running Gateway can otherwise try
to load core or plugin files while the package tree is temporarily half-swapped.
Restart the Gateway after the package manager finishes so the service picks up
the new install.

For a root-owned Linux system-global install, if `openclaw update` fails with
`EACCES` and you recover with system npm, keep the Gateway stopped through the
manual package replacement. Use the same `openclaw` profile flags or environment
you normally use for that Gateway. Replace `/usr/bin/npm` with the system npm
that owns the root-owned global prefix on your host:

```bash
openclaw gateway stop
sudo /usr/bin/npm i -g openclaw@latest
openclaw gateway install --force
openclaw gateway restart
```

Then verify the service:

```bash
openclaw --version
curl -fsS http://127.0.0.1:18789/readyz
openclaw plugins list --json
openclaw doctor --deep --lint --json
```

## Auto-updater

The auto-updater is off by default. Enable it in `~/.openclaw/openclaw.json`:

```json5
{
  update: {
    channel: "stable",
    auto: {
      enabled: true,
      stableDelayHours: 6,
      stableJitterHours: 12,
      betaCheckIntervalHours: 1,
    },
  },
}
```

| Channel  | Behavior                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------- |
| `stable` | Waits `stableDelayHours`, then applies with deterministic jitter across `stableJitterHours` (spread rollout). |
| `beta`   | Checks every `betaCheckIntervalHours` (default: hourly) and applies immediately.                              |
| `dev`    | No automatic apply. Use `openclaw update` manually.                                                           |

The gateway also logs an update hint on startup (disable with `update.checkOnStart: false`).

## After updating

<Steps>

### Run doctor

```bash
openclaw doctor
```

Migrates config, audits DM policies, and checks gateway health. Details: [Doctor](/gateway/doctor)

### Restart the gateway

```bash
openclaw gateway restart
```

### Verify

```bash
openclaw health
```

</Steps>

## Rollback

### Pin a version (npm)

```bash
npm i -g openclaw@<version>
openclaw doctor
openclaw gateway restart
```

Tip: `npm view openclaw version` shows the current published version.

### Pin a commit (source)

```bash
git fetch origin
git checkout "$(git rev-list -n 1 --before=\"2026-01-01\" origin/main)"
pnpm install && pnpm build
openclaw gateway restart
```

To return to latest: `git checkout main && git pull`.

## If you are stuck

- Run `openclaw doctor` again and read the output carefully.
- For `openclaw update --channel dev` on source checkouts, the updater auto-bootstraps `pnpm` when needed. If you see a pnpm/corepack bootstrap error, install `pnpm` manually (or re-enable `corepack`) and rerun the update.
- Check: [Troubleshooting](/gateway/troubleshooting)
- Ask in Discord: [https://discord.gg/clawd](https://discord.gg/clawd)

## Related

- [Install Overview](/install) — all installation methods
- [Doctor](/gateway/doctor) — health checks after updates
- [Migrating](/install/migrating) — major version migration guides
