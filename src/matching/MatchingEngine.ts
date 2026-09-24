import type { DOMField, FillProposal, UserProfile } from '../types/index.ts';
import { FIELD_RULES, HUMAN_GATE_PATTERN, type FieldRule } from './FieldDictionary.ts';
import { findMatchingOption, type ValueKind } from './ValueNormalizer.ts';

export function matchFields(fields: DOMField[], profile: UserProfile): FillProposal[] {
  return fields.map(field => matchField(field, profile));
}

function matchField(field: DOMField, profile: UserProfile): FillProposal {
  if (field.currentValue.trim()) {
    return review(field, '页面已有值，默认不覆盖');
  }
  const labels = [field.label, field.name, field.placeholder, field.ariaLabel]
    .filter(Boolean)
    .map(normalizeLabel);
  if (labels.some(label => HUMAN_GATE_PATTERN.test(label))) {
    return review(field, '需用户确认的敏感求职项');
  }

  const matched = findRule(labels);
  if (!matched) return review(field, '没有确定性规则匹配');

  const rawValue = resolveProfileValue(profile, matched.rule.profilePath);
  if (!rawValue) return review(field, 'Profile 未提供明确值', matched.rule.fieldType as FillProposal['fieldType'], matched.confidence);

  const value = field.options?.length
    ? findMatchingOption(rawValue, field.options, matched.rule.valueKind) || null
    : rawValue;

  if (!value) return review(field, '页面选项无法确定匹配', matched.rule.fieldType as FillProposal['fieldType'], matched.confidence);

  return {
    fieldId: field.id,
    originalLabel: field.label,
    fieldType: matched.rule.fieldType as FillProposal['fieldType'],
    value,
    confidence: matched.confidence,
    reason: matched.reason,
    action: 'auto_fill',
    source: 'rule',
  };
}

function findRule(labels: string[]): { rule: FieldRule; confidence: number; reason: string } | null {
  for (const rule of FIELD_RULES) {
    if (labels.some(label => rule.exact.some(candidate => normalizeLabel(candidate) === label))) {
      return { rule, confidence: 1, reason: 'Exact 规则' };
    }
  }
  for (const rule of FIELD_RULES) {
    if (labels.some(label => rule.aliases.some(candidate => normalizeLabel(candidate) === label))) {
      return { rule, confidence: 0.98, reason: 'Alias 规则' };
    }
  }
  for (const rule of FIELD_RULES) {
    if (labels.some(label => rule.patterns?.some(pattern => pattern.test(label)))) {
      return { rule, confidence: 0.9, reason: 'Regex 规则' };
    }
  }
  return null;
}

function resolveProfileValue(profile: UserProfile, path: string): string | null {
  const basicMatch = /^basic\.([a-zA-Z]+)$/.exec(path);
  if (basicMatch) return profile.basic[basicMatch[1] as keyof UserProfile['basic']] || null;

  const educationMatch = /^education\[(\d+)\]\.([a-zA-Z0-9]+)$/.exec(path);
  if (educationMatch) {
    const education = profile.education[Number(educationMatch[1])];
    return education?.[educationMatch[2] as keyof typeof education] || null;
  }
  return null;
}

function review(field: DOMField, reason: string, fieldType: FillProposal['fieldType'] = 'OTHER' as FillProposal['fieldType'], confidence = 0): FillProposal {
  return {
    fieldId: field.id,
    originalLabel: field.label,
    fieldType,
    value: null,
    confidence,
    reason,
    action: 'confirm',
  };
}

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/（[^）]*）|\([^)]*\)/g, '').replace(/[\s:：*\-_]+/g, '');
}
