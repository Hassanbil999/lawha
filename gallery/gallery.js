/**
 * gallery.js
 * The Scene gallery: browse, preview, apply, remix, import and export Scenes.
 */

/* Lawha — the Scene gallery.
 *
 * Browsing and creating both live here, in a full page, because both deserve
 * room: a preview you can actually read, and a decision worth making slowly.
 * The side panel tunes what you already have; this is where you go to change
 * your mind about it.
 *
 * Every card's preview is the real new tab page in an iframe, fed the Scene
 * over postMessage. Cards mount their iframe only when they scroll into view —
 * a dozen full page loads at once is a lot to spend on a grid most people
 * scroll past.
 *
 * Sharing is deliberately network-free. A Scene is copied to the clipboard as
 * JSON for pasting into a Gist, and importing takes pasted JSON or a file.
 * Fetching a Gist URL would be the first network request Lawha ever made, and
 * the promise that there are none is worth more than the convenience. */

import {
  BUILTIN_SCENE_IDS,
  PALETTE_IDS,
  PALETTE_NAMES,
  DENSITIES,
  getScene,
  listScenes,
  readPaletteTokens,
  remixScene,
  saveCustomScene,
  deleteCustomScene,
  downloadScene,
  serializeScene,
  readSceneFile,
  validateScene,
  isValidGrid,
  applyPresentation,
} from '../shared/scenes.js';
import { MODULES, MODULE_IDS } from '../shared/modules.js';
import {
  initI18n,
  t,
  tModule,
  tVariant,
  currentLanguage,
  applyStrings,
  onLanguageChange,
} from '../shared/i18n.js';
import { mountIconSprite } from '../shared/icons.js';
import { el, replaceChildren, icon, contrastRatio, debounce, contextMenu } from '../shared/utils.js';
import { get, setPresentation } from '../shared/storage.js';

const $ = (id) => document.getElementById(id);

/* ==========================================================================
   Arrangements — five named layouts, composed against what is switched on
   ========================================================================== */

const FLOW = ['waqt', 'clock', 'search', 'shortcuts', 'recent', 'bookmarks', 'notes', 'later'];
const CENTERED = new Set(['clock', 'shortcuts', 'search']);

const TEMPLATES = {
  single: { labelKey: 'arr_single', maxWidth: 520, gap: 6, columns: '1fr', dynamic: true },

  two: {
    labelKey: 'arr_two',
    maxWidth: 1120,
    gap: 5,
    columns: '1fr 1fr',
    areas: ['header header', 'hero hero', 'quick quick', 'left right', 'foot foot'],
    regions: {
      header: { modules: ['waqt'], align: 'stretch' },
      hero: { modules: ['clock'], align: 'center' },
      quick: { modules: ['search', 'shortcuts'], align: 'center' },
      left: { modules: ['recent'], align: 'start' },
      right: { modules: ['bookmarks'], align: 'start' },
      foot: { modules: ['notes', 'later'], align: 'stretch' },
    },
  },

  three: {
    labelKey: 'arr_three',
    maxWidth: 1240,
    gap: 5,
    columns: '1fr 1fr 1fr',
    areas: ['head head head', 'cola colb colc'],
    regions: {
      head: { modules: ['waqt', 'clock', 'search'], align: 'center' },
      cola: { modules: ['shortcuts', 'recent'], align: 'start' },
      colb: { modules: ['bookmarks'], align: 'start' },
      colc: { modules: ['notes', 'later'], align: 'start' },
    },
  },

  sidebar: {
    labelKey: 'arr_sidebar',
    maxWidth: 1440,
    gap: 5,
    columns: '260px 1fr',
    areas: ['rail top', 'rail main', 'rail notes'],
    regions: {
      rail: { modules: ['bookmarks', 'shortcuts', 'later'], align: 'stretch' },
      top: { modules: ['search', 'waqt', 'clock'], align: 'stretch' },
      main: { modules: ['recent'], align: 'stretch' },
      notes: { modules: ['notes'], align: 'stretch' },
    },
  },

  bento: {
    labelKey: 'arr_bento',
    maxWidth: 1240,
    gap: 3,
    columns: '1fr 1fr 1fr',
    areas: ['time quick notes', 'recent recent notes', 'books books later'],
    regions: {
      time: { modules: ['clock', 'waqt'], align: 'start' },
      quick: { modules: ['shortcuts', 'search'], align: 'start' },
      notes: { modules: ['notes'], align: 'stretch' },
      recent: { modules: ['recent'], align: 'stretch' },
      books: { modules: ['bookmarks'], align: 'stretch' },
      later: { modules: ['later'], align: 'start' },
    },
  },
};

