/**
 * background.js
 * The service worker: keyboard commands, the side panel toggle, the toolbar badge, and the session snapshot.
 */

/* Lawha — the service worker.
 *
 * Four keyboard commands, the side-panel toggle, the pieces of state that have
 * to be recorded while nothing is watching, and — since Patch D — the one
 * thing here that reaches past the extension's own package: fetching the feed
 * URLs a person has explicitly added. That is the whole of the host
 * permission's reach; there are no content scripts, so nothing here can read
 * or touch any other page.
 *
 * A service worker has no DOM, so it cannot run DOMParser on what it fetches.
 * offscreen.js is a hidden page that exists for exactly that gap — see
 * ensureOffscreenDocument below. */

import { get, setData, setPresentation, capped, LIMITS } from './shared/storage.js';
import { sendMessage, onMessage } from './shared/messaging.js';
import { safeURL, uid, urlDedupeKey } from './shared/utils.js';
import { MAX_FEEDS, FEED_REFRESH_MINUTES } from './shared/feeds.js';

const DAY = 864e5;

/** Long enough for Chrome to have dismissed the panel before it is made
 *  available again, short enough that the next press feels immediate. */
const PANEL_REOPEN_MS = 120;

/* ---- Side panel ---------------------------------------------------------
 * There is no sidePanel.close(), so a real toggle needs two things: knowing
 * whether the panel is open for a given window, and a way to shut it. The
 * first comes from a port the panel opens on load and drops when it closes.
 * The second is setOptions({enabled: false}), which dismisses the panel; it is
 * re-enabled on the next turn so the next toggle can open it again. */

const openPanels = new Set();

chrome.runtime.onConnect.addListener((port) => {
  // A port is as much of a public surface as a message. Anything that is not
  // one of our own pages is dropped before its first message is read.
  if (port.sender?.id !== chrome.runtime.id) {
    port.disconnect();
    return;
  }
  if (port.name !== 'lawha-sidebar') return;

  port.onMessage.addListener((message) => {
    if (message?.type === 'hello' && Number.isInteger(message.windowId)) {
      port.windowId = message.windowId;
      openPanels.add(message.windowId);
    }
  });

  port.onDisconnect.addListener(() => {
    if (Number.isInteger(port.windowId)) openPanels.delete(port.windowId);
    // Closing the panel is a choice. Remember it, so opening a new tab does
    // not quietly bring it back.
    if (!openPanels.size) setPresentation('sidebarOpen', false);
  });
});

async function toggleSidebar() {
  const { id: windowId } = await chrome.windows.getCurrent();

  if (openPanels.has(windowId)) {
    openPanels.delete(windowId);
    // Disabling the panel for the active tab is what dismisses it; there is no
    // sidePanel.close(). It is re-enabled a moment later so the next press
    // opens it again rather than doing nothing.
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    if (!tab) return;
    await chrome.sidePanel.setOptions({ tabId: tab.id, enabled: false });
    setTimeout(() => {
      chrome.sidePanel
        .setOptions({ tabId: tab.id, path: 'sidebar/sidebar.html', enabled: true })
        .catch((error) => console.error('Lawha: could not re-enable the side panel', error));
    }, PANEL_REOPEN_MS);
    return;
  }

  await chrome.sidePanel.open({ windowId });
}

/* ---- Commands ----------------------------------------------------------- */

/**
 * The palette can only be drawn on a page we own — with no host permissions
 * there is no content script to put it anywhere else. So: offer it to whatever
 * Lawha surface is currently visible, and if none is, open a new tab and let
 * it come up with the palette already showing.
 */
async function openCommandPalette() {
  // sendMessage resolves to null when no Lawha page is listening, rather than
  // throwing, so there is nothing to catch here.
  const delivered = await sendMessage({ type: 'lawha:open-palette' });
  if (delivered?.handled) return;

  await chrome.storage.session.set({ pendingPalette: true });
  await chrome.tabs.create({});
}

async function saveActiveTabForLater() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/^https?:/.test(tab.url)) return;

  const current = await get('later');
  // Saving the same page twice is a no-op, not a second row.
  if (current.some((entry) => urlDedupeKey(entry.url) === urlDedupeKey(tab.url))) return;

  const next = [
    ...current,
    {
      url: tab.url,
      // A page with no title is still worth keeping; its address is the best
      // name it has.
      title: capped(tab.title || tab.url, LIMITS.laterTitle),
      saved: Date.now(),
    },
  ];

  // Newest kept. Appending means the oldest fall off the front.
  await setData('later', next.slice(-LIMITS.laterItems));
}

async function toggleFocusMode() {
  const current = await get('focusMode');
  await setPresentation('focusMode', !current);
}

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-sidebar') toggleSidebar();
  else if (command === 'command-palette') openCommandPalette();
  else if (command === 'save-later') saveActiveTabForLater();
  else if (command === 'focus-mode') toggleFocusMode();
});

