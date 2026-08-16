/**
 * newtab.js
 * The new tab: builds the render context, turns a Scene into DOM, and keeps it in step with storage.
 */

/* Lawha — the new tab.
 *
 * This file does three things: it builds the render context every module
 * shares, it turns a Scene's regions into DOM, and it keeps that DOM in step
 * with storage. It deliberately knows nothing about how any individual module
 * looks — that is the module's business, and it is why adding a variant never
 * touches this file.
 *
 * Note where the writes are. renderRegions only ever reads. Every write in the
 * whole render path is a module responding to a click, which happens long
 * after applyScene has released the presentation lock. */

import {
  applyScene,
  applySceneObject,
  normalizeScene,
  getScene,
  listScenes,
  BUILTIN_SCENE_IDS,
} from '../shared/scenes.js';
import { applyBackground } from '../shared/background.js';
import {
  initI18n,
  t,
  fmtNum,
  formatTime,
  formatDate,
  onLanguageChange,
  setLanguage,
  setNumerals,
} from '../shared/i18n.js';
import { mountIconSprite } from '../shared/icons.js';
import {
  icon,
  el,
  replaceChildren,
  toggleShortcutOverlay,
  isSafeURL,
} from '../shared/utils.js';
import { get, getMany, onChanged, setPresentation, DATA_KEYS } from '../shared/storage.js';
import { openPalette, bindPaletteShortcut } from '../shared/palette.js';
import { onMessage } from '../shared/messaging.js';
import { MODULES, NEWTAB_MODULE_IDS } from '../shared/modules.js';

import * as clock from '../modules/clock.js';
import * as waqt from '../modules/waqt.js';
import * as shortcuts from '../modules/shortcuts.js';
import * as recent from '../modules/recent.js';
import * as bookmarks from '../modules/bookmarks.js';
import * as notes from '../modules/notes.js';
import * as later from '../modules/later.js';
import * as search from '../modules/search.js';

const RENDERERS = { clock, waqt, shortcuts, recent, bookmarks, notes, later, search };

const sceneRoot = document.getElementById('scene');
const announcer = document.getElementById('announcer');
const bannerSlot = document.getElementById('banner');

/* ---- Per-module lifecycle ------------------------------------------------
 * Every timer and listener a module sets up is filed under that module's id,
 * so refreshing one module tears down exactly its own work and nothing else's. */

const cleanups = new Map();

function registerCleanup(moduleId, fn) {
  if (!cleanups.has(moduleId)) cleanups.set(moduleId, new Set());
  cleanups.get(moduleId).add(fn);
}

function disposeModule(moduleId) {
  for (const fn of cleanups.get(moduleId) ?? []) fn();
  cleanups.delete(moduleId);
}

function disposeAll() {
  for (const moduleId of [...cleanups.keys()]) disposeModule(moduleId);
}

/** Ticks aligned to the wall clock, so the minute changes when the minute
 *  changes rather than a fraction of a second later. */
function scheduleAligned(moduleId, intervalMs, fn) {
  let handle;
  const loop = () => {
    fn();
    handle = setTimeout(loop, intervalMs - (Date.now() % intervalMs));
  };
  handle = setTimeout(loop, intervalMs - (Date.now() % intervalMs));
  registerCleanup(moduleId, () => clearTimeout(handle));
}

const SECOND_MS = 1000;
const MINUTE_MS = 60_000;

/* ---- The render context ------------------------------------------------- */

const ctx = {
  t,
  fmtNum,
  formatTime,
  formatDate,
  icon,
  openPalette,

  announce(message) {
    announcer.textContent = message;
  },

  /**
   * Wrap a module's body in a labelled section. `sectionLabels` is a Scene
   * setting handled entirely in CSS — the label is always in the DOM so screen
   * readers keep the structure even when the Scene hides it visually.
   */
  section(labelKey, body, { module: moduleId, count } = {}) {
    const heading = el('h2', { class: 'l-label' }, [t(labelKey)]);
    if (typeof count === 'number' && count > 0) {
      heading.append(el('span', { class: 'l-label-count', text: fmtNum(count) }));
    }
    return el('section', { class: 'l-module', dataset: { module: moduleId } }, [heading, body]);
  },

  /** Re-render a single module in place, keeping the rest of the page still. */
  async refresh(moduleId) {
    const mount = sceneRoot.querySelector(`[data-slot="${moduleId}"]`);
    if (!mount || !currentScene) return;
    disposeModule(moduleId);
    const node = await renderModule(moduleId, currentScene.modules[moduleId]);
    replaceChildren(mount, node ? [node] : []);
  },
};

