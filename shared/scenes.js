/**
 * scenes.js
 * Scenes: schema, validation, migration, palette harmonisation, and applying one to the document.
 */

/* Lawha — the Scene engine.
 *
 * A Scene is palette + grid + one display variant per module. Applying one
 * rewrites how the page looks and nothing else: see the assertNoDataWrites
 * call in applyScene, and the presentation lock it holds while rendering.
 *
 * Scenes arrive from three places — the five bundled JSON files, the user's
 * own saved Scenes, and files other people send them. The third case is why
 * validateScene is as strict as it is: an imported Scene is data that gets fed
 * into CSS, so every value that reaches a stylesheet is checked against a
 * whitelist first. A Scene has no code in it and no write path to user data. */

import { MODULES, resolveModuleConfig, isKnownVariant } from './modules.js';
import { ensureReadable, contrastRatio } from './utils.js';
import {
  assertNoDataWrites,
  beginPresentation,
  endPresentation,
  get,
  setPresentation,
} from './storage.js';

export const CURRENT_SCHEMA = 2;

export const BUILTIN_SCENE_IDS = ['diwan', 'rasf', 'satr', 'falak', 'warsha'];

export const PALETTE_IDS = ['waraq', 'hibr', 'nakhla', 'sadaf'];

/** Arabic names for the built-in palettes, for the picker. */
export const PALETTE_NAMES = {
  waraq: { en: 'Paper', ar: 'ورق' },
  hibr: { en: 'Ink', ar: 'حبر' },
  nakhla: { en: 'Palm', ar: 'نخلة' },
  sadaf: { en: 'Mother-of-pearl', ar: 'صدف' },
};

/** The complete token set a palette must define. An inline palette that is
 *  missing one of these, or carries a key that is not one of these, is
 *  rejected rather than partially applied. */
export const PALETTE_TOKENS = [
  'bg-canvas',
  'bg-raised',
  'bg-card',
  'text-primary',
  'text-secondary',
  'text-muted',
  'accent',
  'accent-soft',
  'accent-text',
  'border',
  'shadow-color',
];

export const DENSITIES = ['compact', 'comfortable', 'airy'];

/** The closed set of Scene tags, used by the gallery's filter pills. Unknown
 *  tags are stripped on import rather than rejected — a tag from a newer build
 *  is not a reason to refuse somebody's Scene. */
export const SCENE_TAGS = [
  'minimal',
  'dense',
  'dark',
  'light',
  'arabic',
  'arabic-friendly',
  'focus',
  'creative',
];

/* ---- Loading ------------------------------------------------------------ */

const builtinCache = new Map();

/** Read a bundled Scene off disk. This is a packaged-resource read, not a
 *  network request — nothing leaves the machine. */
async function loadBuiltin(id) {
  if (builtinCache.has(id)) return builtinCache.get(id);
  const response = await fetch(chrome.runtime.getURL(`scenes/${id}.json`));
  if (!response.ok) throw new Error(`Missing bundled scene: ${id}`);
  const scene = normalizeScene(await response.json());
  builtinCache.set(id, scene);
  return scene;
}

/**
 * Resolve a Scene id to a normalized Scene. Falls back to the default Scene if
 * the id no longer exists — a Scene the user deleted should not leave them
 * staring at a blank page.
 */
export async function getScene(sceneId) {
  if (BUILTIN_SCENE_IDS.includes(sceneId)) return loadBuiltin(sceneId);

  const custom = await get('customScenes');
  const found = custom.find((scene) => scene?.meta?.id === sceneId);
  if (found) return normalizeScene(found);

  return loadBuiltin('diwan');
}

/** Every Scene available to pick from, bundled and custom. */
export async function listScenes() {
  const builtins = await Promise.all(BUILTIN_SCENE_IDS.map(loadBuiltin));
  const custom = (await get('customScenes')).map(normalizeScene);
  return [...builtins, ...custom];
}

/* ---- Normalizing --------------------------------------------------------
 * Fills in everything a renderer is allowed to assume is present, so no render
 * function has to guard for a missing key. */

