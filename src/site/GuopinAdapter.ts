import type { DOMField } from '../types';

export function canHandleGuopinField(field: DOMField, element: HTMLElement): boolean {
  return field.componentType === 'cascader' || field.name === 'work_status' || /work_status|location|hukou/.test(element.id);
}

export async function fillGuopinField(field: DOMField, element: HTMLElement, value: string): Promise<{ success: boolean; reason?: string }> {
  if (field.name === 'work_status') {
    element.click();
    const option = await waitText(value, 1200);
    if (!option) return { success: false, reason: '国聘求职状态选项未出现' };
    option.click();
    return { success: true };
  }
  const structured = /^(.*?省)(.*?市)(.*?[区县])$/.exec(value.replace(/[>/／|,，\s]+/g, ''));
  const parts = structured ? structured.slice(1) : value.split(/[>/／|,，\s]+/).map(item => item.trim()).filter(Boolean);
  if (parts.length < 3) return { success: false, reason: '省市区需要完整的三级地址' };
  element.click();
  for (const part of parts) {
    const option = await waitText(part, 1200);
    if (!option) return { success: false, reason: `国聘地址选项未出现：${part}` };
    option.click();
    await pause(120);
  }
  const selected = element.closest('[class*="cascader-modal"]')?.textContent || element.textContent || '';
  return parts.every(part => selected.includes(part)) ? { success: true } : { success: false, reason: '国聘地址弹窗未提交完整层级' };
}

function waitText(text: string, timeoutMs: number): Promise<HTMLElement | null> {
  const find = () => Array.from(document.querySelectorAll<HTMLElement>('[role="option"], li, [class*="item"], [class*="option"], button'))
    .find(node => node.offsetParent !== null && node.textContent?.trim() === text) || null;
  const immediate = find();
  if (immediate) return Promise.resolve(immediate);
  return new Promise(resolve => {
    const observer = new MutationObserver(() => { const item = find(); if (item) finish(item); });
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    const finish = (item: HTMLElement | null) => { observer.disconnect(); window.clearTimeout(timer); resolve(item); };
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

function pause(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)); }