const ARRANGEMENT_IDS = ['two', 'three', 'single', 'sidebar', 'bento'];

const isOn = (modules, id) => Boolean(modules[id]) && modules[id].variant !== 'off';

/**
 * Compose a template against the modules actually switched on.
 *
 * Absent regions become `.` rather than being spread over their neighbours:
 * spreading turns a two-row region into an L, and Chrome drops the whole
 * grid-template-areas declaration when it sees one. Empty rows and columns are
 * then removed, which cannot break a rectangle because an entirely empty
 * column can never sit inside one.
 */
function composeArrangement(arrangementId, modules) {
  const template = TEMPLATES[arrangementId] ?? TEMPLATES.two;
  if (template.dynamic) return composeSingle(template, modules);

  const regions = {};
  for (const [name, region] of Object.entries(template.regions)) {
    const present = region.modules.filter((id) => isOn(modules, id));
    if (present.length) regions[name] = { modules: present, align: region.align };
  }

  const names = new Set(Object.keys(regions));
  let rows = template.areas.map((row) =>
    row.split(/\s+/).map((cell) => (names.has(cell) ? cell : '.'))
  );
  let tracks = template.columns.split(/\s+/);

  rows = rows.filter((row) => row.some((cell) => cell !== '.'));
  const keep = tracks.map((_, index) => rows.some((row) => row[index] !== '.'));
  rows = rows.map((row) => row.filter((_, index) => keep[index]));
  tracks = tracks.filter((_, index) => keep[index]);

  if (!rows.length || !tracks.length) return composeSingle(TEMPLATES.single, modules);

  const grid = {
    maxWidth: template.maxWidth,
    gap: template.gap,
    columns: tracks.join(' '),
    areas: rows.map((row) => row.join(' ')),
    breakpoints: { 720: { columns: '1fr', areas: Object.keys(regions) } },
  };

  if (!isValidGrid(grid, regions)) return composeSingle(TEMPLATES.single, modules);
  return { grid, regions };
}

function composeSingle(template, modules) {
  const on = FLOW.filter((id) => isOn(modules, id));
  const regions = {};
  for (const id of on) {
    regions[id] = { modules: [id], align: CENTERED.has(id) ? 'center' : 'stretch' };
  }

  if (!on.length) {
    return {
      grid: { maxWidth: template.maxWidth, gap: template.gap, columns: '1fr', areas: ['hero'], breakpoints: {} },
      regions: { hero: { modules: [], align: 'center' } },
    };
  }

  return {
    grid: { maxWidth: template.maxWidth, gap: template.gap, columns: '1fr', areas: on, breakpoints: {} },
    regions,
  };
}

/** Best guess at which arrangement a Scene came from, so opening one in the
 *  builder does not silently relayout it. */
function detectArrangement(scene) {
  const names = Object.keys(scene.regions).sort().join(',');
  for (const id of ARRANGEMENT_IDS) {
    const template = TEMPLATES[id];
    if (template.dynamic) continue;
    if (Object.keys(template.regions).sort().join(',') === names) return id;
  }
  return String(scene.grid.columns).trim() === '1fr' ? 'single' : 'two';
}

/* ==========================================================================
   State
   ========================================================================== */

const state = {
  scenes: [],
  activeScene: 'diwan',
  filter: 'all',
  draft: null,
  baseId: 'diwan',
  arrangement: 'two',
  previewReady: false,
};

function toast(message) {
  const node = $('toast');
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toast.handle);
  toast.handle = setTimeout(() => {
    node.hidden = true;
  }, 3200);
}

const sceneTitle = (scene) =>
  currentLanguage() === 'ar' && scene.meta.nameAr ? scene.meta.nameAr : scene.meta.name;

const sceneSubtitle = (scene) =>
  currentLanguage() === 'ar' ? scene.meta.name : scene.meta.nameAr;

/* ==========================================================================
   Card previews — the real page, mounted lazily
   ========================================================================== */

/* Each preview iframe announces itself when ready, and every card waits for
   its own frame rather than a shared one. */
const pendingFrames = new Map();

