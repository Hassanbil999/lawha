/**
 * sidebar.js
 * The side panel: the live tab list, and the tuning panel beneath it.
 */

/* Lawha — the side panel.
 *
 * Two things, in the order you came for them: the tabs open in this window, and
 * a tuning surface for the active Scene beneath them.
 *
 * It creates nothing. Building and browsing Scenes is the gallery's job, and
 * the link at the foot of the panel is the only route there — a panel that
 * both tunes and creates ends up doing neither well at 320px wide.
 *
 * Every tuning control writes through setPresentation, so nothing on that half
 * of the panel can reach a single byte of user data. The tab list only reads
 * tabLastAccessed; the service worker is the one that writes it. */

import { mountTuningPanel } from '../shared/tuning.js';
import { applyPresentation, getScene } from '../shared/scenes.js';
import { initI18n, t, fmtNum, setLanguage, setNumerals, applyStrings } from '../shared/i18n.js';
import { mountIconSprite } from '../shared/icons.js';
import {
  icon,
  el,
  replaceChildren,
  faviconImage,
  domainOf,
  contextMenu,
  debounce,
  isSafeURL,
} from '../shared/utils.js';
import { get, onChanged, setPresentation } from '../shared/storage.js';
import { bindPaletteShortcut, openPalette } from '../shared/palette.js';
import { onMessage } from '../shared/messaging.js';
import { saveForLater } from '../modules/later.js';

const toastNode = document.getElementById('toast');

/** Long enough to read a short sentence, short enough not to linger. */
const TOAST_MS = 2600;

function toast(message) {
  toastNode.textContent = message;
  toastNode.hidden = false;
  clearTimeout(toast.handle);
  toast.handle = setTimeout(() => {
    toastNode.hidden = true;
  }, TOAST_MS);
}

/* ---- The tab list -------------------------------------------------------
 * List mode: a favicon, a title, and the small marks that say something about
 * a tab you would otherwise have to click it to learn — pinned, muted, and
 * untouched for more than a day.
 *
 * Rows are buttons, not links. A link inside a side panel navigates the panel
 * itself, which would replace the list with the page it points at.
 *
 * Only the current window. A panel listing every tab in every window is a
 * different tool, and at 320px it is an unreadable one. */

const countNode = document.getElementById('tab-count');
const listNode = document.getElementById('tabs');
const emptyNode = document.getElementById('tabs-empty');
const filterNode = document.getElementById('filter');

/** A day untouched is when a tab stops being something you are doing and
 *  becomes something you meant to. */
const STALE_AFTER = 864e5;

async function renderTabs() {
  const [tabs, ages] = await Promise.all([
    chrome.tabs.query({ currentWindow: true }),
    // Written by the service worker on real browser events, read here. The
    // panel never writes it — a render that wrote user data would be exactly
    // the thing shared/storage.js exists to make impossible.
    get('tabLastAccessed'),
  ]);

  countNode.textContent =
    tabs.length === 1 ? t('tabs_count_one') : t('tabs_count_many', fmtNum(tabs.length));

  const needle = filterNode.value.trim().toLowerCase();
  const shown = needle
    ? tabs.filter((tab) => `${tab.title ?? ''} ${tab.url ?? ''}`.toLowerCase().includes(needle))
    : tabs;

  replaceChildren(listNode, shown.map((tab) => buildTabRow(tab, ages)));

  // Two different kinds of nothing: no tabs at all, and none that match what
  // you typed. Telling them apart is the difference between an explanation and
  // a shrug.
  emptyNode.hidden = shown.length > 0;
  emptyNode.textContent = tabs.length ? t('cmd_empty') : t('tabs_empty');
}

function buildTabRow(tab, ages) {
  const title = tab.title || domainOf(tab.url) || tab.url || '';

  const row = el(
    'button',
    {
      class: 'l-row tab',
      type: 'button',
      title,
      dataset: { active: String(Boolean(tab.active)) },
    },
    [
      faviconImage(tab.url ?? '', 16),
      el('span', { class: 'l-row-title tab-title', text: title }),
    ]
  );

  if (tab.pinned) row.append(markIcon('pin', t('action_pin')));
  if (tab.mutedInfo?.muted) row.append(markIcon('mute', t('action_mute')));

  const lastSeen = ages[String(tab.id)];
  if (lastSeen && Date.now() - lastSeen > STALE_AFTER) {
    row.append(
      el('span', { class: 'tab-stale', title: t('tab_age_old'), 'aria-label': t('tab_age_old') })
    );
  }

  row.addEventListener('click', () => focusTab(tab));
  row.addEventListener('contextmenu', (event) => tabMenu(event, tab));

  return row;
}

