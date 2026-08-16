/**
 * later.js
 * The reading queue: count, list and tiles variants, and the shared save path.
 */

/* Lawha — later.
 *
 * Variants: count · list · tiles · off
 *
 * A reading queue that does not nag. `count` is deliberately the default: a
 * number is enough to remember that there is something waiting, and it costs
 * one line of the page. */

import {
  el,
  faviconImage,
  identityTile,
  domainOf,
  relativeTime,
  contextMenu,
  copyButton,
  isSafeURL,
} from '../shared/utils.js';
import { get, updateData, capped, LIMITS } from '../shared/storage.js';

export const id = 'later';

export async function render(cfg, ctx) {
  if (cfg.variant === 'off') return null;

  const all = await get('later');
  const ordered = [...all].sort((a, b) => (b.saved ?? 0) - (a.saved ?? 0));

  if (cfg.variant === 'count') {
    return ctx.section('sec_later', buildCount(ordered, ctx), {
      module: id,
      count: ordered.length,
    });
  }

  if (!ordered.length) {
    return ctx.section('sec_later', el('p', { class: 'l-empty', text: ctx.t('later_empty') }), {
      module: id,
    });
  }

  const shown = ordered.slice(0, cfg.max);
  const body = cfg.variant === 'tiles' ? asTiles(shown, ctx) : asList(shown, ctx);

  return ctx.section('sec_later', body, { module: id, count: ordered.length });
}

/** A badge, not a list. Clicking it opens the oldest thing you saved, which is
 *  almost always the one you meant to get back to. */
function buildCount(items, ctx) {
  if (!items.length) {
    return el('p', { class: 'l-empty', text: ctx.t('later_empty') });
  }

  const oldest = items[items.length - 1];
  return el(
    'a',
    {
      class: 'later-count',
      href: oldest.url,
      title: oldest.title || oldest.url,
    },
    [
      el('span', { class: 'later-count-number', text: ctx.fmtNum(items.length) }),
      el('span', { class: 'later-count-label', text: ctx.t('sec_later') }),
    ]
  );
}

function asList(items, ctx) {
  const list = el('ul', { class: 'later later-list', role: 'list' });

  for (const item of items) {
    const row = el(
      'a',
      { class: 'l-row l-row-copyable', href: item.url, title: item.title || item.url },
      [
        faviconImage(item.url, 16),
        el('span', { class: 'l-row-title', text: item.title || domainOf(item.url) }),
        el('span', { class: 'l-row-meta', text: relativeTime(item.saved, ctx.t, ctx.fmtNum) }),
      ]
    );
    wireRemove(row, item, ctx);
    list.append(el('li', { class: 'l-row-host' }, [row, copyButton(item.url, ctx.t, ctx.icon)]));
  }

  return list;
}

function asTiles(items, ctx) {
  const grid = el('div', { class: 'later later-tiles', role: 'list' });

  for (const item of items) {
    const { gradient, domain, letter } = identityTile(item.url);
    const tile = el(
      'a',
      {
        class: 'l-tile',
        href: item.url,
        role: 'listitem',
        title: item.title || item.url,
        style: { '--tile-gradient': gradient },
      },
      [
        faviconImage(item.url, 24, { className: 'l-tile-mark' }),
        el('span', { class: 'l-tile-domain', text: domain || letter }),
      ]
    );
    wireRemove(tile, item, ctx);
    grid.append(el('div', { class: 'l-tile-host' }, [tile, copyButton(item.url, ctx.t, ctx.icon)]));
  }

  return grid;
}

function wireRemove(node, item, ctx) {
  node.addEventListener('contextmenu', (event) =>
    contextMenu(event, [
      {
        label: ctx.t('action_remove'),
        icon: 'trash',
        danger: true,
        onSelect: () => removeLater(item.url, ctx),
      },
    ])
  );
}

async function removeLater(url, ctx) {
  await updateData('later', (current) => current.filter((entry) => entry.url !== url));
  ctx.refresh(id);
}

/** Used by the toolbar command and the sidebar context menu. Exported so the
 *  save path lives with the module that owns the data. */
export async function saveForLater({ url, title }) {
  // The queue is a list of things that will be opened later, so nothing that
  // cannot safely be opened belongs in it.
  if (!isSafeURL(url)) throw new Error(`Lawha blocked an unsafe URL: ${url}`);

  await updateData('later', (current) => {
    if (current.some((entry) => entry.url === url)) return current;
    return [
      ...current,
      { url, title: capped(title || url, LIMITS.laterTitle), saved: Date.now() },
      // Same cap as the toolbar command, applied on the same terms — the queue
      // has one size limit however you reached it.
    ].slice(-LIMITS.laterItems);
  });
}
