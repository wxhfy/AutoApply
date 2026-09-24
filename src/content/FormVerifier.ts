import type { DOMField, FillProposal, VerifyResult } from '../types';
import { formatDateForControl, normalizeValue, type ValueKind } from '../matching/ValueNormalizer';

export function verifyField(field: DOMField, proposal?: FillProposal): VerifyResult {
  if (!proposal) return result(field.id, 'REVIEW', null, field.currentValue || null, '字段没有对应的填写提案');
  const expectedValue = proposal.value;
  const element = document.querySelector<HTMLElement>(field.locator);
  if (!expectedValue) return result(field.id, 'REVIEW', null, field.currentValue || null, '没有可自动填写的确定值');
  if (!element) return result(field.id, 'ERROR', expectedValue, null, '字段已从页面移除');
  if (element.getAttribute('aria-invalid') === 'true') return result(field.id, 'ERROR', expectedValue, readValue(field, element), '页面标记为无效');

  const actualValue = readValue(field, element);
  const kind = valueKind(field, proposal);
  const normalizedExpected = field.componentType === 'date' && element instanceof HTMLInputElement
    ? formatDateForControl(expectedValue, element.type)
    : normalizeValue(expectedValue, kind);
  const normalizedActual = actualValue ? normalizeValue(actualValue, kind) : '';

  if (!normalizedExpected || normalizedExpected !== normalizedActual) {
    return { fieldId: field.id, status: 'ERROR', expectedValue, actualValue, normalizedExpected, normalizedActual, reason: '页面实际值与期望值不一致' };
  }

  if (field.componentType === 'autocomplete' && hasUncommittedAutocompleteId(element)) {
    return { fieldId: field.id, status: 'REVIEW', expectedValue, actualValue, normalizedExpected, normalizedActual, reason: 'autocomplete 文本存在，但隐藏 ID 未提交' };
  }

  return { fieldId: field.id, status: 'VERIFIED', expectedValue, actualValue, normalizedExpected, normalizedActual };
}

function result(fieldId: string, status: VerifyResult['status'], expectedValue: string | null, actualValue: string | null, reason: string): VerifyResult {
  return {
    fieldId,
    status,
    expectedValue,
    actualValue,
    normalizedExpected: expectedValue,
    normalizedActual: actualValue,
    reason,
  };
}

function readValue(field: DOMField, element: HTMLElement): string | null {
  if (element instanceof HTMLSelectElement) return element.selectedOptions[0]?.text || null;
  if (element instanceof HTMLInputElement && (field.componentType === 'radio' || field.componentType === 'checkbox')) {
    const group = element.closest<HTMLElement>('[role="radiogroup"], .ant-radio-group, fieldset, .ant-form-item');
    const selected = element.name
      ? document.querySelector<HTMLInputElement>(`input[name="${CSS.escape(element.name)}"]:checked`)
      : group?.querySelector<HTMLInputElement>(`input[type="${element.type}"]:checked`) || (element.checked ? element : null);
    if (!selected) return null;
    if (selected.id) return document.querySelector(`label[for="${CSS.escape(selected.id)}"]`)?.textContent?.trim() || selected.value;
    return selected.closest('label')?.textContent?.trim() || selected.value;
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return element.value;
  return element.textContent?.trim() || null;
}

function valueKind(field: DOMField, proposal: FillProposal): ValueKind {
  if (proposal.fieldType === 'DEGREE') return 'degree';
  if (proposal.fieldType === 'GENDER') return 'gender';
  if (field.componentType === 'date') return 'date';
  return 'text';
}

function hasUncommittedAutocompleteId(element: HTMLElement): boolean {
  const container = element.closest('[data-autofill-autocomplete], .autocomplete, [class*="autocomplete"]');
  const idField = container?.querySelector<HTMLInputElement>('input[type="hidden"][name*="id" i]');
  return !!idField && !idField.value;
}
