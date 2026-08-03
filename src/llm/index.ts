import type { LLMClient, DOMField, UserProfile, FillProposal } from '../types';
import { classifyAction } from '../types';
import { chat } from './chat';

const SYSTEM_PROMPT = `You are a precise form-filling assistant. Your task is to map each form field to a semantic field type and propose a fill value from the user's profile.

## Resume Field Types
Only use these types:
NAME, PHONE, EMAIL, LOCATION, SCHOOL, MAJOR, DEGREE, GRADUATION_DATE,
WORK_EXPERIENCE, INTERNSHIP_EXPERIENCE, PROJECT_EXPERIENCE, SKILLS,
SELF_INTRODUCTION, CAREER_GOAL, SALARY_EXPECTATION, OTHER

## Rules
1. Match fields semantically by ALL available attributes: label, placeholder, name, nearbyText, type, tag.
2. NEVER fabricate data. Only use exact strings from the provided profile.
3. If a field type has no corresponding data in the profile, set value to null and confidence to 0.
4. For SELECT fields, pick the closest option from the provided options list. If none matches, set value to null.
5. Confidence scoring:
   - 0.9-1.0: label + attributes clearly match a single field type, exact profile data available
   - 0.7-0.89: strong match but label is ambiguous or noisy nearbyText
   - 0.5-0.69: plausible match but label is very vague
   - 0.0-0.49: uncertain, do not propose a value
6. For WORK_EXPERIENCE/INTERNSHIP_EXPERIENCE/PROJECT_EXPERIENCE/SELF_INTRODUCTION fields:
   - Only fill if the profile contains relevant content
   - For textareas, provide concise, professional content from the profile
7. reason must be a short Chinese sentence explaining the match (e.g. "label文本'姓名'匹配到简历中的名字")
8. Return ONLY a JSON array. No markdown, no explanation, no code fences.

## Output Format
[
  {
    "fieldId": "jf-0",
    "fieldType": "NAME",
    "value": "张三",
    "confidence": 0.95,
    "reason": "label文本'姓名'匹配到简历中的名字"
  }
]
`;

function buildProfileText(profile: UserProfile): string {
  const parts: string[] = [];

  parts.push(`## 基本信息
姓名: ${profile.basic.name}
电话: ${profile.basic.phone}
邮箱: ${profile.basic.email}
所在城市: ${profile.basic.location}

## 教育
学校: ${profile.education.school}
专业: ${profile.education.major}
学历: ${profile.education.degree}
毕业时间: ${profile.education.graduation}`);

  if (profile.experience.length > 0) {
    parts.push(`## 工作经历
${profile.experience.map((e, i) =>
  `${i + 1}. ${e.company} - ${e.role}: ${e.description}`
).join('\n')}`);
  }

  if (profile.projects.length > 0) {
    parts.push(`## 项目经历
${profile.projects.map((p, i) =>
  `${i + 1}. ${p.name}: ${p.description} (技术: ${p.technologies}, 成果: ${p.achievement})`
).join('\n')}`);
  }

  if (profile.skills.length > 0) {
    parts.push(`## 技能
${profile.skills.join(', ')}`);
  }

  if (Object.keys(profile.answers).length > 0) {
    parts.push(`## 自定义问答
${Object.entries(profile.answers).map(([q, a]) => `Q: ${q}\nA: ${a}`).join('\n\n')}`);
  }

  return parts.join('\n\n');
}

export function createLLMClient(
  endpoint: string,
  apiKey: string,
  model: string
): LLMClient {
  return {
    async matchFields(fields: DOMField[], profile: UserProfile): Promise<FillProposal[]> {
      const fieldsDesc = fields.map(f => {
        const desc: Record<string, unknown> = {
          fieldId: f.id,
          tag: f.tag,
          type: f.type,
          label: f.label,
          placeholder: f.placeholder,
          name: f.name,
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
          maxTokens: 4000,
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

      // Enforce action classification client-side — do not trust LLM action
      return raw.map(r => {
        const confidence = clamp(Number(r.confidence) || 0, 0, 1);
        return {
          fieldId: r.fieldId,
          originalLabel: fields.find(f => f.id === r.fieldId)?.label || '',
          fieldType: (r.fieldType as FillProposal['fieldType']) || 'OTHER',
          value: r.value ?? null,
          confidence,
          reason: String(r.reason || ''),
          action: classifyAction(confidence),
        };
      });
    },
  };
}

interface RawProposal {
  fieldId: string;
  fieldType: string;
  value: string | null;
  confidence: number;
  reason: string;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
