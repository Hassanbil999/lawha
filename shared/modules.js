/**
 * modules.js
 * The module registry: what exists, which variants each declares, and how a Scene resolves against defaults.
 */

/* Lawha — the module registry.
 *
 * This is the contract every other part of the system reads from. A Scene is
 * only ever a selection made against this table: pick a variant per module,
 * place modules into regions, choose a palette. Import validation, the builder
 * dropdowns, and the renderer all derive from here, so adding a variant is a
 * one-line change plus the render function itself.
 *
 * `defaults` are the module's config keys with their fallback values. A Scene
 * may override any of them; anything it omits falls back here, which is what
 * lets an old Scene keep working after a module grows a new option. */

export const MODULES = {
  clock: {
    labelKey: null,
    variants: ['minimal', 'monumental', 'ring', 'off'],
    default: 'monumental',
    defaults: { seconds: false, greeting: true, date: true },
  },

  waqt: {
    labelKey: null,
    variants: ['arc', 'bar', 'dots', 'off'],
    default: 'arc',
    defaults: {},
  },

  shortcuts: {
    labelKey: 'sec_shortcuts',
    variants: ['circles', 'squares', 'strip', 'ring', 'list'],
    default: 'circles',
    defaults: { max: 16, perRow: 8, labels: true },
  },

  recent: {
    labelKey: 'sec_recent',
    variants: ['list', 'compact', 'tiles', 'feed'],
    default: 'list',
    defaults: { max: 8, showDomain: true, showTime: true },
  },

  bookmarks: {
    labelKey: 'sec_collections',
    variants: ['folders', 'shelf', 'tree', 'tiles', 'columns'],
    default: 'folders',
    defaults: { max: 6, expandable: true },
  },

  notes: {
    labelKey: 'sec_notes',
    variants: ['cards', 'strip', 'stack', 'off'],
    default: 'cards',
    defaults: { max: 6 },
  },

  later: {
    labelKey: 'sec_later',
    variants: ['count', 'list', 'tiles', 'off'],
    default: 'count',
    defaults: { max: 12 },
  },

  search: {
    labelKey: null,
    variants: ['bar', 'icon', 'off'],
    default: 'off',
    defaults: {},
  },

  // There was a `tabs` module here, rendered by the side panel in four
  // variants. The side panel is now a live tuning surface for the active
  // Scene, so the module has no surface to draw on and has been retired.
  // Scenes that still carry a `tabs` block import fine — validateScene drops
  // modules it does not recognise rather than refusing the file.
};

export const MODULE_IDS = Object.keys(MODULES);

/** Modules the new tab is responsible for drawing. */
export const NEWTAB_MODULE_IDS = MODULE_IDS.filter(
  (id) => MODULES[id].surface !== 'sidebar'
);

/** True when `variant` is one this module actually knows how to draw. */
export function isKnownVariant(moduleId, variant) {
  const mod = MODULES[moduleId];
  return Boolean(mod) && mod.variants.includes(variant);
}

/** A module config with every key present: registry defaults under the Scene's
 *  overrides. Renderers can read `cfg.max` without guarding. */
export function resolveModuleConfig(moduleId, cfg = {}) {
  const mod = MODULES[moduleId];
  if (!mod) return null;
  const variant = isKnownVariant(moduleId, cfg.variant) ? cfg.variant : mod.default;
  return { ...mod.defaults, ...cfg, variant };
}

/** Every module at its registry default. The starting point for a new Scene. */
export function defaultModuleSet() {
  const out = {};
  for (const id of MODULE_IDS) {
    out[id] = { ...MODULES[id].defaults, variant: MODULES[id].default };
  }
  return out;
}
