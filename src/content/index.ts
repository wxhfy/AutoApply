import { analyzePage } from './DOMAnalyzer';
import { fillForm, fillSingle, expandSections } from './FormFiller';
import { verifyField } from './FormVerifier';
import { highlightField } from './Highlighter';

chrome.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
  if (message.type === '__PING__') {
    sendResponse({ type: 'PONG' });
    return false;
  }
  if (message.type === 'ANALYZE') {
    try {
      sendResponse({ type: 'ANALYZE_RESULT', fields: analyzePage() });
    } catch (error) {
      sendResponse({ type: 'ERROR', message: error instanceof Error ? error.message : '页面扫描失败' });
    }
    return false;
  }
  if (message.type === 'FILL_BATCH') {
    fillForm(message.fields, message.proposals)
      .then(attempts => sendResponse({ type: 'FILL_BATCH_RESULT', attempts }))
      .catch(error => sendResponse({ type: 'ERROR', message: error instanceof Error ? error.message : '填写失败' }));
    return true;
  }
  if (message.type === 'VERIFY_BATCH') {
    try {
      const results = message.fields.map((field: any) => {
        const proposal = message.proposals.find((item: any) => item.fieldId === field.id);
        return verifyField(field, proposal);
      });
      sendResponse({ type: 'VERIFY_BATCH_RESULT', results });
    } catch (error) {
      sendResponse({ type: 'ERROR', message: error instanceof Error ? error.message : '验证失败' });
    }
    return false;
  }
  if (message.type === 'HIGHLIGHT_BATCH') {
    message.results.forEach((result: any) => highlightField(result.fieldId, result));
    sendResponse({ type: 'HIGHLIGHT_BATCH_RESULT', success: true });
    return false;
  }
  if (message.type === 'FILL') {
    fillForm(message.fields || analyzePage(), message.proposals)
      .then(attempts => sendResponse({ type: 'FILL_RESULT', success: true, filled: attempts.filter(a => a.success).length }))
      .catch(error => sendResponse({ type: 'ERROR', message: error instanceof Error ? error.message : '填写失败' }));
    return true;
  }
  if (message.type === 'FILL_SINGLE') {
    fillSingle(message.proposal)
      .then(success => sendResponse({ type: 'FILL_SINGLE_RESULT', success }))
      .catch(() => sendResponse({ type: 'FILL_SINGLE_RESULT', success: false }));
    return true;
  }
  if (message.type === 'EXPAND_SECTIONS') {
    expandSections(message.counts).then(() => sendResponse({ type: 'EXPAND_RESULT', success: true }));
    return true;
  }
  return false;
});
