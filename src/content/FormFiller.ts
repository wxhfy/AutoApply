import type { FillProposal } from '../types';

export function fillForm(proposals: FillProposal[]): number {
  let filled = 0;

  // Only fill auto_fill proposals (high confidence). Confirm proposals must
  // be explicitly approved by the user — they arrive here already filtered.
  for (const p of proposals) {
    if (p.value === null || p.action === 'skip') continue;

    const element = document.querySelector(`[data-jf-id="${p.fieldId}"]`);
    if (!element) continue;

    if (element.tagName === 'SELECT') {
      fillSelect(element as HTMLSelectElement, p.value);
    } else {
      fillInput(element as HTMLInputElement | HTMLTextAreaElement, p.value);
    }

    filled++;
  }

  return filled;
}

function fillInput(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  // Use native setter to bypass React/Vue controlled components
  const proto = Object.getPrototypeOf(el);
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

  if (nativeSetter) {
    nativeSetter.call(el, value);
  } else {
    el.value = value;
  }

  // Trigger framework change detection
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function fillSelect(el: HTMLSelectElement, value: string): void {
  const options = Array.from(el.options);
  const target = value.toLowerCase().trim();

  // Exact match first, then contains match
  const best =
    options.find(o => o.text.trim().toLowerCase() === target) ||
    options.find(o => o.text.trim().toLowerCase().includes(target));

  if (!best) return;

  const proto = Object.getPrototypeOf(el);
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

  if (nativeSetter) {
    nativeSetter.call(el, best.value);
  } else {
    el.value = best.value;
  }

  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
