import type { DOMField } from '../types';

const FIELD_SELECTOR =
  'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), textarea, select';

export function analyzePage(): DOMField[] {
  const elements = document.querySelectorAll(FIELD_SELECTOR);
  const fields: DOMField[] = [];

  elements.forEach((el, index) => {
    const element = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const fieldId = `jf-${index}`;
    element.setAttribute('data-jf-id', fieldId);

    const field: DOMField = {
      id: fieldId,
      tag: element.tagName.toLowerCase(),
      type: (element as HTMLInputElement).type || 'text',
      label: findLabel(element),
      placeholder: (element as HTMLInputElement).placeholder || '',
      name: element.name || '',
      ariaLabel: element.getAttribute('aria-label') || '',
      nearbyText: findNearbyText(element),
    };

    if (element.tagName === 'SELECT') {
      const selectEl = element as HTMLSelectElement;
      field.options = Array.from(selectEl.options).map(o => o.text);
    }

    fields.push(field);
  });

  return fields;
}

// ─── Label Detection ───

function findLabel(element: HTMLElement): string {
  // 1. <label for="id">
  if (element.id) {
    const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    if (label) return label.textContent?.trim() || '';
  }

  // 2. Wrapped in <label>
  const parentLabel = element.closest('label');
  if (parentLabel) {
    const clone = parentLabel.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('input, textarea, select').forEach(i => i.remove());
    const text = clone.textContent?.trim();
    if (text) return text;
  }

  // 3. Preceding sibling <label>
  const prev = element.previousElementSibling;
  if (prev?.tagName === 'LABEL') {
    return prev.textContent?.trim() || '';
  }

  // 4. aria-labelledby
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const ref = document.getElementById(labelledBy);
    if (ref) return ref.textContent?.trim() || '';
  }

  return '';
}

// ─── Nearby Context Extraction ───

function findNearbyText(element: HTMLElement): string {
  const sources: string[] = [];

  // 1. Section header — closest preceding h1-h6, legend, or fieldset legend
  const sectionHeader = findSectionHeader(element);
  if (sectionHeader) sources.push(`section:${sectionHeader}`);

  // 2. Parent wrapper text — the text content of the parent div, excluding this field
  const parentText = findParentContext(element);
  if (parentText) sources.push(`parent:${parentText}`);

  // 3. Previous sibling text
  let prev = element.previousElementSibling;
  if (prev) {
    const text = prev.textContent?.trim();
    if (text && text.length < 200) sources.push(`prev:${text}`);
  }

  return sources.join(' | ');
}

function findSectionHeader(element: HTMLElement): string {
  // Walk up looking for h1-h6, legend, or [class*="title"] within parent scope
  let current: HTMLElement | null = element.parentElement;
  for (let level = 0; level < 4 && current; level++) {
    // Check if current is inside a fieldset
    const fieldset = current.closest('fieldset');
    if (fieldset) {
      const legend = fieldset.querySelector(':scope > legend');
      if (legend) return legend.textContent?.trim() || '';
    }

    // Check previous siblings at this level for heading elements
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children);
      const idx = siblings.indexOf(current);
      for (let i = idx - 1; i >= 0; i--) {
        const sib = siblings[i] as HTMLElement;
        const tag = sib.tagName;
        if (/^H[1-6]$/.test(tag)) {
          return sib.textContent?.trim() || '';
        }
        // Element with title/header class
        if (/(title|header|heading|section-label)/i.test(sib.className || '')) {
          const text = sib.textContent?.trim();
          if (text && text.length < 100) return text;
        }
      }
    }

    current = current.parentElement;
  }

  return '';
}

function findParentContext(element: HTMLElement): string {
  // Walk up to 3 parent levels
  let current: HTMLElement | null = element.parentElement;
  for (let level = 0; level < 3 && current; level++) {
    const siblings = Array.from(current.children);
    const idx = siblings.indexOf(element);

    // Collect text from nearby siblings (±2 positions)
    const texts: string[] = [];
    for (let i = Math.max(0, idx - 2); i < Math.min(siblings.length, idx + 3); i++) {
      if (i !== idx) {
        const sib = siblings[i] as HTMLElement;
        // Skip nested form elements to reduce noise
        if (sib.querySelector('input, textarea, select')) continue;
        const text = sib.textContent?.trim();
        if (text && text.length < 200) texts.push(text);
      }
    }

    if (texts.length > 0) return texts.join(' ');

    // Fallback: parent's own text minus this element
    const clone = current.cloneNode(true) as HTMLElement;
    const selfIdx = Array.from(current.children).indexOf(element);
    if (selfIdx >= 0 && clone.children[selfIdx]) {
      clone.children[selfIdx].remove();
    }
    const parentText = clone.textContent?.trim();
    if (parentText && parentText.length < 200) return parentText;

    element = current;
    current = current.parentElement;
  }

  return '';
}
