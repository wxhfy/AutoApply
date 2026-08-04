import type { LLMClient, DOMField, UserProfile, FillProposal } from '../types';
import { classifyAction } from '../types';
import { chat } from './chat';
import { resolveRef } from './resolveRef';

const SYSTEM_PROMPT = `你是一个精确的招聘网站表单填写助手。你的任务是根据用户简历信息，将每个表单字段匹配到正确的简历字段类型，并提供填写值。

## 简历字段类型 (Resume Field Types)
NAME, PHONE, EMAIL, LOCATION, GENDER, BIRTH_DATE, ID_NUMBER,
SCHOOL, COLLEGE, MAJOR, DEGREE, GPA, COURSES, GRADUATION_DATE, EDUCATION_START_DATE,
WORK_EXPERIENCE, INTERNSHIP_EXPERIENCE, PROJECT_EXPERIENCE, AWARD, SKILLS,
SELF_INTRODUCTION, CAREER_GOAL, SALARY_EXPECTATION,
LINKEDIN, GITHUB, PERSONAL_WEBSITE, PORTFOLIO,
NATIONALITY, ETHNICITY, POLITICAL_STATUS, MARITAL_STATUS,
EMERGENCY_CONTACT, EMERGENCY_PHONE,
OTHER

## 中文招聘网站常见字段名映射
- 姓名/名字/真实姓名 → NAME
- 手机/手机号/联系电话/移动电话 → PHONE
- 邮箱/电子邮件/Email → EMAIL
- 所在城市/现居地/居住城市/期望工作城市 → LOCATION
- 性别 → GENDER
- 出生日期/生日/出生年月 → BIRTH_DATE
- 身份证/证件号 → ID_NUMBER
- 学校/毕业院校/就读学校 → SCHOOL
- 学院/院系/所在学院/二级学院 → COLLEGE
- 专业/所学专业 → MAJOR
- 学历/最高学历 → DEGREE
- 绩点/GPA/平均分/成绩 → GPA
- 主修课程/相关课程/课程名称 → COURSES
- 毕业时间/毕业年份 → GRADUATION_DATE
- 入学时间/开始时间 → EDUCATION_START_DATE
- 工作经历/工作经验 → WORK_EXPERIENCE
- 实习经历/实习经验/实习公司 → INTERNSHIP_EXPERIENCE
- 项目经历/项目经验/项目名称 → PROJECT_EXPERIENCE
- 获奖经历/荣誉奖项/竞赛获奖/奖项名称 → AWARD
- 技能/技术栈/擅长技术 → SKILLS
- 自我介绍/个人简介/自我评价 → SELF_INTRODUCTION
- 期望薪资/薪资要求 → SALARY_EXPECTATION

## 匹配规则
1. 综合利用所有可用属性进行语义匹配：label, placeholder, name, ariaLabel, nearbyText, section 上下文。
2. 中文招聘网站标签优先级：label文本 > placeholder > nearbyText > name属性。
3. 绝对不要编造数据，只使用用户简历中已有的内容。
4. 没有对应简历数据的字段：ref 和 value 都设为 null，confidence 设为 0。
5. 置信度评分：
   - 0.9-1.0: 标签明确对应一个字段类型，有准确的简历数据
   - 0.7-0.89: 语义上高度匹配但标签不够明确
   - 0.5-0.69: 可能匹配但存在歧义
   - <0.5: 不确定，ref 和 value 都设为 null

## 输出方式：优先用 ref 引用，不要复制原文

**这是最重要的规则。** 不要把简历正文复制到输出里，而是返回该内容在简历中的引用路径 \`ref\`。
系统会自动按路径取出原文填写，这样能保证与简历逐字一致。

可用的 ref 路径（严格使用以下格式，下标从 0 开始）：
- \`basic.name\` \`basic.phone\` \`basic.email\` \`basic.gender\` \`basic.birthDate\` \`basic.ethnicity\` \`basic.politicalStatus\` \`basic.nativePlace\`
- \`links.github\` \`links.linkedin\` \`links.website\`
- \`education[i].school\` \`education[i].college\` \`education[i].major\` \`education[i].degree\` \`education[i].gpa\` \`education[i].courses\` \`education[i].startDate\` \`education[i].endDate\`
- \`experience[i].company\` \`experience[i].role\` \`experience[i].startDate\` \`experience[i].endDate\` \`experience[i].description\`
- \`internships[i].company\` \`internships[i].role\` \`internships[i].startDate\` \`internships[i].endDate\` \`internships[i].description\`
- \`projects[i].name\` \`projects[i].startDate\` \`projects[i].endDate\` \`projects[i].description\`
- \`awards[i].name\` \`awards[i].date\` \`awards[i].level\` \`awards[i].description\`
- \`skills\` （全部技能，逗号分隔）
- \`selfIntroduction\`

**多条目对应关系**：页面上第 1 段项目对应 \`projects[0].*\`，第 2 段对应 \`projects[1].*\`，依此类推。
利用字段在页面中的先后顺序和 nearbyText 判断它属于第几段，教育/工作/实习/获奖同理。

**拆分式日期控件（重要）**：很多网站把「起止时间」拆成多个独立的年/月下拉框，
例如一行里有 4 个控件：[年][月] - [年][月]。这时**不要**把整个日期串填进去，
而要给日期 ref 加上 \`:year\` / \`:month\` / \`:day\` 后缀，一个控件对应一个部分：
- 第 1 个控件（开始的年）→ \`ref: "projects[0].startDate:year"\`
- 第 2 个控件（开始的月）→ \`ref: "projects[0].startDate:month"\`
- 第 3 个控件（结束的年）→ \`ref: "projects[0].endDate:year"\`
- 第 4 个控件（结束的月）→ \`ref: "projects[0].endDate:month"\`

判断依据：placeholder 或 label 是「年」「月」「日」「YYYY」「MM」这类单一部分的字样，
或同一「起止时间」标签下出现多个 select / combobox。
只有当一个控件明显承载完整日期（placeholder 形如 \`YYYY-MM-DD\`、\`请选择日期\`）时才用不带后缀的 ref。

**只有以下情况才用 value 直接给字面量**（因为需要改写以匹配页面）：
- SELECT 字段：必须从提供的 options 中选一个原文，填入 value
- 下拉框/选择器（role=combobox, role=listbox）：填期望选中的文本
- 日期需要转换格式时：按 placeholder 指定的格式（默认 YYYY-MM-DD）填 value
- 简历值与页面选项措辞不同需要归一化时（如简历"男" → 选项"男性"）

ref 和 value 只能给一个。能用 ref 就一定用 ref，尤其是所有长文本描述字段。

## 输出格式
只返回JSON数组，不要markdown代码块，不要解释文字。reason 控制在 10 字以内：
[
  { "fieldId": "jf-0", "fieldType": "NAME", "ref": "basic.name", "confidence": 0.95, "reason": "label姓名" },
  { "fieldId": "jf-7", "fieldType": "DEGREE", "value": "硕士", "confidence": 0.9, "reason": "选项匹配" },
  { "fieldId": "jf-31", "fieldType": "PROJECT_EXPERIENCE", "ref": "projects[0].description", "confidence": 0.95, "reason": "第1段项目描述" },
  { "fieldId": "jf-28", "fieldType": "PROJECT_EXPERIENCE", "ref": "projects[0].startDate:year", "confidence": 0.9, "reason": "第1段项目开始年" },
  { "fieldId": "jf-29", "fieldType": "PROJECT_EXPERIENCE", "ref": "projects[0].startDate:month", "confidence": 0.9, "reason": "第1段项目开始月" },
  { "fieldId": "jf-40", "fieldType": "OTHER", "ref": null, "value": null, "confidence": 0, "reason": "简历无此项" }
]
`;

