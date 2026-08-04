import type { DOMField } from '../types';

const FIELD_SELECTOR = [
  'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]):not([type="file"])',
  'textarea',
  'select',
  // Custom dropdown triggers commonly used by Ant Design / Element Plus / MUI
  '[role="combobox"]',
  '[role="listbox"]',
  '[contenteditable="true"]',
].join(', ');

// Common form-item wrapper selectors used by popular UI libraries
const FORM_ITEM_SELECTORS = [
  '.ant-form-item',           // Ant Design
  '.el-form-item',            // Element Plus
  '.arco-form-item',          // Arco Design
  '.semi-form-field',         // Semi Design
  '.MuiFormControl-root',     // MUI
  '[class*="form-item"]',     // Generic
  '[class*="formItem"]',      // camelCase variant
  '[class*="form-field"]',
  '[class*="formField"]',
];

const LABEL_SELECTORS = [
  '.ant-form-item-label',
  '.el-form-item__label',
  '.arco-form-item-label',
  '.semi-form-field-label',
  '.MuiFormLabel-root',
  '.MuiInputLabel-root',
  '[class*="form-item-label"]',
  '[class*="formItem-label"]',
  '[class*="label"]',
  'label',
];

export function analyzePage(): DOMField[] {
  const elements = document.querySelectorAll(FIELD_SELECTOR);
  const fields: DOMField[] = [];
  const seen = new Set<HTMLElement>();

  elements.forEach((el, index) => {
    const element = el as HTMLElement;

    // Skip duplicates and very small/hidden elements
    if (seen.has(element)) return;
    if (isHidden(element)) return;
    seen.add(element);

    const fieldId = `jf-${index}`;
    element.setAttribute('data-jf-id', fieldId);

    const inputEl = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

    const field: DOMField = {
      id: fieldId,
      tag: element.tagName.toLowerCase(),
      type: (inputEl as HTMLInputElement).type || element.getAttribute('role') || 'text',
      label: findLabel(element),
      placeholder: inputEl.placeholder || element.getAttribute('placeholder') || '',
      name: inputEl.name || element.getAttribute('data-name') || element.getAttribute('data-field') || '',
      ariaLabel: element.getAttribute('aria-label') || '',
      nearbyText: findNearbyText(element),
    };

    // Native select or custom select with options
    if (element.tagName === 'SELECT') {
      field.options = Array.from((element as HTMLSelectElement).options).map(o => o.text);
    }

    // Only include if we have some identifying info
    if (field.label || field.placeholder || field.name || field.ariaLabel || field.nearbyText) {
      fields.push(field);
    }
  });

  return fields;
}

function isHidden(el: HTMLElement): boolean {
  if (el.offsetParent === null && el.style.position !== 'fixed') return true;
  const style = window.getComputedStyle(el);
  return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
}

// ─── Label Detection (multi-strategy) ───

function findLabel(element: HTMLElement): string {
  // Strategy 1: native <label for="id">
  if (element.id) {
    const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    if (label) return cleanText(label.textContent);
  }

  // Strategy 2: wrapped in <label>
  const parentLabel = element.closest('label');
  if (parentLabel) {
    const clone = parentLabel.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('input, textarea, select').forEach(i => i.remove());
    const text = cleanText(clone.textContent);
    if (text) return text;
  }

  // Strategy 3: find form-item wrapper and its label element
  const formItem = findFormItemWrapper(element);
  if (formItem) {
    const labelEl = findLabelInFormItem(formItem, element);
    if (labelEl) return cleanText(labelEl);
  }

  // Strategy 4: aria-labelledby
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const ref = document.getElementById(labelledBy);
    if (ref) return cleanText(ref.textContent);
  }

  // Strategy 5: preceding sibling that looks like a label
  const prev = element.previousElementSibling;
  if (prev) {
    const tag = prev.tagName;
    if (tag === 'LABEL' || tag === 'SPAN' || tag === 'DIV') {
      const text = cleanText(prev.textContent);
      if (text && text.length < 50) return text;
    }
  }

  // Strategy 6: parent's direct text (excluding children with inputs)
  const parent = element.parentElement;
  if (parent) {
    for (const child of Array.from(parent.children)) {
      if (child === element) continue;
      if (child.querySelector('input, textarea, select')) continue;
      const text = cleanText(child.textContent);
      if (text && text.length < 50 && text.length > 1) return text;
    }
  }

  return '';
}

