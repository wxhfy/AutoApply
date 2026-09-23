# Laya 评估结论

评估对象：[`NandhaKishorM/laya`](https://github.com/NandhaKishorM/laya)，Apache-2.0，核对提交 `ab87e4792eab23301e1d65cea75d0b685dc88040`（2026-09-23）。此前评估的 `laya-ultrafast` 是同名外围项目，并非本次所说的模型，结论已更正。

## 已核实的能力

Laya 是非自回归的 System 1 决策模型，不生成文本。它对一个给定 `state` 回答受限的：

- `choice`：在调用方给出的候选 key 中选择一个；
- `score`：在有序等级中评分；
- `noul`：是/否概率。

英文 `laya` 权重为 421M；README 报告 T4 上单题 33ms。该仓库还提供 `laya-multilingual`（322M）和 Router；中文网申页面应由 Router 使用 multilingual 权重，而非因为 421M 更大就固定英文权重。

它有自托管的 Jev 兼容 HTTP 服务：`POST /v1/systemone`，可通过 `pip install "laya[serve]"` 与 `laya-serve` 启动。README 的 Laya/Jev 速度对比为仓库作者汇总的数据，且其 `BENCHMARKS.md` 明确说明 Jev 数据来自第三方发布、未在该仓库中同环境重测。因此“快 4 倍”（或 README 中约 6–7 倍）的表述只能作为候选性能信号，不是本项目的实测结论。

## 与 CUA 的关系

它们不是同一种边界：Laya 给出一个受限结构化决策，不会读取屏幕后自行点击、输入、滚动或提交。即使某个 Browser Agent 用 Laya 选择下一步动作，执行 DOM 操作、等待组件状态和验证结果仍属于 Agent/插件代码。

当前环境无法取得官方 OpenAI 文档页（返回 403），所以此处不对 CUA 的具体实现或性能做未核实的产品断言。

## 对 AutoApply 的决策

保留现有主链路，默认不依赖 Laya：

```text
DOMAnalyzer → MatchingEngine（规则优先） → ComponentAdapter
          → FormVerifier → Highlighter → FillSummary
```

Laya 只适合作为规则无法区分时的**可选匹配兜底**：例如在少量已扫描字段中选择一个既有 Profile key，或在不超过约 20 个的已观测下拉选项中选择一个候选。它不替代 Component Adapter、Autocomplete 的隐藏 ID 提交、日期格式转换或 FormVerifier。

禁止将它用于验证码、提交按钮、真实性声明、薪资/调剂等人工确认字段，或让它返回任意 selector、脚本、坐标和 Profile 文本。

## 尚未接入 HTTP 服务的原因

当前插件没有用户配置的 Laya 服务地址，也没有可验证的本地运行实例；现有 OpenAI API 配置只服务于可选的简历解析，不能悄悄复用为 Laya 地址。

接入时采用最小的、默认关闭的契约：

| 项目 | 约束 |
| --- | --- |
| 调用方 | Popup 用户明确配置并启用的本地服务 |
| 请求 | 字段标签/组件类型、受限候选 Profile key、必要的候选 option 文本；不发送真实 Profile 值 |
| 响应 | 仅允许已发送的 candidate ID 与 confidence |
| 缺失/失败 | 超时、无效 ID、低置信度均退回 `REVIEW`，不影响规则填写 |
| 成功标准 | 仍以 FormVerifier 的实际 DOM 值为准 |

在获得一个可运行的本地地址、超时阈值和可接受的页面文本范围前，不增加网络调用或配置持久化。
