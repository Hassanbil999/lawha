/**
 * recent.js
 * The recent-pages module: list, compact, tiles and feed variants.
 */

/* Lawha — recent.
 *
 * Variants: list · compact · tiles · feed
 *
 * Reads the last week of history and dedupes by URL, because a page you
 * visited nine times is one page, not nine rows. */

import {
  el,
  faviconImage,
  identityTile,
  domainOf,
  dedupeBy,
  relativeTime,
  copyButton,
} from '../shared/utils.js';

export const id = 'recent';

const WEEK = 7 * 864e5;

async function load(cfg) {
  const results = await chrome.history.search({
    text: '',
    maxResults: 30,
    startTime: Date.now() - WEEK,
  });

  return dedupeBy(
    results.filter((item) => item.url && item.title),
    (item) => item.url
  ).slice(0, cfg.max);
}

export async function render(cfg, ctx) {
  const items = await load(cfg);

  if (!items.length) {
    return ctx.section('sec_recent', el('p', { class: 'l-empty', text: ctx.t('recent_empty') }), {
      module: id,
    });
  }

  const renderers = { list: asRows, compact: asRows, tiles: asTiles, feed: asFeed };
  const body = (renderers[cfg.variant] || asRows)(items, cfg, ctx);

  return ctx.section('sec_recent', body, { module: id });
}

/* `list` and `compact` differ only in density, which is a CSS concern — the
   markup they need is identical. */
function asRows(items, cfg, ctx) {
  const list = el('ul', { class: `recent recent-${cfg.variant}`, role: 'list' });

  for (const item of items) {
    const children = [faviconImage(item.url, 16), el('span', { class: 'l-row-title', text: item.title })];

    if (cfg.showDomain && cfg.variant !== 'compact') {
      children.push(el('span', { class: 'recent-domain', text: domainOf(item.url) }));
    }
    if (cfg.showTime) {
      children.push(
        el('span', {
          class: 'l-row-meta',
          text: relativeTime(item.lastVisitTime, ctx.t, ctx.fmtNum),
        })
      );
    }

    list.append(
      el('li', { class: 'l-row-host' }, [
        el('a', { class: 'l-row l-row-copyable', href: item.url, title: item.title }, children),
        copyButton(item.url, ctx.t, ctx.icon),
      ])
    );
  }

  return list;
}

function asTiles(items, cfg, ctx) {
  const grid = el('div', { class: 'recent recent-tiles', role: 'list' });

  for (const item of items) {
    const { gradient, letter, domain } = identityTile(item.url);
    const tile = el(
      'a',
      {
        class: 'l-tile',
        href: item.url,
        role: 'listitem',
        title: item.title,
        style: { '--tile-gradient': gradient },
      },
      [
        faviconImage(item.url, 24, { className: 'l-tile-mark' }),
        el('span', { class: 'l-tile-domain', text: domain || letter }),
      ]
    );
    grid.append(el('div', { class: 'l-tile-host' }, [tile, copyButton(item.url, ctx.t, ctx.icon)]));
  }

  return grid;
}

/** Grouped by domain: one card per site, its pages beneath. Reads as a feed
 *  of places rather than a stream of URLs. */
function asFeed(items, cfg, ctx) {
  const groups = new Map();
  for (const item of items) {
    const domain = domainOf(item.url) || item.url;
    if (!groups.has(domain)) groups.set(domain, []);
    groups.get(domain).push(item);
  }

  const feed = el('div', { class: 'recent recent-feed' });

  for (const [domain, entries] of groups) {
    const card = el('div', { class: 'l-card l-card-interactive recent-feed-card' }, [
      el('div', { class: 'recent-feed-head' }, [
        faviconImage(entries[0].url, 16),
        el('span', { class: 'recent-feed-domain', text: domain }),
        el('span', { class: 'l-row-meta', text: ctx.fmtNum(entries.length) }),
      ]),
    ]);

    const list = el('ul', { class: 'recent-feed-list', role: 'list' });
    for (const entry of entries.slice(0, 4)) {
      list.append(
        el('li', { class: 'l-row-host' }, [
          el(
            'a',
            {
              class: 'recent-feed-link l-row-copyable',
              href: entry.url,
              title: entry.title,
            },
            [
              el('span', { class: 'l-row-title', text: entry.title }),
              cfg.showTime
                ? el('span', {
                    class: 'l-row-meta',
                    text: relativeTime(entry.lastVisitTime, ctx.t, ctx.fmtNum),
                  })
                : null,
            ]
          ),
          copyButton(entry.url, ctx.t, ctx.icon),
        ])
      );
    }

    card.append(list);
    feed.append(card);
  }

  return feed;
}
