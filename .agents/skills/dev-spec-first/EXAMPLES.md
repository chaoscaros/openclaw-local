# dev-spec-first 调用示例

---

## 示例 1：截图 + 文件路径（最常见）

**用户输入：**

> [截图] 把这个分类区域改成下拉框
> 文件：`/project/src/views/index/index.vue`
> 参考：`/Downloads/index.html`

**Skill 默认输出（规格模式）：**

```
## 开发 Prompt

### 任务描述
将 index.vue 上半部分卡片区的分类分段按钮改为单个下拉选择框，
放在搜索框右侧，默认值为“全部”，复用原有分类筛选逻辑。

### 文件路径
- 目标文件：`/project/src/views/index/index.vue`
- 目标样式：`/project/src/views/index/index.scss`
- 参考文件：`/Downloads/index.html`（参考 .p2-search / .p2-sort 样式）

### 改动范围
只允许修改：
1. index.vue 中 `.p2-search` 内分类区域 template
2. index.scss 中分类控件对应样式
3. 极少量 data/computed/method 适配（categorySelectValue、onCategorySelectChange）

### 禁改区域
不允许修改：
1. header 顶部绿色栏
2. 左侧商品列表栏
3. 卡片列表其他布局
4. 下半部分详情区
5. filterByCategory / filterByThirdCategory 方法内部逻辑
6. 接口请求

### 复用要求
必须复用：
1. filterByCategory(id) 方法
2. orderCategoryList computed（已过滤当前订单有的分类）
3. selectedCategoryId 数据字段

### 实现约束
- Vue2，禁用 ?. ?? <script setup>
- 使用已注册的 el-select / el-option，不引入新组件
- 不整页重写

### 输出要求
- 先读取真实文件，再开始改动
- 只做最小改动，不扩散到非目标区域
- 改完后输出：改了什么 / 没改什么

### 验收标准
- ✅ 原分段按钮消失
- ✅ 搜索框右侧出现下拉框，默认“全部”
- ✅ 选择分类后商品列表按原逻辑筛选
- ❌ 非分类区域不变
```

> 📋 规格已就绪。如需执行，请说“**直接开发**”或“**应用修改**”。
> 如需要调整规格，直接告诉我。

**同任务连续推进说明：**

> 一旦用户已对这条任务明确说“直接开发”，同一任务内的后续修补 / 回归 / 收尾应连续推进，
> 不要每做完一个小步骤就再次索要开发确认；只有当目标、范围或风险边界变化时才重新确认。

---

## 示例 2：逻辑修复（保留 0，空值传 null）

**用户输入：**

> 修复盘点单保存参数里 `inventory_list_id` 的取值逻辑
> 文件：`src/views/warehouse/warehouseCheck_edit.vue`

**Skill 默认输出（规格模式）：**

```
## 开发 Prompt

### 任务描述
修复盘点单保存参数中 `inventory_list_id` 的取值逻辑：
如果 `inventory_list_id` 是 `null / undefined / ""`，则传 `null`；否则传原本的值，包括 `0`。

### 文件路径
- 目标文件：`src/views/warehouse/warehouseCheck_edit.vue`
- 目标方法：`inventorySheet_check(type)`

### 改动范围
只允许修改：
1. 保存 / 保存并审核时组装 `list` 参数的 `inventory_list_id` 赋值逻辑

### 禁改区域
不允许修改：
1. 表格展示逻辑
2. 新增商品逻辑
3. 保存接口路径
4. `id` 明细 id 逻辑
5. 批次、库位、数量、价格计算逻辑

### 复用要求
必须复用：
1. 现有保存接口调用方式
2. 现有 `list` 参数结构
3. 现有 `inventorySheet_check(type)` 主流程

### 实现约束
- `inventory_list_id === null / undefined / ""` 时，传 `null`
- `inventory_list_id === 0` 时，必须传 `0`
- 不允许再用 `e.id` 兜底给 `inventory_list_id`
- Vue2 语法，不用 `??`、`?.`

### 输出要求
- 先读取真实文件，再开始改动
- 只做最小改动，不扩散到非目标区域
- 改完后输出：改了什么 / 没改什么

### 验收标准
- ✅ `inventory_list_id: 0` 保存时仍传 `0`
- ✅ `inventory_list_id: null / undefined / ""` 保存时传 `null`
- ✅ 不再出现把明细 `id` 塞进 `inventory_list_id` 的情况
- ✅ 保存、保存并审核都生效
```

> 📋 规格已就绪。如需执行，请说“**直接开发**”或“**应用修改**”。
> 如需要调整规格，直接告诉我。

---

## 示例 3：要求转给 ACP Harness

**用户输入：**

> 用 Codex 帮我实现这个

**Skill 行为：**

1. 先整理规格（如果还没有）
2. 将规格 prompt 适配为 Codex 输入格式
3. 再发送给对应执行层

---

## 示例 4：要求手动应用

**用户输入：**

> 给我代码片段，我自己改

**Skill 行为：**

- 不动文件
- 输出精确的“替换前 → 替换后”代码块
- 标注每个片段对应的文件和大概行号

---

## 快速触发方式

| 我说的话                       | Skill 行为                       |
| ------------------------------ | -------------------------------- |
| “帮我改 XXX”                   | 输出规格 prompt，不动代码        |
| “我想让 XXX 变成 YYY”          | 输出规格 prompt，不动代码        |
| “直接开发”                     | 读文件，执行修改                 |
| “直接改代码”                   | 读文件，执行修改                 |
| “应用修改”                     | 读文件，执行修改                 |
| “继续 / 可以 / 好 / 行”        | 不算开发确认，继续停留在规格模式 |
| “给我代码片段”                 | 输出代码块，不动文件             |
| “用 Codex 做”                  | 适配规格，发给 Codex             |
| “调整规格，加一条：禁止改 XXX” | 更新规格中禁改区域               |
