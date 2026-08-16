/**
 * bookmarks.js
 * The bookmarks module: folders, shelf, tree, tiles and columns variants.
 */

/* Lawha — bookmarks.
 *
 * Variants: folders · shelf · tree · tiles · columns
 *
 * Folders with nothing in them are dropped: an empty folder is filing, not
 * content, and it should not cost you a row on the page you look at most. */

import { el, faviconImage, identityTile, domainOf } from '../shared/utils.js';

export const id = 'bookmarks';

/** Flatten the tree into folders that actually hold links, deepest names kept
 *  so "Reading / Longform" stays distinguishable from "Work / Longform". */
function collectFolders(nodes, trail = [], out = []) {
  for (const node of nodes) {
    if (!node.children) continue;

    const links = node.children.filter((child) => child.url);
    const name = node.title || trail[trail.length - 1] || '';

    if (links.length && name) {
      out.push({ id: node.id, title: name, links });
    }
    collectFolders(node.children, [...trail, node.title], out);
  }
  return out;
}

async function load(cfg) {
  const tree = await chrome.bookmarks.getTree();
  const roots = tree[0]?.children ?? [];
  return collectFolders(roots).slice(0, cfg.max);
}

export async function render(cfg, ctx) {
  const folders = await load(cfg);

  if (!folders.length) {
    return ctx.section(
      'sec_collections',
      el('p', { class: 'l-empty', text: ctx.t('bookmarks_empty') }),
      { module: id }
    );
  }

  const renderers = {
    folders: asFolders,
    shelf: asShelf,
    tree: asTree,
    tiles: asTiles,
    columns: asColumns,
  };
  const body = (renderers[cfg.variant] || asFolders)(folders, cfg, ctx);

  return ctx.section('sec_collections', body, { module: id });
}

/* ---- folders: a card per folder, four favicons as a preview ------------- */

function asFolders(folders, cfg, ctx) {
  const grid = el('div', { class: 'bookmarks bookmarks-folders' });

  for (const folder of folders) {
    const preview = el(
      'div',
      { class: 'bookmark-preview' },
      folder.links.slice(0, 4).map((link) => faviconImage(link.url, 16))
    );

    const head = el('div', { class: 'bookmark-folder-head' }, [
      el('span', { class: 'bookmark-folder-name', text: folder.title }),
      el('span', { class: 'l-row-meta', text: ctx.fmtNum(folder.links.length) }),
    ]);

    const card = el('div', { class: 'l-card l-card-interactive bookmark-folder' }, [preview, head]);

    if (cfg.expandable) {
      const links = folderLinks(folder, ctx);
      const drawer = el('div', { class: 'l-drawer' }, [links]);
      card.append(drawer);

      const toggle = el('button', {
        class: 'bookmark-folder-toggle',
        type: 'button',
        'aria-expanded': 'false',
        'aria-label': `${ctx.t('action_expand')} — ${folder.title}`,
      });
      toggle.addEventListener('click', () => {
        const open = card.dataset.open === 'true';
        card.dataset.open = String(!open);
        toggle.setAttribute('aria-expanded', String(!open));
        toggle.setAttribute(
          'aria-label',
          `${open ? ctx.t('action_expand') : ctx.t('action_collapse')} — ${folder.title}`
        );
      });
      card.prepend(toggle);
    }

    grid.append(card);
  }

  return grid;
}

function folderLinks(folder, ctx, limit = 12) {
  const list = el('ul', { class: 'bookmark-links', role: 'list' });
  for (const link of folder.links.slice(0, limit)) {
    list.append(
      el('li', {}, [
        el('a', { class: 'l-row', href: link.url, title: link.title || link.url }, [
          faviconImage(link.url, 16),
          el('span', { class: 'l-row-title', text: link.title || domainOf(link.url) }),
        ]),
      ])
    );
  }
  return list;
}

/* ---- shelf: one horizontal scroll row per folder ------------------------ */

function asShelf(folders, cfg, ctx) {
  const wrap = el('div', { class: 'bookmarks bookmarks-shelf' });

  for (const folder of folders) {
    const rail = el('div', { class: 'bookmark-shelf-rail' });

    for (const link of folder.links) {
      const { gradient } = identityTile(link.url);
      rail.append(
        el(
          'a',
          {
            class: 'bookmark-shelf-item',
            href: link.url,
            title: link.title || link.url,
            style: { '--tile-gradient': gradient },
          },
          [
            faviconImage(link.url, 20),
            el('span', { class: 'bookmark-shelf-title', text: link.title || domainOf(link.url) }),
          ]
        )
      );
    }

    wrap.append(
      el('section', { class: 'bookmark-shelf' }, [
        el('h3', { class: 'l-label', text: folder.title }),
        rail,
      ])
    );
  }

  return wrap;
}

/* ---- tree: indented, collapsible --------------------------------------- */

function asTree(folders, cfg, ctx) {
  const tree = el('ul', { class: 'bookmarks bookmarks-tree', role: 'tree' });

  folders.forEach((folder, index) => {
    const links = folderLinks(folder, ctx, 40);
    const drawer = el('div', { class: 'l-drawer' }, [links]);

    const branch = el('li', { class: 'bookmark-branch', role: 'treeitem' });
    // The first folder opens by default so the variant does not read as an
    // empty list of words on first sight.
    branch.dataset.open = String(index === 0);
    drawer.id = `tree-${folder.id}`;

    const toggle = el(
      'button',
      {
        class: 'l-branch-toggle',
        type: 'button',
        'aria-expanded': String(index === 0),
        'aria-controls': drawer.id,
      },
      [
        ctx.icon('chevron_end'),
        el('span', { class: 'l-branch-name', text: folder.title }),
        el('span', { class: 'l-row-meta', text: ctx.fmtNum(folder.links.length) }),
      ]
    );

    toggle.addEventListener('click', () => {
      const open = branch.dataset.open === 'true';
      branch.dataset.open = String(!open);
      toggle.setAttribute('aria-expanded', String(!open));
    });

    branch.append(toggle, drawer);
    tree.append(branch);
  });

  return tree;
}

/* ---- tiles: every link, no folders -------------------------------------- */

function asTiles(folders, cfg, ctx) {
  const grid = el('div', { class: 'bookmarks bookmarks-tiles', role: 'list' });

  const links = folders.flatMap((folder) => folder.links).slice(0, cfg.max * 4);

  for (const link of links) {
    const { gradient, domain, letter } = identityTile(link.url);
    grid.append(
      el(
        'a',
        {
          class: 'l-tile',
          href: link.url,
          role: 'listitem',
          title: link.title || link.url,
          style: { '--tile-gradient': gradient },
        },
        [
          faviconImage(link.url, 24, { className: 'l-tile-mark' }),
          el('span', { class: 'l-tile-domain', text: domain || letter }),
        ]
      )
    );
  }

  return grid;
}

/* ---- columns: newspaper set --------------------------------------------- */

function asColumns(folders, cfg, ctx) {
  const wrap = el('div', { class: 'bookmarks bookmarks-columns' });

  for (const folder of folders) {
    const group = el('section', { class: 'bookmark-column' }, [
      el('h3', { class: 'l-label', text: folder.title }),
    ]);

    const list = el('ul', { class: 'bookmark-column-list', role: 'list' });
    for (const link of folder.links.slice(0, 12)) {
      list.append(
        el('li', {}, [
          el('a', {
            class: 'bookmark-column-link',
            href: link.url,
            title: link.title || link.url,
            text: link.title || domainOf(link.url),
          }),
        ])
      );
    }

    group.append(list);
    wrap.append(group);
  }

  return wrap;
}
