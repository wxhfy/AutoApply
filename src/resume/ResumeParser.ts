import type { ApiConfig } from '../types';
import type { ParsedResume, ExtractedResume } from './types';
import { chat } from '../llm/chat';

const RESUME_PARSE_PROMPT = `你是一个简历信息抽取系统。从简历文本中提取结构化数据，用于自动填写招聘网站的网申表单。

## 核心原则
**逐字复制原文** — 所有 description、selfIntroduction 字段必须是简历原文的逐字复制，绝对不允许改写、润色、缩写、总结或重新组织语言。

## 输出 JSON 结构
{
  "basic": {
    "name": "姓名",
    "phone": "手机号",
    "email": "邮箱",
    "gender": "性别（男/女）",
    "birthDate": "出生日期，保持原文格式",
    "ethnicity": "民族",
    "politicalStatus": "政治面貌（群众/共青团员/中共党员等）",
    "nativePlace": "籍贯"
  },
  "links": {
    "github": "GitHub 链接",
    "linkedin": "LinkedIn 链接",
    "website": "个人网站/博客/作品集链接"
  },
  "education": [
    {
      "school": "学校全称",
      "college": "学院/院系名称，如'计算机科学与技术学院'，没有则空字符串",
      "major": "专业",
      "degree": "学历（博士/硕士/本科/大专）",
      "gpa": "绩点或平均分，保持原文写法如'3.8/4.0'或'89分'，没有则空字符串",
      "courses": "主修课程，所有课程放在同一个字符串里，用顿号或逗号分隔，没有则空字符串",
      "startDate": "入学时间，保持原文格式",
      "endDate": "毕业时间，保持原文格式"
    }
  ],
  "experience": [
    {
      "company": "公司名称",
      "role": "职位/岗位",
      "startDate": "开始时间",
      "endDate": "结束时间",
      "description": "【逐字复制该段经历下的全部描述，包括换行】"
    }
  ],
  "internships": [
    {
      "company": "实习公司名称",
      "role": "实习岗位",
      "startDate": "开始时间",
      "endDate": "结束时间",
      "description": "【逐字复制该段实习经历的全部描述，包括换行】"
    }
  ],
  "projects": [
    {
      "name": "项目名称",
      "startDate": "开始时间",
      "endDate": "结束时间",
      "description": "【逐字复制该项目下的全部描述，包括换行】"
    }
  ],
  "awards": [
    {
      "name": "奖项名称",
      "date": "获奖时间",
      "level": "获奖级别（国家级/省级/校级/院级等，原文没有则留空）",
      "description": "【逐字复制奖项相关描述，没有则留空】"
    }
  ],
  "skills": ["技能1", "技能2"],
  "selfIntroduction": "【逐字复制简历中自我评价/自我介绍的全部内容】"
}

## 规则
1. 只提取简历中明确存在的信息。没有提到的字段设为空字符串 "" 或空数组 []。
2. education 支持多段：如果简历有本科和硕士，就提取两条记录，按时间倒序（最近的在前）。
   - college 是学院/院系，注意与 school（学校）区分。如"清华大学 计算机科学与技术学院"，
     school 填"清华大学"，college 填"计算机科学与技术学院"。
   - courses 把所有主修课程合并进同一个字符串，不要拆成数组。
3. **区分正式工作和实习**：
   - experience 只放正式工作经历（全职）
   - internships 只放实习经历（简历中标注"实习"、"Intern"、或在校期间的工作）
   - 如果无法判断，看是否在教育经历时间段内：在校期间的通常是实习
4. projects 的 description 是最重要的字段，必须完整保留原文，不管多长。
5. awards 对应简历中"获奖经历""荣誉奖项""竞赛获奖"等板块，每个奖项一条记录。
6. 时间格式保持原文中的写法，不要统一转换。
7. selfIntroduction 对应简历中"自我评价""自我介绍""个人总结"等板块。
8. skills 提取为扁平数组，每项是一个技术/能力名称。
9. 只输出 JSON，不要 markdown 代码块、不要解释文字。`;

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
    // 简历解析输出量大（需逐字复制原文），给更长的超时
    timeoutMs: 180_000,
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

  // Validate structure (defensive defaults)
  parsed.basic ??= { name: '', phone: '', email: '', gender: '', birthDate: '', ethnicity: '', politicalStatus: '', nativePlace: '' };
  parsed.links ??= { github: '', linkedin: '', website: '' };
  parsed.education ??= [];
  parsed.experience ??= [];
  parsed.internships ??= [];
  parsed.projects ??= [];
  parsed.awards ??= [];
  parsed.skills ??= [];
  parsed.selfIntroduction ??= '';

  return parsed;
}
