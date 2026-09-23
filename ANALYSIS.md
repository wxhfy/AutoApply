# AutoApply V1 Phase 0 分析

分析日期：2026-09-23  
主基座：`freecodetiger/job-filler`，本地 `main` / `1cb10ae6da282e912989a954ee5ee3aa7e36c427`  
参考：`hanjiayuan2025-coder/CampusApply-Agent` / `6dee3305534b01722136108bc2a478103dd92368`；`23aaaa/jobfill` / `2d9b43822d03e609f86db1c39d0f28616efd2dcf`

## 结论

选择 `job-filler` 作为唯一产品基座。它已经是 Manifest V3 + React + TypeScript 的可构建插件，并且已有单一的 `UserProfile`、`DOMAnalyzer`、`FormFiller`、Popup 和 `chrome.storage.local` 封装；应在这些模块上演进，而不是迁移或并列另一套插件。

它尚未满足 V1 的关键契约：当前的字段映射**完全依赖 LLM**，没有确定性规则、统一的值归一化、实际填写后的验证、三态高亮或组件适配器。因此现状不能作为“无 API Key 也可用”的第一阶段 Autofill。

本阶段只完成分析和基座构建验证；未改动产品源代码，也未接入 CUA、验证码绕过或自动提交。

## Phase 2 实现进展（本次）

根据评审意见，已开始最小可用链路实现：

- 新增 `src/autofill/AutofillOrchestrator.ts`，Popup 只负责点击、进度和汇总；扫描、规则匹配、批量填写、批量验证、高亮和历史记录由编排器串联。
- 新增 `src/matching/FieldDictionary.ts`、`MatchingEngine.ts`、`ValueNormalizer.ts`，当前使用 Exact → Alias → Regex，且默认不覆盖已有页面值。
- `DOMAnalyzer` 补充 `currentValue/required/componentType/locator`；Profile 只增加本阶段高频的 `basic.currentCity`、`education.cet4`、`education.cet6`。
- `FormFiller` 改为 Component Adapter 注册表；已分离 Native、Radio/Checkbox、Autocomplete、Date、Ant Design Select、Element Plus Select 和 Generic Select。站点层只保留 `SiteAdapter` 契约，尚未凭猜测增加 Moka/北森/牛客逻辑。
- `FormVerifier` 返回 `expectedValue/actualValue/normalizedExpected/normalizedActual/status/reason`；`Highlighter` 使用绿/黄/红状态写回页面。
- 新增 `fixtures/` 下六个本地页面，覆盖原生表单、Custom Select、延迟 Autocomplete + hidden ID、Date、Cascader 和混合表单。
- API 配置仍可维护，但不再是手工 Profile Autofill 的前置条件；PDF 导入仍是可选的 Profile 预填入口。
- Laya 评估结论见 [LAYA_EVALUATION.md](LAYA_EVALUATION.md)：它可作为未来 unresolved 控件/导航的 Agent fallback，但当前没有足够的扩展协议证据，不能替换 Rule-first 主链路。

## 交付边界

采用 delivery-critical profile：插件会把本地 Profile 写入用户已经登录的外部招聘表单，未来可选 LLM fallback 还会把数据发往用户配置的第三方 API。

| 维度 | V1 已知约束 |
| --- | --- |
| Actor | 已登录招聘网站、主动点击“一键智能填写”的用户 |
| Confirmed event | 用户在当前页面发起一次填写；不包含跳转、登录、验证码、提交 |
| Resulting state | 当前页面尚未提交的控件值与插件的字段结果标记 |
| State owner | 招聘网站拥有表单最终状态；插件只拥有本地 Profile、填写历史和页面高亮 |
| Success proof | 控件/隐藏选择值通过重新读取验证，且页面显示 VERIFIED / REVIEW / ERROR；构建成功不等于表单行为成功 |
| Identity | N/A：复用浏览器当前登录会话，不接收、转发或替换网站身份凭据 |
| Outbound delivery | N/A 于规则填写；LLM 只能是用户显式配置后的 unresolved batch fallback，不能成为主路径 |

实施前必须明确两条会影响错填率的产品规则：已有非空控件是否一律不覆盖，以及多条教育/实习/项目经历在页面重复区块中应如何选取、匹配和扩展。PRD 目前没有给出唯一答案，不能由填写器静默猜测。

