# 本地命令索引

完整 CLI 命令树见 `docs/cli/index.md`。这里按本地维护场景分类，记录常用入口和文档位置。

## 启动和构建

```bash
pnpm install
pnpm build
pnpm ui:build
pnpm fast
pnpm ui:dev
```

说明：

- `pnpm build`：构建代码和 Control UI 相关产物。
- `pnpm ui:build`：单独构建 Control UI。
- `pnpm fast`：快速启动本地 gateway。
- `pnpm ui:dev`：单独启动 UI 开发服务。

用户已经启动 gateway 时，不要擅自重启后台服务。

## 初始化和配置

- `openclaw env init` / `openclaw env token`：见 `docs/cli/env.md`
- `openclaw config init`：见 `docs/cli/config.md`
- `openclaw agents init`：见 `docs/cli/agents.md`
- `openclaw codex clean`：见 `docs/cli/codex.md`
- `openclaw setup`：见 `docs/cli/setup.md`
- `openclaw onboard`：见 `docs/cli/onboard.md`
- `openclaw configure`：见 `docs/cli/configure.md`
- `openclaw completion`：见 `docs/cli/completion.md`

## Gateway、诊断和更新

- `openclaw gateway ...`：见 `docs/cli/gateway.md`
- `openclaw dashboard`：见 `docs/cli/dashboard.md`
- `openclaw status`：见 `docs/cli/status.md`
- `openclaw health`：见 `docs/cli/health.md`
- `openclaw doctor`：见 `docs/cli/doctor.md`
- `openclaw logs`：见 `docs/cli/logs.md`
- `openclaw system ...`：见 `docs/cli/system.md`
- `openclaw update ...`：见 `docs/cli/update.md`
- `openclaw daemon ...`：见 `docs/cli/daemon.md`

本地常用：

```bash
pnpm openclaw gateway status
pnpm openclaw doctor
pnpm openclaw dashboard --no-open
```

## Agent、会话和任务

- `openclaw agent`：见 `docs/cli/agent.md`
- `openclaw agents ...`：见 `docs/cli/agents.md`
- `openclaw sessions cleanup`：见 `docs/cli/sessions.md`
- `openclaw tasks ...`：见 `docs/cli/index.md`
- `openclaw cron ...`：见 `docs/cli/cron.md`
- `openclaw flows ...`：见 `docs/cli/flows.md`
- `openclaw tui`：见 `docs/cli/tui.md`
- `openclaw acp`：见 `docs/cli/acp.md`
- `openclaw mcp ...`：见 `docs/cli/mcp.md`

## 渠道、消息和设备

- `openclaw channels ...`：见 `docs/cli/channels.md`
- `openclaw message ...`：见 `docs/cli/message.md`
- `openclaw directory ...`：见 `docs/cli/directory.md`
- `openclaw pairing`：见 `docs/cli/pairing.md`
- `openclaw qr`：见 `docs/cli/qr.md`
- `openclaw devices ...`：见 `docs/cli/devices.md`
- `openclaw nodes ...`：见 `docs/cli/nodes.md`
- `openclaw node ...`：见 `docs/cli/node.md`

## 模型、能力和安全

- `openclaw models ...`：见 `docs/cli/models.md`
- `openclaw infer ...`：见 `docs/cli/infer.md`
- `openclaw secrets ...`：见 `docs/cli/secrets.md`
- `openclaw security audit`：见 `docs/cli/security.md`
- `openclaw approvals ...` / `openclaw exec-policy ...`：见 `docs/cli/approvals.md`
- `openclaw sandbox ...`：见 `docs/cli/sandbox.md`

## Plugins、skills、memory 和工具插件

- `openclaw plugins ...`：见 `docs/cli/plugins.md`
- `openclaw policy ...`：见 `docs/cli/policy.md`
- `openclaw skills ...`：见 `docs/cli/skills.md`
- `openclaw memory ...`：见 `docs/cli/memory.md`
- `openclaw wiki ...`：见 `docs/cli/wiki.md`
- `openclaw browser ...`：见 `docs/cli/browser.md`
- `openclaw webhooks ...`：见 `docs/cli/webhooks.md`
- `openclaw docs ...`：见 `docs/cli/docs.md`
- `openclaw dns ...`：见 `docs/cli/dns.md`
- `openclaw voicecall ...`：见 `docs/cli/voicecall.md`

## 备份、恢复和卸载

- `openclaw backup create/verify`：见 `docs/cli/backup.md`
- `openclaw reset`：见 `docs/cli/reset.md`
- `openclaw uninstall`：见 `docs/cli/uninstall.md`
- `openclaw clawbot ...`：见 `docs/cli/clawbot.md`
