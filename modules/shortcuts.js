/**
 * shortcuts.js
 * The shortcuts module: five layouts, drag reordering, an add/edit dialog, and filter-on-type.
 */

/* Lawha — shortcuts.
 *
 * Variants: circles · squares · strip · ring · list
 *
 * The only module on the new tab that writes user data, and it does so only in
 * response to a deliberate act: adding, editing, reordering, removing. None of
 * that happens during a render, which is why the data guard in storage.js can
 * be as absolute as it is.
 *
 * A Scene's `max` caps what is *drawn*, never what is *kept*. Switching to a
 * Scene that shows eight of your twelve shortcuts leaves twelve in storage. */

import { el, faviconImage, identityTile, contextMenu, domainOf, safeURL } from '../shared/utils.js';
import { get, updateData, capped, LIMITS } from '../shared/storage.js';

export const id = 'shortcuts';

export async function render(cfg, ctx) {
  const all = await get('shortcuts');
  const ordered = [...all].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const shown = ordered.slice(0, cfg.max);

  const grid =
    cfg.variant === 'list'
      ? renderList(shown, cfg, ctx)
      : renderGrid(shown, cfg, ctx);

  if (!all.length) {
    grid.append(el('p', { class: 'l-empty', text: ctx.t('shortcuts_empty') }));
  }

  const hint = el('p', { class: 'shortcuts-filter', role: 'status', hidden: true });
  wireFilter(grid, hint, ctx);

  return ctx.section('sec_shortcuts', el('div', { class: 'shortcuts-wrap' }, [hint, grid]), {
    module: id,
  });
}

/* ---- Filtering on type --------------------------------------------------
 * Past a dozen shortcuts, finding one by eye is slower than the click is worth.
 * So: with focus anywhere in the grid, start typing and the grid narrows.
 *
 * There is no search field, and that is the point. A field would take up room
 * on every single new tab to serve the handful of seconds a week anyone spends
 * looking. Typing is the trigger, the way it is in a file list — you do not ask
 * to search, you simply start, and the only thing on screen while you are not
 * filtering is the shortcuts themselves. */

/** Everything a query might reasonably be matched against, folded to lower
 *  case once at build time rather than on every keystroke. */
function matchKey(item) {
  return `${item.label ?? ''} ${domainOf(item.url)} ${item.url}`.toLowerCase();
}

function wireFilter(grid, hint, ctx) {
  let query = '';

  /** Repaint, and hand back the first surviving tile — which is the one Enter
   *  should open. */
  function paint() {
    const needle = query.trim().toLowerCase();
    let first = null;

    for (const node of grid.querySelectorAll('[data-match]')) {
      const hit = !needle || node.dataset.match.includes(needle);
      node.classList.toggle('is-filtered-out', !hit);
      if (hit && !first) first = node;
    }

    grid.classList.toggle('is-filtering', Boolean(needle));
    hint.hidden = !needle;
    if (needle) {
      hint.textContent = first ? ctx.t('filter_hint') : ctx.t('filter_none', query);
    }
    return first;
  }

  function clear() {
    query = '';
    paint();
  }

  grid.addEventListener('keydown', (event) => {
    // Chorded keys belong to the browser and to the palette.
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (event.key === 'Escape') {
      if (!query) return;
      event.preventDefault();
      clear();
      return;
    }

    if (event.key === 'Enter') {
      // With no filter running, a focused link opens itself. Leave it alone.
      if (!query) return;
      const first = paint();
      if (!first) return;
      event.preventDefault();
      first.click();
      clear();
      return;
    }

    if (event.key === 'Backspace') {
      if (!query) return;
      event.preventDefault();
      query = query.slice(0, -1);
      paint();
      return;
    }

    // One printable character. Named keys — Tab, ArrowDown, Shift — are longer
    // than one, so this is the whole test. Space only counts once a query has
    // started, so it can still activate the add button.
    if (event.key.length !== 1) return;
    if (event.key === ' ' && !query) return;

    event.preventDefault();
    query += event.key;
    paint();
  });

  // Leaving the grid ends the filter. Coming back to a page still showing
  // yesterday's query would be a small mystery every time.
  grid.addEventListener('focusout', (event) => {
    if (grid.contains(event.relatedTarget)) return;
    if (query) clear();
  });
}

/* ---- Grid-ish variants: circles, squares, strip, ring ------------------- */