## 主基座现状

### 架构与 UI

`manifest.json` 已是 Manifest V3，Popup 为 React，Content Script 负责扫描和填写，Background 当前没有业务逻辑。Profile、API 配置和最多 100 条填写历史通过 `chrome.storage.local` 保存。

实际链路是：Popup `handleAnalyze` → 注入/联通 Content Script → `ANALYZE` → 将全部字段及 Profile 交给 `LLMClient.matchFields` → 逐字段 `FILL_SINGLE` → 只按返回布尔值计数并保存历史。

这意味着当前“一键填写”按钮要求同时存在 Profile 和 API 配置；它不是 PRD 所需的 Rule-first 路径。仓库有 `FillPreview.tsx`，但当前 `App.tsx` 的主流程明确跳过预览并直接填写，Preview 不是现行行为的一部分。

### DOMAnalyzer

可直接复用和增强 `src/content/DOMAnalyzer.ts`，不应另建 Scanner。它目前会扫描可见的普通 `input`（不含 file/hidden/按钮）、`textarea`、原生 `select`、`role=combobox` / `role=listbox` 和 `contenteditable`；为目标元素写入稳定到本次扫描的 `data-jf-id`。

标签提取已经有可复用的六层顺序：`label[for]`、包裹 label、Ant/Element/Arco/Semi/MUI 表单项、`aria-labelledby`、前序兄弟与父元素文本。附近上下文还会读取分段标题、帮助文案和相邻文本。这是 V1 字段匹配的正确入口。

当前 `DOMField` 只有 `id/tag/type/label/placeholder/name/ariaLabel/nearbyText/options`。相对 PRD 缺少：`currentValue`、`required`、自定义组件的可选项、`componentType`、可重定位 DOM locator，以及 upload/date/cascader/autocomplete 的区分。`role=listbox` 也可能代表已展开的选项列表而非实际触发控件，不能直接视作一个可填写字段。

### FormFiller

可直接复用 `src/content/FormFiller.ts` 的原生 value setter、`input/change/blur` 事件、原生 select、radio/checkbox、`contenteditable` 和基础可见下拉选项检索；这些是 React/Vue 受控输入兼容的起点。

但它当前不是可验证的组件填写层：

- 所有普通 input 都会等待全局 dropdown；超时后会点击第一个可见选项。对自由文本字段和同时显示的下拉框，这有错填风险。
- `role=combobox` 的分支即使没有真正点中候选项也返回成功；autocomplete 不会核验实际选择或隐藏 ID。
- 原生 select 仅做字符串包含比较，没有学历、日期、是非等 canonical value 归一化。
- Ant、Element、Arco 等选择器和选项搜索散落在 FormFiller 中；尚无 Component Adapter，DatePicker/Cascader 也没有实现。
- 重复区块扩展使用固定 500ms sleep，不符合 PRD 要求的 DOM condition / MutationObserver。
- `fillElement` 返回的是“尝试写入”而非“已生效”；没有 `FormVerifier`、统一结果状态或红黄绿高亮。

### Profile、Storage 和 LLM

基座 `UserProfile` 已有 basic、education、experience、internships、projects、awards、skills、selfIntroduction，可作为唯一 Profile Schema 继续扩展。它的字段命名为 `birthDate/nativePlace/endDate`，与 PRD 的 `birthday/hometown/graduationDate` 不同；扩展时应兼容既有命名和 `migrateProfile`，不要复制一套 Profile。

相对 PRD，仍需在既有 schema 内增加或明确映射：`currentCity`、教育 CET4/CET6、certificates、preferences、commonAnswers、attachments，以及实习/项目更细的字段。用户数据目前本地保存，但当前 LLM matching 会把整份 Profile 与页面字段发送到用户配置的 endpoint；V1 Rule-first 必须把这条调用挪为显式可选 fallback，并且只发送 unresolvedFields 的一个 batch。

当前 LLM client 的职责可保留为 fallback：支持 OpenAI-compatible 与 Anthropic、超时和短暂错误重试，并用 ref 在本地解析长简历文本。它不应参与 Exact/Alias/Regex 命中。

