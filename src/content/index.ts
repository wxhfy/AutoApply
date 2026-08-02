import type { ContentMessage, ContentResponse } from '../types';
import { analyzePage } from './DOMAnalyzer';
import { fillForm } from './FormFiller';

chrome.runtime.onMessage.addListener(
  (
    message: ContentMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: ContentResponse) => void
  ) => {
    try {
      if (message.type === 'ANALYZE') {
        const fields = analyzePage();
        sendResponse({ type: 'ANALYZE_RESULT', fields });
      } else if (message.type === 'FILL') {
        const filled = fillForm(message.proposals);
        sendResponse({ type: 'FILL_RESULT', success: true, filled });
      }
    } catch (err) {
      sendResponse({
        type: 'ERROR',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
    return false;
  }
);