export function normalizeScene(raw) {
  const scene = structuredClone(raw);

  scene.lawha = true;
  scene.kind = 'scene';
  scene.schemaVersion = CURRENT_SCHEMA;

  scene.meta = {
    id: 'untitled',
    name: 'Untitled',
    nameAr: '',
    author: '',
    remixOf: null,
    created: new Date().toISOString(),
    note: '',
    tags: [],
    ...(scene.meta || {}),
  };

  scene.meta.tags = (Array.isArray(scene.meta.tags) ? scene.meta.tags : [])
    .filter((tag) => SCENE_TAGS.includes(tag))
    .slice(0, 6);

  scene.palette = scene.palette ?? 'waraq';
  scene.density = DENSITIES.includes(scene.density) ? scene.density : 'comfortable';
  scene.sectionLabels = scene.sectionLabels !== false;

  scene.grid = {
    maxWidth: 1120,
    gap: 5,
    columns: '1fr',
    areas: ['header', 'hero'],
    breakpoints: {},
    ...(scene.grid || {}),
  };

  scene.regions = scene.regions || {};
  for (const [name, region] of Object.entries(scene.regions)) {
    scene.regions[name] = {
      align: 'stretch',
      modules: [],
      ...region,
    };
  }

  const modules = {};
  for (const id of Object.keys(MODULES)) {
    modules[id] = resolveModuleConfig(id, scene.modules?.[id] || {});
  }
  scene.modules = modules;

  return scene;
}

/* ---- Migration ----------------------------------------------------------
 * Each step takes a Scene one version forward. A Scene written against an
 * older Lawha keeps working; a Scene from a newer one is refused politely by
 * validateScene rather than half-applied. */

const MIGRATIONS = {
  // v1 had a flat module list and no regions: everything stacked in one
  // column, in order. Wrap it into the v2 grid/region shape.
  1: (scene) => {
    const ids = Array.isArray(scene.modules)
      ? scene.modules
      : Object.keys(scene.modules || {});
    const regions = {};
    const areas = [];
    ids.forEach((id, index) => {
      const name = `r${index}`;
      regions[name] = { modules: [id], align: 'stretch' };
      areas.push(name);
    });
    return {
      ...scene,
      schemaVersion: 2,
      grid: { maxWidth: 1120, gap: 5, columns: '1fr', areas, breakpoints: {} },
      regions,
      modules: Array.isArray(scene.modules) ? {} : scene.modules,
    };
  },
};

export function migrateScene(scene) {
  let current = scene;
  while (current.schemaVersion < CURRENT_SCHEMA) {
    const step = MIGRATIONS[current.schemaVersion];
    if (!step) break;
    current = step(current);
  }
  return current;
}

/* ---- Validation ---------------------------------------------------------
 * Everything below runs against files that came from strangers. */

/**
 * A colour token is `#RGB`, `#RRGGBB`, or a space-separated RGB triple (which
 * is what --shadow-color is, so it can be used inside rgb(... / alpha)).
 *
 * Nothing else. This is what stops someone smuggling `url(https://…)` into a
 * palette token and turning a shared Scene into a request from inside your
 * browser — the exact thing this extension promises never happens.
 */
