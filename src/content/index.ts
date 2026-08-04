import type { ContentMessage, ContentResponse } from '../types';
import { analyzePage } from './DOMAnalyzer';
import { fillForm, fillSingle, expandSections } from './FormFiller';

chrome.runtime.onMessage.addListener(
  (
    message: any,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: any) => void
  ) => {
    // Ping check — used by ensureContentScript to verify injection
    if (message.type === '__PING__') {
      sendResponse({ type: 'PONG' });
      return false;
    }

    if (message.type === 'ANALYZE') {
      try {
        const fields = analyzePage();
        if (fields.length >= 3) {
          sendResponse({ type: 'ANALYZE_RESULT', fields });
        } else {
          setTimeout(() => {
            const retryFields = analyzePage();
            sendResponse({
              type: 'ANALYZE_RESULT',
              fields: retryFields.length > fields.length ? retryFields : fields,
            });
          }, 800);
          return true;
        }
      } catch (err) {
        sendResponse({
          type: 'ERROR',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    } else if (message.type === 'FILL') {
      fillForm(message.proposals)
        .then(filled => {
          sendResponse({ type: 'FILL_RESULT', success: true, filled });
        })
        .catch(err => {
          sendResponse({
            type: 'ERROR',
            message: err instanceof Error ? err.message : 'Fill error',
          });
        });
      return true;
    } else if (message.type === 'FILL_SINGLE') {
      fillSingle(message.proposal)
        .then(success => {
          sendResponse({ type: 'FILL_SINGLE_RESULT', success });
        })
        .catch(() => {
          sendResponse({ type: 'FILL_SINGLE_RESULT', success: false });
        });
      return true;
    } else if (message.type === 'EXPAND_SECTIONS') {
      expandSections(message.counts)
        .then(() => {
          sendResponse({ type: 'EXPAND_RESULT', success: true });
        })
        .catch(() => {
          sendResponse({ type: 'EXPAND_RESULT', success: false });
        });
      return true;
    }

    return false;
  }
);
