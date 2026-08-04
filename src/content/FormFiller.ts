import type { FillProposal } from '../types';

// Fill a single proposal (called repeatedly by popup for progress tracking)
export async function fillSingle(proposal: FillProposal): Promise<boolean> {
  if (proposal.value === null || proposal.action === 'skip') return false;

  const element = document.querySelector(`[data-jf-id="${proposal.fieldId}"]`) as HTMLElement | null;
  if (!element) return false;

  return await fillElement(element, proposal.value);
}

// Fill all proposals at once (legacy, no progress)
export async function fillForm(proposals: FillProposal[]): Promise<number> {
  let filled = 0;

  for (const p of proposals) {
    if (p.value === null || p.action === 'skip') continue;

    const element = document.querySelector(`[data-jf-id="${p.fieldId}"]`) as HTMLElement | null;
    if (!element) continue;

    const success = await fillElement(element, p.value);
    if (success) filled++;

    await sleep(100);
  }

  return filled;
}

// Expand repeatable sections (click "添加" buttons)
export async function expandSections(counts: { section: string; need: number }[]): Promise<void> {
  for (const { section, need } of counts) {
    const addButtons = findAddButtons(section);
    if (addButtons.length === 0) continue;

    const btn = addButtons[0];
    for (let i = 0; i < need; i++) {
      btn.click();
      await sleep(500);
    }
  }
}

function findAddButtons(sectionKeyword: string): HTMLElement[] {
  const allButtons = document.querySelectorAll(
    'button, a, [role="button"], [class*="add"], [class*="btn"]'
  );
  const results: HTMLElement[] = [];

  for (const btn of Array.from(allButtons)) {
    const text = (btn.textContent || '').trim();
    if (/^[+＋]?\s*(添加|新增|增加|add)/i.test(text)) {
      const parent = btn.closest('[class*="section"], [class*="block"], [class*="module"], [class*="panel"]');
      if (parent) {
        const parentText = parent.querySelector(
          'h1, h2, h3, h4, [class*="title"], [class*="header"]'
        )?.textContent || '';
        if (parentText.includes(sectionKeyword)) {
          results.push(btn as HTMLElement);
        }
      } else {
        results.push(btn as HTMLElement);
      }
    }
  }

  return results;
}

// ─── Route by element type ───

async function fillElement(el: HTMLElement, value: string): Promise<boolean> {
  const tag = el.tagName;
  const role = el.getAttribute('role');

  if (tag === 'SELECT') {
    return fillSelect(el as HTMLSelectElement, value);
  }

  if (role === 'combobox' || role === 'listbox') {
    return await fillSearchableInput(el, value);
  }

  if (el.getAttribute('contenteditable') === 'true') {
    return fillContentEditable(el, value);
  }

  // Textarea — direct fill, no dropdown wait
  if (tag === 'TEXTAREA') {
    return fillTextarea(el as HTMLTextAreaElement, value);
  }

  if (tag === 'INPUT') {
    const inputEl = el as HTMLInputElement;
    const type = inputEl.type;

    if (type === 'radio' || type === 'checkbox') {
      return fillCheckableByLabel(el, value);
    }

    if (inputEl.readOnly) {
      return await fillReadonlyInput(inputEl, value);
    }

    return await fillInputWithDropdownCheck(inputEl, value);
  }

  return await fillInputWithDropdownCheck(el as any, value);
}

// ─── Textarea (no dropdown, direct fill) ───