window.addEventListener('message', (event) => {
  if (event.origin !== location.origin) return;

  if (event.data?.type === 'lawha:preview-ready') {
    for (const [frame, scene] of pendingFrames) {
      if (frame.contentWindow === event.source) {
        frame.contentWindow.postMessage(
          { type: 'lawha:preview', scene: JSON.parse(JSON.stringify(scene)) },
          location.origin
        );
        pendingFrames.delete(frame);
      }
    }
  }

  if (event.data?.type === 'lawha:preview-ready' && event.source === $('preview')?.contentWindow) {
    state.previewReady = true;
    refreshBuilderPreview();
  }
});

const lazyPreviews = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const host = entry.target;
      lazyPreviews.unobserve(host);
      mountCardPreview(host);
    }
  },
  { rootMargin: '200px' }
);

function mountCardPreview(host) {
  const scene = state.scenes.find((s) => s.meta.id === host.dataset.scene);
  if (!scene) return;

  const frame = el('iframe', {
    class: 'gal-card-frame',
    title: sceneTitle(scene),
    tabindex: '-1',
    'aria-hidden': 'true',
    src: '../newtab/newtab.html?preview=1',
  });

  pendingFrames.set(frame, scene);
  host.append(frame);
}

/* ==========================================================================
   Gallery
   ========================================================================== */

const FILTERS = [
  { id: 'all', labelKey: 'filter_all' },
  { id: 'minimal', labelKey: 'tag_minimal' },
  { id: 'dense', labelKey: 'tag_dense' },
  { id: 'arabic', labelKey: 'tag_arabic' },
  { id: 'dark', labelKey: 'tag_dark' },
  { id: 'custom', labelKey: 'gal_custom' },
];

function matchesFilter(scene) {
  if (state.filter === 'all') return true;
  if (state.filter === 'custom') return !BUILTIN_SCENE_IDS.includes(scene.meta.id);
  if (state.filter === 'arabic') {
    return scene.meta.tags.some((tag) => tag === 'arabic' || tag === 'arabic-friendly');
  }
  return scene.meta.tags.includes(state.filter);
}

function renderFilters() {
  replaceChildren(
    $('filters'),
    FILTERS.map((filter) =>
      el('button', {
        class: 'gal-pill',
        type: 'button',
        text: t(filter.labelKey),
        'aria-pressed': String(state.filter === filter.id),
        on: {
          click: () => {
            state.filter = filter.id;
            renderFilters();
            renderGrid();
          },
        },
      })
    )
  );
}

function renderGrid() {
  const visible = state.scenes.filter(matchesFilter);
  $('grid-empty').hidden = visible.length > 0;

  replaceChildren($('grid'), visible.map(buildCard));

  for (const host of $('grid').querySelectorAll('.gal-card-preview')) {
    lazyPreviews.observe(host);
  }
}

function buildCard(scene) {
  const isBuiltin = BUILTIN_SCENE_IDS.includes(scene.meta.id);
  const isActive = scene.meta.id === state.activeScene;

  const preview = el('div', {
    class: 'gal-card-preview',
    dataset: { scene: scene.meta.id },
  });

  const tags = el(
    'div',
    { class: 'gal-card-tags' },
    scene.meta.tags.slice(0, 3).map((tag) =>
      el('span', { class: 'gal-tag', text: t(`tag_${tag.replace(/-/g, '_')}`) })
    )
  );

  const apply = el('button', {
    class: `l-btn ${isActive ? '' : 'l-btn-primary'} gal-apply`,
    type: 'button',
    text: isActive ? t('gal_applied') : t('gal_apply'),
    disabled: isActive || null,
    on: { click: () => applyScene(scene) },
  });

  const more = el('button', {
    class: 'l-icon-btn',
    type: 'button',
    'aria-label': t('gal_more'),
    on: { click: (event) => openCardMenu(event, scene, isBuiltin) },
  });
  more.append(icon('grip'));

  return el('article', { class: 'gal-card', dataset: { active: String(isActive) } }, [
    preview,
    el('div', { class: 'gal-card-body' }, [
      el('h2', { class: 'gal-card-name', text: sceneTitle(scene) }),
      el('p', { class: 'gal-card-sub', text: sceneSubtitle(scene) || '' }),
      el('p', {
        class: 'gal-card-origin',
        text: isBuiltin
          ? t('gal_builtin')
          : scene.meta.author
            ? t('gal_by', scene.meta.author)
            : t('gal_custom'),
      }),
      tags,
      el('div', { class: 'gal-card-actions' }, [apply, more]),
    ]),
  ]);
}

