export type ValueKind = 'degree' | 'gender' | 'boolean' | 'date' | 'location' | 'text';

const DEGREE_ALIASES: Record<string, string> = {
  本科: 'BACHELOR',
  学士: 'BACHELOR',
  bachelor: 'BACHELOR',
  硕士: 'MASTER',
  研究生: 'MASTER',
  硕士研究生: 'MASTER',
  master: 'MASTER',
  masters: 'MASTER',
  博士: 'PHD',
  博士研究生: 'PHD',
  phd: 'PHD',
};

const GENDER_ALIASES: Record<string, string> = {
  男: 'MALE', male: 'MALE', m: 'MALE',
  女: 'FEMALE', female: 'FEMALE', f: 'FEMALE',
};

const BOOLEAN_ALIASES: Record<string, string> = {
  是: 'YES', yes: 'YES', true: 'YES', '1': 'YES',
  否: 'NO', no: 'NO', false: 'NO', '0': 'NO',
};

export function normalizeValue(value: string, kind: ValueKind = 'text'): string {
  const trimmed = value.trim();
  if (kind === 'location') {
    return trimmed
      .replace(/^中国\s*[>/／|,，-]?\s*/, '')
      .replace(/[>/／|,，\s-]+/g, '')
      .replace(/特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|自治州|省|市/g, '');
  }
  if (kind === 'date') {
    const parts = trimmed.match(/\d+/g);
    if (!parts || parts.length < 2 || parts.length > 3) return trimmed.toLowerCase().replace(/\s+/g, '');
    return parts.map((part, index) => index === 0 ? part.padStart(4, '0') : part.padStart(2, '0')).join('-');
  }

  const compact = trimmed.toLowerCase().replace(/[\s'’._-]+/g, '');
  if (!compact) return '';

  if (kind === 'degree') return DEGREE_ALIASES[compact] || compact.toUpperCase();
  if (kind === 'gender') return GENDER_ALIASES[compact] || compact.toUpperCase();
  if (kind === 'boolean') return BOOLEAN_ALIASES[compact] || compact.toUpperCase();
  return compact;
}

/** Convert the Profile's human date format into an HTML date/month control value. */
export function formatDateForControl(value: string, controlType: 'date' | 'month' | string): string | null {
  const normalized = normalizeValue(value, 'date');
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(normalized);
  if (!match) return null;

  const [, year, month, day] = match;
  const monthNumber = Number(month);
  if (monthNumber < 1 || monthNumber > 12) return null;
  if (controlType === 'month') return `${year}-${month}`;
  if (controlType !== 'date') return normalized;

  const resolvedDay = day || '01';
  const date = new Date(Date.UTC(Number(year), monthNumber - 1, Number(resolvedDay)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== monthNumber - 1 || date.getUTCDate() !== Number(resolvedDay)) {
    return null;
  }
  return `${year}-${month}-${resolvedDay}`;
}

export function findMatchingOption(value: string, options: string[], kind: ValueKind = 'text'): string | null {
  const target = normalizeValue(value, kind);
  return options.find(option => normalizeValue(option, kind) === target) || null;
}
