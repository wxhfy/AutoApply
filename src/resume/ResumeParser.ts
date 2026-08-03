import type { ApiConfig } from '../types';
import type { ParsedResume, ExtractedResume } from './types';
import { chat } from '../llm/chat';

const RESUME_PARSE_PROMPT = `你是一个简历信息抽取系统。从简历文本中提取结构化个人资料。

## 规则
1. **只提取明确存在的信息** — 文本中没有提到的字段，设为 null 或空字符串。绝对不推测。
2. **保留原始描述** — 项目描述、工作描述保持原文，不要改写、不要润色、不要总结。
3. **保留技术栈原文** — technologies 数组中的每个元素必须是原文明确提到的技术。
4. **保留工作经历细节** — 公司名、职位、时间范围，原文写什么就提取什么。
5. **技能** — 只提取简历中明确列出的技能，不要推断。
6. **时间格式** — 保持原文格式（如 "2021.06-2023.08" 或 "2021年6月-2023年8月"）。

## JSON 输出格式（严格遵守）
{
  "basic": {
    "name": "张三",
    "phone": "13800138000",
    "email": "zhangsan@example.com",
    "location": "北京市"
  },
  "education": {
    "school": "清华大学",
    "major": "计算机科学与技术",
    "degree": "硕士",
    "graduation": "2025.06"
  },
  "experience": [
    {
      "company": "字节跳动",
      "role": "前端开发实习生",
      "description": "负责抖音Web版直播功能的开发和维护，使用React+TypeScript优化首屏加载性能",
      "startDate": "2024.01",
      "endDate": "2024.06"
    }
  ],
  "projects": [
    {
      "name": "DDL Agent",
      "description": "一个基于LLM的智能任务管理工具，自动解析用户的自然语言描述生成结构化任务",
      "technologies": ["TypeScript", "React", "OpenAI API"],
      "achievements": ["实现自然语言到结构化任务的自动转换", "减少任务管理时间50%"]
    }
  ],
  "skills": ["Python", "TypeScript", "React", "SQL", "Docker"],
  "answers": {}
}

## 注意事项
- 如果没有工作经验，experience 设为空数组 []
- 如果没有项目经历，projects 设为空数组 []
- 如果某个基本信息缺失，设为空字符串 ""
- achievements 是字符串数组，每条一个成果，没有则 []
- 只输出 JSON，不要 markdown、不要解释、不要代码块`;

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
    maxTokens: 8192,
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