/**
 * Build the resume context sent to the LLM.
 *
 * Each value is annotated with its ref path so the model can reference it
 * instead of copying it. Long descriptions are truncated here — the model only
 * needs enough text to identify which entry a field belongs to, never to
 * reproduce it, so the full text stays client-side.
 */
const DESC_PREVIEW_LIMIT = 200;

function preview(text: string): string {
  if (!text) return '(空)';
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= DESC_PREVIEW_LIMIT
    ? flat
    : `${flat.slice(0, DESC_PREVIEW_LIMIT)}…（共 ${flat.length} 字，填写时自动取全文）`;
}

function buildProfileText(profile: UserProfile): string {
  const parts: string[] = [];

  parts.push(`## 基本信息
姓名 [basic.name]: ${profile.basic.name}
手机 [basic.phone]: ${profile.basic.phone}
邮箱 [basic.email]: ${profile.basic.email}
性别 [basic.gender]: ${profile.basic.gender}
出生日期 [basic.birthDate]: ${profile.basic.birthDate}
民族 [basic.ethnicity]: ${profile.basic.ethnicity}
政治面貌 [basic.politicalStatus]: ${profile.basic.politicalStatus}
籍贯 [basic.nativePlace]: ${profile.basic.nativePlace}`);

  if (profile.links.github || profile.links.linkedin || profile.links.website) {
    parts.push(`## 个人链接
GitHub [links.github]: ${profile.links.github}
LinkedIn [links.linkedin]: ${profile.links.linkedin}
个人网站 [links.website]: ${profile.links.website}`);
  }

  if (profile.education.length > 0) {
    parts.push(`## 教育经历
${profile.education.map((e, i) =>
  `[education[${i}]] 学校: ${e.school} | 学院: ${e.college || '(空)'} | 专业: ${e.major} | 学历: ${e.degree} | 绩点: ${e.gpa || '(空)'} | ${e.startDate} ~ ${e.endDate}${e.courses ? `\n  主修课程: ${preview(e.courses)}` : ''}`
).join('\n')}`);
  }

  if (profile.experience.length > 0) {
    parts.push(`## 工作经历
${profile.experience.map((e, i) =>
  `[experience[${i}]] ${e.company} - ${e.role} (${e.startDate} ~ ${e.endDate})\n  描述摘要: ${preview(e.description)}`
).join('\n')}`);
  }

  if (profile.internships.length > 0) {
    parts.push(`## 实习经历
${profile.internships.map((e, i) =>
  `[internships[${i}]] ${e.company} - ${e.role} (${e.startDate} ~ ${e.endDate})\n  描述摘要: ${preview(e.description)}`
).join('\n')}`);
  }

  if (profile.projects.length > 0) {
    parts.push(`## 项目经历
${profile.projects.map((p, i) =>
  `[projects[${i}]] ${p.name} (${p.startDate} ~ ${p.endDate})\n  描述摘要: ${preview(p.description)}`
).join('\n')}`);
  }

  if (profile.awards.length > 0) {
    parts.push(`## 获奖经历
${profile.awards.map((a, i) =>
  `[awards[${i}]] ${a.name}${a.level ? ` [级别: ${a.level}]` : ''}${a.date ? ` (${a.date})` : ''}`
).join('\n')}`);
  }

  if (profile.skills.length > 0) {
    parts.push(`## 技能 [skills]
${profile.skills.join(', ')}`);
  }

  if (profile.selfIntroduction) {
    parts.push(`## 自我评价 [selfIntroduction]
${preview(profile.selfIntroduction)}`);
  }

  return parts.join('\n\n');
}

