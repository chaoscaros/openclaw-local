---
summary: "`openclaw env` CLI 说明：创建默认 `.env` 和轮换 gateway token"
read_when:
  - 需要创建默认 OpenClaw `.env` 文件
  - 需要轮换保存在 `.env` 中的本地 Gateway token
title: "env"
---

# `openclaw env`

管理默认 OpenClaw `.env` 文件，默认位置是 `~/.openclaw/.env`。

这组命令主要用于本地工作站初始化。它只会在你显式执行时创建或更新 `.env`；随后其它初始化命令会读取这个文件，继续生成运行配置和智能体状态。

## 推荐流程

```bash
openclaw env init
# 手动编辑 ~/.openclaw/.env，填好 OPENCLAW_STATE_DIR 和 OPENCLAW_CONFIG_PATH
openclaw config init
openclaw agents init
```

## `env init`

根据 `.env.example` 创建 `~/.openclaw/.env`，并生成新的 `OPENCLAW_GATEWAY_TOKEN`。

模板查找顺序：

1. 当前工作目录下的 `.env.example`
2. OpenClaw 包内置的 `.env.example`

选项：

- `--force`：覆盖已有的 `~/.openclaw/.env`

示例：

```bash
openclaw env init
openclaw env init --force
```

生成后至少需要确认这些值：

```env
OPENCLAW_STATE_DIR=/path/to/openclaw/state
OPENCLAW_CONFIG_PATH=/path/to/openclaw/config/openclaw.runtime.json5
```

Windows 上请使用 Windows 路径或环境变量展开：

```env
OPENCLAW_STATE_DIR=%USERPROFILE%\openclaw-state
OPENCLAW_CONFIG_PATH=%USERPROFILE%\openclaw-config\openclaw.runtime.json5
```

不要把 macOS 路径，例如 `/Users/name/...`，直接复制到 Windows `.env` 文件里。

## `env token`

轮换 `~/.openclaw/.env` 里的 `OPENCLAW_GATEWAY_TOKEN`。

选项：

- `--print`：写入后打印新生成的 token

示例：

```bash
openclaw env token
openclaw env token --print
```

默认不会打印新 token，避免在终端日志里误泄露密钥。
