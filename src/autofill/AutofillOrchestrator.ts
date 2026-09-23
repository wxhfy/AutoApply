import type { AutofillSummary, DOMField, UserProfile, VerifyResult } from '../types';
import { addHistory } from '../storage';
import { matchFields } from '../matching/MatchingEngine';

export type AutofillStep = 'scan' | 'match' | 'fill' | 'verify';
export interface AutofillProgress {
  step: AutofillStep;
  detail: string;
  current?: number;
  total?: number;
}

export async function runAutofill(
  profile: UserProfile,
  onProgress?: (progress: AutofillProgress) => void,
): Promise<AutofillSummary> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('无法访问当前标签页');
  await ensureContentScript(tab.id);

  onProgress?.({ step: 'scan', detail: '正在读取页面元素' });
  const scan = await sendMessage<{ type: 'ANALYZE_RESULT'; fields: DOMField[] } | { type: 'ERROR'; message: string }>(tab.id, { type: 'ANALYZE' });
  if (scan.type === 'ERROR') throw new Error(scan.message);
  if (!scan.fields.length) throw new Error('当前页面未找到表单字段');

  onProgress?.({ step: 'match', detail: `正在匹配 ${scan.fields.length} 个字段` });
  const proposals = matchFields(scan.fields, profile);
  const fillableCount = proposals.filter(proposal => proposal.action === 'auto_fill').length;

  onProgress?.({ step: 'fill', detail: '正在写入可确定字段', current: 0, total: fillableCount });
  const fillResponse = await sendMessage<{ type: 'FILL_BATCH_RESULT'; attempts: { fieldId: string; success: boolean; reason?: string }[] }>(tab.id, {
    type: 'FILL_BATCH', fields: scan.fields, proposals,
  });
  if (fillResponse.type !== 'FILL_BATCH_RESULT') throw new Error('填写阶段没有返回结果');

  onProgress?.({ step: 'verify', detail: '正在重新读取并验证结果' });
  const verifyResponse = await sendMessage<{ type: 'VERIFY_BATCH_RESULT'; results: VerifyResult[] }>(tab.id, {
    type: 'VERIFY_BATCH', fields: scan.fields, proposals,
  });
  if (verifyResponse.type !== 'VERIFY_BATCH_RESULT') throw new Error('验证阶段没有返回结果');

  const attempts = new Map(fillResponse.attempts.map(attempt => [attempt.fieldId, attempt]));
  const results = verifyResponse.results.map(result => {
    const attempt = attempts.get(result.fieldId);
    return attempt && !attempt.success && result.status === 'ERROR' && attempt.reason
      ? { ...result, reason: attempt.reason }
      : result;
  });
  await sendMessage(tab.id, { type: 'HIGHLIGHT_BATCH', results });

  const summary: AutofillSummary = {
    totalFields: results.length,
    verifiedCount: results.filter(result => result.status === 'VERIFIED').length,
    reviewCount: results.filter(result => result.status === 'REVIEW').length,
    errorCount: results.filter(result => result.status === 'ERROR').length,
    results,
  };
  await addHistory({
    url: tab.url || '',
    timestamp: Date.now(),
    filledCount: summary.verifiedCount,
    skippedCount: summary.reviewCount + summary.errorCount,
  });
  return summary;
}

async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: '__PING__' });
  } catch {
    const files = chrome.runtime.getManifest().content_scripts?.[0]?.js;
    if (!files?.length) throw new Error('Content script not found in manifest');
    await chrome.scripting.executeScript({ target: { tabId }, files });
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function sendMessage<T = any>(tabId: number, message: any): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || '无法连接到页面'));
        return;
      }
      if (response?.type === 'ERROR') {
        reject(new Error(response.message));
        return;
      }
      resolve(response as T);
    });
  });
}