function renderGrid(items, cfg, ctx) {
  const wrap = el('div', {
    class: `shortcuts shortcuts-${cfg.variant}`,
    role: 'list',
  });

  if (cfg.variant === 'circles' || cfg.variant === 'squares') {
    wrap.style.setProperty('--per-row', String(cfg.perRow));
  }

  items.forEach((item, index) => {
    wrap.append(buildTile(item, index, cfg, ctx, items));
  });

  // The add button takes a place in the ring rather than sitting outside it —
  // a circle with something bolted to one side is not a circle.
  wrap.append(buildAddButton(cfg, ctx));

  if (cfg.variant === 'ring') {
    // Positions are percentages around the container centre, set as custom
    // properties so CSS can place them with logical insets and RTL mirrors
    // the ring for free.
    const children = [...wrap.children];
    children.forEach((child, index) => {
      const angle = (index / children.length) * Math.PI * 2 - Math.PI / 2;
      child.style.setProperty('--ring-x', `${50 + Math.cos(angle) * 38}%`);
      child.style.setProperty('--ring-y', `${50 + Math.sin(angle) * 38}%`);
    });
  }

  return wrap;
}

function buildTile(item, index, cfg, ctx, items) {
  const label = item.label || domainOf(item.url) || item.url;

  const mark = el('span', { class: 'shortcut-mark' }, [
    faviconImage(item.url, cfg.variant === 'circles' ? 20 : 24, { className: 'shortcut-fav' }),
  ]);

  if (cfg.variant === 'squares') {
    const { gradient } = identityTile(item.url);
    mark.style.setProperty('--tile-gradient', gradient);
  }

  const children = [mark];
  if (cfg.labels) {
    children.push(el('span', { class: 'shortcut-label', text: label }));
  }

  const link = el(
    'a',
    {
      class: 'shortcut',
      href: item.url,
      role: 'listitem',
      draggable: 'true',
      title: label,
      dataset: { index: String(index), match: matchKey(item) },
    },
    children
  );

  link.addEventListener('contextmenu', (event) =>
    contextMenu(event, [
      { label: ctx.t('action_edit'), icon: 'note', onSelect: () => editShortcut(item, ctx) },
      {
        label: ctx.t('action_remove'),
        icon: 'trash',
        danger: true,
        onSelect: () => removeShortcut(item, ctx),
      },
    ])
  );

  wireDragging(link, index, items, ctx);
  return link;
}

function buildAddButton(cfg, ctx) {
  const button = el(
    'button',
    {
      class: 'shortcut shortcut-add',
      type: 'button',
      'aria-label': ctx.t('action_add'),
      on: { click: () => editShortcut(null, ctx) },
    },
    [el('span', { class: 'shortcut-mark' }, [ctx.icon('plus')])]
  );
  if (cfg.labels) button.append(el('span', { class: 'shortcut-label', text: ctx.t('action_add') }));
  return button;
}

/* ---- list variant ------------------------------------------------------- */

function renderList(items, cfg, ctx) {
  const list = el('ul', { class: 'shortcuts shortcuts-list', role: 'list' });

  items.forEach((item, index) => {
    const label = item.label || domainOf(item.url) || item.url;
    const link = el(
      'a',
      {
        class: 'l-row',
        href: item.url,
        draggable: 'true',
        dataset: { match: matchKey(item) },
      },
      [faviconImage(item.url, 16), el('span', { class: 'l-row-title', text: label })]
    );

    link.addEventListener('contextmenu', (event) =>
      contextMenu(event, [
        { label: ctx.t('action_edit'), icon: 'note', onSelect: () => editShortcut(item, ctx) },
        {
          label: ctx.t('action_remove'),
          icon: 'trash',
          danger: true,
          onSelect: () => removeShortcut(item, ctx),
        },
      ])
    );

    wireDragging(link, index, items, ctx);
    list.append(el('li', { role: 'listitem' }, [link]));
  });

  list.append(
    el('li', {}, [
      el(
        'button',
        {
          class: 'l-row shortcuts-list-add',
          type: 'button',
          on: { click: () => editShortcut(null, ctx) },
        },
        [ctx.icon('plus'), el('span', { class: 'l-row-title', text: ctx.t('action_add') })]
      ),
    ])
  );

  return list;
}

/* ---- Reordering --------------------------------------------------------- */

