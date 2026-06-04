# openclaw-local 本地维护手册

这个目录记录 `openclaw-local` 的中文维护说明。它是本地 fork 专用文档，不是官方 OpenClaw 文档，也不进入 `docs/` 的 Mintlify 发布体系。

## 阅读顺序

1. `workflow.md`
   - 分支职责
   - tag 迭代顺序
   - 什么时候能合并到 `codex/qa` 和 `main`
2. `configuration.md`
   - `openclaw.json`
   - `.env.example`
   - `OPENCLAW_STATE_DIR`
   - `OPENCLAW_CONFIG_PATH`
   - 初始化命令
3. `commands.md`
   - 本地常用命令
   - CLI 文档位置
   - 新增命令分类索引
4. `verification.md`
   - 构建、UI 构建、定向测试
   - 收尾前检查清单
   - 哪些场景需要用户重启服务
5. `feature-guards.md`
   - 任务模式
   - Memory / Dreaming
   - Control UI
   - Gateway / Runtime
   - 移动端和 Android 注意点

## 文档边界

- `README.md` 只保留项目入口、快速启动和本地手册位置。
- `local-docs/` 记录本地 fork 的中文维护规则和验收习惯。
- `docs/cli/`、`docs/gateway/`、`docs/web/` 等目录仍是官方风格的产品文档。
- `docs/local-init-commands.md` 是早期初始化命令设计说明；日常查阅优先看 `local-docs/configuration.md` 和 `local-docs/commands.md`。

## 更新原则

- 新增本地功能时，先判断属于配置、命令、流程、验证还是保护点。
- README 不再堆细节，只补入口链接。
- 命令如果已有官方 CLI 文档，在 `local-docs/commands.md` 里记录文档位置即可。
- 本地 fork 特有的习惯、分支流和验收规则，写在 `local-docs/`。
