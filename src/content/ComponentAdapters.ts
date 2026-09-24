import type { DOMField } from '../types';
import { formatDateForControl, normalizeValue, type ValueKind } from '../matching/ValueNormalizer.ts';

export interface AdapterFillResult {
  success: boolean;
  reason?: string;
}

export interface ComponentAdapter {
  readonly name: string;
  canHandle(field: DOMField, element: HTMLElement): boolean;
  fill(field: DOMField, element: HTMLElement, value: string): Promise<AdapterFillResult>;
}

export function findComponentAdapter(field: DOMField, element: HTMLElement): ComponentAdapter | null {
  return COMPONENT_ADAPTERS.find(adapter => adapter.canHandle(field, element)) || null;
}

class TextAdapter implements ComponentAdapter {
  readonly name = 'TextAdapter';

  canHandle(field: DOMField): boolean {
    return ['text', 'textarea', 'contenteditable'].includes(field.componentType);
  }

  async fill(_field: DOMField, element: HTMLElement, value: string): Promise<AdapterFillResult> {
    if (element.isContentEditable) {
      element.focus();
      element.textContent = value;
      dispatchInputEvents(element, value);
      element.blur();
      return { success: true };
    }

    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
      return { success: false, reason: '不是可输入控件' };
    }
    setNativeValue(element, value);
    return { success: true };
  }
}

class DateInputAdapter implements ComponentAdapter {
  readonly name = 'DateInputAdapter';

  canHandle(field: DOMField): boolean {
    return field.componentType === 'date';
  }

  async fill(_field: DOMField, element: HTMLElement, value: string): Promise<AdapterFillResult> {
    const input = element instanceof HTMLInputElement ? element : element.querySelector<HTMLInputElement>('input');
    if (input) {
      const controlValue = formatDateForControl(value, input.type);
      if (!controlValue) return { success: false, reason: 'Profile 日期格式不被页面日期控件接受' };
      if (input.closest('.ant-picker')) {
        if (input.readOnly) return fillAntCalendar(input, controlValue);
        input.click();
        setNativeValue(input, controlValue, false);
        await new Promise(resolve => setTimeout(resolve, 100));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        input.blur();
      } else setNativeValue(input, controlValue);
      return { success: true };
    }

    element.click();
    const option = await waitForDateOption(value, 1_500);
    if (!option) return { success: false, reason: '日期候选项未出现或未精确匹配' };
    clickOption(option);
    return { success: true };
  }
}

async function fillAntCalendar(input: HTMLInputElement, value: string): Promise<AdapterFillResult> {
  const parts = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  if (!parts) return { success: false, reason: '日期必须为 YYYY-MM 或 YYYY-MM-DD' };
  const pause = () => new Promise(resolve => setTimeout(resolve, 80));
  const panel = () => latestVisible('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)');
  input.focus();
  clickOption(input);
  await pause();
  if (!panel()) return { success: false, reason: '日期面板未打开' };
  panel()?.querySelector<HTMLElement>('.ant-picker-year-btn')?.click();
  await pause();
  for (let step = 0; step < 30; step++) {
    const root = panel();
    if (!root) break;
    const year = root.querySelector<HTMLElement>(`.ant-picker-cell[title="${parts[1]}"]:not(.ant-picker-cell-disabled)`);
    if (year) { year.click(); await pause(); break; }
    const years = Array.from(root.querySelectorAll('.ant-picker-cell[title]')).map(e => Number(e.getAttribute('title'))).filter(Number.isFinite);
    if (!years.length) break;
    const direction = Number(parts[1]) < Math.min(...years) ? 'prev' : 'next';
    const button = root.querySelector<HTMLButtonElement>(`.ant-picker-header-super-${direction}-btn`);
    if (!button || button.disabled) break;
    button.click();
    await pause();
  }
  const needsDay = !!panel()?.querySelector('.ant-picker-date-panel');
  if (needsDay && !parts[3]) return { success: false, reason: '日控件需要明确日期，不能猜测日' };
  if (needsDay) {
    panel()?.querySelector<HTMLElement>('.ant-picker-month-btn')?.click();
    await pause();
  }
  const month = panel()?.querySelector<HTMLElement>(`.ant-picker-cell[title="${parts[1]}-${parts[2]}"]:not(.ant-picker-cell-disabled)`);
  if (!month) return { success: false, reason: '日历中未找到目标年月' };
  month.click();
  await pause();
  if (parts[3]) {
    const day = panel()?.querySelector<HTMLElement>(`.ant-picker-date-panel .ant-picker-cell[title="${value}"]:not(.ant-picker-cell-disabled)`);
    if (!day) return { success: false, reason: '日历中未找到目标日期' };
    day.click();
    await pause();
  }
  input.blur();
  return { success: input.value === value, reason: input.value === value ? undefined : '日历选择未提交' };
}