function openCardMenu(event, scene, isBuiltin) {
  contextMenu(event, [
    { label: t('action_edit'), icon: 'note', onSelect: () => openBuilder(scene) },
    { label: t('set_export'), icon: 'external', onSelect: () => downloadScene(scene) },
    { label: t('gal_share'), icon: 'grip', onSelect: () => shareScene(scene) },
    isBuiltin
      ? null
      : {
          label: t('build_delete_scene'),
          icon: 'trash',
          danger: true,
          onSelect: async () => {
            await deleteCustomScene(scene.meta.id);
            if (state.activeScene === scene.meta.id) {
              state.activeScene = 'diwan';
              await setPresentation('activeScene', 'diwan');
            }
            await reload();
          },
        },
  ]);
}

async function applyScene(scene) {
  state.activeScene = scene.meta.id;
  await setPresentation('activeScene', scene.meta.id);
  await applyPresentation(scene);
  renderGrid();
}

/**
 * Sharing without a server: the Scene goes to the clipboard, and the person
 * pastes it into a Gist. No account, no upload, no infrastructure that can be
 * acquired and paywalled later.
 */
async function shareScene(scene) {
  try {
    await navigator.clipboard.writeText(serializeScene(scene));
    toast(t('gal_shared'));
  } catch {
    toast(t('import_bad'));
  }
}

/* ==========================================================================
   Import
   ========================================================================== */

const GIST_URL = /^https?:\/\/(gist\.)?github(usercontent)?\.com\//i;

function wireImport() {
  $('import-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const result = await readSceneFile(file);
    await acceptImport(result);
  });

  $('import-text').addEventListener(
    'input',
    debounce(async () => {
      const raw = $('import-text').value.trim();
      const note = $('import-note');
      if (!raw) {
        note.textContent = '';
        return;
      }

      // A URL cannot be fetched — that would be the first network request this
      // extension ever made. Point at the raw file instead and let the person
      // paste what is in it.
      if (GIST_URL.test(raw)) {
        note.textContent = t('gal_import_url');
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        note.textContent = t('import_bad');
        return;
      }

      const result = validateScene(parsed);
      if (await acceptImport(result)) $('import-text').value = '';
    }, 400)
  );
}

async function acceptImport(result) {
  if (!result.ok) {
    toast(t(result.reason));
    return false;
  }
  await saveCustomScene(result.scene);
  await reload();
  openBuilder(result.scene);
  return true;
}

/* ==========================================================================
   Builder
   ========================================================================== */

function showView(name) {
  $('grid-view').hidden = name !== 'gallery';
  $('builder-view').hidden = name !== 'builder';
}

function openBuilder(scene) {
  state.baseId = scene.meta.id;
  state.draft = remixScene(scene, { credit: !BUILTIN_SCENE_IDS.includes(scene.meta.id) });
  state.arrangement = detectArrangement(scene);
  showView('builder');
  renderBuilder();
  refreshBuilderPreview();
}

function fillSelect(node, options, value) {
  replaceChildren(
    node,
    options.map((option) => el('option', { value: String(option.value), text: option.label }))
  );
  node.value = String(value);
}

function renderBuilder() {
  fillSelect(
    $('b-base'),
    state.scenes.map((scene) => ({ value: scene.meta.id, label: sceneTitle(scene) })),
    state.baseId
  );
  fillSelect(
    $('b-arrangement'),
    ARRANGEMENT_IDS.map((id) => ({ value: id, label: t(TEMPLATES[id].labelKey) })),
    state.arrangement
  );
  fillSelect(
    $('b-palette'),
    [
      ...PALETTE_IDS.map((id) => ({ value: id, label: PALETTE_NAMES[id][currentLanguage()] })),
      { value: 'auto', label: t('opt_auto') },
    ],
    typeof state.draft.palette === 'string' ? state.draft.palette : 'waraq'
  );
  fillSelect(
    $('b-density'),
    DENSITIES.map((d) => ({ value: d, label: t(`dens_${d}`) })),
    state.draft.density
  );
  fillSelect(
    $('b-labels'),
    [
      { value: 'on', label: t('opt_on') },
      { value: 'off', label: t('opt_off') },
    ],
    state.draft.sectionLabels ? 'on' : 'off'
  );

  $('b-name').value = state.draft.meta.name;

  const remix = state.draft.meta.remixOf;
  $('remix-note').hidden = !remix;
  if (remix) {
    $('remix-note').textContent = t(
      'build_remix_of',
      remix.author ? `${remix.name} — ${remix.author}` : remix.name
    );
  }

  renderModuleRows();
  renderContrast();
}