/* ---- Rendering ---------------------------------------------------------- */

let currentScene = null;

/**
 * The context a module renders against.
 *
 * Bound per module rather than shared, because regions build concurrently: an
 * ambient "currently rendering" variable would be clobbered across awaits and
 * file the clock's timer under whichever module happened to resume last, so
 * refreshing one module would leave another's timer running.
 */
function moduleContext(moduleId) {
  return {
    ...ctx,
    onCleanup: (fn) => registerCleanup(moduleId, fn),
    everySecond: (fn) => scheduleAligned(moduleId, SECOND_MS, fn),
    everyMinute: (fn) => scheduleAligned(moduleId, MINUTE_MS, fn),
  };
}

async function renderModule(moduleId, cfg) {
  const renderer = RENDERERS[moduleId];
  if (!renderer || !cfg || cfg.variant === 'off') return null;

  try {
    return await renderer.render(cfg, moduleContext(moduleId));
  } catch (error) {
    // One module failing should cost you that module, not the page.
    console.error(`Lawha: ${moduleId} failed to render`, error);
    return null;
  }
}

const ALIGN = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' };

/**
 * Turn regions into DOM. Reads user data through the module renderers; writes
 * nothing. Called with the presentation lock held, so that is enforced rather
 * than promised.
 */
async function renderRegions(regions, modules) {
  disposeAll();

  // Regions are independent of each other, so they build at the same time.
  // Within a region the modules build one after another, in the order the Scene
  // lists them: a column is read top to bottom, and rendering it in that order
  // means the work happens in the order the eye will arrive, rather than in
  // whatever order the histories and bookmarks happen to come back.
  //
  // Promise.all preserves the order of its input, so the regions still land in
  // the order the Scene declared regardless of which finished first.
  const built = await Promise.all(
    Object.entries(regions).map(async ([name, region]) => {
      const node = el('div', {
        class: 'l-region',
        dataset: { region: name, align: region.align },
      });
      // Region names are validated against /^[a-z][a-z0-9-]*$/ before they
      // reach here, and this is CSSOM rather than a stylesheet, so there is
      // nothing to inject into.
      node.style.setProperty('grid-area', name);
      node.style.setProperty('align-items', ALIGN[region.align] ?? 'stretch');

      for (const moduleId of region.modules) {
        if (!NEWTAB_MODULE_IDS.includes(moduleId)) continue;

        // Each module keeps its own slot so ctx.refresh can swap one without
        // disturbing its neighbours.
        const slot = el('div', { class: 'l-slot', dataset: { slot: moduleId } });
        node.append(slot);

        const rendered = await renderModule(moduleId, modules[moduleId]);
        if (rendered) slot.append(rendered);
        else slot.remove();
      }

      return node;
    })
  );

  // One swap, so the page never shows a half-built Scene.
  replaceChildren(
    sceneRoot,
    built.filter((node) => node.children.length)
  );
}

/* ---- Boot --------------------------------------------------------------- */

async function paintBackground() {
  const { background, gradient, wallpaper, bgScrim } = await getMany([
    'background',
    'gradient',
    'wallpaper',
    'bgScrim',
  ]);
  applyBackground({ background, gradient, wallpaper, scrim: bgScrim });
}

async function applyFocusMode() {
  const focus = await get('focusMode');
  document.documentElement.dataset.focus = focus ? 'on' : 'off';
}

/**
 * A fingerprint of everything about a Scene that affects what gets drawn.
 *
 * Watching the `activeScene` id alone is not enough: editing a custom Scene
 * changes its content while its id stays put, and two Scenes can share an id
 * once imported files are in the mix. Comparing the resolved object means a
 * redraw happens when the Scene is genuinely different and not otherwise.
 */
function sceneHash(scene) {
  return JSON.stringify([scene.meta.id, scene.palette, scene.grid, scene.regions, scene.modules, scene.density, scene.sectionLabels]);
}

let lastSceneHash = null;

