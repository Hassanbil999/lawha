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
  normalizeScene,
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
import { get, onChanged, setPresentation } from '../shared/storage.js';

const $ = (id) => document.getElementById(id);

/* ==========================================================================
   Arrangements — five named layouts, composed against what is switched on
   ========================================================================== */

const FLOW = ['waqt', 'clock', 'search', 'shortcuts', 'recent', 'bookmarks', 'feeds', 'notes', 'later'];
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
      right: { modules: ['bookmarks', 'feeds'], align: 'start' },
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
      colb: { modules: ['bookmarks', 'feeds'], align: 'start' },
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
      main: { modules: ['recent', 'feeds'], align: 'stretch' },
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
      later: { modules: ['later', 'feeds'], align: 'start' },
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

/* The Scene's other name, under its title. A Scene with only one name — every
   Scene you make yourself — has no second line, rather than the same words
   printed twice. */
const sceneSubtitle = (scene) => {
  const other = currentLanguage() === 'ar' ? scene.meta.name : scene.meta.nameAr;
  return other && other !== sceneTitle(scene) ? other : '';
};

/* ==========================================================================
   Card previews — the real page, mounted lazily
   ========================================================================== */

/* Each preview iframe announces itself when ready, and every card waits for
   its own frame rather than a shared one.

   A frame stays in this map for as long as its card is on the page, not just
   until its first draft lands: a Scene that gets edited has to reach the card
   already showing it, and posting a fresh Scene down an open frame is the
   cheap way to do that. Reloading the frame is the expensive way, and it is
   what a card is here to avoid. */
const frames = new Map();

function postScene(frame, scene) {
  const entry = frames.get(frame);
  if (!entry) return;
  entry.scene = scene;
  if (!entry.ready || !frame.contentWindow) return;
  frame.contentWindow.postMessage(
    { type: 'lawha:preview', scene: JSON.parse(JSON.stringify(scene)) },
    location.origin
  );
}