/* ---- The toolbar badge --------------------------------------------------
 * How many tabs are open, on the extension icon. Off by default: a number that
 * changes every time you open a tab is precisely the restlessness the rest of
 * this product is arranged to avoid, and the people who want it want it badly
 * enough to turn it on. */

const BADGE_COLOR = '#1F6E63'; // --accent, waraq

async function updateBadge() {
  if (!(await get('badgeCount'))) {
    await chrome.action.setBadgeText({ text: '' });
    return;
  }

  const tabs = await chrome.tabs.query({});
  await chrome.action.setBadgeText({ text: tabs.length > 99 ? '99+' : String(tabs.length) });
  await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
}

/* ---- The session snapshot -----------------------------------------------
 * The one complaint every tab manager collects is losing everything to a crash.
 * So: keep a list of what is open, and let the new tab offer it back.
 *
 * The spec asked for a timer every five minutes. A Manifest V3 service worker
 * is torn down after about thirty seconds of idle, so a timer that long only
 * fires if something else happens to be keeping the worker awake — which is to
 * say, unreliably. Saving on the tab events that wake the worker anyway is both
 * more current and free of the alarms permission.
 *
 * Two rules keep the snapshot worth having:
 *   · an empty list is never written, so the moment everything closes cannot
 *     erase the record of what was open
 *   · the write is on a trailing debounce, so a browser being torn down usually
 *     dies before it can overwrite a good snapshot with a dwindling one */

const SESSION_DEBOUNCE_MS = 1500;
let sessionSaveHandle = null;

function scheduleSessionSave() {
  clearTimeout(sessionSaveHandle);
  sessionSaveHandle = setTimeout(() => {
    saveSession().catch((error) => console.error('Lawha: session snapshot failed', error));
    // The same quiet moment is when the tab-age map is worth sweeping — see
    // pruneTabAges. Both are "the tabs have settled, tidy up" work.
    pruneTabAges().catch((error) => console.error('Lawha: tab age sweep failed', error));
  }, SESSION_DEBOUNCE_MS);
}

async function saveSession() {
  const tabs = await chrome.tabs.query({});
  const worth = tabs
    .filter((tab) => tab.url && /^https?:/.test(tab.url))
    .map((tab) => ({ url: tab.url, title: capped(tab.title, LIMITS.laterTitle) }));

  // Never trade a good snapshot for an empty one.
  if (!worth.length) return;
  await setData('lastSession', worth);
}

/** Both the badge and the snapshot care about the same three events. */
function onTabsChanged() {
  updateBadge().catch((error) => console.error('Lawha: badge update failed', error));
  scheduleSessionSave();
}

chrome.tabs.onCreated.addListener(onTabsChanged);
chrome.tabs.onRemoved.addListener(onTabsChanged);
chrome.tabs.onReplaced.addListener(onTabsChanged);
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  // A title or URL settling is worth recording; a favicon or a loading flag is
  // not, and firing on those would write on every keystroke in the omnibox.
  if (changeInfo.url || changeInfo.title) scheduleSessionSave();
});

/** Turning the badge on or off in the panel has to reach the icon at once. */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !changes.badgeCount) return;
  updateBadge().catch((error) => console.error('Lawha: badge update failed', error));
});

/* ---- Tab age ------------------------------------------------------------
 * A tab you have not touched in a day gets a small dot in the panel. Recording
 * that means writing tabLastAccessed, which is a DATA_KEY — and it is written
 * here, from a genuine browser event, never from a render. */

async function touchTab(tabId) {
  const map = await get('tabLastAccessed');
  map[String(tabId)] = Date.now();
  await setData('tabLastAccessed', map);
}

chrome.tabs.onActivated.addListener(({ tabId }) => touchTab(tabId));
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id !== undefined) touchTab(tab.id);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const map = await get('tabLastAccessed');
  if (!(String(tabId) in map)) return;
  delete map[String(tabId)];
  await setData('tabLastAccessed', map);
});

/** Tab ids are reused across restarts, so a map that is never pruned starts
 *  lying about the age of new tabs. Sweep anything older than a week and
 *  anything whose tab no longer exists.
 *
 *  Runs off the same debounced tab-change signal as the session snapshot rather
 *  than on a startup hook. That is the better moment for it in any case: at
 *  startup the restored tabs have not been created yet, so a sweep then is
 *  looking at a window that is still filling up. A second and a half after the
 *  churn stops, it is looking at the truth. */
async function pruneTabAges() {
  const [map, tabs] = await Promise.all([get('tabLastAccessed'), chrome.tabs.query({})]);
  const live = new Set(tabs.map((tab) => String(tab.id)));
  const cutoff = Date.now() - 7 * DAY;

  const next = {};
  for (const [tabId, at] of Object.entries(map)) {
    if (live.has(tabId) && at > cutoff) next[tabId] = at;
  }

  if (Object.keys(next).length !== Object.keys(map).length) {
    await setData('tabLastAccessed', next);
  }
}