/** Walk up the DOM to find a form-item wrapper */
function findFormItemWrapper(element: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = element;
  for (let i = 0; i < 6 && current; i++) {
    current = current.parentElement;
    if (!current) break;
    for (const selector of FORM_ITEM_SELECTORS) {
      if (current.matches(selector)) return current;
    }
  }
  return null;
}

/** Find label text within a form-item wrapper */
function findLabelInFormItem(formItem: HTMLElement, field: HTMLElement): string {
  // Try known label selectors first
  for (const selector of LABEL_SELECTORS) {
    const labelEl = formItem.querySelector(selector);
    if (labelEl && !labelEl.contains(field)) {
      const text = cleanText(labelEl.textContent);
      if (text && text.length < 80) return text;
    }
  }

  // Fallback: first text node or short text element before the input
  const walker = document.createTreeWalker(formItem, NodeFilter.SHOW_TEXT);
  const texts: string[] = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    if (field.contains(node)) break; // Stop when we reach the input
    const t = node.textContent?.trim();
    if (t && t.length > 0 && t.length < 80) texts.push(t);
  }

  return texts.join(' ');
}

// ─── Nearby Context Extraction ───

function findNearbyText(element: HTMLElement): string {
  const sources: string[] = [];

  // 1. Section header
  const sectionHeader = findSectionHeader(element);
  if (sectionHeader) sources.push(`section:${sectionHeader}`);

  // 2. Form-item wrapper context (if label was already found, skip)
  const formItem = findFormItemWrapper(element);
  if (formItem) {
    // Get any helper/hint text
    const hints = formItem.querySelectorAll('[class*="hint"], [class*="help"], [class*="extra"], [class*="description"]');
    hints.forEach(h => {
      const text = cleanText(h.textContent);
      if (text && text.length < 150) sources.push(`hint:${text}`);
    });
  }

  // 3. Previous sibling context
  const prev = element.previousElementSibling;
  if (prev && !prev.querySelector('input, textarea, select')) {
    const text = cleanText(prev.textContent);
    if (text && text.length < 150 && text.length > 1) sources.push(`prev:${text}`);
  }

  // 4. Parent text (walk up 3 levels)
  if (sources.length === 0) {
    let current: HTMLElement | null = element.parentElement;
    for (let level = 0; level < 3 && current; level++) {
      const siblings = Array.from(current.children);
      const idx = siblings.indexOf(element);
      for (let i = Math.max(0, idx - 2); i < Math.min(siblings.length, idx + 3); i++) {
        if (i !== idx) {
          const sib = siblings[i] as HTMLElement;
          if (sib.querySelector('input, textarea, select')) continue;
          const text = cleanText(sib.textContent);
          if (text && text.length < 150 && text.length > 1) sources.push(text);
        }
      }
      if (sources.length > 0) break;
      element = current;
      current = current.parentElement;
    }
  }

  return sources.join(' | ');
}

function findSectionHeader(element: HTMLElement): string {
  let current: HTMLElement | null = element.parentElement;
  for (let level = 0; level < 5 && current; level++) {
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children);
      const idx = siblings.indexOf(current);
      for (let i = idx - 1; i >= Math.max(0, idx - 3); i--) {
        const sib = siblings[i] as HTMLElement;
        const tag = sib.tagName;
        if (/^H[1-6]$/.test(tag)) {
          return cleanText(sib.textContent);
        }
        if (/(title|header|heading|section-label|group-title)/i.test(sib.className || '')) {
          const text = cleanText(sib.textContent);
          if (text && text.length < 80) return text;
        }
      }
    }
    current = current.parentElement;
  }
  return '';
}

function cleanText(text: string | null | undefined): string {
  if (!text) return '';
  return text.replace(/[\n\r\t]+/g, ' ').replace(/\s+/g, ' ').replace(/[*：:]\s*$/, '').trim();
}
