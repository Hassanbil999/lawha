/**
 * utils.js
 * Small pure helpers: DOM construction without markup, URL safety, colour maths, and relative time.
 */

/* Lawha — small pure helpers. No storage, no i18n, no module registry: the
 * only Chrome APIs it touches are runtime.getURL, for the favicon endpoint,
 * and tabs.create inside navigate().
 *
 * Anything here that needs a translated string takes `t` as an argument rather
 * than importing i18n, which is what keeps this file free of dependencies. */

/* ---- DOM ----------------------------------------------------------------
 * `el` exists so that no call site is ever tempted to reach for innerHTML.
 * Text always arrives through textContent; attributes always through
 * setAttribute. Note bodies, shortcut labels and imported Scene names are all
 * user-supplied, and this is the only door they come through. */

/**
 * A display cap on any single text node. Nothing in this interface has a
 * legitimate reason to draw more than this in one run, and a page title from
 * history or a name inside an imported Scene is not ours to trust.
 *
 * It is a *rendering* limit. Storage is never truncated by it — a note keeps
 * every character you typed whether or not a Scene chooses to draw them all.
 */
export const MAX_TEXT_NODE = 2000;

/**
 * The only function that writes text into an element.
 *
 * Assigning markup from user text appears nowhere in this codebase, and
 * tools/audit.mjs fails the build if it ever does. This is the sanctioned way.
 */
export function setText(element, text, { max = MAX_TEXT_NODE } = {}) {
  element.textContent = String(text).slice(0, max);
  return element;
}

/** A new element carrying nothing but text. */
export function createTextNode(tag, text, className) {
  const node = document.createElement(tag);
  setText(node, text);
  if (className) node.className = className;
  return node;
}

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;

    if (key === 'text') {
      setText(node, value);
    } else if (key === 'class') {
      node.className = value;
    } else if (key === 'dataset') {
      for (const [k, v] of Object.entries(value)) node.dataset[k] = v;
    } else if (key === 'style') {
      // Custom properties only, set through CSSOM. A literal style attribute
      // would be blocked by the extension CSP, and rightly so.
      for (const [k, v] of Object.entries(value)) node.style.setProperty(k, v);
    } else if (key === 'on') {
      for (const [type, fn] of Object.entries(value)) node.addEventListener(type, fn);
    } else {
      node.setAttribute(key, value === true ? '' : String(value));
    }
  }

  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }

  return node;
}

/** Replace a node's children without ever parsing markup. */
export function replaceChildren(node, children) {
  node.replaceChildren(...[].concat(children).filter(Boolean));
}

/** An inline SVG icon from the sprite sheet, by symbol id. */
export function icon(name, size = 16) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

/* ---- URLs --------------------------------------------------------------- */