async function draw({ force = false } = {}) {
  const sceneId = await get('activeScene');
  const scene = await getScene(sceneId);
  const hash = sceneHash(scene);

  if (!force && hash === lastSceneHash) return;

  lastSceneHash = hash;
  currentScene = await applyScene(sceneId, { renderRegions });
}

/**
 * Preview mode. The builder embeds this same page in an iframe and posts it a
 * draft Scene; rendering it here rather than reimplementing a miniature is the
 * only way "the preview matches the applied result" can be true rather than
 * merely intended. Nothing is persisted and nothing is clickable.
 */
async function bootPreview() {
  mountIconSprite();
  await initI18n();
  document.documentElement.dataset.preview = 'on';
  // The background is a preference rather than part of the Scene, but it is
  // part of what the page looks like, so the preview wears it too.
  await paintBackground();

  window.addEventListener('message', async (event) => {
    if (event.origin !== location.origin) return;
    if (event.data?.type !== 'lawha:preview') return;
    const scene = normalizeScene(event.data.scene);
    currentScene = await applySceneObject(scene, { renderRegions });
    // Acked so a caller can await the paint instead of guessing at a delay.
    parent.postMessage({ type: 'lawha:preview-painted', scene: scene.meta.id }, location.origin);
  });

  // Tell the builder we are ready for the first draft.
  parent.postMessage({ type: 'lawha:preview-ready' }, location.origin);
}

async function boot() {
  if (new URLSearchParams(location.search).get('preview') === '1') {
    await bootPreview();
    return;
  }

  mountIconSprite();
  await initI18n();

  await Promise.all([paintBackground(), applyFocusMode()]);
  await draw();

  bindPaletteShortcut(document);

  // Re-render on a language switch: strings are baked into nodes at render
  // time rather than re-read on every paint, which keeps the modules simple.
  onLanguageChange(() => {
    if (currentScene) renderRegions(currentScene.regions, currentScene.modules);
  });

  wireStorage();
  wireShortcutKeys();
  watchForFooter();
  await wirePaletteRequests();

  // Last, and never blocking the paint: the page is already drawn and usable by
  // the time either of these decides whether it has anything to say. First run
  // takes precedence — being asked where to start and offered yesterday's tabs
  // in the same breath would be two conversations at once.
  if (await get('onboardingComplete')) {
    offerSessionRestore().catch((error) =>
      console.error('Lawha: session restore check failed', error)
    );
  } else {
    runOnboarding().catch((error) => console.error('Lawha: onboarding failed', error));
  }
}

/**
 * Chrome's new tab footer, if it ever appears inside our document.
 *
 * On current builds the "Customize Chrome" bar is painted by the browser
 * outside the page, where no extension can touch it — the real switch is
 * chrome://flags/#ntp-footer, which the README points at. This observer costs
 * one callback and handles the case where Chrome injects it into the DOM
 * instead, which is what earlier versions did.
 */
function watchForFooter() {
  const strip = () => {
    for (const node of document.querySelectorAll('#ntp-footer, ntp-app, [slot="footer"]')) {
      node.remove();
    }
  };
  strip();
  new MutationObserver(strip).observe(document.body, { childList: true, subtree: true });
}

/* Ctrl+K pressed somewhere Lawha cannot draw — an ordinary web page — arrives
   here instead, either as a message to a visible new tab or as a flag on a tab
   the service worker opened for the purpose. */
async function wirePaletteRequests() {
  onMessage((message, _sender, sendResponse) => {
    if (message.type !== 'lawha:open-palette') return false;
    if (document.visibilityState !== 'visible') return false;
    openPalette('');
    sendResponse({ handled: true });
    return false;
  });

  const { pendingPalette } = await chrome.storage.session.get('pendingPalette');
  if (pendingPalette) {
    await chrome.storage.session.remove('pendingPalette');
    openPalette('');
  }
}

/* ---- First run ----------------------------------------------------------
 * One question, asked once: where would you like to start?
 *
 * The panel is small and its backdrop is translucent, so the page is visible
 * behind it — and choosing a name redraws that page underneath while you watch.
 * That is the entire explanation of what a Scene is, given by demonstration
 * rather than by a paragraph nobody reads. It is also the reason this is not a
 * tour: there is nothing to tour, and the product's whole argument is that the
 * canvas should be in front of you rather than described to you.
 *
 * Nothing is written until you choose. Dismissing without picking leaves you on
 * Diwan, which is where you would have been anyway. */

