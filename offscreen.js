/**
 * offscreen.js
 * Parses feed XML with DOMParser, which the service worker does not have.
 */

/* Lawha — the offscreen document.
 *
 * A Manifest V3 service worker has no DOM, so background.js cannot run
 * DOMParser on the XML it fetches. This hidden page exists for exactly that
 * gap: it never becomes visible, never navigates anywhere, and does nothing
 * but turn feed XML into plain objects on request. */

import { onMessage } from './shared/messaging.js';
import { parseFeedDocument } from './shared/feeds.js';

onMessage((message, _sender, sendResponse) => {
  if (message.type !== 'lawha:parse-feed') return false;

  try {
    const doc = new DOMParser().parseFromString(message.xml, 'text/xml');
    if (doc.querySelector('parsererror')) throw new Error('parse_error');
    sendResponse({ ok: true, result: parseFeedDocument(doc, message.existingLinks || []) });
  } catch (error) {
    sendResponse({ ok: false, error: error.message });
  }
  return false;
});