## 参考项目对比

| 项目 | 可迁移的具体思路 | 不应直接迁移 |
| --- | --- | --- |
| CampusApply-Agent | `fieldMappingRules.ts` 的集中规则表；规则→低置信语义→LLM fallback 的顺序；ATS 检测标签策略；填写结果/高亮的 UI 表达 | 它有独立 IndexedDB 数据模型与产品面板；ATS profiles 中的 `specialHandlers` 多为声明字符串，Content Script 仍是内联分支；其“success”是写入成功，不是重新验证 |
| JobFill | `fill.ts` 的 native setter、`InputEvent`、composition/change/blur/focusout 事件序列；按可见性排序并定位下一字段的交互 | 仅面向当前焦点输入框的手动侧栏模式；扫描不含 select，且没有 Profile 匹配、验证、复杂控件或 ATS 适配 |

CampusApply-Agent 的规则库可作为规则覆盖面的参考素材，但需要迁入主基座的字段路径并按 V1 Human Gate 移除“期望城市、薪资、意向岗位”等会自动猜测的规则。不能整段复制它的另一套数据层。

## 第一阶段最小改造路径

以下是建议的后续 Phase 2+ 文件级路径，不在本阶段实施：

1. 在既有 `src/types/index.ts` 扩展 `DOMField` 为 PRD 所需的 NormalizedField 信息，并将填写结果统一为 `UNSCANNED/MATCHED/FILLED/VERIFIED/REVIEW/UNRESOLVED/ERROR`。
2. 增强已有 `src/content/DOMAnalyzer.ts`，补齐 required/current value/locator/component hints 和选项发现；不新增第二个扫描器。
3. 新增集中维护的 `src/matching/FieldDictionary.ts`、`MatchingEngine.ts`、`ValueNormalizer.ts`，先实现 Exact → Alias → Regex，无法确定直接 REVIEW/UNRESOLVED。Fuzzy 必须有保守阈值，Human Gate 字段一律不得自动写入。
4. 将现有 `FormFiller` 保留为单一入口，先把 text/textarea/radio/checkbox/native select 做成返回可验证结果的 component adapters；再按 Custom Select → Autocomplete → DatePicker → Cascader 顺序扩展。不得对自由输入采用“超时点第一个候选”的回退。
5. 新增 `FormVerifier` 和 `Highlighter`，逐字段读取真实 input/select/checked/aria-invalid/错误文本/必要隐藏 ID；将验证状态和定位下一个 REVIEW/ERROR 接到现有 Popup。
6. Rule 路径稳定后，保留 LLM 为用户显式启用的 unresolved batch fallback；Moka/北森/牛客 Site Adapter 只在 Generic + Component Adapter 出现经证实的站点差异时添加。

明确不做：新 Profile 存储、自动登录、验证码处理、URL 路由、自动翻页、最终提交、CUA，以及未经验收证据的站点专用 selector。

## 构建与验证

环境：Node `v22.23.1`、npm `10.9.8`。

- `npm ci`：失败，原因是 `vite@8.2.0` 与 `@vitejs/plugin-react@4.7.0` 的 peer dependency 范围不相容。这是依赖安装/基座问题，不是功能测试失败。
- `npm ci --legacy-peer-deps && npm run build`：通过，生成 `dist/`。Vite 给出未来 config loader 与 React Babel deprecation 警告；未修改依赖版本。
- `npm audit` 报告 1 个 high severity vulnerability；本阶段未执行自动修复，避免无关依赖升级。
- Chrome “加载已解压扩展”和真实 Moka/北森/牛客页面填写尚未验证；当前没有自动化测试脚本或页面 fixture，因此构建通过不构成 Autofill 验收证据。

## 建议验收顺序

先为纯规则与归一化写不依赖网页的 focused tests；再为 Content Script 添加静态 DOM fixture，证明 normal input、radio、checkbox、native select 的填后状态与 Human Gate；最后用各 2 个 Moka/北森、2 个牛客或其他、3 个普通招聘页面记录扫描数、匹配数、VERIFIED/REVIEW/ERROR、错填与耗时。真实页面验证前不宣称达到 PRD 的 95% 识别率、85% 填写成功率或 2% 以下错填率。
