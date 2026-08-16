/**
 * storage.js
 * The only door to chrome.storage, and the place the data-preservation contract is enforced.
 */

/* Lawha — storage, and the data-preservation contract enforced in code.
 *
 * THE CONTRACT
 *   Switching Scenes changes only how data renders. It never reads, writes,
 *   migrates, or deletes user data.
 *
 * This file makes that structural rather than something to remember. There are
 * two namespaces and they never touch:
 *
 *   DATA_KEYS   owned by the person. Rendering may read them; nothing in the
 *               presentation path may write them. A write attempted while a
 *               Scene is rendering throws DataGuardError.
 *   SCENE_KEYS  owned by the Scene. Freely overwritten.
 *
 * setData() is the only door to user data, and it is bolted shut for the whole
 * duration of applyScene(). An imported Scene is inert JSON with no code path
 * to reach it, so a hostile Scene cannot delete your notes even if it tries. */

/** User data. Owned by the person. Scenes may only read.
 *
 *  `lastSession` sits here with `tabLastAccessed` for the same reason: it is a
 *  record of what the person had open, written only from a real browser event
 *  in the service worker, and no Scene has any business touching it. */
export const DATA_KEYS = [
  'shortcuts',
  'notes',
  'later',
  'tabLastAccessed',
  'wallpaper',
  'lastSession',
];

/** Presentation. Owned by the Scene. Freely overwritten. */
export const SCENE_KEYS = ['activeScene', 'customScenes', 'density', 'gradient'];

/** Preferences. Presentation too, but chosen by the person rather than the
 *  Scene, so they survive a Scene switch. */
export const PREF_KEYS = [
  'palette',
  'language',
  'numerals',
  'background',
  'sectionLabels',
  'focusMode',
  'sidebarOpen',
  'onboardingComplete',
  // The palette Istikhraj derived from the current wallpaper. Presentation
  // derived from user data, not user data itself — it is regenerated from the
  // image whenever the image changes, and losing it costs nothing.
  'imageExtractedPalette',
  'extractPalette',
  // How much --bg-canvas sits between a photograph and the text on top of it.
  'bgScrim',
  // The tab count on the toolbar icon. Off unless asked for — a number that
  // changes every time you open a tab is exactly the kind of restlessness the
  // rest of this product is arranged to avoid.
  'badgeCount',
];

/* Whether the restore-your-tabs strip has already been offered lives in
 * chrome.storage.session rather than here. "Once per browser session" is
 * exactly what that area means — it empties itself when the browser closes —
 * and a local key would have needed clearing on startup, which races the very
 * new tab it is meant to inform. See newtab.js. */

/**
 * Length caps on everything a person can type.
 *
 * Enforced twice: on the field, so the limit is visible while typing, and here
 * on the way to storage, so a value that arrives by any other route — an
 * imported Scene, a message, a future call site — is cut to the same size.
 */
export const LIMITS = {
  shortcutLabel: 40,
  noteBody: 2000,
  sceneName: 40,
  sceneAuthor: 60,
  sceneTag: 20,
  sceneTags: 8,
  laterTitle: 80,
  // A reading queue past fifty is not a queue, it is a graveyard. The newest
  // are kept: the thing you saved this morning is the thing you meant.
  laterItems: 50,
};

/** Trim a user-supplied string to its cap. */
export function capped(value, limit) {
  return String(value ?? '').slice(0, limit);
}

/** Which storage area each key lives in. Preferences are small and belong on
 *  every device the person uses; anything holding user content stays local,
 *  both for the 8 KB/item sync limit and because it is nobody else's business. */
const AREA = {
  activeScene: 'sync',
  palette: 'sync',
  language: 'sync',
  numerals: 'sync',
  background: 'sync',
  density: 'sync',
  sectionLabels: 'sync',
  focusMode: 'sync',
  sidebarOpen: 'sync',
  extractPalette: 'sync',
  badgeCount: 'sync',

  onboardingComplete: 'local',
  imageExtractedPalette: 'local',
  bgScrim: 'local',
  lastSession: 'local',
  shortcuts: 'local',
  notes: 'local',
  later: 'local',
  customScenes: 'local',
  gradient: 'local',
  wallpaper: 'local',
  tabLastAccessed: 'local',
};

export const DEFAULTS = {
  activeScene: 'diwan',
  palette: null, // null = whatever the Scene asks for
  language: null, // null = detect from the browser UI language on first run
  numerals: 'latin',
  background: 'theme',
  density: null, // null = whatever the Scene asks for
  sectionLabels: null, // null = whatever the Scene asks for
  focusMode: false,
  sidebarOpen: false,
  onboardingComplete: false,
  // Istikhraj: derive the palette from the background image. On by default,
  // because an image the UI does not match is the worse of the two defaults.
  extractPalette: true,
  imageExtractedPalette: null,
  // 20% of --bg-canvas over a photograph: enough to read against, little
  // enough that the picture is still the picture.
  bgScrim: 20,
  badgeCount: false,

  shortcuts: [],
  notes: [],
  later: [],
  customScenes: [],
  gradient: { colors: ['#FBFAF7', '#D6E8E4'], angle: 135 },
  wallpaper: null,
  tabLastAccessed: {},
  lastSession: [],
};

