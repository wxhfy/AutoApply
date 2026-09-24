import type { DOMField, FillProposal } from '../types';
import { findComponentAdapter } from './ComponentAdapters';
import { canHandleGuopinField, fillGuopinField } from '../site/GuopinAdapter';

export interface FillAttempt {
  fieldId: string;
  success: boolean;
  reason?: string;
}

const FIELD_TIMEOUT_MS = 10_000;

export async function fillForm(fields: DOMField[], proposals: FillProposal[]): Promise<FillAttempt[]> {
  const byId = new Map(fields.map(field => [field.id, field]));
  const attempts: FillAttempt[] = [];
  for (const proposal of proposals) {
    if (proposal.action !== 'auto_fill' || !proposal.value) continue;
    const field = byId.get(proposal.fieldId);
    attempts.push(field
      ? await withTimeout(fillProposal(field, proposal), proposal.fieldId)
      : { fieldId: proposal.fieldId, success: false, reason: '扫描结果中不存在该字段' });
  }
  return attempts;
}

async function withTimeout(attempt: Promise<FillAttempt>, fieldId: string): Promise<FillAttempt> {
  let timer = 0;
  const timeout = new Promise<FillAttempt>(resolve => {
    timer = window.setTimeout(() => resolve({
      fieldId,
      success: false,
      reason: `控件在 ${FIELD_TIMEOUT_MS / 1000} 秒内未完成提交`,
    }), FIELD_TIMEOUT_MS);
  });
  const result = await Promise.race([attempt, timeout]);
  window.clearTimeout(timer);
  return result;
}

export async function fillProposal(field: DOMField, proposal: FillProposal): Promise<FillAttempt> {
  if (!proposal.value || proposal.action !== 'auto_fill') {
    return { fieldId: proposal.fieldId, success: false, reason: '字段不允许自动填写' };
  }
  const element = document.querySelector<HTMLElement>(field.locator);
  if (!element) return { fieldId: proposal.fieldId, success: false, reason: '字段已从页面移除' };
  if (location.hostname.endsWith('iguopin.com') && canHandleGuopinField(field, element)) {
    const result = await fillGuopinField(field, element, proposal.value);
    return { fieldId: proposal.fieldId, ...result };
  }
  const adapter = findComponentAdapter(field, element);
  if (!adapter) return { fieldId: proposal.fieldId, success: false, reason: `不支持的组件：${field.componentType}` };
  const result = await adapter.fill(field, element, proposal.value);
  return { fieldId: proposal.fieldId, ...result };
}

// Compatibility shim for the old popup message. New orchestration uses fillForm.
export async function fillSingle(proposal: FillProposal): Promise<boolean> {
  const element = document.querySelector<HTMLElement>(`[data-jf-id="${proposal.fieldId}"]`);
  if (!element || !proposal.value || proposal.action !== 'auto_fill') return false;
  const field: DOMField = {
    id: proposal.fieldId,
    tag: element.tagName.toLowerCase(),
    type: element.getAttribute('type') || 'text',
    label: proposal.originalLabel,
    placeholder: element.getAttribute('placeholder') || '',
    name: element.getAttribute('name') || '',
    ariaLabel: element.getAttribute('aria-label') || '',
    nearbyText: '',
    currentValue: '',
    required: element.hasAttribute('required'),
    componentType: element instanceof HTMLSelectElement ? 'native-select' : 'text',
    locator: `[data-jf-id="${proposal.fieldId}"]`,
  };
  return (await fillProposal(field, proposal)).success;
}

// Repeatable sections stay deferred until cardinality semantics are defined.
export async function expandSections(_counts: { section: string; need: number }[]): Promise<void> {}
