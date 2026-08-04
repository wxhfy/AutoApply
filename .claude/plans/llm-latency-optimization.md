# LLM 匹配步骤性能优化方案

## 背景

第 3 步「AI 匹配字段」在 DeepSeek 上出现转圈 7 分钟仍未完成的情况。经排查是三个问题叠加，其中输出量过大是根本原因。

## 根因分析

### 根因 1：LLM 被要求复述简历全文（决定性因素）

`src/llm/index.ts:46` 的 SYSTEM_PROMPT 规则 8：

> 大文本字段（textarea或多行）：直接使用简历中的完整描述文本，不要缩写或改写。

模型必须把每段项目/工作/实习的完整描述**逐字重新生成**到 JSON 的 `value` 里。项目描述是简历中体积最大的部分，加上每个字段还要写 `reason`。

大疆页面展开后 60+ 字段，输出规模约 5000–10000 token。非流式串行生成，DeepSeek 高峰期吞吐可能掉到 10–20 token/s，折算 5–10 分钟。7 分钟属于该设计下的正常耗时，不是异常。

附带问题：靠 prompt 约束"不要改写"本质不可靠，这也是此前「AI 自己总结简历」问题的来源。

### 根因 2：fetch 无超时，请求可能永久挂起

`src/llm/chat.ts:65` 的 `fetch` 没有 `AbortController` / `signal`。DeepSeek 繁忙时常见表现是接受连接后迟迟不返回数据，请求会无限 pending。7 分钟中可能有相当部分是已僵死而非在计算。

### 根因 3：reasoner 模型放大延迟

`src/popup/ApiConfigEditor.tsx:25` 预设含 `deepseek-reasoner`。字段映射任务不需要推理链，选中它会额外生成大量思维链 token。

---

## 方案

核心思路：**让 LLM 只输出引用路径，不输出简历正文**。文本在客户端按引用取出后填入。

### 改动 1：引用式输出（核心）

LLM 返回 `ref`（简历数据路径）而非 `value`：

```json
{ "fieldId": "jf-31", "fieldType": "PROJECT_EXPERIENCE", "ref": "projects[0].description", "confidence": 0.95 }
```

对枚举/字面量类字段（性别、学历、下拉选项）仍允许直接给 `value`，因为需要适配页面 options 文本，且体积极小：

```json
{ "fieldId": "jf-4", "fieldType": "DEGREE", "value": "硕士", "confidence": 0.9 }
```

规则：**能用 ref 就用 ref，仅当值需要改写以匹配页面选项时才用 value**。

预期效果：
- 输出 token 从 5000–10000 降到 300–800，约 10 倍以上
- 该步骤耗时从分钟级降到秒级
- 简历原文逐字保真由结构保证，不再依赖 prompt 约束

#### 需新增的 ref 解析器

`src/llm/resolveRef.ts`：

```ts
// 支持 basic.name / links.github / education[0].school / projects[2].description
export function resolveRef(profile: UserProfile, ref: string): string | null
```

要点：
- 白名单校验路径首段（`basic` / `links` / `education` / `experience` / `internships` / `projects` / `awards` / `skills` / `selfIntroduction`），拒绝任意路径访问
- 数组下标越界返回 `null`
- `skills` 为字符串数组，`skills` 整体引用时 join 成逗号分隔
- 解析失败一律返回 `null`，让该字段走 skip，不抛错中断整批

#### 类型改动

`RawProposal` 增加可选 `ref`；`FillProposal` 保持现有形状（`value` 仍为最终字符串），在 `matchFields` 内完成 ref → value 的解析，下游 FormFiller 无需改动。

### 改动 2：请求超时

`src/llm/chat.ts` 两个 provider 分支都加：

```ts
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);
try {
  const response = await fetch(url, { ..., signal: controller.signal });
  ...
} catch (err) {
  if (err instanceof DOMException && err.name === 'AbortError') {
    throw new Error(`请求超时（${timeoutMs / 1000}s），服务可能繁忙，请稍后重试`);
  }
  throw err;
} finally {
  clearTimeout(timer);
}
```

超时值：匹配请求 120s，简历解析 180s（输入更大）。作为 `ChatParams` 的可选字段传入。

### 改动 3：503 / 429 指数退避重试

`chat.ts` 内包一层重试。仅对临时性错误重试，配置错误（401/403/404）立即抛出：

- 可重试状态码：429、500、502、503、504、529
- 退避：2s → 4s → 8s，最多 3 次
- `AbortError` 不重试（已经等够久了）
- 通过回调把重试状态透出到 UI，在「AI 匹配字段」那步显示 `服务繁忙，第 2 次重试`

`ChatParams` 增加 `onRetry?: (attempt: number, max: number) => void`，`matchFields` 透传，`App.tsx` 里映射到 `updateStep('match', { detail: ... })`。

### 改动 4：精简输出字段

- `reason` 从必填改为可选，prompt 要求不超过 10 字，或在稳定后直接移除。当前它仅用于调试，却占可观输出量。
- `FillProposal.reason` 保留字段（历史记录与潜在的预览 UI 用），LLM 未返回时填空串。

### 改动 5：模型选择提示

`ApiConfigEditor.tsx` 在 `deepseek-reasoner` 选项旁标注「推理模型，本场景不推荐，耗时显著更长」。不移除选项，只做提示。

---

## 实施顺序

1. `src/llm/resolveRef.ts` — 新增解析器 + 白名单校验
2. `src/llm/chat.ts` — 超时 + 重试 + `onRetry` 回调
3. `src/llm/index.ts` — SYSTEM_PROMPT 改为引用式输出，`matchFields` 解析 ref
4. `src/popup/App.tsx` — 重试状态显示到 match 步骤
5. `src/popup/ApiConfigEditor.tsx` — reasoner 提示
6. `npm run build` 验证

## 验证

- 大疆页面完整跑一遍，确认 match 步骤耗时从分钟级降到 10s 内
- 确认项目描述填入页面后与简历原文逐字一致（此前依赖 prompt，现由 ref 保证）
- 构造一个越界 ref（如手改 LLM 返回）确认走 skip 而非整批失败
- 断网触发超时路径，确认 120s 后有明确报错而非无限转圈

## 不在本次范围

- 备用 provider 自动切换（需扩 ApiConfig 结构与配置界面）
- 流式输出（当前输出量降下来后收益有限）
- 把编排从 popup 移到 service worker 以避免关闭弹窗中断（独立问题）