window.addEventListener('message', (event) => {
  if (event.origin !== location.origin) return;
  if (event.data?.type !== 'lawha:preview-ready') return;

  if (event.source === $('preview')?.contentWindow) {
    state.previewReady = true;
    refreshBuilderPreview();
    return;
  }

  for (const [frame, entry] of frames) {
    if (frame.contentWindow !== event.source) continue;
    entry.ready = true;
    postScene(frame, entry.scene);
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

  frames.set(frame, { scene, ready: false });
  host.append(frame);
}

/** Everything a card holds on to, so it can be updated in place rather than
 *  built again. */
function unmountCard(card) {
  lazyPreviews.unobserve(card.preview);
  const frame = card.preview.querySelector('iframe');
  if (frame) frames.delete(frame);
  card.article.remove();
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

/* Cards, by Scene id, kept between renders.

   Rebuilding the grid is the obvious way to redraw it and it cannot be used
   here: every card holds an iframe running the real new tab page, and an
   iframe that leaves the document reloads when it comes back. A wholesale
   rebuild on a filter click therefore blanks every preview on the page and
   spends a dozen page loads redrawing the same dozen Scenes — which is what a
   filter click, an Apply, a save and a language switch all used to cost.

   So cards are made once and updated after that. Filtering hides them,
   applying relabels one button, and a Scene that has genuinely changed gets
   the new version posted down its existing frame. */
const cards = new Map();

function renderGrid() {
  const grid = $('grid');
  const live = new Set(state.scenes.map((scene) => scene.meta.id));

  for (const [id, card] of cards) {
    if (live.has(id)) continue;
    unmountCard(card);
    cards.delete(id);
  }

  let visible = 0;
  let cursor = grid.firstElementChild;

  for (const scene of state.scenes) {
    let card = cards.get(scene.meta.id);
    if (!card) {
      card = buildCard(scene);
      cards.set(scene.meta.id, card);
      lazyPreviews.observe(card.preview);
    }

    // Only ever moved when the Scene order really changed — moving a card
    // costs the reload this whole arrangement exists to avoid.
    if (card.article !== cursor) grid.insertBefore(card.article, cursor);
    else cursor = cursor.nextElementSibling;

    updateCard(card, scene);
    const shown = matchesFilter(scene);
    card.article.hidden = !shown;
    if (shown) visible += 1;
  }

  $('grid-empty').hidden = visible > 0;
}

function buildCard(scene) {
  const preview = el('div', {
    class: 'gal-card-preview',
    dataset: { scene: scene.meta.id },
  });

  const name = el('h2', { class: 'gal-card-name' });
  const sub = el('p', { class: 'gal-card-sub' });
  const origin = el('p', { class: 'gal-card-origin' });
  const tags = el('div', { class: 'gal-card-tags' });
  const apply = el('button', { class: 'l-btn gal-apply', type: 'button' });
  const more = el('button', { class: 'l-icon-btn', type: 'button' });
  more.append(icon('grip'));

  const article = el('article', { class: 'gal-card' }, [
    preview,
    el('div', { class: 'gal-card-body' }, [
      name,
      sub,
      origin,
      tags,
      el('div', { class: 'gal-card-actions' }, [apply, more]),
    ]),
  ]);

  // Bound once, reading the card's current Scene, so updating a card never
  // has to unpick a listener.
  const card = { article, preview, name, sub, origin, tags, apply, more, scene, hash: null };
  apply.addEventListener('click', () => applyScene(card.scene));
  more.addEventListener('click', (event) =>
    openCardMenu(event, card.scene, BUILTIN_SCENE_IDS.includes(card.scene.meta.id))
  );
  return card;
}

function updateCard(card, scene) {
  const isBuiltin = BUILTIN_SCENE_IDS.includes(scene.meta.id);
  const isActive = scene.meta.id === state.activeScene;

  card.scene = scene;
  card.article.dataset.active = String(isActive);
  card.name.textContent = sceneTitle(scene);
  card.sub.textContent = sceneSubtitle(scene) || '';
  card.origin.textContent = isBuiltin
    ? t('gal_builtin')
    : scene.meta.author
      ? t('gal_by', scene.meta.author)
      : t('gal_custom');

  replaceChildren(
    card.tags,
    scene.meta.tags.slice(0, 3).map((tag) =>
      el('span', { class: 'gal-tag', text: t(`tag_${tag.replace(/-/g, '_')}`) })
    )
  );

  card.apply.className = `l-btn ${isActive ? '' : 'l-btn-primary'} gal-apply`;
  card.apply.textContent = isActive ? t('gal_applied') : t('gal_apply');
  card.apply.disabled = isActive;
  card.more.setAttribute('aria-label', t('gal_more'));

  // A Scene that was edited has to reach the card already drawing it. Posting
  // it down the open frame redraws the preview without reloading the page
  // inside it; comparing first keeps a filter click from posting five Scenes
  // that have not moved.
  const hash = JSON.stringify(scene);
  if (hash === card.hash) return;
  card.hash = hash;
  const frame = card.preview.querySelector('iframe');
  if (frame) postScene(frame, scene);
}

function openCardMenu(event, scene, isBuiltin) {
  contextMenu(event, [
    {
      label: t('action_edit'),
      icon: 'note',
      // Your own Scene is opened as itself, so saving replaces it. Forking on
      // every edit is how one Scene becomes six near-identical ones with no
      // way to tell which is the current one. A bundled Scene cannot be
      // written to, so editing one is still a copy — openBuilder decides.
      onSelect: () => openBuilder(scene, { fork: false }),
    },
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
              await applyPresentation(await getScene('diwan'));
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
  // Saved a moment ago, so the builder opens it rather than copying it —
  // otherwise the first save after an import leaves two of everything.
  openBuilder(result.scene, { fork: false });
  return true;
}

/* ==========================================================================
   Builder
   ========================================================================== */

function showView(name) {
  $('grid-view').hidden = name !== 'gallery';
  $('builder-view').hidden = name !== 'builder';
}

/**
 * Open a Scene in the builder.
 *
 * `fork` is the difference between "start from this" and "change this". A
 * bundled Scene is always a fork whatever is asked for — there is nowhere to
 * save it back to.
 */
function openBuilder(scene, { fork = true } = {}) {
  const isBuiltin = BUILTIN_SCENE_IDS.includes(scene.meta.id);
  state.baseId = scene.meta.id;
  state.draft =
    fork || isBuiltin
      ? remixScene(scene, { credit: !isBuiltin })
      : normalizeScene(structuredClone(scene));
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
    // The Scene you just saved is now the active one, so the page has to be
    // wearing it. Without this the gallery keeps the palette, density and
    // labels of whatever was active before, and saving a dark Scene appears
    // to do nothing at all.
    await applyPresentation(state.draft);
    await reload();
    toast(t('build_saved'));
    showView('gallery');
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

  watchStorage();
}

/**
 * The side panel and the popup write to the same storage this page reads, and
 * the gallery used to be the one surface that never noticed. Applying a Scene
 * from the panel with the gallery open left every card still claiming the old
 * one was active — an Apply button that plainly did nothing.
 */
function watchStorage() {
  onChanged(async (changes) => {
    const changed = (key) =>
      key in changes &&
      JSON.stringify(changes[key].oldValue) !== JSON.stringify(changes[key].newValue);

    if (changed('customScenes')) await reload();

    if (changed('activeScene')) {
      state.activeScene = changes.activeScene.newValue ?? 'diwan';
      renderGrid();
    }

    if (changed('activeScene') || changed('palette') || changed('density') || changed('sectionLabels')) {
      await applyPresentation(await getScene(state.activeScene));
    }
  });
}

boot();
