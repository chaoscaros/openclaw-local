# 本地初始化命令设计

这份说明用于梳理一组简洁的初始化命令。目标是让 macOS、Windows 用户都能按同一套步骤生成 `.env`、生成运行配置、创建默认智能体，并能方便地更新 gateway token 或清理 Codex 登录状态。

## 命令总览

```bash
openclaw env init
openclaw env token
openclaw config init
openclaw agents init
openclaw codex clean
```

推荐使用顺序：

```bash
openclaw env init
# 手动编辑 ~/.openclaw/.env，填好 OPENCLAW_STATE_DIR 和 OPENCLAW_CONFIG_PATH
openclaw config init
openclaw agents init
```

## openclaw env init

生成默认 `.env` 文件。

行为：

- 默认写入 OpenClaw 的默认位置：`~/.openclaw/.env`。
- 内容优先来自当前目录的 `.env.example`，如果不存在，则回退到 OpenClaw 包内置的 `.env.example` 模板。
- 自动生成并填入 `OPENCLAW_GATEWAY_TOKEN`。
- 如果 `~/.openclaw` 目录不存在，自动递归创建。
- 如果 `.env` 已存在，默认不覆盖。
- 支持 `--force` 覆盖已有 `.env`。

示例：

```bash
openclaw env init
openclaw env init --force
```

用户生成后需要手动编辑 `.env`，至少确认：

```bash
OPENCLAW_STATE_DIR=/path/to/openclaw/state
OPENCLAW_CONFIG_PATH=/path/to/openclaw/config/openclaw.runtime.json5
```

Windows 用户不能直接使用 macOS 路径，例如 `/Users/name/...`；需要改成 Windows 路径，例如：

```bash
OPENCLAW_STATE_DIR=C:\Users\name\openclaw-state
OPENCLAW_CONFIG_PATH=C:\Users\name\openclaw-config\openclaw.runtime.json5
```

## openclaw env token

更新 `.env` 里的 `OPENCLAW_GATEWAY_TOKEN`。

行为：

- 读取默认 `.env`：`~/.openclaw/.env`。
- 生成新的 gateway token。
- 只替换 `OPENCLAW_GATEWAY_TOKEN` 这一项。
- 如果 `.env` 不存在，提示先运行 `openclaw env init`。
- 默认不在终端打印 token，避免误泄露。
- 可选支持 `--print`，用于用户明确需要复制 token 的场景。

示例：

```bash
openclaw env token
openclaw env token --print
```

## openclaw config init

根据 `.env` 生成默认 OpenClaw 配置文件。

行为：

- 读取默认 `.env`：`~/.openclaw/.env`。
- 必须检查 `OPENCLAW_STATE_DIR` 和 `OPENCLAW_CONFIG_PATH`。
- 如果任一项缺失或为空，停止并提示用户编辑 `.env`。
- 如果 Windows 上发现 `/Users/...`、`/home/...` 这类非 Windows 路径，停止并提示用户改成 Windows 路径。
- 自动递归创建 `OPENCLAW_STATE_DIR`。
- 自动递归创建 `OPENCLAW_CONFIG_PATH` 的父目录。
- 在 `OPENCLAW_CONFIG_PATH` 指向的位置写入默认配置文件。
- 如果目标配置文件已存在，默认不覆盖。
- 支持 `--force` 覆盖已有配置。
- 配置文件里的 secret 一律写 env 引用，不写真实密钥。

默认配置重点：

```json5
{
  gateway: {
    mode: "local",
    bind: "loopback",
    auth: {
      mode: "token",
      token: { source: "env", provider: "default", id: "OPENCLAW_GATEWAY_TOKEN" },
    },
  },
}
```

如果 `.env` 配置了 channel token，也可以写入对应 env 引用：

```json5
{
  channels: {
    telegram: {
      botToken: { source: "env", provider: "default", id: "TELEGRAM_BOT_TOKEN" },
    },
    discord: {
      token: { source: "env", provider: "default", id: "DISCORD_BOT_TOKEN" },
    },
    slack: {
      botToken: { source: "env", provider: "default", id: "SLACK_BOT_TOKEN" },
      appToken: { source: "env", provider: "default", id: "SLACK_APP_TOKEN" },
    },
  },
}
```

示例：

```bash
openclaw config init
openclaw config init --force
```

## openclaw agents init

根据 `.env` 和 `OPENCLAW_CONFIG_PATH` 指向的配置文件创建默认智能体。

行为：

- 读取默认 `.env`：`~/.openclaw/.env`。
- 读取 `OPENCLAW_CONFIG_PATH` 指向的配置文件，例如 `openclaw.json` 或 `openclaw.runtime.json5`。
- 如果配置文件不存在，提示先运行 `openclaw config init`。
- 根据配置和 state 目录创建默认 agent 目录。
- 目录不存在时自动递归创建。
- 将当前项目的 `solo` 设为默认智能体。
- 如果默认智能体已存在，默认保留已有配置。
- 支持 `--force` 重新写入默认智能体配置。
- 使用复数 `agents init`，因为单数 `agent` 已经用于发送一次 agent 消息。

示例：

```bash
openclaw agents init
openclaw agents init --force
```

默认智能体预期效果：

- 当前项目目录作为默认工作区。
- agent id 使用 `solo`。
- 后续启动 OpenClaw 时优先使用这个项目默认智能体。

## openclaw codex clean

清理 OpenClaw 侧保存的 Codex 认证绑定，方便用户退出并切换 Codex 账号。

行为：

- 只清理 Codex / `openai-codex` 相关 profile、order、缓存或绑定。
- 不删除 OpenAI API key、Anthropic、Google、Discord、Telegram 等其它认证。
- 不删除 Codex CLI 自己的 `~/.codex/auth.json`。
- 默认先显示将清理的项目，并要求确认。
- 支持 `--dry-run` 只预览。
- 支持 `--force` 跳过确认。

示例：

```bash
openclaw codex clean --dry-run
openclaw codex clean
openclaw codex clean --force
```

推荐切换账号流程：

```bash
openclaw codex clean
# 然后重新进行 Codex 登录或重新选择 Codex OAuth
openclaw configure --section model
```

## 平台差异要求

macOS 和 Linux：

- 允许 `/Users/...`、`/home/...`、`~/...` 这类路径。
- 创建目录时使用当前用户权限。

Windows：

- 不接受从 macOS 复制来的 `/Users/...` 路径。
- 不接受 Linux 风格 `/home/...` 作为本机默认路径。
- 推荐使用 `C:\Users\name\...` 或 `%USERPROFILE%\...`。
- 创建目录时必须递归创建父目录。

## 安全要求

- `.env` 可以保存真实 token，但不得提交到 git。
- `openclaw.json` / `openclaw.runtime.json5` 只保存 env 引用，不保存真实 token。
- 命令输出默认不打印 secret。
- `openclaw env token --print` 必须是用户显式要求才打印 token。
- `openclaw codex clean` 不能误删其它 provider 的认证。
