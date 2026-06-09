---
summary: "`openclaw codex` CLI 说明：清理 Codex 认证绑定"
read_when:
  - 需要切换 OpenClaw 智能体使用的 Codex 账号
title: "codex"
---

# `openclaw codex`

管理 OpenClaw 侧保存的 Codex 本地认证状态。

## Codex OAuth 重新登录

如果只是想重新登录 OpenClaw 使用的 Codex OAuth 账号，可以运行：

```bash
pnpm openclaw models auth login --provider openai-codex
```

这个命令会走 `openai-codex` provider 的登录流程，更新 OpenClaw 侧用于 `openai-codex/*` 模型的认证。它不会清理旧的 Codex 绑定；如果你要先移除旧绑定再重新登录，先执行 `openclaw codex clean`。

## `codex clean`

从智能体认证状态里移除 OpenClaw 侧的 `openai-codex` 绑定，方便干净地切换到另一个 Codex 账号。

这个命令只会处理配置状态目录下的 OpenClaw 智能体认证文件。它不会删除 Codex CLI 自己的认证文件，例如 `~/.codex/auth.json`，也不会清理 OpenAI API key、Anthropic、Google、Discord、Telegram 等其它 provider 认证。

示例：

```bash
openclaw codex clean --dry-run
openclaw codex clean
openclaw codex clean --force
```

选项：

- `--dry-run`：只预览将要清理的内容，不写入文件
- `--force`：跳过确认提示
- `--json`：输出机器可读 JSON

推荐切换账号流程：

```bash
openclaw codex clean
# 重新登录或选择新的 Codex OAuth 账号
pnpm openclaw models auth login --provider openai-codex
```