export function isSafeColor(value) {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (/^#[0-9a-f]{3}$/i.test(v)) return true;
  if (/^#[0-9a-f]{6}$/i.test(v)) return true;
  if (/^\d{1,3} \d{1,3} \d{1,3}$/.test(v)) {
    return v.split(' ').every((n) => Number(n) >= 0 && Number(n) <= 255);
  }
  return false;
}

/** Every required token present, every value a safe colour, nothing extra. */
export function allTokensSafe(palette) {
  if (!palette || typeof palette !== 'object') return false;
  const normalized = normalizePaletteKeys(palette);
  const keys = Object.keys(normalized);
  if (keys.length !== PALETTE_TOKENS.length) return false;
  return PALETTE_TOKENS.every(
    (token) => token in normalized && isSafeColor(normalized[token])
  );
}

/** Accept `--bg-canvas`, `bg-canvas`, or `bgCanvas`; emit `bg-canvas`. */
export function normalizePaletteKeys(palette) {
  const out = {};
  for (const [key, value] of Object.entries(palette)) {
    const name = key
      .replace(/^--/, '')
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .toLowerCase();
    out[name] = value;
  }
  return out;
}

const NAME_RE = /^[a-z][a-z0-9-]{0,31}$/;

/** grid-template-columns, but only shapes we can prove are inert. */
function isSafeTrackList(value) {
  if (typeof value !== 'string' || value.length > 200) return false;
  if (!/^[a-z0-9\s%.,()/_-]+$/i.test(value)) return false;
  if (/url|expression|@|;|\{|\}|\\/i.test(value)) return false;
  // CSS itself is the final authority on whether this parses.
  if (typeof CSS !== 'undefined' && CSS.supports) {
    return CSS.supports('grid-template-columns', value);
  }
  return true;
}

/** grid-template-areas rows must be rectangular, or the whole grid silently
 *  collapses. Chrome drops the declaration; the page just looks broken. */
function areasAreRectangular(rows) {
  const cells = rows.map((row) => row.trim().split(/\s+/));
  const width = cells[0].length;
  if (!cells.every((row) => row.length === width)) return false;

  const bounds = new Map();
  cells.forEach((row, y) => {
    row.forEach((name, x) => {
      if (name === '.') return;
      const box = bounds.get(name) || { x0: x, x1: x, y0: y, y1: y, count: 0 };
      box.x0 = Math.min(box.x0, x);
      box.x1 = Math.max(box.x1, x);
      box.y0 = Math.min(box.y0, y);
      box.y1 = Math.max(box.y1, y);
      box.count += 1;
      bounds.set(name, box);
    });
  });

  for (const box of bounds.values()) {
    const area = (box.x1 - box.x0 + 1) * (box.y1 - box.y0 + 1);
    if (area !== box.count) return false;
  }
  return true;
}

export function isValidGrid(grid, regions) {
  if (!grid || typeof grid !== 'object') return false;

  if (!Number.isFinite(grid.maxWidth) || grid.maxWidth < 320 || grid.maxWidth > 4096) {
    return false;
  }
  if (!Number.isInteger(grid.gap) || grid.gap < 1 || grid.gap > 9) return false;
  if (!isSafeTrackList(grid.columns)) return false;

  const checkAreas = (areas, columns) => {
    if (!Array.isArray(areas) || areas.length === 0 || areas.length > 24) return false;
    if (!areas.every((row) => typeof row === 'string' && row.length <= 200)) return false;

    const names = new Set();
    for (const row of areas) {
      for (const cell of row.trim().split(/\s+/)) {
        if (cell === '.') continue;
        if (!NAME_RE.test(cell)) return false;
        names.add(cell);
      }
    }
    // Every named area must be a region, or nothing renders into it.
    for (const name of names) {
      if (!regions || !regions[name]) return false;
    }
    if (!areasAreRectangular(areas)) return false;
    return isSafeTrackList(columns);
  };

  if (!checkAreas(grid.areas, grid.columns)) return false;

  if (grid.breakpoints && typeof grid.breakpoints === 'object') {
    const widths = Object.keys(grid.breakpoints);
    if (widths.length > 6) return false;
    for (const width of widths) {
      const px = Number(width);
      if (!Number.isFinite(px) || px < 240 || px > 4096) return false;
      const bp = grid.breakpoints[width];
      if (!bp || typeof bp !== 'object') return false;
      if (!checkAreas(bp.areas, bp.columns ?? grid.columns)) return false;
    }
  }

  return true;
}

/**
 * The import gate.
 *
 * Two failure modes, deliberately different. A file that is not a Lawha Scene,
 * or one carrying something unsafe, is rejected. A Scene that merely mentions
 * a module or variant this build has never heard of is *repaired* — dropped
 * back to the default — because the alternative is a file failing on
 * someone's friend for a reason neither of them can see.
 */
export function validateScene(obj) {
  if (!obj?.lawha || obj.kind !== 'scene') return { ok: false, reason: 'import_bad' };
  if (typeof obj.schemaVersion !== 'number') return { ok: false, reason: 'import_bad' };
  if (obj.schemaVersion > CURRENT_SCHEMA) return { ok: false, reason: 'import_newer' };

  let scene;
  try {
    scene = normalizeScene(migrateScene(structuredClone(obj)));
  } catch {
    return { ok: false, reason: 'import_bad' };
  }

  // Unknown module or variant → fall back to default, don't reject the file.
  for (const [id, cfg] of Object.entries(scene.modules)) {
    if (!MODULES[id]) delete scene.modules[id];
    else if (!isKnownVariant(id, cfg.variant)) cfg.variant = MODULES[id].default;
  }

  // Same tolerance for regions pointing at modules that no longer exist.
  for (const region of Object.values(scene.regions)) {
    region.modules = (Array.isArray(region.modules) ? region.modules : []).filter(
      (id) => Boolean(MODULES[id])
    );
    if (!['start', 'center', 'stretch', 'end'].includes(region.align)) {
      region.align = 'stretch';
    }
  }
  for (const name of Object.keys(scene.regions)) {
    if (!NAME_RE.test(name)) return { ok: false, reason: 'import_bad' };
  }

  if (!isValidGrid(scene.grid, scene.regions)) return { ok: false, reason: 'import_bad' };

  if (typeof scene.palette === 'object') {
    if (!allTokensSafe(scene.palette)) return { ok: false, reason: 'import_bad' };
  } else if (!PALETTE_IDS.includes(scene.palette) && scene.palette !== 'auto') {
    return { ok: false, reason: 'import_bad' };
  }

  scene.meta.name = String(scene.meta?.name ?? 'Imported').slice(0, 40);
  scene.meta.nameAr = String(scene.meta?.nameAr ?? '').slice(0, 40);
  scene.meta.author = String(scene.meta?.author ?? '').slice(0, 60);
  scene.meta.note = String(scene.meta?.note ?? '').slice(0, 240);
  if (!NAME_RE.test(scene.meta.id || '')) {
    scene.meta.id = `imported-${Math.random().toString(36).slice(2, 8)}`;
  }

  return { ok: true, scene };
}

/* ---- Applying ----------------------------------------------------------- */

/** One probe element, reused, for reading a palette's tokens out of CSS rather
 *  than keeping a second copy of them in JavaScript. */
let probe = null;

/**
 * The eleven token values of a palette, as hex. Accepts a built-in id or an
 * inline palette object. Used by the contrast checker and the builder preview.
 */
export function readPaletteTokens(palette) {
  if (palette && typeof palette === 'object') {
    const normalized = normalizePaletteKeys(palette);
    return Object.fromEntries(PALETTE_TOKENS.map((t) => [t, normalized[t]]));
  }

  const id = PALETTE_IDS.includes(palette) ? palette : 'waraq';
  if (!probe) {
    probe = document.createElement('div');
    probe.className = 'l-sr-only';
    probe.setAttribute('aria-hidden', 'true');
    document.body.append(probe);
  }
  probe.dataset.palette = id;
  const styles = getComputedStyle(probe);
  return Object.fromEntries(
    PALETTE_TOKENS.map((token) => [token, styles.getPropertyValue(`--${token}`).trim()])
  );
}

/**
 * Walk a custom palette's text colours until they are readable against the
 * surfaces they sit on.
 *
 * Only inline palettes go through this. The four built-ins are checked in
 * tools/audit.mjs and clear 4.5:1 on every pair, so there is nothing to
 * correct; a palette someone mixed with a colour picker ten seconds ago is a
 * different matter.
 *
 * `--text-primary` is measured against whichever of the two surfaces it does
 * worse on, so fixing it for the canvas cannot leave it invisible on a card.
 *
 * @returns {{tokens: object, corrected: string[]}}
 */
export function harmonizePalette(tokens) {
  const out = { ...tokens };
  const corrected = [];

  const fix = (token, background) => {
    const result = ensureReadable(out[token], background);
    if (!result.corrected) return;
    out[token] = result.hex;
    corrected.push(token);
  };

  const worseSurface =
    contrastRatio(out['text-primary'], out['bg-canvas']) <=
    contrastRatio(out['text-primary'], out['bg-card'])
      ? out['bg-canvas']
      : out['bg-card'];

  fix('text-primary', worseSurface);
  fix('text-secondary', out['bg-canvas']);
  fix('accent-text', out['accent']);

  return { tokens: out, corrected };
}

let autoPaletteQuery = null;

/**
 * `palette` is a built-in id, `'auto'`, or an inline token object.
 * `'auto'` pairs waraq with hibr and follows the OS, live, without a reload.
 */
export function applyPalette(palette, root = document.documentElement) {
  if (autoPaletteQuery) {
    autoPaletteQuery.onchange = null;
    autoPaletteQuery = null;
  }

  // Clear any inline palette from a previous Scene.
  for (const token of PALETTE_TOKENS) root.style.removeProperty(`--${token}`);

  if (palette === 'auto') {
    autoPaletteQuery = matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      root.dataset.palette = autoPaletteQuery.matches ? 'hibr' : 'waraq';
    };
    autoPaletteQuery.onchange = sync;
    sync();
    return;
  }

  if (palette && typeof palette === 'object') {
    const normalized = normalizePaletteKeys(palette);
    if (!allTokensSafe(normalized)) {
      root.dataset.palette = 'waraq';
      return [];
    }
    // Inline palettes ride on top of waraq so anything the object does not
    // define still resolves to something legible.
    root.dataset.palette = 'waraq';

    const { tokens, corrected } = harmonizePalette(normalized);
    for (const token of PALETTE_TOKENS) {
      root.style.setProperty(`--${token}`, tokens[token]);
    }
    return corrected;
  }

  root.dataset.palette = PALETTE_IDS.includes(palette) ? palette : 'waraq';
  return [];
}

/* Grid rules are generated at runtime from Scene JSON, which means they cannot
 * live in a <style> element — the extension CSP forbids inline styles, and
 * relaxing it would defeat the point. A constructable stylesheet is CSSOM, not
 * markup, so it is both allowed and cheaper to swap. */
let gridSheet = null;
let gridSheetAdopted = false;

export function applyGrid(grid, { selector = '.scene', doc = document } = {}) {
  // Built on first use rather than at module load, so this file can also be
  // imported by the static audit in tools/, where there is no CSSOM.
  if (!gridSheet) gridSheet = new CSSStyleSheet();

  const rules = [];

  const block = (columns, areas) =>
    [
      `grid-template-columns: ${columns};`,
      `grid-template-areas: ${areas.map((row) => `"${row.trim()}"`).join(' ')};`,
    ].join(' ');

  rules.push(
    `${selector} { max-inline-size: ${grid.maxWidth}px; gap: var(--space-${grid.gap}); ${block(grid.columns, grid.areas)} }`
  );

  // Largest breakpoint first so the narrowest max-width query wins the cascade.
  const widths = Object.keys(grid.breakpoints || {})
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => b - a);

  for (const width of widths) {
    const bp = grid.breakpoints[String(width)];
    rules.push(
      `@media (max-width: ${width}px) { ${selector} { ${block(bp.columns ?? grid.columns, bp.areas)} } }`
    );
  }

  gridSheet.replaceSync(rules.join('\n'));
  if (!gridSheetAdopted) {
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, gridSheet];
    gridSheetAdopted = true;
  }
}