function wireDragging(node, index, items, ctx) {
  node.addEventListener('dragstart', (event) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
    node.classList.add('is-dragging');
  });

  node.addEventListener('dragend', () => node.classList.remove('is-dragging'));

  node.addEventListener('dragover', (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    node.classList.add('is-drop');
  });

  node.addEventListener('dragleave', () => node.classList.remove('is-drop'));

  node.addEventListener('drop', async (event) => {
    event.preventDefault();
    node.classList.remove('is-drop');
    const from = Number(event.dataTransfer.getData('text/plain'));
    if (!Number.isInteger(from) || from === index) return;
    await reorder(items[from], index, ctx);
  });
}

async function reorder(moved, toIndex, ctx) {
  if (!moved) return;
  await updateData('shortcuts', (current) => {
    const sorted = [...current].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const from = sorted.findIndex((s) => s.url === moved.url);
    if (from < 0) return current;
    const [item] = sorted.splice(from, 1);
    sorted.splice(toIndex, 0, item);
    return sorted.map((s, order) => ({ ...s, order }));
  });
  ctx.refresh(id);
}

/* ---- Editing ------------------------------------------------------------ */

async function removeShortcut(item, ctx) {
  await updateData('shortcuts', (current) =>
    current.filter((s) => s.url !== item.url).map((s, order) => ({ ...s, order }))
  );
  ctx.refresh(id);
}

/**
 * Add or edit. A <dialog> rather than window.prompt, so the field can be
 * labelled in both languages and the URL normalised before it is stored.
 */
function editShortcut(existing, ctx) {
  const urlField = el('input', {
    class: 'l-input',
    type: 'url',
    id: 'shortcut-url',
    required: true,
    placeholder: 'example.com',
    value: existing?.url ?? '',
  });

  const labelField = el('input', {
    class: 'l-input',
    type: 'text',
    id: 'shortcut-label',
    maxlength: String(LIMITS.shortcutLabel),
    value: capped(existing?.label, LIMITS.shortcutLabel),
  });

  // A counter that appears only near the end. Shown from the first keystroke it
  // would be a running commentary on typing a six-letter word.
  const counter = el('span', { class: 'l-count', 'aria-hidden': 'true', hidden: true });
  const paintCounter = () => {
    const near = labelField.value.length >= Math.floor(LIMITS.shortcutLabel * 0.8);
    counter.hidden = !near;
    if (near) counter.textContent = String(LIMITS.shortcutLabel - labelField.value.length);
  };
  labelField.addEventListener('input', paintCounter);
  paintCounter();

  const form = el('form', { method: 'dialog', class: 'shortcut-form' }, [
    el('label', { class: 'l-label', for: 'shortcut-url', text: ctx.t('shortcut_url') }),
    urlField,
    el('label', { class: 'l-label', for: 'shortcut-label' }, [
      ctx.t('shortcut_label'),
      counter,
    ]),
    labelField,
    el('div', { class: 'shortcut-form-actions' }, [
      el('button', {
        class: 'l-btn',
        type: 'button',
        text: ctx.t('action_cancel'),
        on: { click: () => dialog.close() },
      }),
      el('button', {
        class: 'l-btn l-btn-primary',
        type: 'submit',
        text: existing ? ctx.t('action_done') : ctx.t('action_add'),
      }),
    ]),
  ]);

  const dialog = el('dialog', { class: 'l-dialog' }, [form]);
  document.body.append(dialog);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const url = normalizeURL(urlField.value);
    if (!url) {
      urlField.focus();
      return;
    }
    // Capped again here: the maxlength attribute is a courtesy to whoever is
    // typing, not a guarantee about what reaches storage.
    const label = capped(labelField.value.trim(), LIMITS.shortcutLabel);

    await updateData('shortcuts', (current) => {
      const next = existing
        ? current.map((s) => (s.url === existing.url ? { ...s, url, label } : s))
        : [...current, { url, label, order: current.length }];
      return next.map((s, order) => ({ ...s, order }));
    });

    dialog.close();
    ctx.refresh(id);
  });

  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
  urlField.focus();
}

/** Accept "example.com" as readily as a full URL; reject anything that is not
 *  http(s), so a shortcut cannot become a javascript: link. */
function normalizeURL(value) {
  const raw = value.trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  const parsed = safeURL(withScheme);
  if (!parsed) return null;
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return parsed.toString();
}