function fillTextarea(el: HTMLTextAreaElement, value: string): boolean {
  el.focus();
  el.select();
  const inserted = document.execCommand('insertText', false, value);

  if (!inserted || el.value !== value) {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype, 'value'
    )?.set;
    if (setter) {
      setter.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new InputEvent('input', {
      bubbles: true, inputType: 'insertText', data: value,
    }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  el.dispatchEvent(new Event('blur', { bubbles: true }));
  return true;
}

// ─── Input with dropdown detection ───

async function fillInputWithDropdownCheck(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string
): Promise<boolean> {
  closeOpenDropdowns();
  await sleep(100);

  el.focus();
  el.select();
  const inserted = document.execCommand('insertText', false, value);

  if (!inserted || el.value !== value) {
    const setter =
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      || Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (setter) {
      setter.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new InputEvent('input', {
      bubbles: true, inputType: 'insertText', data: value,
    }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Wait for dropdown (search selects need backend response)
  const clicked = await waitAndClickDropdown(value, 1200);

  if (!clicked) {
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  } else {
    await sleep(300);
  }

  return true;
}

// ─── Readonly input (custom select trigger) ───

async function fillReadonlyInput(el: HTMLInputElement, value: string): Promise<boolean> {
  closeOpenDropdowns();
  await sleep(100);

  el.focus();
  el.click();
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

  const clicked = await waitAndClickDropdown(value, 1200);
  if (clicked) await sleep(300);
  return clicked;
}

// ─── Searchable select (role=combobox) ───

async function fillSearchableInput(el: HTMLElement, value: string): Promise<boolean> {
  closeOpenDropdowns();
  await sleep(100);

  const innerInput = el.querySelector('input') as HTMLInputElement | null;

  if (innerInput) {
    innerInput.focus();
    innerInput.select();
    const inserted = document.execCommand('insertText', false, value);

    if (!inserted || innerInput.value !== value) {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype, 'value'
      )?.set;
      if (setter) setter.call(innerInput, value);
      else innerInput.value = value;
      innerInput.dispatchEvent(new InputEvent('input', {
        bubbles: true, inputType: 'insertText', data: value,
      }));
      innerInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  } else {
    el.click();
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  }

  const clicked = await waitAndClickDropdown(value, 1200);
  if (clicked) await sleep(300);
  return true;
}

// ─── Close open dropdowns before filling next field ───

function closeOpenDropdowns(): void {
  document.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Escape', code: 'Escape', bubbles: true,
  }));
  document.body.click();
}

// ─── Wait for dropdown and click best match ───

async function waitAndClickDropdown(value: string, timeoutMs: number): Promise<boolean> {
  const startTime = Date.now();
  const checkInterval = 100;

  while (Date.now() - startTime < timeoutMs) {
    const clicked = tryClickDropdownOption(value);
    if (clicked) return true;
    await sleep(checkInterval);
  }

  // Timeout fallback: click first visible option
  return tryClickFirstOption();
}

function tryClickDropdownOption(value: string): boolean {
  const target = value.toLowerCase().trim();
  const dropdowns = findVisibleDropdowns();

  for (const dropdown of dropdowns) {
    const options = dropdown.querySelectorAll(
      '[role="option"], [class*="option"]:not([class*="disabled"]), [class*="item"]:not([class*="disabled"]), li'
    );
    if (options.length === 0) continue;

    const best = findBestOption(Array.from(options) as HTMLElement[], target);
    if (best) {
      clickOption(best);
      return true;
    }
  }

  return false;
}

function tryClickFirstOption(): boolean {
  const dropdowns = findVisibleDropdowns();

  for (const dropdown of dropdowns) {
    const options = dropdown.querySelectorAll(
      '[role="option"], [class*="option"]:not([class*="disabled"]), li'
    );
    if (options.length > 0) {
      clickOption(options[0] as HTMLElement);
      return true;
    }
  }

  return false;
}

function findVisibleDropdowns(): HTMLElement[] {
  const selectors = [
    '.ant-select-dropdown:not(.ant-select-dropdown-hidden)',
    '.ant-cascader-dropdown',
    '.el-select-dropdown',
    '.el-autocomplete-suggestion',
    '.arco-select-popup',
    '.arco-trigger-popup',
    '.semi-select-option-list',
    '.ivu-select-dropdown',
    '[class*="dropdown"]:not([style*="display: none"])',
    '[class*="select-popup"]',
    '[class*="autocomplete"]',
    '[class*="suggestion"]',
    '[class*="popover"]',
    '[role="listbox"]',
  ];

  const results: HTMLElement[] = [];
  for (const selector of selectors) {
    const els = document.querySelectorAll(selector);
    for (const el of Array.from(els)) {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if ((el as HTMLElement).offsetHeight === 0) continue;
      results.push(el as HTMLElement);
    }
  }
  return results;
}

function clickOption(opt: HTMLElement): void {
  opt.scrollIntoView({ block: 'nearest' });
  opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  opt.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  opt.click();
}

function findBestOption(options: HTMLElement[], target: string): HTMLElement | null {
  let bestMatch: HTMLElement | null = null;
  let bestScore = 0;

  for (const opt of options) {
    const text = (opt.textContent || '').trim().toLowerCase();
    if (!text) continue;

    let score = 0;
    if (text === target) score = 100;
    else if (text.startsWith(target) || target.startsWith(text)) score = 80;
    else if (text.includes(target) || target.includes(text)) score = 60;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = opt;
    }
  }

  return bestScore >= 60 ? bestMatch : null;
}

// ─── Native Select ───

function fillSelect(el: HTMLSelectElement, value: string): boolean {
  const options = Array.from(el.options);
  const target = value.toLowerCase().trim();

  const best =
    options.find(o => o.text.trim().toLowerCase() === target) ||
    options.find(o => o.text.trim().toLowerCase().includes(target)) ||
    options.find(o => target.includes(o.text.trim().toLowerCase()) && o.text.trim().length > 1);

  if (!best) return false;

  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  if (setter) setter.call(el, best.value);
  else el.value = best.value;

  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

// ─── ContentEditable ───

function fillContentEditable(el: HTMLElement, value: string): boolean {
  el.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  selection?.removeAllRanges();
  selection?.addRange(range);

  const inserted = document.execCommand('insertText', false, value);
  if (!inserted) el.textContent = value;

  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
  return true;
}

// ─── Radio / Checkbox ───

function fillCheckableByLabel(el: HTMLElement, value: string): boolean {
  const target = value.toLowerCase().trim();
  const name = (el as HTMLInputElement).name;

  if (!name) {
    if (['yes', 'true', '是', '1'].includes(target)) {
      (el as HTMLInputElement).click();
      return true;
    }
    return false;
  }

  const group = document.querySelectorAll(`input[name="${CSS.escape(name)}"]`);
  for (const input of Array.from(group)) {
    const label = findAssociatedLabel(input as HTMLElement);
    if (label.toLowerCase().includes(target) || target.includes(label.toLowerCase())) {
      (input as HTMLInputElement).click();
      return true;
    }
    if ((input as HTMLInputElement).value.toLowerCase() === target) {
      (input as HTMLInputElement).click();
      return true;
    }
  }
  return false;
}

function findAssociatedLabel(el: HTMLElement): string {
  if (el.id) {
    const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (label) return label.textContent?.trim() || '';
  }
  const parentLabel = el.closest('label');
  if (parentLabel) return parentLabel.textContent?.trim() || '';
  const next = el.nextElementSibling;
  if (next) return next.textContent?.trim() || '';
  return '';
}

// ─── Util ───

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}