/**
 * Palette, density and label visibility, with the user's standing preferences
 * layered over what the Scene asked for. Shared by the new tab, the side panel
 * and the builder preview, so all three agree on what "the current look" means
 * without any of them applying a grid they have no use for.
 */
export async function applyPresentation(scene, root = document.documentElement) {
  const [paletteOverride, densityOverride, labelsOverride] = await Promise.all([
    get('palette'),
    get('density'),
    get('sectionLabels'),
  ]);

  const density = densityOverride ?? scene.density;
  const labels = labelsOverride ?? scene.sectionLabels;

  applyPalette(paletteOverride ?? scene.palette, root);
  root.dataset.density = DENSITIES.includes(density) ? density : 'comfortable';
  root.dataset.labels = labels ? 'on' : 'off';
  root.dataset.scene = scene.meta.id;
}

/**
 * Apply a Scene.
 *
 * The assertNoDataWrites call is the data-preservation contract written as an
 * executable claim: this function is permitted to write `activeScene` and
 * nothing else. The presentation lock around rendering means that even if a
 * render function were to reach for setData, it would throw rather than
 * quietly eat somebody's notes.
 */
export async function applyScene(sceneId, options = {}) {
  const scene = await getScene(sceneId);

  // This function is permitted to write `activeScene` and nothing else.
  assertNoDataWrites(['activeScene']);

  await applySceneObject(scene, options);
  await setPresentation('activeScene', sceneId);
  return scene;
}