/** Parse a URL without throwing. Returns null for the unparseable. */
export function safeURL(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * Is this something we are willing to navigate to?
 *
 * http and https only. `javascript:` is the attack this closes — a shortcut
 * label is user-supplied and an imported Scene comes from a stranger, and
 * either could otherwise carry a URL that executes when clicked. `data:` is
 * refused for the same reason, even though ours are the only ones we create.
 */
export function isSafeURL(url) {
  const parsed = safeURL(url);
  if (!parsed) return false;
  return parsed.protocol === 'https:' || parsed.protocol === 'http:';
}

/**
 * Open a URL in a new tab, or refuse loudly.
 *
 * Throwing rather than silently doing nothing is deliberate: a blocked URL is
 * either a bug in Lawha or something hostile in a Scene file, and both deserve
 * to show up in the console rather than read as a click that missed.
 */
export function navigate(url) {
  if (!isSafeURL(url)) throw new Error(`Lawha blocked an unsafe URL: ${url}`);
  return chrome.tabs.create({ url });
}

/** Bare hostname, www stripped. Empty string when there isn't one. */
export function domainOf(url) {
  const parsed = safeURL(url);
  if (!parsed) return '';
  return parsed.hostname.replace(/^www\./, '');
}

/**
 * chrome://favicon/ was removed in Manifest V3. The replacement is the
 * extension's own /_favicon/ endpoint, which Chrome serves out of the local
 * favicon cache — so this stays a zero-network lookup.
 * Requires the "favicon" permission.
 */
export function faviconURL(pageUrl, size = 32) {
  const u = new URL(chrome.runtime.getURL('/_favicon/'));
  u.searchParams.set('pageUrl', pageUrl);
  u.searchParams.set('size', String(size));
  return u.toString();
}

/**
 * Deterministic identity tile for a URL.
 *
 * chrome.tabs.captureVisibleTab only ever captures the tab that is currently
 * visible, never the background tabs a tile grid is made of. It also wants
 * broad host permissions and produces stale, heavy, privacy-sensitive images.
 * Hashing the domain instead gives every site a stable colour, which is what
 * spatial memory actually needs.
 */
export function identityTile(url) {
  const parsed = safeURL(url);
  const domain = parsed ? parsed.hostname.replace(/^www\./, '') : '';
  let hash = 0;
  for (let i = 0; i < domain.length; i++) hash = (hash * 31 + domain.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return {
    gradient: `linear-gradient(135deg, hsl(${hue} 32% 88%) 0%, hsl(${(hue + 28) % 360} 28% 80%) 100%)`,
    letter: (domain[0] || '?').toUpperCase(),
    domain,
  };
}

/**
 * A favicon, with the identity letter standing in when Chrome has no icon
 * cached for the site. Swapping the node rather than showing a broken image
 * keeps the row from reflowing.
 */
export function faviconImage(url, size = 16, { className = 'l-fav' } = {}) {
  const wrap = el('span', { class: className });
  wrap.style.setProperty('inline-size', `${size}px`);
  wrap.style.setProperty('block-size', `${size}px`);

  const img = el('img', {
    src: faviconURL(url, size <= 16 ? 16 : size <= 32 ? 32 : 64),
    alt: '',
    width: size,
    height: size,
    loading: 'lazy',
    decoding: 'async',
  });

  img.addEventListener('error', () => {
    const { letter } = identityTile(url);
    const fallback = el('span', { class: 'l-fav-letter', text: letter });
    fallback.style.setProperty('font-size', `${Math.round(size * 0.62)}px`);
    img.replaceWith(fallback);
  });

  wrap.append(img);
  return wrap;
}

/**
 * A copy-the-address button for a row that is itself a link.
 *
 * Right-click works on extension pages, but not everyone thinks to try it, and
 * on a row whose whole surface navigates there is otherwise no way to take the
 * URL without going to the page first. Sixteen pixels at the inline end,
 * invisible until the row is hovered or something in it has focus.
 *
 * Confirms in place with a tick for a second. No toast: a toast for a copy is
 * an interruption to tell you that the thing you just did worked.
 *
 * @param {string} url        what lands on the clipboard
 * @param {Function} t        translator, for the label
 * @param {Function} iconOf   icon factory (ctx.icon), so utils stays sprite-agnostic
 */
export function copyButton(url, t, iconOf) {
  const button = el('button', {
    class: 'l-copy',
    type: 'button',
    tabindex: '-1',
    'aria-label': t('action_copy'),
    title: t('action_copy'),
  });
  button.append(iconOf('copy'));

  button.addEventListener('click', async (event) => {
    // The row underneath is a link. This click is not for it.
    event.preventDefault();
    event.stopPropagation();

    try {
      await navigator.clipboard.writeText(url);
    } catch (error) {
      console.error('Lawha: clipboard write failed', error);
      return;
    }

    button.dataset.copied = 'true';
    button.setAttribute('aria-label', t('action_copied'));
    replaceChildren(button, [iconOf('check')]);

    clearTimeout(button.resetHandle);
    button.resetHandle = setTimeout(() => {
      delete button.dataset.copied;
      button.setAttribute('aria-label', t('action_copy'));
      replaceChildren(button, [iconOf('copy')]);
    }, 1000);
  });

  return button;
}

/* ---- Context menu -------------------------------------------------------
 * One implementation, shared by the shortcut grid and the tab list. Closes on
 * the next click, on Escape, and on scroll. Positioned with logical insets so
 * it opens toward the reading direction. */

let openMenu = null;

export function closeContextMenu() {
  if (!openMenu) return;
  openMenu.remove();
  openMenu = null;
}

/**
 * @param {MouseEvent} event  the contextmenu event, used for placement
 * @param {Array<{label: string, icon?: string, danger?: boolean, onSelect: Function}>} items
 */
export function contextMenu(event, items) {
  event.preventDefault();
  closeContextMenu();

  const menu = el('div', { class: 'l-menu', role: 'menu' });

  for (const item of items) {
    if (!item) continue;
    const button = el(
      'button',
      {
        class: `l-menu-item${item.danger ? ' l-menu-item-danger' : ''}`,
        type: 'button',
        role: 'menuitem',
        on: {
          click: () => {
            closeContextMenu();
            item.onSelect();
          },
        },
      },
      [item.icon ? icon(item.icon) : null, el('span', { text: item.label })]
    );
    menu.append(button);
  }

  document.body.append(menu);

  // A pointer has real coordinates, so placement starts physical — but it is
  // converted back to an inline-start inset before it touches the element, so
  // the menu opens away from the pointer whichever way the page reads and the
  // no-physical-properties rule still holds.
  const rect = menu.getBoundingClientRect();
  const rtl = document.documentElement.dir === 'rtl';
  const edge = rtl ? event.clientX - rect.width : event.clientX;
  const clamped = clamp(edge, 8, innerWidth - rect.width - 8);
  const startInset = rtl ? innerWidth - (clamped + rect.width) : clamped;

  menu.style.setProperty('inset-inline-start', `${startInset}px`);
  menu.style.setProperty(
    'inset-block-start',
    `${clamp(event.clientY, 8, innerHeight - rect.height - 8)}px`
  );

  openMenu = menu;

  const dismiss = (e) => {
    if (e.type === 'keydown' && e.key !== 'Escape') return;
    closeContextMenu();
    removeListeners();
  };
  const removeListeners = () => {
    document.removeEventListener('pointerdown', dismiss, true);
    document.removeEventListener('keydown', dismiss, true);
    window.removeEventListener('scroll', dismiss, true);
  };
  // Deferred so the click that opened the menu does not immediately close it.
  setTimeout(() => {
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('keydown', dismiss, true);
    window.addEventListener('scroll', dismiss, true);
  }, 0);

  menu.querySelector('button')?.focus();
  return menu;
}

/* ---- Colour ------------------------------------------------------------- */

/** #RGB or #RRGGBB to [r, g, b]. Returns null on anything else. */
export function hexToRgb(hex) {
  const value = String(hex).trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
  if (short) return short.slice(1, 4).map((c) => parseInt(c + c, 16));
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (long) return long.slice(1, 4).map((c) => parseInt(c, 16));
  return null;
}

/** WCAG 2.1 relative luminance, 0 (black) to 1 (white). */
export function luminance(hex) {
  const [r, g, b] = (hexToRgb(hex) || [0, 0, 0]).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 relative-luminance contrast ratio, 1 to 21. */
export function contrastRatio(hex1, hex2) {
  const [a, b] = [luminance(hex1), luminance(hex2)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

/** #RRGGBB to [hue 0-360, saturation 0-100, lightness 0-100]. */
export function hexToHSL(hex) {
  const [r, g, b] = (hexToRgb(hex) || [0, 0, 0]).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) return [0, 0, l * 100];

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;

  return [(h * 60 + 360) % 360, s * 100, l * 100];
}

export function hslToHex(h, s, l) {
  const sat = clamp(s, 0, 100) / 100;
  const light = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs((((h % 360) + 360) % 360) / 60 % 2 - 1));
  const m = light - c / 2;

  const hue = (((h % 360) + 360) % 360) / 60;
  const [r, g, b] =
    hue < 1 ? [c, x, 0] :
    hue < 2 ? [x, c, 0] :
    hue < 3 ? [0, c, x] :
    hue < 4 ? [0, x, c] :
    hue < 5 ? [x, 0, c] : [c, 0, x];

  const channel = (v) =>
    Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
}

/** Saturation alone, 0-100. Used to pick an accent out of a set of colours. */
export function saturation(hex) {
  return hexToHSL(hex)[1];
}

/** Mix two colours by weight — `amount` is how much of `a` survives. */
export function blend(a, b, amount) {
  const [ar, ag, ab] = hexToRgb(a) || [0, 0, 0];
  const [br, bg, bb] = hexToRgb(b) || [0, 0, 0];
  const mix = (x, y) => Math.round(x * amount + y * (1 - amount));
  const channel = (v) => v.toString(16).padStart(2, '0');
  return `#${channel(mix(ar, br))}${channel(mix(ag, bg))}${channel(mix(ab, bb))}`.toUpperCase();
}

/** "20 22 26" — the space-separated triple --shadow-color wants. */
export function hexToRGBTriple(hex) {
  return (hexToRgb(hex) || [0, 0, 0]).join(' ');
}

/**
 * Keep text readable against its background.
 *
 * A warning badge tells someone their text has become invisible. It does not
 * give them the text back. Below 3.0:1 — the point where text stops being
 * merely non-compliant and starts being genuinely unreadable — the colour is
 * walked toward whichever end of the luminance scale is further from the
 * background, in 3% lightness steps, until it clears 4.5:1.
 *
 * Hue and saturation are preserved, so the correction reads as the same colour
 * adjusted rather than a different colour substituted.
 *
 * @returns {{hex: string, corrected: boolean, ratio: number}}
 */
export function ensureReadable(textHex, bgHex, { floor = 3.0, target = 4.5 } = {}) {
  let ratio = contrastRatio(textHex, bgHex);
  if (ratio >= floor) return { hex: textHex, corrected: false, ratio };

  const isDarkBg = luminance(bgHex) < 0.18;
  const step = isDarkBg ? 3 : -3;

  let [h, s, l] = hexToHSL(textHex);
  let corrected = textHex;

  for (let attempts = 0; ratio < target && attempts < 34; attempts += 1) {
    const next = clamp(l + step, 0, 100);
    // Walked as far as the scale goes; take what we have.
    if (next === l) break;
    l = next;
    corrected = hslToHex(h, s, l);
    ratio = contrastRatio(corrected, bgHex);
  }

  return { hex: corrected, corrected: true, ratio };
}

/* ---- Time --------------------------------------------------------------- */

/**
 * Compact relative time for metadata columns: "now", "5m", "3h", "2d".
 * Both the unit strings and the digit shaping are injected so this stays pure
 * and the caller decides language and numerals.
 */
export function relativeTime(timestamp, t, digits = (s) => s) {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return t('time_now');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return digits(String(minutes)) + t('time_m');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return digits(String(hours)) + t('time_h');
  const days = Math.floor(hours / 24);
  return digits(String(days)) + t('time_d');
}

/** Fraction of the day elapsed, 0 at 00:00 and approaching 1 at 23:59. */
export function dayProgress(date = new Date()) {
  return (date.getHours() * 60 + date.getMinutes()) / 1440;
}

/** Greeting band for the hour. */
export function greetingKey(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return 'greet_dawn';
  if (h < 12) return 'greet_morning';
  if (h < 17) return 'greet_afternoon';
  if (h < 22) return 'greet_evening';
  return 'greet_night';
}

/* ---- Keyboard cheatsheet ------------------------------------------------
 * Every keyboard-driven tool is asked "what are all the shortcuts?" within a
 * week of shipping. The answer belongs in the product, one keystroke away, not
 * in a store listing nobody re-reads.
 *
 * A <dialog> rather than a div: Escape-to-close, the focus trap and the inert
 * backdrop all come free and correct, and the rows are logical-property laid
 * out so the whole thing mirrors in Arabic without a second stylesheet. */

/** Rows are [keys, string key]. Keys are literal — "Ctrl" and "Esc" are not
 *  translated on an Arabic keyboard either. */
const SHORTCUT_ROWS = [
  ['Ctrl+K', 'action_search'],
  ['/', 'action_search'],
  ['Ctrl+Shift+P', 'cmd_palette_global'],
  ['Ctrl+Shift+L', 'help_sidebar'],
  ['Ctrl+Shift+S', 'action_save'],
  ['Ctrl+Shift+F', 'set_focus'],
  ['A–Z', 'help_filter'],
  ['?', 'help_this'],
  ['Esc', 'action_close'],
];

const IS_MAC = /mac/i.test(navigator.userAgentData?.platform ?? navigator.platform ?? '');

/** Chrome shows ⌘ in its own shortcut list on macOS; so do we. */
function shapeKeys(keys) {
  return IS_MAC ? keys.replace('Ctrl', '⌘').replace('Shift', '⇧') : keys;
}

let helpDialog = null;

export function closeShortcutOverlay() {
  helpDialog?.close();
}

/**
 * Show or hide the cheatsheet.
 * @param {Function} t translator
 */
export function toggleShortcutOverlay(t) {
  if (helpDialog?.open) {
    helpDialog.close();
    return null;
  }

  const rows = SHORTCUT_ROWS.map(([keys, labelKey]) =>
    el('div', { class: 'help-row' }, [
      el('kbd', { class: 'help-keys', text: shapeKeys(keys) }),
      el('span', { class: 'help-label', text: t(labelKey) }),
    ])
  );

  helpDialog = el('dialog', { class: 'l-dialog help-overlay', 'aria-label': t('help_title') }, [
    el('h2', { class: 'help-title', text: t('help_title') }),
    el('div', { class: 'help-rows' }, rows),
  ]);

  // Pressing ? a second time closes it, which is what a toggle means. Escape is
  // handled by <dialog> itself.
  helpDialog.addEventListener('keydown', (event) => {
    if (event.key === '?') {
      event.preventDefault();
      helpDialog.close();
    }
  });

  // Clicking the backdrop — anywhere outside the panel — dismisses it.
  helpDialog.addEventListener('click', (event) => {
    if (event.target === helpDialog) helpDialog.close();
  });

  helpDialog.addEventListener('close', () => {
    helpDialog?.remove();
    helpDialog = null;
  });

  document.body.append(helpDialog);
  helpDialog.showModal();
  return helpDialog;
}

/* ---- Misc --------------------------------------------------------------- */

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function debounce(fn, ms = 120) {
  let handle;
  return (...args) => {
    clearTimeout(handle);
    handle = setTimeout(() => fn(...args), ms);
  };
}

/** Stable id for locally created records. */
export function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Remove duplicates by a derived key, keeping first occurrence. */
export function dedupeBy(items, keyOf) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
