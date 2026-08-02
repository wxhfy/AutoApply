# 🤖 AI Job Filler

AI 驱动的网申自动填写助手，Chrome 浏览器扩展。

上传简历 PDF → 自动解析 → 打开招聘网站 → 一键填写。

## 功能

- **📄 简历导入** — 上传 Word 导出的 PDF，AI 自动提取结构化个人信息
- **📝 简历管理** — 分层编辑基本信息、教育背景、工作经历、项目经历、技能
- **🔍 页面分析** — 自动扫描招聘网站表单字段，提取 label、placeholder、上下文文本
- **🧠 AI 匹配** — 调用 LLM 将网页字段语义映射到简历数据，16 种字段类型覆盖
- **👁️ 填写预览** — 三级置信度（自动填写 / 待确认 / 跳过），逐项人工审核
- **✍️ 自动填写** — 原生 setter 绕过 React/Vue 受控组件，兼容主流招聘网站
- **📊 填写历史** — 记录每次填写的网站、字段数、时间

## 安装

```bash
# 1. 克隆仓库
git clone https://github.com/freecodetiger/job-filler.git
cd job-filler

# 2. 安装依赖
npm install --legacy-peer-deps

# 3. 构建
npm run build
```

## 加载到 Chrome

1. Chrome 地址栏输入 `chrome://extensions`，回车
2. 右上角打开「**开发者模式**」
3. 点击「**加载已解压的扩展程序**」
4. 选择 `dist/` 目录
5. 工具栏出现插件图标后，「**首次使用**」见下方

## 首次使用

1. **配置 API** — 点击插件图标 → 切换到「API」标签 → 填入：
   - Endpoint: `https://api.openai.com/v1`（或其他 OpenAI 兼容地址）
   - API Key: `sk-...`
   - Model: `gpt-4o-mini`
   - 点击「保存」
2. **导入简历** — 切换到「导入」标签 → 上传 PDF 简历 → AI 自动解析 → 确认导入
3. **编辑确认** — 切换到「简历」标签，检查并修改解析结果，保存

## 日常使用

1. 打开任意招聘网站的表单页面
2. 点击插件图标
3. 点击「**分析页面**」
4. 查看 AI 填写建议，勾选/取消
5. 点击「**确认填写**」

## 技术栈

| 层 | 技术 |
|----|------|
| 框架 | React 18 + TypeScript strict |
| 构建 | Vite + @crxjs/vite-plugin |
| 扩展 | Chrome Manifest V3 |
| 存储 | chrome.storage.local |
| PDF | pdfjs-dist |
| AI | OpenAI 兼容 API（可换任何厂商） |

## 项目结构

```
src/
├── types/          # 类型定义（ResumeFieldType, UserProfile, FillProposal ...）
├── storage/        # chrome.storage.local 封装 + 数据迁移
├── llm/            # LLM 客户端（OpenAI 兼容接口）
├── content/        # Content Script
│   ├── DOMAnalyzer.ts   # 页面表单字段扫描
│   └── FormFiller.ts    # 原生 setter + 事件触发填写
├── resume/         # 简历导入
│   ├── PDFExtractor.ts  # pdf.js 文本提取
│   ├── ResumeParser.ts  # LLM 简历解析
│   └── ProfileMapper.ts # 解析结果 → UserProfile
├── popup/          # Popup UI
│   ├── App.tsx          # 主流程编排
│   ├── ProfileEditor.tsx # 分层简历编辑器
│   ├── ResumeImport.tsx  # 简历上传 + 预览
│   ├── FillPreview.tsx   # 填写建议预览
│   └── ApiConfigEditor.tsx # API 配置
└── background/     # Service Worker（最小化）
```

## 架构

```
简历 PDF                招聘网站表单
   │                        │
   ▼                        ▼
PDFExtractor           DOMAnalyzer
   │                        │
   ▼                        ▼
ResumeParser (LLM)      FormField[]
   │                        │
   ▼                        ▼
UserProfile ────────▶ LLMClient.matchFields()
   │                        │
   ▼                        ▼
chrome.storage         FillProposal[]
   ▲                        │
   │                        ▼
   └────────────── FillPreview (确认)
                            │
                            ▼
                       FormFiller → 页面
```

## 许可

MIT