/* ---- Feeds ---------------------------------------------------------------
 * The one place in Lawha that reaches past its own package. A feed is a URL
 * someone typed in themselves; nothing is fetched that was not asked for, and
 * the result never leaves chrome.storage.local — there is no Lawha server for
 * it to go to.
 *
 * Refresh runs off an alarm rather than a startup hook, for the same reason
 * the session snapshot does: alarms survive a service worker being torn down
 * and a browser being restarted, so nothing has to run at launch to keep the
 * thirty-minute cadence honest. */

const FEED_FETCH_TIMEOUT_MS = 15_000;

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'feed-refresh') {
    refreshAllFeeds().catch((error) => console.error('Lawha: feed refresh failed', error));
  }
});

async function refreshAllFeeds() {
  const feeds = await get('feeds');
  if (!feeds.some((feed) => feed.enabled)) return;

  const updated = await Promise.all(feeds.map((feed) => (feed.enabled ? fetchAndParseFeed(feed) : feed)));
  await setData('feeds', updated);
}

async function fetchAndParseFeed(feed) {
  try {
    const xml = await fetchFeedText(feed.url);
    const parsed = await parseFeedXML(xml, feed.items);

    return {
      ...feed,
      // Sticky once set: the first successful fetch names the feed, and a
      // later one does not quietly rename it out from under you.
      title: feed.title || parsed.title || feed.url,
      siteUrl: parsed.siteUrl || feed.siteUrl,
      items: parsed.items,
      lastFetched: Date.now(),
      lastError: null,
    };
  } catch (error) {
    // Marked, not removed — a feed server having a bad day is not a reason to
    // lose the subscription.
    return { ...feed, lastFetched: Date.now(), lastError: error.message || 'fetch_failed' };
  }
}

async function fetchFeedText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEED_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/rss+xml, application/atom+xml, text/xml, */*' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const text = await response.text();
    // A response that is not even trying to be XML — an HTML error page, a
    // login wall, a redirect target — produces the same "nothing to show"
    // result as a genuine parse failure either way. Catching it here means
    // the offscreen document never hands it to DOMParser, which is what
    // avoids Chrome's own malformed-XML error rendering: that rendering uses
    // inline styles, which trips this extension's CSP and logs a console
    // warning that looks like a crash but is not one.
    if (!/^\s*(<\?xml|<)/i.test(text)) throw new Error('not_xml');
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

/* Parsing needs a real DOMParser, which a service worker does not have. The
 * offscreen document is a hidden page that does — created on first use and
 * then left open, since offscreen documents are cheap and tearing one down
 * only to spin another up thirty minutes later buys nothing. */

let offscreenReady = null;

async function ensureOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) return;
  if (!offscreenReady) {
    offscreenReady = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['DOM_PARSER'],
      justification: 'Parse RSS/Atom XML fetched from feed URLs the user added.',
    });
  }
  await offscreenReady;
  offscreenReady = null;
}

async function parseFeedXML(xml, existingItems) {
  await ensureOffscreenDocument();
  const response = await sendMessage({
    type: 'lawha:parse-feed',
    xml,
    existingLinks: existingItems.map((item) => item.link),
  });
  if (!response?.ok) throw new Error(response?.error || 'parse_failed');
  return response.result;
}

function isValidFeedURL(url) {
  const parsed = safeURL(url);
  return Boolean(parsed) && parsed.protocol === 'https:';
}

async function addFeed(url) {
  if (!isValidFeedURL(url)) return { ok: false };

  const current = await get('feeds');
  if (current.length >= MAX_FEEDS) return { ok: false };
  if (current.some((feed) => urlDedupeKey(feed.url) === urlDedupeKey(url))) return { ok: false };

  const draft = { id: uid(), url, title: '', siteUrl: '', items: [], lastFetched: 0, lastError: null, enabled: true };
  const fetched = await fetchAndParseFeed(draft);
  if (fetched.lastError) return { ok: false };

  await setData('feeds', [...current, fetched]);
  return { ok: true };
}

onMessage((message, _sender, sendResponse) => {
  if (message.type !== 'lawha:add-feed') return false;
  addFeed(message.url).then(sendResponse);
  return true;
});

/* There is no onStartup listener, and nothing is missing without one.
 *
 * The two things it used to do now happen on better signals. The session-restore
 * flag needs no clearing: it lives in chrome.storage.session, which the browser
 * empties by itself. The tab-age sweep runs off the debounced tab-change
 * handler, which fires as the restored tabs arrive rather than before them.
 *
 * The badge follows from the same events — every restored tab fires onCreated,
 * so the count is drawn as the window fills, without a startup hook to say so. */

chrome.runtime.onInstalled.addListener(async () => {
  // The toolbar icon opens the popup, which is where the builder lives; the
  // panel has its own shortcut and a button in that popup.
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  await pruneTabAges();
  await updateBadge();

  // periodInMinutes on an existing alarm resets its schedule rather than
  // creating a second one, so this is safe to run on every update too.
  await chrome.alarms.create('feed-refresh', { periodInMinutes: FEED_REFRESH_MINUTES });
  refreshAllFeeds().catch((error) => console.error('Lawha: feed refresh failed', error));
});