/**
 * Apply a Scene object that may not be saved anywhere.
 *
 * The builder previews through this, which is what makes "the preview matches
 * the applied result" true by construction rather than by two implementations
 * happening to agree.
 */
export async function applySceneObject(
  scene,
  { renderRegions, root = document.documentElement } = {}
) {
  beginPresentation();
  try {
    // Colour first, and given a frame to land before anything moves.
    //
    // Palette tokens are CSS custom properties with transitions on them; the
    // grid is a wholesale change of grid-template-areas that reflows the page.
    // Done in the same frame, the reflow lands mid-transition and the switch
    // reads as a flash of unstyled layout. Separated by one frame, the colours
    // change first and the layout follows, which reads as a change of light.
    await applyPresentation(scene, root);
    await nextFrame();
    applyGrid(scene.grid);

    // Reads user data. Never writes it — the lock above makes sure.
    if (renderRegions) await renderRegions(scene.regions, scene.modules, scene);
  } finally {
    endPresentation();
  }
  return scene;
}

/**
 * One animation frame, or 50ms, whichever comes first.
 *
 * requestAnimationFrame does not fire in a tab that is not being painted, and a
 * Scene applied in a background tab — or in a gallery preview that has scrolled
 * out of view — has to finish rather than hang forever on a frame that is never
 * coming. Resolving a promise twice is a no-op, so the race needs no bookkeeping.
 */
