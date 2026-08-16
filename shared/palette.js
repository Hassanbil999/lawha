/**
 * palette.js
 * The command palette: one search across open tabs, bookmarks and history.
 */

/* Lawha — the command palette.
 *
 * One field over open tabs, bookmarks, and history at once. Open tabs rank
 * first, then bookmarks, then history: an open tab is almost always what you
 * meant, and putting it anywhere else makes you read the list.
 *
 * Matching is plain substring over title and URL. Chrome's own history.search
 * does word-prefix matching, which quietly fails on "logical properties" when
 * the title reads "CSS logical properties" — so the corpus is pulled into
 * memory once per open and filtered here. It stays instant at a few thousand
 * rows and it behaves the way people expect a search box to behave.
 *
 * Built on <dialog>, which brings a focus trap and Escape handling with it. */

import { el, faviconImage, domainOf, replaceChildren } from './utils.js';
import { t } from './i18n.js';

const SOURCE_ORDER = { tab: 0, bookmark: 1, history: 2 };
const SOURCE_LABEL = { tab: 'cmd_src_tab', bookmark: 'cmd_src_bookmark', history: 'cmd_src_history' };

const CORPUS_TTL = 60_000;

/** A month of history, capped. Past a few hundred entries the ranking is what
 *  matters, not the size of the pile being ranked. */
const HISTORY_RESULTS = 400;
const HISTORY_WINDOW_MS = 30 * 864e5;
const MAX_RESULTS = 24;

let cache = { at: 0, bookmarks: [], history: [] };
let instance = null;

/* ---- Corpus ------------------------------------------------------------- */

function flattenBookmarks(nodes, out = []) {
  for (const node of nodes) {
    if (node.url) out.push({ source: 'bookmark', title: node.title || node.url, url: node.url });
    if (node.children) flattenBookmarks(node.children, out);
  }
  return out;
}

async function loadCorpus() {
  // Tabs are cheap and change constantly, so they are always read fresh.
  const tabs = (await chrome.tabs.query({})).map((tab) => ({
    source: 'tab',
    title: tab.title || tab.url || '',
    url: tab.url || '',
    tabId: tab.id,
    windowId: tab.windowId,
  }));

  if (Date.now() - cache.at > CORPUS_TTL) {
    const [tree, history] = await Promise.all([
      chrome.bookmarks.getTree(),
      chrome.history.search({ text: '', maxResults: HISTORY_RESULTS, startTime: Date.now() - HISTORY_WINDOW_MS }),
    ]);

    cache = {
      at: Date.now(),
      bookmarks: flattenBookmarks(tree[0]?.children ?? []),
      history: history
        .filter((item) => item.url && item.title)
        .map((item) => ({ source: 'history', title: item.title, url: item.url })),
    };
  }

  return [...tabs, ...cache.bookmarks, ...cache.history];
}

/* ---- Ranking ------------------------------------------------------------ */

