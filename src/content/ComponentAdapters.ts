import type { DOMField } from '../types';
import { formatDateForControl, normalizeValue } from '../matching/ValueNormalizer.ts';

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
      setNativeValue(input, controlValue);
      return { success: true };
    }

    element.click();
    const option = await waitForDateOption(value, 1_500);
    if (!option) return { success: false, reason: '日期候选项未出现或未精确匹配' };
    clickOption(option);
    return { success: true };
  }
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
    const candidates = element.name
      ? Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="${CSS.escape(element.name)}"]`))
      : [element];
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
    setNativeValue(input, value);
    const option = await waitForMatchingOption(value, 1_500);
    if (!option) return { success: false, reason: '候选项未出现或未精确匹配' };
    clickOption(option);
    return { success: true };
  }
}

class AntDesignSelectAdapter implements ComponentAdapter {
  readonly name = 'AntDesignSelectAdapter';

  canHandle(field: DOMField, element: HTMLElement): boolean {
    return field.componentType === 'custom-select' && !!element.closest('.ant-select, [class*="ant-select"]');
  }

  async fill(_field: DOMField, element: HTMLElement, value: string): Promise<AdapterFillResult> {
    element.click();
    const option = await waitForMatchingOption(value, 1_500, '.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
    if (!option) return { success: false, reason: 'Ant Design 选项未匹配' };
    clickOption(option);
    return { success: true };
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
    clickOption(option);
    return { success: true };
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
    clickOption(option);
    return { success: true };
  }
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  element.focus();
  const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
  dispatchInputEvents(element, value);
  element.blur();
}

function dispatchInputEvents(element: HTMLElement, value: string): void {
  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
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

async function waitForMatchingOption(value: string, timeoutMs: number, scopeSelector?: string): Promise<HTMLElement | null> {
  const find = (): HTMLElement | null => {
    const scope = scopeSelector ? document.querySelector(scopeSelector) : document;
    if (!scope) return null;
    const options = scope.querySelectorAll<HTMLElement>('[role="option"], [class*="option"], [class*="item"], li');
    return Array.from(options).find(option => sameText(option.textContent || '', value)) || null;
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