async function runOnboarding() {
  if (await get('onboardingComplete')) return;

  const scenes = (await listScenes()).filter((scene) =>
    BUILTIN_SCENE_IDS.includes(scene.meta.id)
  );
  if (!scenes.length) return;

  const active = await get('activeScene');

  const finish = async () => {
    await setPresentation('onboardingComplete', true);
    dialog.close();
  };

  const cards = scenes.map((scene) => {
    const { id, name, nameAr } = scene.meta;
    const card = el('button', {
      class: 'onboard-scene',
      type: 'button',
      'aria-pressed': String(id === active),
      dataset: { scene: id },
      on: {
        click: async () => {
          // The redraw happens through the ordinary storage path, so what you
          // are shown here is exactly what you will get afterwards.
          await setPresentation('activeScene', id);
          for (const other of dialog.querySelectorAll('.onboard-scene')) {
            other.setAttribute('aria-pressed', String(other.dataset.scene === id));
          }
        },
      },
    });
    // Both scripts, always. The name of a Scene is not a translation of itself.
    card.append(
      el('span', { class: 'onboard-scene-ar', text: nameAr || name }),
      el('span', { class: 'onboard-scene-en', text: name })
    );
    return card;
  });

  const dialog = el('dialog', { class: 'l-dialog onboard', 'aria-label': t('onboard_welcome') }, [
    el('h2', { class: 'onboard-title', text: t('onboard_welcome') }),
    el('div', { class: 'onboard-scenes' }, cards),
    el('button', {
      class: 'l-btn l-btn-primary onboard-go',
      type: 'button',
      text: t('onboard_go'),
      on: { click: finish },
    }),
  ]);

  // Closing by any route — the button, Escape, the backdrop — counts as done.
  // Being asked this twice would be worse than never being asked at all.
  dialog.addEventListener('close', () => {
    dialog.remove();
    setPresentation('onboardingComplete', true).catch((error) =>
      console.error('Lawha: could not record onboarding', error)
    );
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  document.body.append(dialog);
  dialog.showModal();
}

/* ---- Session restore ----------------------------------------------------
 * The morning after a crash, the browser opens with one empty tab and no clue
 * that yesterday existed. The service worker keeps a snapshot; this offers it
 * back, once, and then never mentions it again.
 *
 * Deliberately not a session manager. No naming, no history of sessions, no
 * management screen — that is a different product, and building the first
 * inch of it here would be the beginning of the end of a calm new tab. */

async function offerSessionRestore() {
  const [lastSession, { sessionRestoreOffered }, openTabs] = await Promise.all([
    get('lastSession'),
    // Session storage, not local: "once per browser session" is precisely what
    // that area means, and it empties itself when the browser closes. A local
    // flag would have to be cleared on startup, which races the very new tab
    // the clearing is meant to inform — and losing that race means the strip
    // never appears on exactly the morning it exists for.
    chrome.storage.session.get('sessionRestoreOffered'),
    chrome.tabs.query({ currentWindow: true }),
  ]);

  if (sessionRestoreOffered) return;
  // Two or more, because a snapshot that has dwindled to a single tab is the
  // tail of a browser shutting down rather than a session worth restoring.
  if (!Array.isArray(lastSession) || lastSession.length < 2) return;
  // Anything more than this new tab and the session is plainly not lost.
  if (openTabs.length > 1) return;

  const restorable = lastSession.filter((entry) => isSafeURL(entry?.url));
  if (restorable.length < 2) return;

  const dismiss = async () => {
    strip.remove();
    await chrome.storage.session.set({ sessionRestoreOffered: true });
  };

  const message =
    restorable.length === 1
      ? t('session_restore_one')
      : t('session_restore_many', fmtNum(restorable.length));

  const strip = el('div', { class: 'restore', role: 'status' }, [
    icon('restore'),
    el('span', { class: 'restore-text', text: message }),
    el('button', {
      class: 'l-btn l-btn-primary restore-go',
      type: 'button',
      text: t('action_restore'),
      on: {
        click: async () => {
          // Marked offered before the tabs open, so a restore that is
          // interrupted halfway does not ask again on the next new tab.
          await chrome.storage.session.set({ sessionRestoreOffered: true });
          for (const entry of restorable) {
            chrome.tabs
              .create({ url: entry.url, active: false })
              .catch((error) => console.error('Lawha: could not reopen', entry.url, error));
          }
          strip.remove();
        },
      },
    }),
    el('button', {
      class: 'l-icon-btn restore-dismiss',
      type: 'button',
      'aria-label': t('action_dismiss'),
      on: { click: dismiss },
    }),
  ]);

  strip.querySelector('.restore-dismiss').append(icon('close'));
  replaceChildren(bannerSlot, [strip]);
}

/* ---- Staying in step ----------------------------------------------------
 * The popup and the side panel write to the same storage this page reads, so
 * a change made there lands here without either side knowing about the other. */

const PRESENTATION_WATCH = [
  'activeScene',
  // Editing a custom Scene rewrites this without touching `activeScene`, so
  // without it a Scene edited in the gallery would not reach an open new tab.
  'customScenes',
  'palette',
  'density',
  'sectionLabels',
];

/**
 * applyScene finishes by writing `activeScene`, which comes straight back here
 * as a storage change. Chrome fires onChanged for a set even when the value is
 * identical, so without this the page would redraw itself forever. A change
 * that changes nothing is not a change.
 */
function reallyChanged(entry) {
  return JSON.stringify(entry.oldValue) !== JSON.stringify(entry.newValue);
}

function wireStorage() {
  onChanged(async (rawChanges) => {
    const changes = Object.fromEntries(
      Object.entries(rawChanges).filter(([, entry]) => reallyChanged(entry))
    );
    const keys = Object.keys(changes);
    if (!keys.length) return;

    if (keys.some((key) => PRESENTATION_WATCH.includes(key))) {
      // Preference overrides sit on top of the Scene rather than inside it, so
      // they change how it looks without changing its fingerprint. Those have
      // to bypass the hash guard.
      const overrideChanged = keys.some((key) =>
        ['palette', 'density', 'sectionLabels'].includes(key)
      );
      await draw({ force: overrideChanged });
      return;
    }

    if (keys.some((key) => ['background', 'gradient', 'wallpaper', 'bgScrim'].includes(key))) {
      await paintBackground();
    }

    if (changes.focusMode) await applyFocusMode();

    if (changes.language) await setLanguage(changes.language.newValue, { persist: false });
    if (changes.numerals) await setNumerals(changes.numerals.newValue, { persist: false });

    // A data change from another surface should refresh the module that shows
    // it — unless you are currently typing in that module, in which case
    // rebuilding it under your caret would be worse than a stale count.
    for (const key of keys) {
      if (!DATA_KEYS.includes(key)) continue;
      const moduleId = MODULE_FOR_DATA[key];
      if (!moduleId || !MODULES[moduleId]) continue;
      const mount = sceneRoot.querySelector(`[data-slot="${moduleId}"]`);
      if (mount?.contains(document.activeElement)) continue;
      await ctx.refresh(moduleId);
    }
  });
}

const MODULE_FOR_DATA = {
  shortcuts: 'shortcuts',
  notes: 'notes',
  later: 'later',
};

function wireShortcutKeys() {
  document.addEventListener('keydown', (event) => {
    // Don't hijack a keystroke meant for a field.
    const target = event.target;
    const typing =
      target instanceof HTMLElement &&
      (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

    if (typing || event.ctrlKey || event.metaKey || event.altKey) return;

    // Escape leaves focus mode. The shortcut that turned it on is the other way
    // out, but Escape is the key you reach for when you want out of something,
    // and a mode with only one exit is a mode people get stuck in.
    if (event.key === 'Escape' && document.documentElement.dataset.focus === 'on') {
      event.preventDefault();
      setPresentation('focusMode', false).catch((error) =>
        console.error('Lawha: could not leave focus mode', error)
      );
      return;
    }

    if (event.key === '/') {
      event.preventDefault();
      openPalette('');
      return;
    }

    // Shift+/ on a Latin layout, and the Arabic question mark on an Arabic one.
    if (event.key === '?' || event.key === '؟') {
      event.preventDefault();
      toggleShortcutOverlay(t);
    }
  });
}

boot();
