import type { DOMField } from '../types';
import type { SiteAdapter } from './SiteAdapter.ts';

export const guopinSiteAdapter: SiteAdapter = {
  canHandle: url => {
    try { return new URL(url).hostname.endsWith('iguopin.com'); } catch { return false; }
  },
  canFill: canHandleGuopinField,
  fill: fillGuopinField,
};

export function canHandleGuopinField(field: DOMField, element: HTMLElement): boolean {
  return field.componentType === 'cascader' || field.name === 'work_status' || /work_status|location|hukou/.test(element.id);
}

export async function fillGuopinField(field: DOMField, element: HTMLElement, value: string): Promise<{ success: boolean; reason?: string }> {
  if (field.name === 'work_status' || element.id === 'work_status') {
    activateControl(element);
    const option = await waitText(value, 2500, 'select');
    if (!option) return { success: false, reason: '国聘求职状态选项未出现' };
    clickInteractiveOption(option);
    return await waitSelectedText(element, value, 1500)
      ? { success: true }
      : { success: false, reason: '国聘求职状态已点击但未提交' };
  }
  const parts = parseGuopinAddress(value);
  if (parts.length < 2) return { success: false, reason: '地址至少需要省市两级' };
  await closeVisibleAddressModals();
  const previouslyVisible = new Set(visibleAddressModals());
  activateControl(element);
  const modal = await waitActiveAddressModal(previouslyVisible, 2500);
  if (!modal) return { success: false, reason: '国聘地址弹窗未出现' };
  for (const part of parts) {
    const option = await waitTextInRoot(modal, part, 2500);
    if (!option) return { success: false, reason: `国聘地址选项未出现：${part}` };
    clickInteractiveOption(option);
    await pause(250);
  }
  const selected = await waitAddressValue(element, parts, 1500);
  return parts.every(part => selected.includes(part)) ? { success: true } : { success: false, reason: '国聘地址弹窗未提交完整层级' };
}

export function parseGuopinAddress(value: string): string[] {
  const compact = value.replace(/[>/／|,，\s]+/g, '');
  const structured = /^(.*?省)(.*?市)(.*?[区县])?$/.exec(compact);
  const parts = structured ? structured.slice(1).filter(Boolean) : value.split(/[>/／|,，\s]+/).map(item => item.trim()).filter(Boolean);
  if (parts.length < 2) return parts;
  return [
    parts[0].replace(/省$/, ''),
    parts[1].replace(/市$/, ''),
    ...parts.slice(2),
  ];
}

function waitText(text: string, timeoutMs: number, kind: 'select' | 'address'): Promise<HTMLElement | null> {
  const find = () => {
    const selector = kind === 'address'
      ? '.ant-modal-wrap'
      : '.ant-select-dropdown:not(.ant-select-dropdown-hidden)';
    const roots = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(isVisible);
    const scope: HTMLElement = roots[roots.length - 1] || document.body;
    const candidates = Array.from(scope.querySelectorAll<HTMLElement>('*'));
    return candidates
      .filter(node => isVisible(node) && node.textContent?.trim() === text)
      .filter(node => !Array.from(node.children).some(child => child.textContent?.trim() === text))
      .sort((left, right) => area(left) - area(right))[0] || null;
  };
  const immediate = find();
  if (immediate) return Promise.resolve(immediate);
  return new Promise(resolve => {
    const observer = new MutationObserver(() => { const item = find(); if (item) finish(item); });
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    const finish = (item: HTMLElement | null) => { observer.disconnect(); window.clearTimeout(timer); resolve(item); };
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

function waitTextInRoot(root: HTMLElement, text: string, timeoutMs: number): Promise<HTMLElement | null> {
  const find = () => Array.from(root.querySelectorAll<HTMLElement>('*'))
    .filter(node => isVisible(node) && node.textContent?.trim() === text)
    .filter(node => !Array.from(node.children).some(child => child.textContent?.trim() === text))
    .sort((left, right) => area(left) - area(right))[0] || null;
  const immediate = find();
  if (immediate) return Promise.resolve(immediate);
  return new Promise(resolve => {
    const observer = new MutationObserver(() => { const item = find(); if (item) finish(item); });
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    const finish = (item: HTMLElement | null) => { observer.disconnect(); window.clearTimeout(timer); resolve(item); };
    observer.observe(root, { childList: true, subtree: true });
  });
}

async function waitActiveAddressModal(previouslyVisible: Set<HTMLElement>, timeoutMs: number): Promise<HTMLElement | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const visible = visibleAddressModals();
    const opened = visible.filter(modal => !previouslyVisible.has(modal));
    if (opened.length) return topmost(opened);
    if (visible.length) return topmost(visible);
    await pause(50);
  }
  return null;
}

function clickInteractiveOption(element: HTMLElement): void {
  const target = element.closest<HTMLElement>(
    '[role="option"], .ant-select-item-option, .level-item, .leaf-item, li, button',
  ) || element;
  activateControl(target);
}

async function waitSelectedText(element: HTMLElement, value: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const selected = element.closest('.ant-select')?.querySelector<HTMLElement>('.ant-select-selection-item')?.textContent?.trim() || '';
    if (selected === value) return true;
    await pause(50);
  }
  return false;
}

async function waitAddressValue(element: HTMLElement, parts: string[], timeoutMs: number): Promise<string> {
  const read = () => element.closest('[data-testid="cascader-modal-field"], .ant-form-item')
    ?.querySelector<HTMLElement>('.ant-select-selection-item')?.textContent?.trim() || '';
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const selected = read();
    if (parts.every(part => selected.includes(part))) return selected;
    await pause(50);
  }
  return read();
}

async function closeVisibleAddressModals(): Promise<void> {
  visibleAddressModals().forEach(modal => {
    const close = modal.querySelector<HTMLElement>('.ant-modal-close, [aria-label="Close"], [aria-label="关闭"]');
    if (close) activateControl(close);
  });
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  for (let attempt = 0; attempt < 6 && visibleAddressModals().length; attempt++) await pause(50);
}

function visibleAddressModals(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ant-modal-wrap')).filter(isVisible);
}

function topmost(elements: HTMLElement[]): HTMLElement {
  return elements.reduce((top, candidate) => overlayRank(candidate) >= overlayRank(top) ? candidate : top);
}

function overlayRank(element: HTMLElement): number {
  const zIndex = Number.parseInt(window.getComputedStyle(element).zIndex, 10);
  return (Number.isFinite(zIndex) ? zIndex : 0) * 1_000_000
    + Array.from(document.querySelectorAll<HTMLElement>('.ant-modal-wrap')).indexOf(element);
}

function pause(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)); }

function activateControl(element: HTMLElement): void {
  const container = element.closest<HTMLElement>('.ant-select, [class*="Select-container"]');
  const target = container?.querySelector<HTMLElement>('.ant-select-selector') || container || element;
  target.scrollIntoView({ block: 'nearest' });
  target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  target.click();
}

function isVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
}

function area(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  return rect.width * rect.height;
}
