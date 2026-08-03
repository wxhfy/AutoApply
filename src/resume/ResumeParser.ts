import type { ApiConfig } from '../types';
import type { ParsedResume, ExtractedResume } from './types';
import { chat } from '../llm/chat';

const RESUME_PARSE_PROMPT = `你是一个简历信息抽取系统。从简历文本中提取结构化个人资料。

## 核心原则
**逐字复制原文** — 所有 description、achievements 字段必须是简历原文的逐字摘录，绝对不允许改写、润色、缩写、总结或重新组织语言。如果原文是"负责公司内部CRM系统的前端开发，使用Vue3+TypeScript重构了客户管理模块，将页面加载速度从3.2s优化至0.8s"，你必须原封不动复制这段话。

## 规则
1. **只提取明确存在的信息** — 文本中没有提到的字段，设为空字符串 ""。绝对不推测、不补充。
2. **description 必须原文复制** — 把简历中该经历/项目下的所有描述文字完整复制过来，包括换行符。不要总结，不要缩写。
3. **technologies 只提取明确出现的** — 原文提到什么技术就写什么，不要推断。
4. **achievements 逐条原文复制** — 简历中每一条成果/亮点作为数组的一个元素，保持原文。
5. **时间格式** — 保持原文格式，不要统一格式。

## JSON 输出格式
{
  "basic": { "name": "", "phone": "", "email": "", "location": "" },
  "education": { "school": "", "major": "", "degree": "", "graduation": "" },
  "experience": [
    {
      "company": "",
      "role": "",
      "description": "【逐字复制简历中该经历的全部描述文字】",
      "startDate": "",
      "endDate": ""
    }
  ],
  "projects": [
    {
      "name": "",
      "description": "【逐字复制简历中该项目的全部描述文字】",
      "technologies": [],
      "achievements": ["【逐条原文复制】"]
    }
  ],
  "skills": [],
  "answers": {}
}

## 注意
- 没有工作经验 → experience 设为 []
- 没有项目经历 → projects 设为 []
- 某个字段缺失 → 设为 ""
- 只输出 JSON，不要 markdown 代码块、不要解释`;

export async function parseResume(
  resume: ExtractedResume,
  apiConfig: ApiConfig
): Promise<ParsedResume> {
  // Truncate to ~15000 chars to stay within token limits for most models
  const truncatedText = resume.text.length > 15000
    ? resume.text.slice(0, 15000) + '\n\n[... 文本过长已截断]'
    : resume.text;

  console.log(`[ResumeParser] Sending ${truncatedText.length} chars to LLM`);

  const content = await chat(apiConfig, {
    systemPrompt: RESUME_PARSE_PROMPT,
    userMessage: `请从以下简历文本中提取结构化信息：\n\n${truncatedText}`,
  });

  console.log(`[ResumeParser] LLM response (${content.length} chars):`, content.slice(0, 200));

  // Strip possible markdown fences
  const jsonStr = content
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim();

  let parsed: ParsedResume;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    console.error('[ResumeParser] JSON parse failed, raw content:', content);
    throw new Error(`LLM 返回的内容不是合法 JSON: ${jsonStr.slice(0, 100)}...`);
  }

  // Validate structure (defensive)
  parsed.basic ??= { name: '', phone: '', email: '', location: '' };
  parsed.education ??= { school: '', major: '', degree: '', graduation: '' };
  parsed.experience ??= [];
  parsed.projects ??= [];
  parsed.skills ??= [];
  parsed.answers ??= {};

  return parsed;
}