function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(resolve);
    setTimeout(resolve, 50);
  });
}

/* ---- Export / import / remix -------------------------------------------- */

/** The shareable form: pretty-printed, stable key order, no runtime cruft. */
export function serializeScene(scene) {
  const ordered = {
    lawha: true,
    schemaVersion: CURRENT_SCHEMA,
    kind: 'scene',
    meta: scene.meta,
    palette: scene.palette,
    grid: scene.grid,
    regions: scene.regions,
    modules: scene.modules,
    density: scene.density,
    sectionLabels: scene.sectionLabels,
  };
  return JSON.stringify(ordered, null, 2);
}

/** Trigger a download of `<name>.lawha.json`. No downloads permission needed:
 *  an object URL on an anchor is enough. */
export function downloadScene(scene) {
  const slug =
    (scene.meta.id || scene.meta.name || 'scene')
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-|-$/g, '') || 'scene';

  const blob = new Blob([serializeScene(scene)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${slug}.lawha.json`;
  anchor.click();
  // Revoke on the next turn so the download has taken the handle.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Read a File the user picked, and validate it. */
export async function readSceneFile(file) {
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return { ok: false, reason: 'import_bad' };
  }
  return validateScene(parsed);
}

/**
 * Open a Scene for editing. If it came from somewhere else, the copy records
 * where — so credit travels with the file and no server has to track it.
 */
export function remixScene(scene, { id, name, credit = true } = {}) {
  const copy = normalizeScene(structuredClone(scene));

  // Credit is recorded when the source is someone else's work. Starting from a
  // bundled Scene is not a remix — nobody needs crediting for Diwan.
  const isDerived = credit && Boolean(scene.meta?.id);

  copy.meta = {
    ...copy.meta,
    id: id || `scene-${Math.random().toString(36).slice(2, 8)}`,
    name: name || copy.meta.name,
    created: new Date().toISOString(),
    remixOf: isDerived
      ? {
          id: scene.meta.id,
          name: scene.meta.name || '',
          author: scene.meta.author || '',
        }
      : (scene.meta?.remixOf ?? null),
  };
  return copy;
}

/** Save a custom Scene, replacing any earlier version of the same id.
 *  customScenes is a SCENE_KEY, so this never trips the data guard. */
export async function saveCustomScene(scene) {
  const custom = await get('customScenes');
  const next = custom.filter((s) => s?.meta?.id !== scene.meta.id);
  next.push(scene);
  await setPresentation('customScenes', next);
  return scene;
}

export async function deleteCustomScene(sceneId) {
  const custom = await get('customScenes');
  await setPresentation(
    'customScenes',
    custom.filter((s) => s?.meta?.id !== sceneId)
  );
}