function search(corpus, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    // An empty field shows open tabs, which is the most useful default state
    // for a box you opened by reflex.
    return corpus.filter((item) => item.source === 'tab').slice(0, MAX_RESULTS);
  }

  const terms = needle.split(/\s+/);
  const scored = [];
  const seen = new Set();

  for (const item of corpus) {
    const title = item.title.toLowerCase();
    const url = item.url.toLowerCase();
    if (!terms.every((term) => title.includes(term) || url.includes(term))) continue;

    const key = `${item.source}:${item.url}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Within a source, an early hit in the title beats a late hit in a URL.
    const position = title.indexOf(terms[0]);
    scored.push({
      item,
      rank: SOURCE_ORDER[item.source] * 1000 + (position < 0 ? 500 : position),
    });
  }

  scored.sort((a, b) => a.rank - b.rank);
  return scored.slice(0, MAX_RESULTS).map((entry) => entry.item);
}

/* ---- Opening a result --------------------------------------------------- */

async function activate(item) {
  if (item.source === 'tab' && item.tabId !== undefined) {
    await chrome.tabs.update(item.tabId, { active: true });
    await chrome.windows.update(item.windowId, { focused: true });
    return;
  }
  // From the new tab, navigating in place is what a person expects from
  // typing an address. From the side panel there is no page to replace, so a
  // new tab it is.
  if (location.pathname.includes('newtab')) {
    location.assign(item.url);
  } else {
    await chrome.tabs.create({ url: item.url });
  }
}

/* ---- UI ----------------------------------------------------------------- */

function build() {
  const input = el('input', {
    class: 'cmdk-input',
    type: 'text',
    id: 'cmdk-input',
    autocomplete: 'off',
    spellcheck: 'false',
    role: 'combobox',
    'aria-expanded': 'true',
    'aria-controls': 'cmdk-list',
    'aria-autocomplete': 'list',
  });

  const list = el('ul', {
    class: 'cmdk-list',
    id: 'cmdk-list',
    role: 'listbox',
  });

  const hints = el('div', { class: 'cmdk-hints' }, [
    el('span', {}, [el('kbd', { text: '↑↓' }), el('span', { class: 'cmdk-hint-text' })]),
    el('span', {}, [el('kbd', { text: '↵' }), el('span', { class: 'cmdk-hint-text' })]),
    el('span', {}, [el('kbd', { text: 'esc' }), el('span', { class: 'cmdk-hint-text' })]),
  ]);

  const dialog = el('dialog', { class: 'cmdk', 'aria-label': 'Lawha' }, [
    el('div', { class: 'cmdk-field' }, [input]),
    list,
    hints,
  ]);

  document.body.append(dialog);

  const state = { results: [], active: 0, corpus: [] };

  const paint = () => {
    if (!state.results.length) {
      replaceChildren(list, [
        el('li', { class: 'cmdk-empty', role: 'presentation', text: t('cmd_empty') }),
      ]);
      input.removeAttribute('aria-activedescendant');
      return;
    }

    const rows = state.results.map((item, index) => {
      const row = el(
        'li',
        {
          class: 'cmdk-row',
          id: `cmdk-row-${index}`,
          role: 'option',
          'aria-selected': String(index === state.active),
          dataset: { index: String(index) },
        },
        [
          el('span', { class: 'cmdk-source', text: t(SOURCE_LABEL[item.source]) }),
          faviconImage(item.url, 16),
          el('span', { class: 'cmdk-title', text: item.title || domainOf(item.url) }),
          el('span', { class: 'cmdk-url', text: domainOf(item.url) }),
        ]
      );
      row.addEventListener('click', () => {
        dialog.close();
        activate(item);
      });
      row.addEventListener('pointermove', () => {
        if (state.active === index) return;
        state.active = index;
        paint();
      });
      return row;
    });

    replaceChildren(list, rows);
    input.setAttribute('aria-activedescendant', `cmdk-row-${state.active}`);
    rows[state.active]?.scrollIntoView({ block: 'nearest' });
  };

  const run = () => {
    state.results = search(state.corpus, input.value);
    state.active = 0;
    paint();
  };

  input.addEventListener('input', run);

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || (event.key === 'n' && event.ctrlKey)) {
      event.preventDefault();
      state.active = Math.min(state.active + 1, state.results.length - 1);
      paint();
    } else if (event.key === 'ArrowUp' || (event.key === 'p' && event.ctrlKey)) {
      event.preventDefault();
      state.active = Math.max(state.active - 1, 0);
      paint();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = state.results[state.active];
      if (!item) return;
      dialog.close();
      activate(item);
    }
  });

  // Clicking the backdrop dismisses; clicking the panel does not. A <dialog>
  // reports the dialog itself as the target for backdrop clicks, and the list
  // stops its own clicks from reaching that handler at all — otherwise a click
  // that lands between two rows would close the palette before the row's own
  // handler had a chance to navigate.
  list.addEventListener('click', (event) => event.stopPropagation());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  const refreshStrings = () => {
    input.placeholder = t('cmd_placeholder');
    const texts = hints.querySelectorAll('.cmdk-hint-text');
    texts[0].textContent = t('cmd_hint_nav');
    texts[1].textContent = t('cmd_hint_open');
    texts[2].textContent = t('cmd_hint_close');
  };

  return {
    dialog,
    async open(query = '') {
      refreshStrings();
      input.value = query;
      state.corpus = await loadCorpus();
      run();
      if (!dialog.open) dialog.showModal();
      input.focus();
      input.select();
    },
    close() {
      if (dialog.open) dialog.close();
    },
    isOpen: () => dialog.open,
  };
}

/** Lazily built on first use, then reused — the corpus load is the only cost
 *  worth paying twice. */
export async function openPalette(query = '') {
  if (!instance) instance = build();
  await instance.open(query);
}

export function closePalette() {
  instance?.close();
}

export function isPaletteOpen() {
  return Boolean(instance?.isOpen());
}

/**
 * Wire Ctrl+K (and Cmd+K) on a page. Chrome's own Ctrl+K focuses the omnibox,
 * and the manifest command only reaches pages we own anyway — so the binding
 * that actually matters is this one, on the surfaces where the palette can
 * appear.
 */
export function bindPaletteShortcut(target = document) {
  target.addEventListener('keydown', (event) => {
    if (event.key !== 'k' && event.key !== 'K') return;
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    if (isPaletteOpen()) closePalette();
    else openPalette('');
  });
}