class NativeSelectAdapter implements ComponentAdapter {
  readonly name = 'NativeSelectAdapter';

  canHandle(field: DOMField, element: HTMLElement): boolean {
    return field.componentType === 'native-select' && element instanceof HTMLSelectElement;
  }

  async fill(_field: DOMField, element: HTMLElement, value: string): Promise<AdapterFillResult> {
    const select = element as HTMLSelectElement;
    const option = Array.from(select.options).find(item => item.value === value || sameText(item.text, value));
    if (!option) return { success: false, reason: '未找到原生下拉选项' };
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    if (setter) setter.call(select, option.value);
    else select.value = option.value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return { success: true };
  }
}

class RadioCheckboxAdapter implements ComponentAdapter {
  readonly name = 'RadioCheckboxAdapter';

  canHandle(field: DOMField): boolean {
    return field.componentType === 'radio' || field.componentType === 'checkbox';
  }

  async fill(_field: DOMField, element: HTMLElement, value: string): Promise<AdapterFillResult> {
    if (!(element instanceof HTMLInputElement)) return { success: false, reason: '不是勾选控件' };
    const group = element.closest<HTMLElement>('[role="radiogroup"], .ant-radio-group, fieldset, .ant-form-item');
    const candidates = element.name
      ? Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="${CSS.escape(element.name)}"]`))
      : Array.from(group?.querySelectorAll<HTMLInputElement>(`input[type="${element.type}"]`) || [element]);
    const target = candidates.find(input => sameText(input.value, value) || sameText(getLabel(input), value));
    if (!target) return { success: false, reason: '未找到可选项' };
    if (!target.checked) target.click();
    return { success: target.checked };
  }
}

class AutocompleteAdapter implements ComponentAdapter {
  readonly name = 'AutocompleteAdapter';

  canHandle(field: DOMField): boolean {
    return field.componentType === 'autocomplete';
  }

  async fill(_field: DOMField, element: HTMLElement, value: string): Promise<AdapterFillResult> {
    const input = element instanceof HTMLInputElement
      ? element
      : element.querySelector<HTMLInputElement>('input');
    if (!input) return { success: false, reason: '未找到 autocomplete 输入框' };
    const trigger = input.closest('.ant-select')?.querySelector<HTMLElement>('.ant-select-selector');
    if (trigger) clickOption(trigger);
    setNativeValue(input, value, false);
    const optionScope = input.closest('.ant-select')
      ? '.ant-select-dropdown:not(.ant-select-dropdown-hidden)'
      : undefined;
    const option = await waitForMatchingOption(
      value,
      5_000,
      optionScope,
    );
    if (!option) return { success: false, reason: '候选项未出现或未精确匹配' };
    clickOption(option);
    const committed = await waitForAutocompleteCommit(input, 2_000);
    return committed
      ? { success: true }
      : { success: false, reason: 'autocomplete 候选文本已点击，但选项 ID 未提交' };
  }
}

class AntDesignSelectAdapter implements ComponentAdapter {
  readonly name = 'AntDesignSelectAdapter';

  canHandle(field: DOMField, element: HTMLElement): boolean {
    return field.componentType === 'custom-select' && !!element.closest('.ant-select, [class*="ant-select"]');
  }

  async fill(field: DOMField, element: HTMLElement, value: string): Promise<AdapterFillResult> {
    const trigger = element.closest('.ant-select')?.querySelector<HTMLElement>('.ant-select-selector') || element;
    clickOption(trigger);
    const kind = inferSelectValueKind(field);
    let option = await waitForMatchingOption(value, 500, '.ant-select-dropdown:not(.ant-select-dropdown-hidden)', kind);
    // Ant virtual lists only render the current window of options.
    for (let page = 0; !option && page < 20; page++) {
      const list = latestVisible('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
        ?.querySelector<HTMLElement>('.rc-virtual-list-holder');
      if (!list || list.scrollTop + list.clientHeight >= list.scrollHeight) break;
      list.scrollTop += list.clientHeight;
      list.dispatchEvent(new Event('scroll', { bubbles: true }));
      option = await waitForMatchingOption(value, 150, '.ant-select-dropdown:not(.ant-select-dropdown-hidden)', kind);
    }
    if (!option) return { success: false, reason: 'Ant Design 选项未匹配' };
    clickOption(getInteractiveOption(option));
    const committed = await waitForSelectedValue(element, value, 1_500, kind);
    return committed ? { success: true } : { success: false, reason: 'Ant Design 选项已点击但未提交' };
  }
}

class ElementPlusSelectAdapter implements ComponentAdapter {
  readonly name = 'ElementPlusSelectAdapter';

  canHandle(field: DOMField, element: HTMLElement): boolean {
    return field.componentType === 'custom-select' && !!element.closest('.el-select, [class*="el-select"]');
  }

  async fill(_field: DOMField, element: HTMLElement, value: string): Promise<AdapterFillResult> {
    element.click();
    const option = await waitForMatchingOption(value, 1_500, '.el-select-dropdown');
    if (!option) return { success: false, reason: 'Element Plus 选项未匹配' };
    clickOption(getInteractiveOption(option));
    const committed = await waitForSelectedValue(element, value, 1_500);
    return committed ? { success: true } : { success: false, reason: 'Element Plus 选项已点击但未提交' };
  }
}

class GenericSelectAdapter implements ComponentAdapter {
  readonly name = 'GenericSelectAdapter';

  canHandle(field: DOMField): boolean {
    return field.componentType === 'custom-select';
  }

  async fill(_field: DOMField, element: HTMLElement, value: string): Promise<AdapterFillResult> {
    element.click();
    const option = await waitForMatchingOption(value, 1_500);
    if (!option) return { success: false, reason: '自定义下拉选项未匹配' };
    clickOption(getInteractiveOption(option));
    const committed = await waitForSelectedValue(element, value, 1_500);
    return committed ? { success: true } : { success: false, reason: '自定义下拉选项已点击但未提交' };
  }
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string, blur = true): void {
  element.focus();
  const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
  dispatchInputEvents(element, value);
  if (blur) element.blur();
}

function dispatchInputEvents(element: HTMLElement, value: string): void {
  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function sameText(left: string, right: string): boolean {
  return left.trim().toLowerCase().replace(/\s+/g, '') === right.trim().toLowerCase().replace(/\s+/g, '');
}

function getLabel(input: HTMLInputElement): string {
  if (input.id) {
    const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    if (label) return label.textContent || '';
  }
  return input.closest('label')?.textContent || input.nextElementSibling?.textContent || '';
}

export function findAutocompleteIdField(element: HTMLElement): HTMLInputElement | null {
  const container = element.closest<HTMLElement>('[data-autofill-autocomplete], .autocomplete, [class*="autocomplete"]');
  if (!container) return null;
  const baseId = element.id.split('-fe-')[0];
  return container.querySelector<HTMLInputElement>('input[type="hidden"][name*="id" i]')
    || (baseId !== element.id ? container.querySelector<HTMLInputElement>(`input[id="${CSS.escape(baseId)}"]`) : null);
}

async function waitForAutocompleteCommit(element: HTMLElement, timeoutMs: number): Promise<boolean> {
  const idField = findAutocompleteIdField(element);
  if (!idField) return true;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (idField.value) return true;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return !!idField.value;
}

async function waitForMatchingOption(value: string, timeoutMs: number, scopeSelector?: string, kind: ValueKind = 'text'): Promise<HTMLElement | null> {
  const find = (): HTMLElement | null => {
    const scope = scopeSelector ? latestVisible(scopeSelector) : document;
    if (!scope) return null;
    const options = scope.querySelectorAll<HTMLElement>('[role="option"], [class*="option"], [class*="item"], li');
    return Array.from(options).find(option => matchesSelectOption(value, option.textContent || '', kind)) || null;
  };

  const immediate = find();
  if (immediate) return immediate;

  return new Promise(resolve => {
    const observer = new MutationObserver(() => {
      const option = find();
      if (option) finish(option);
    });
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    const finish = (option: HTMLElement | null) => {
      observer.disconnect();
      window.clearTimeout(timer);
      resolve(option);
    };
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
  });
}

function latestVisible(selector: string): HTMLElement | null {
  const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));
  const visible = elements.filter(element => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  });
  return visible[visible.length - 1] || null;
}

export async function dismissTransientOverlays(): Promise<void> {
  const overlays = Array.from(document.querySelectorAll<HTMLElement>(
    '.ant-select-dropdown:not(.ant-select-dropdown-hidden), .ant-picker-dropdown:not(.ant-picker-dropdown-hidden), .ant-modal-wrap',
  )).filter(element => {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
  if (!overlays.length) return;

  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', bubbles: true }));
  document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  overlays.forEach(overlay => {
    const close = overlay.querySelector<HTMLElement>('.ant-modal-close, [aria-label="Close"], [aria-label="关闭"]');
    if (close) clickOption(close);
  });
  await new Promise(resolve => setTimeout(resolve, 150));
}

function inferSelectValueKind(field: DOMField): ValueKind {
  return /学历|学位|degree|educationlevel/i.test(`${field.label} ${field.name}`) ? 'degree' : 'text';
}

export function matchesSelectOption(expected: string, candidate: string, kind: ValueKind = 'text'): boolean {
  if (kind === 'text') return sameText(expected, candidate);
  const normalizedExpected = normalizeValue(expected, kind);
  const normalizedCandidate = normalizeValue(candidate, kind);
  return !!normalizedExpected && normalizedExpected === normalizedCandidate;
}

function getInteractiveOption(element: HTMLElement): HTMLElement {
  return element.closest<HTMLElement>(
    '[role="option"], .ant-select-item-option, .el-select-dropdown__item, li, button',
  ) || element;
}

async function waitForSelectedValue(element: HTMLElement, value: string, timeoutMs: number, kind: ValueKind = 'text'): Promise<boolean> {
  const read = (): string => {
    const container = element.closest<HTMLElement>('.ant-select, .el-select, [class*="select"]');
    const selected = container?.querySelector<HTMLElement>(
      '.ant-select-selection-item, .el-select__selected-item, [class*="singleValue"], [class*="selected"]',
    );
    if (selected?.textContent?.trim()) return selected.textContent.trim();
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return element.value;
    return element.textContent?.trim() || '';
  };
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (matchesSelectOption(value, read(), kind)) return true;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return matchesSelectOption(value, read(), kind);
}

export function matchesDateOption(expected: string, candidate: string): boolean {
  const expectedMonth = normalizeValue(expected, 'date');
  const actual = normalizeValue(candidate, 'date');
  if (!expectedMonth || !actual) return false;
  return actual === expectedMonth || actual.startsWith(`${expectedMonth}-`) || expectedMonth.startsWith(`${actual}-`);
}

async function waitForDateOption(value: string, timeoutMs: number): Promise<HTMLElement | null> {
  const find = (): HTMLElement | null => {
    const candidates = document.querySelectorAll<HTMLElement>(
      '[data-date], [data-value], [data-month], [role="option"], [role="gridcell"], button',
    );
    return Array.from(candidates).find(candidate => {
      const values = [
        candidate.dataset.date,
        candidate.dataset.value,
        candidate.dataset.month,
        candidate.textContent || '',
      ].filter(Boolean) as string[];
      return values.some(candidateValue => matchesDateOption(value, candidateValue));
    }) || null;
  };

  const immediate = find();
  if (immediate) return immediate;

  return new Promise(resolve => {
    const observer = new MutationObserver(() => {
      const option = find();
      if (option) finish(option);
    });
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    const finish = (option: HTMLElement | null) => {
      observer.disconnect();
      window.clearTimeout(timer);
      resolve(option);
    };
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
  });
}

function clickOption(option: HTMLElement): void {
  option.scrollIntoView({ block: 'nearest' });
  option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  option.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  option.click();
}

const COMPONENT_ADAPTERS: ComponentAdapter[] = [
  new NativeSelectAdapter(),
  new RadioCheckboxAdapter(),
  new AntDesignSelectAdapter(),
  new ElementPlusSelectAdapter(),
  new AutocompleteAdapter(),
  new DateInputAdapter(),
  new GenericSelectAdapter(),
  new TextAdapter(),
];