export class DataGuardError extends Error {
  constructor(key) {
    super(
      `Lawha data guard: refused to write "${key}" while a Scene is rendering. ` +
        `Scenes change how data looks, never what it is.`
    );
    this.name = 'DataGuardError';
    this.key = key;
  }
}

/* ---- The lock -----------------------------------------------------------
 * Held for the duration of applyScene(). Re-entrant, because rendering a
 * region may render nested modules. */

let presentationDepth = 0;

export function beginPresentation() {
  presentationDepth += 1;
}

export function endPresentation() {
  presentationDepth = Math.max(0, presentationDepth - 1);
}

export function isRenderingScene() {
  return presentationDepth > 0;
}

/**
 * Throws if any of `keys` is user data. Called at the top of applyScene with
 * the keys that call is allowed to touch, so the guarantee is asserted rather
 * than assumed.
 */
export function assertNoDataWrites(keys) {
  for (const key of [].concat(keys)) {
    if (DATA_KEYS.includes(key)) throw new DataGuardError(key);
  }
  return true;
}

/* ---- Reads --------------------------------------------------------------
 * Reading is always allowed, from anywhere, including mid-render. That is the
 * whole point: a Scene renders your data, it just cannot change it. */

export async function get(key) {
  const area = AREA[key];
  if (!area) throw new Error(`Unknown storage key: ${key}`);
  const result = await chrome.storage[area].get(key);
  return key in result ? result[key] : structuredCloneSafe(DEFAULTS[key]);
}

export async function getMany(keys) {
  const bySync = keys.filter((k) => AREA[k] === 'sync');
  const byLocal = keys.filter((k) => AREA[k] === 'local');
  const unknown = keys.find((k) => !AREA[k]);
  if (unknown) throw new Error(`Unknown storage key: ${unknown}`);

  const [sync, local] = await Promise.all([
    bySync.length ? chrome.storage.sync.get(bySync) : {},
    byLocal.length ? chrome.storage.local.get(byLocal) : {},
  ]);

  const merged = { ...sync, ...local };
  const out = {};
  for (const key of keys) {
    out[key] = key in merged ? merged[key] : structuredCloneSafe(DEFAULTS[key]);
  }
  return out;
}

/* ---- Writes ------------------------------------------------------------- */

/**
 * Write user data. Only ever called from a deliberate user action — adding a
 * note, dropping a shortcut, saving a page for later. Never from a renderer.
 */
export async function setData(key, value) {
  if (!DATA_KEYS.includes(key)) {
    throw new Error(`setData refuses "${key}": not user data. Use setPresentation.`);
  }
  if (isRenderingScene()) throw new DataGuardError(key);
  await chrome.storage[AREA[key]].set({ [key]: value });
  return value;
}

/** Write presentation state: which Scene is active, palette, density, and so on. */
export async function setPresentation(key, value) {
  if (DATA_KEYS.includes(key)) throw new DataGuardError(key);
  if (!SCENE_KEYS.includes(key) && !PREF_KEYS.includes(key)) {
    throw new Error(`setPresentation refuses "${key}": not a presentation key.`);
  }
  await chrome.storage[AREA[key]].set({ [key]: value });
  return value;
}

/** Several presentation keys at once, so the popup can apply a Scene switch
 *  in a single storage round-trip. */
export async function setPresentationMany(entries) {
  const keys = Object.keys(entries);
  assertNoDataWrites(keys);
  const sync = {};
  const local = {};
  for (const [key, value] of Object.entries(entries)) {
    if (!SCENE_KEYS.includes(key) && !PREF_KEYS.includes(key)) {
      throw new Error(`setPresentation refuses "${key}": not a presentation key.`);
    }
    (AREA[key] === 'sync' ? sync : local)[key] = value;
  }
  await Promise.all([
    Object.keys(sync).length ? chrome.storage.sync.set(sync) : null,
    Object.keys(local).length ? chrome.storage.local.set(local) : null,
  ]);
}

/** Read-modify-write on a user-data list. Guarded like any other data write. */
export async function updateData(key, mutate) {
  const current = await get(key);
  const next = mutate(current);
  return setData(key, next);
}

/* ---- Change notification ------------------------------------------------ */

/** Subscribe to storage changes across both areas. Returns an unsubscribe fn. */
export function onChanged(handler) {
  const listener = (changes, areaName) => handler(changes, areaName);
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

function structuredCloneSafe(value) {
  if (value === null || typeof value !== 'object') return value;
  return structuredClone(value);
}
