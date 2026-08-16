/**
 * messaging.js
 * Runtime messaging, with every incoming message treated as untrusted until it proves otherwise.
 */

/* Lawha — message passing, treated as untrusted input.
 *
 * chrome.runtime.onMessage is reachable by any extension the user has
 * installed, and — with externally_connectable — by web pages. Lawha declares
 * neither, but the listener is still a public surface, and a listener that
 * trusts its input is a listener that will eventually be handed something it
 * did not expect.
 *
 * Three gates, cheapest first: is it ours, is it shaped like a message, is it
 * small enough to be one. Anything that fails is dropped without a reply. */

/** Anything bigger than this is not one of our messages. */
export const MAX_MESSAGE_BYTES = 50_000;

/**
 * The three gates, as one predicate — separated from the listener so it can be
 * tested directly rather than by trying to forge a message.
 *
 * @param {unknown} message
 * @param {{id?: string}} sender
 */
export function isTrustedMessage(message, sender) {
  // Not from us. Another extension, or a page that found the id.
  if (sender?.id !== chrome.runtime.id) return false;
  // Not shaped like one of ours.
  if (!message?.type || typeof message.type !== 'string') return false;
  // Too big to be one of ours. Cheap guard against a memory-pressure probe.
  return withinSizeLimit(message);
}

/**
 * Register a validated message listener.
 *
 * The handler's return value is passed straight through to Chrome, so the
 * existing contract still holds: return true to keep the channel open for an
 * async sendResponse, anything else to close it. A wrapper that always returned
 * true would leave every sender waiting on a reply that never comes.
 *
 * @param {(message: object, sender: chrome.runtime.MessageSender, sendResponse: Function) => boolean|void} handler
 * @returns {() => void} unsubscribe
 */
export function onMessage(handler) {
  const listener = (message, sender, sendResponse) => {
    if (!isTrustedMessage(message, sender)) return false;
    return handler(message, sender, sendResponse) === true;
  };

  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}

/**
 * Send a message to our own pages. Resolves to null rather than throwing when
 * nothing is listening, which is the ordinary case for a shortcut pressed while
 * no Lawha surface is open.
 */
export async function sendMessage(message) {
  if (!message?.type || typeof message.type !== 'string') {
    throw new Error('sendMessage: every message needs a string type.');
  }
  try {
    return (await chrome.runtime.sendMessage(message)) ?? null;
  } catch {
    // "Receiving end does not exist" is not an error worth propagating.
    return null;
  }
}

/** JSON.stringify can throw on a cyclic payload; a message we cannot measure is
 *  a message we do not accept. */
function withinSizeLimit(message) {
  try {
    return JSON.stringify(message).length <= MAX_MESSAGE_BYTES;
  } catch {
    return false;
  }
}