/** A mark that says something, so it gets a name rather than aria-hidden. */
function markIcon(name, label) {
  const wrap = el('span', { class: 'tab-mark', title: label, 'aria-label': label, role: 'img' });
  wrap.append(icon(name, 12));
  return wrap;
}

async function focusTab(tab) {
  await chrome.tabs.update(tab.id, { active: true });
  // The panel can be open over a window that is not the focused one.
  await chrome.windows.update(tab.windowId, { focused: true });
}

function tabMenu(event, tab) {
  contextMenu(event, [
    {
      label: t('action_close'),
      icon: 'close',
      danger: true,
      onSelect: () => chrome.tabs.remove(tab.id),
    },
    {
      label: t(tab.pinned ? 'action_unpin' : 'action_pin'),
      icon: 'pin',
      onSelect: () => chrome.tabs.update(tab.id, { pinned: !tab.pinned }),
    },
    {
      label: t(tab.mutedInfo?.muted ? 'action_unmute' : 'action_mute'),
      icon: tab.mutedInfo?.muted ? 'sound' : 'mute',
      onSelect: () => chrome.tabs.update(tab.id, { muted: !tab.mutedInfo?.muted }),
    },
    // Only for something the queue could actually open again later. A
    // chrome:// page saved for later is a row you can never click.
    isSafeURL(tab.url)
      ? {
          label: t('action_save'),
          icon: 'later',
          onSelect: async () => {
            await saveForLater({ url: tab.url, title: tab.title ?? '' });
            toast(t('later_saved'));
          },
        }
      : null,
  ]);
}

/* One repaint per burst. Closing eight tabs fires eight events, and the list
 * only has to be right once they have all landed. */
const refreshTabs = debounce(() => {
  renderTabs().catch((error) => console.error('Lawha: tab list failed', error));
}, 60);

function wireTabs() {
  chrome.tabs.onCreated.addListener(refreshTabs);
  chrome.tabs.onRemoved.addListener(refreshTabs);
  chrome.tabs.onUpdated.addListener(refreshTabs);
  chrome.tabs.onActivated.addListener(refreshTabs);

  filterNode.addEventListener('input', refreshTabs);
  filterNode.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !filterNode.value) return;
    event.preventDefault();
    filterNode.value = '';
    refreshTabs();
  });
}

/* ---- Boot --------------------------------------------------------------- */

let panel = null;

async function boot() {
  mountIconSprite();
  await initI18n();

  document.getElementById('mark').append(icon('logo', 20));

  const scene = await getScene(await get('activeScene'));
  await applyPresentation(scene);

  await renderTabs();
  wireTabs();

  panel = await mountTuningPanel(document.getElementById('tune'), { onToast: toast });

  bindPaletteShortcut(document);
  wireStorage();
  await announcePresence();
}

/** A set that writes the same value still fires onChanged. Ignore those, so a
 *  repaint is only ever triggered by something actually being different. */
function reallyChanged(entry) {
  return JSON.stringify(entry.oldValue) !== JSON.stringify(entry.newValue);
}

function wireStorage() {
  onChanged(async (rawChanges) => {
    const changes = Object.fromEntries(
      Object.entries(rawChanges).filter(([, entry]) => reallyChanged(entry))
    );
    if (!Object.keys(changes).length) return;

    if (changes.language) {
      await setLanguage(changes.language.newValue, { persist: false });
      applyStrings();
    }
    if (changes.numerals) await setNumerals(changes.numerals.newValue, { persist: false });

    // Tab rows bake their strings in at render time, so a language or numeral
    // switch has to redraw them rather than waiting for the next tab event.
    if (changes.language || changes.numerals) refreshTabs();

    // A Scene applied from the gallery changes what the panel is tuning.
    if (changes.activeScene || changes.customScenes) {
      const scene = await getScene(await get('activeScene'));
      await applyPresentation(scene);
      await panel?.refresh();
    }
  });
}

/**
 * The service worker has no way to ask whether the panel is open — there is no
 * sidePanel.isOpen(). This port is that answer: it exists while the panel does,
 * and its disconnect is what makes Ctrl+Shift+L a toggle rather than an
 * open-only shortcut. The same signal persists `sidebarOpen`, so a panel you
 * closed stays closed across new tabs.
 */
async function announcePresence() {
  const { id: windowId } = await chrome.windows.getCurrent();
  const port = chrome.runtime.connect({ name: 'lawha-sidebar' });
  port.postMessage({ type: 'hello', windowId });
  await setPresentation('sidebarOpen', true);

  onMessage((message, _sender, sendResponse) => {
    if (message.type !== 'lawha:open-palette') return false;
    if (document.visibilityState !== 'visible') return false;
    openPalette('');
    sendResponse({ handled: true });
    return false;
  });
}

boot();