export function createLLMClient(
  endpoint: string,
  apiKey: string,
  model: string
): LLMClient {
  return {
    async matchFields(
      fields: DOMField[],
      profile: UserProfile,
      onRetry?: (attempt: number, max: number, reason: string) => void,
    ): Promise<FillProposal[]> {
      const fieldsDesc = fields.map(f => {
        const desc: Record<string, unknown> = {
          fieldId: f.id,
          tag: f.tag,
          type: f.type,
          label: f.label,
          placeholder: f.placeholder,
          name: f.name,
          ariaLabel: f.ariaLabel,
          nearbyText: f.nearbyText,
        };
        if (f.options) desc.options = f.options;
        return desc;
      });

      const content = await chat(
        { endpoint, apiKey, model },
        {
          systemPrompt: SYSTEM_PROMPT,
          userMessage: `${buildProfileText(profile)}\n\n---\n\nForm Fields:\n${JSON.stringify(fieldsDesc, null, 2)}`,
          timeoutMs: 120_000,
          onRetry,
        },
      );

      // Extract JSON from possible markdown fences
      const jsonStr = content
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();

      const raw: RawProposal[] = JSON.parse(jsonStr);

      if (!Array.isArray(raw)) {
        throw new Error('LLM response is not an array');
      }

      // Resolve refs client-side so resume text is preserved verbatim,
      // and enforce action classification — do not trust LLM action.
      let unresolved = 0;

      const proposals = raw.map(r => {
        const confidence = clamp(Number(r.confidence) || 0, 0, 1);

        // ref takes priority: it points at the original resume text
        let value: string | null = null;
        if (r.ref) {
          value = resolveRef(profile, r.ref);
          if (value === null) {
            unresolved++;
            console.warn(`[LLM matchFields] unresolved ref "${r.ref}" for ${r.fieldId}`);
          }
        }
        if (value === null && typeof r.value === 'string' && r.value.trim()) {
          value = r.value;
        }

        return {
          fieldId: r.fieldId,
          originalLabel: fields.find(f => f.id === r.fieldId)?.label || '',
          fieldType: (r.fieldType as FillProposal['fieldType']) || 'OTHER',
          value,
          confidence,
          reason: String(r.reason || ''),
          action: classifyAction(confidence),
        };
      });

      if (unresolved > 0) {
        console.warn(`[LLM matchFields] ${unresolved}/${raw.length} refs could not be resolved`);
      }

      return proposals;
    },
  };
}

interface RawProposal {
  fieldId: string;
  fieldType: string;
  ref?: string | null;
  value?: string | null;
  confidence: number;
  reason: string;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
