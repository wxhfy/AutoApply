import type { UserProfile } from '../types';

/**
 * Resolve a resume data reference path to its literal text.
 *
 * The LLM returns paths instead of copying resume text verbatim, which keeps
 * output token count small and guarantees the original wording is preserved.
 *
 * Supported forms:
 *   basic.name
 *   links.github
 *   education[0].school
 *   projects[2].description
 *   skills            (joined with ', ')
 *   selfIntroduction
 *
 * Date fields accept a part suffix for forms that split a date across several
 * inputs (e.g. DJI renders 起止时间 as four year/month dropdowns):
 *   projects[0].startDate:year   -> "2022"
 *   projects[0].startDate:month  -> "01"
 *   projects[0].startDate:day    -> "15"
 *
 * Returns null for any unknown / out-of-range / malformed path so the caller
 * can skip that field instead of failing the whole batch.
 */

const OBJECT_ROOTS = ['basic', 'links'] as const;
const ARRAY_ROOTS = ['education', 'experience', 'internships', 'projects', 'awards'] as const;

type ObjectRoot = (typeof OBJECT_ROOTS)[number];
type ArrayRoot = (typeof ARRAY_ROOTS)[number];

type DatePart = 'year' | 'month' | 'day';
const DATE_PARTS: DatePart[] = ['year', 'month', 'day'];

export function resolveRef(profile: UserProfile, ref: string): string | null {
  let path = ref.trim();
  if (!path) return null;

  // Split off an optional ":year" / ":month" / ":day" suffix
  let datePart: DatePart | null = null;
  const colonIdx = path.lastIndexOf(':');
  if (colonIdx > 0) {
    const suffix = path.slice(colonIdx + 1).toLowerCase();
    if (DATE_PARTS.includes(suffix as DatePart)) {
      datePart = suffix as DatePart;
      path = path.slice(0, colonIdx).trim();
    }
  }

  const raw = resolvePath(profile, path);
  if (raw === null) return null;

  return datePart ? extractDatePart(raw, datePart) : raw;
}

/**
 * Pull one component out of a date string. Handles the formats resumes
 * realistically use: 2022-01, 2022/01/15, 2022年1月, 2022.01, bare 2022.
 */
export function extractDatePart(value: string, part: DatePart): string | null {
  const text = value.trim();
  if (!text) return null;

  // "至今" / "present" has no numeric parts
  if (/^(至今|现在|present|now|ongoing)$/i.test(text)) return null;

  const nums = text.match(/\d+/g);
  if (!nums || nums.length === 0) return null;

  // Year is the first 4-digit group; fall back to the first group
  const yearIdx = nums.findIndex(n => n.length === 4);
  const idx = yearIdx >= 0 ? yearIdx : 0;

  if (part === 'year') {
    const y = nums[idx];
    return y.length === 4 ? y : null;
  }

  const offset = part === 'month' ? 1 : 2;
  const raw = nums[idx + offset];
  if (!raw) return null;

  const n = Number(raw);
  if (part === 'month' && (n < 1 || n > 12)) return null;
  if (part === 'day' && (n < 1 || n > 31)) return null;

  // Unpadded. Dropdown option text varies ("1", "01", "1月", "01月") and the
  // filler's fuzzy matcher hits all of those from "1", but not from "01".
  return String(n);
}

function resolvePath(profile: UserProfile, path: string): string | null {
  // Scalar roots
  if (path === 'selfIntroduction') {
    return profile.selfIntroduction || null;
  }
  if (path === 'skills') {
    return profile.skills.length > 0 ? profile.skills.join(', ') : null;
  }

  // skills[0]
  const skillMatch = /^skills\[(\d+)\]$/.exec(path);
  if (skillMatch) {
    return profile.skills[Number(skillMatch[1])] ?? null;
  }

  // basic.name / links.github
  const objMatch = /^([a-zA-Z]+)\.([a-zA-Z]+)$/.exec(path);
  if (objMatch) {
    const [, root, key] = objMatch;
    if (!OBJECT_ROOTS.includes(root as ObjectRoot)) return null;
    const container = profile[root as ObjectRoot] as unknown as Record<string, unknown>;
    return toText(container?.[key]);
  }

  // education[0].school
  const arrMatch = /^([a-zA-Z]+)\[(\d+)\]\.([a-zA-Z]+)$/.exec(path);
  if (arrMatch) {
    const [, root, idxStr, key] = arrMatch;
    if (!ARRAY_ROOTS.includes(root as ArrayRoot)) return null;
    const list = profile[root as ArrayRoot] as unknown as Record<string, unknown>[] | undefined;
    if (!Array.isArray(list)) return null;
    const item = list[Number(idxStr)];
    if (!item) return null;
    return toText(item[key]);
  }

  return null;
}

function toText(raw: unknown): string | null {
  if (typeof raw === 'string') return raw.trim() ? raw : null;
  if (typeof raw === 'number') return String(raw);
  if (Array.isArray(raw)) {
    const joined = raw.filter(x => typeof x === 'string').join(', ');
    return joined || null;
  }
  return null;
}
