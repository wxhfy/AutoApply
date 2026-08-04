# 大疆网申页面填充问题修复方案

## 问题根因分析

### 问题1：下拉列表没有自动确认（多个下拉同时弹开）

**原因：**
- `fillSingle` 填完一个字段后，`waitAndClickDropdown` 在 600ms 内轮询查找下拉
- 但大疆的搜索型下拉（学校、专业等）是**异步请求后端**返回候选列表，可能需要 1-2s
- 600ms 超时后函数返回 `false`，执行 blur，但此时下拉刚好出现（blur 不会关闭已弹出的列表）
- 下一个字段开始填充时，上一个的下拉仍在，而 `tryClickDropdownOption` 无法区分是哪个字段的下拉
- 另外，`findBestOption` 要求 score >= 60，但如果学校名是"武汉大学"而下拉里显示的是"武汉大学(211/985)"，可能匹配失败

**修复方案：**
1. 增加 `waitAndClickDropdown` 超时到 1200ms（搜索型下拉需要更长等待）
2. 点击选项后等一小段时间让下拉关闭，再处理下一个字段
3. 如果等待超时仍有下拉弹出，尝试点击第一个选项（通常第一个就是最佳匹配）
4. 区分 textarea（不需要等下拉）和 input（可能触发下拉）

### 问题2：项目经历只能看到1个，实际需要填4个

**原因：**
- 大疆的项目经历区域是动态的，初始只显示1个（或需要点击"添加"按钮）
- DOMAnalyzer 只能扫描到**当前已渲染的 DOM 元素**
- 简历中有多个项目，但页面上只有一组字段，LLM 只能把第一个项目匹配进去

**修复方案：**
- 在填充前，检测页面是否有"添加"按钮（常见文本：添加、+ 添加、新增）
- 根据简历中经历/项目的数量，先点击 N-1 次"添加"按钮，等待新的字段渲染出来
- 然后重新执行 DOM 分析，获取所有字段
- 这需要改 popup 的填充流程：分析→预添加→重新分析→LLM匹配→填充

### 问题3：项目描述（textarea）没填进去

**原因：**
- textarea 走了 `fillInputWithDropdownCheck`，填入值后会等 600ms 等下拉（永远不会出现的）
- 更关键的是：大疆的描述字段可能是**富文本编辑器**（contenteditable div）而不是原生 textarea
- 或者 React/Vue 的 textarea 组件对 native setter 方式不响应

**修复方案：**
- textarea 单独处理，不走 dropdown 等待逻辑
- 对于 textarea，使用 `execCommand('insertText')` 或 `InputEvent` with `inputType: 'insertText'` 来模拟真实输入
- 这是 React controlled textarea 最可靠的填充方式

## 实施计划

### 改动文件

1. **`src/content/FormFiller.ts`** — 核心改动
   - textarea 单独路径，不等下拉
   - input 等下拉超时增加到 1200ms
   - 点击选项后加 200ms 等待关闭
   - 超时后尝试选第一个可见选项（fallback）
   - 使用 `document.execCommand('insertText')` 作为 textarea 填充方式

2. **`src/popup/App.tsx`** — 流程改动
   - 填充前检测"添加"按钮并自动点击以展开多个条目
   - 添加完后重新执行 ANALYZE
   - 新消息类型：`EXPAND_SECTIONS`（让 content script 点击所有添加按钮）

3. **`src/content/index.ts`** — 新消息处理
   - `EXPAND_SECTIONS`：接收需要展开的类型和数量，自动点击添加按钮

4. **`src/content/DOMAnalyzer.ts`** — 辅助
   - 在分析结果中标注哪些字段是 textarea（帮助 FormFiller 区分）
   - 检测并返回页面上的"添加"按钮信息
