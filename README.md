# OpenClaw Local

这是我自己的本地改版 OpenClaw 项目，不是官方仓库说明文档。

## 项目定位

这个项目从官方 OpenClaw fork 出来，作为长期本地改版版本使用。当前本地线已经持续吸收并整理到 2026.5.x 系列，具体版本以 `package.json`、左下角 UI 版本和当前分支提交为准。

目标是：

- 保留官方 OpenClaw 仓库原样，方便后续同步和参考
- 在这个项目里持续做本地优化和定制
- 固化常用默认技能、交互体验优化和界面调整
- 按 tag 分批吸收官方改动，先在开发分支整理，再进入 QA 验证

Git 仓库：

```bash
git@github.com:chaoscaros/openclaw-local.git
```

## 本地中文说明文档

本地 fork 的配置、命令、迭代流程和验收保护点已经单独整理到：

```text
local-docs/
```

阅读入口：

- `local-docs/README.md`：本地手册总览和阅读顺序
- `local-docs/workflow.md`：分支、tag 迭代、提交、QA 流程
- `local-docs/configuration.md`：`openclaw.json`、`.env.example`、初始化命令和路径规则
- `local-docs/commands.md`：本地常用命令和 CLI 文档分类索引
- `local-docs/verification.md`：构建、UI 构建、定向测试和收尾检查
- `local-docs/feature-guards.md`：任务模式、Dreaming、Control UI、Gateway、移动端保护点

官方风格产品文档仍在 `docs/`，例如 `docs/cli/index.md`、`docs/gateway/`、`docs/web/`。本地中文维护说明优先写入 `local-docs/`，README 只保留入口。

## 分支约定

当前本地维护使用三条主线：

- `codex/dev`：开发分支，日常迭代和官方 tag 吸收都先在这里做
- `codex/qa`：测试分支，`codex/dev` 本地验证通过后再合并到这里
- `main`：正式版本分支，只有 QA 没问题后才合并

常规流程见 `local-docs/workflow.md`。

## 快速启动

首次安装依赖：

```bash
pnpm install
```

构建代码和 UI：

```bash
pnpm build
pnpm ui:build
```

快速启动本地 gateway：

```bash
pnpm fast
```

如果用户已经在本机启动服务，开发过程中不要擅自重启后台服务。需要重启时，先说明原因，由用户操作。

## 常用入口

```bash
pnpm openclaw --help
pnpm openclaw gateway status
pnpm openclaw doctor
pnpm openclaw dashboard --no-open
```

初始化命令、命令分类和对应文档位置见 `local-docs/commands.md`。

## 默认本地定制

当前本地版本重点包含：

- Chat 发送体验优化
- 任务模式和移动端任务入口
- 默认 `dev-spec-first` 技能
- Memory / Dreaming 保护
- Control UI 任务、归档、日志、使用情况等入口
- Gateway / Runtime 稳定性修复

详细保护点见 `local-docs/feature-guards.md`。

## README 使用原则

这个 README 代表的是本地版本入口，不是官方 OpenClaw 总说明。

后续新增内容时：

- 本地配置、命令、流程、验收规则写入 `local-docs/`
- 官方通用 CLI / gateway / web 文档继续写入 `docs/`
- README 只保留项目定位、快速启动和文档入口
