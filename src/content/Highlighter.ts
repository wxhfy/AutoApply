import type { VerifyResult } from '../types';

let injected = false;

export function highlightField(fieldId: string, result: VerifyResult): void {
  injectStyles();
  const element = document.querySelector<HTMLElement>(`[data-jf-id="${fieldId}"]`);
  if (!element) return;
  element.dataset.autofillStatus = result.status.toLowerCase();
  if (result.source === 'llm') element.dataset.autofillSource = 'llm';
  element.title = result.reason || result.status;
}

function injectStyles(): void {
  if (injected) return;
  const style = document.createElement('style');
  style.textContent = `
    [data-autofill-status="verified"] { outline: 2px solid #22c55e !important; outline-offset: 2px !important; }
    [data-autofill-status="review"] { outline: 2px solid #eab308 !important; outline-offset: 2px !important; }
    [data-autofill-status="error"] { outline: 2px solid #ef4444 !important; outline-offset: 2px !important; }
    [data-autofill-source="llm"] { outline: 2px solid #ef4444 !important; outline-offset: 2px !important; }
  `;
  document.head.append(style);
  injected = true;
}