function renderModuleRows() {
  replaceChildren(
    $('b-modules'),
    MODULE_IDS.map((moduleId) => {
      const select = el('select', { class: 'l-select' });
      fillSelect(
        select,
        MODULES[moduleId].variants.map((variant) => ({
          value: variant,
          label: tVariant(moduleId, variant),
        })),
        state.draft.modules[moduleId].variant
      );

      select.addEventListener('change', () => {
        state.draft.modules[moduleId].variant = select.value;
        relayout();
        refreshBuilderPreview();
      });

      return el('label', { class: 'gal-row' }, [
        el('span', { class: 'gal-row-label', text: tModule(moduleId) }),
        select,
      ]);
    })
  );
}

function relayout() {
  const { grid, regions } = composeArrangement(state.arrangement, state.draft.modules);
  state.draft.grid = grid;
  state.draft.regions = regions;
  renderContrast();
}

function renderContrast() {
  const tokens = readPaletteTokens(
    state.draft.palette === 'auto' ? 'waraq' : state.draft.palette
  );
  const worst = Math.min(
    contrastRatio(tokens['text-primary'], tokens['bg-canvas']),
    contrastRatio(tokens['accent-text'], tokens.accent)
  );
  const level = worst >= 4.5 ? 'pass' : worst >= 3 ? 'warn' : 'fail';

  const node = $('contrast');
  node.dataset.state = level;
  replaceChildren(node, [
    el('span', { class: 'tune-dot', dataset: { level }, 'aria-hidden': 'true' }),
    el('span', {
      text: t(level === 'pass' ? 'contrast_pass' : level === 'warn' ? 'contrast_warn' : 'contrast_fail'),
    }),
  ]);
}

const refreshBuilderPreview = debounce(() => {
  if (!state.previewReady || !state.draft) return;
  $('preview').contentWindow.postMessage(
    { type: 'lawha:preview', scene: JSON.parse(JSON.stringify(state.draft)) },
    location.origin
  );
}, 80);

function wireBuilder() {
  $('create').addEventListener('click', async () => {
    openBuilder(await getScene(state.activeScene));
  });

  $('back').addEventListener('click', () => {
    showView('gallery');
    renderGrid();
  });

  $('b-base').addEventListener('change', async (event) => {
    openBuilder(await getScene(event.target.value));
  });

  $('b-arrangement').addEventListener('change', (event) => {
    state.arrangement = event.target.value;
    relayout();
    refreshBuilderPreview();
  });

  $('b-palette').addEventListener('change', (event) => {
    state.draft.palette = event.target.value;
    renderContrast();
    refreshBuilderPreview();
  });

  $('b-density').addEventListener('change', (event) => {
    state.draft.density = event.target.value;
    refreshBuilderPreview();
  });

  $('b-labels').addEventListener('change', (event) => {
    state.draft.sectionLabels = event.target.value === 'on';
    refreshBuilderPreview();
  });

  $('b-name').addEventListener('input', () => {
    state.draft.meta.name = $('b-name').value.slice(0, 40);
  });

  $('b-save').addEventListener('click', async () => {
    commitName();
    await saveCustomScene(state.draft);
    state.activeScene = state.draft.meta.id;
    await setPresentation('activeScene', state.draft.meta.id);
    await reload();
    toast(t('build_saved'));
    showView('gallery');
    renderGrid();
  });

  $('b-export').addEventListener('click', () => {
    commitName();
    downloadScene(state.draft);
  });

  $('b-share').addEventListener('click', () => {
    commitName();
    shareScene(state.draft);
  });
}

function commitName() {
  state.draft.meta.name = $('b-name').value.trim().slice(0, 40) || 'Untitled';
  relayout();
}

/* ==========================================================================
   Boot
   ========================================================================== */

async function reload() {
  state.scenes = await listScenes();
  renderGrid();
}

async function boot() {
  mountIconSprite();
  await initI18n();
  applyStrings();

  $('mark').append(icon('logo', 22));

  state.activeScene = await get('activeScene');
  state.scenes = await listScenes();

  const base = await getScene(state.activeScene);
  await applyPresentation(base);

  state.baseId = base.meta.id;
  state.draft = remixScene(base, { credit: false });
  state.arrangement = detectArrangement(base);

  renderFilters();
  renderGrid();
  renderBuilder();
  wireBuilder();
  wireImport();

  onLanguageChange(() => {
    applyStrings();
    renderFilters();
    renderGrid();
    renderBuilder();
  });
}

boot();
