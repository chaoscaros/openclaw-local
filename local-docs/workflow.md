# 本地迭代流程

## 分支职责

当前维护使用三条主线：

- `codex/dev`：开发分支。日常迭代、官方 tag 吸收、修复和文档整理都先在这里完成。
- `codex/qa`：测试分支。`codex/dev` 本地验证通过后，再合并到这里给用户验收。
- `main`：正式版本分支。只有 `codex/qa` 验收通过后才合并。

不要在未验证时直接把开发改动推到 `main`。

## 标准流转

1. 切到 `codex/dev`。
2. 拉取远程最新状态。
3. 在 `codex/dev` 完成开发或文档整理。
4. 运行与改动面相关的定向验证。
5. 用户确认需要收尾后，提交并推送 `codex/dev`。
6. 用户要求进入 QA 时，再合并到 `codex/qa` 并推送。
7. 切回 `codex/dev` 继续下一轮开发。
8. `codex/qa` 验收通过后，才考虑合并到 `main`。

## tag 迭代原则

- 找下一个正式 tag，不把 beta tag 当作正式迭代目标。
- 先梳理 tag 差异，再按功能切片吸收。
- 不跳过大功能。任务模式、dreaming、Control UI、gateway runtime 都要逐项确认。
- 同一个任务切片尽量集中提交，避免把无关改动混在一起。
- 如果官方 tag 中包含与本地功能冲突的改动，先在 `codex/dev` 消化，再进入 QA。

## 提交和推送

提交使用项目脚本，避免误把无关文件加入提交：

```bash
scripts/committer "提交说明" <file...>
```

不要默认自动提交、推送或合并。只有用户明确要求“收尾”“提交”“推送”“合并到 qa/main”时才执行。

## 服务启动约定

- Codex 可以负责代码编译和 UI 编译。
- 不要擅自启动或重启后台 gateway 服务。
- 如果需要重新编译并让用户重启，先说明原因。
- 用户已经启动服务时，只做浏览器验收或命令验证，不私自替换后台进程。

## 相关记录

本地吸收官方改动的阶段记录：

- `docs/local-official-backports-2026-5-12.md`
- `docs/local-official-backports-2026-5-18.md`
- `docs/local-official-backports-2026-5-19.md`
- `docs/local-init-commands.md`
