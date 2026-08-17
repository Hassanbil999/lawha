/**
 * feeds.js
 * The feeds module: a read-only subscription list, list and compact variants.
 */

/* Lawha — feeds (متابعات).
 *
 * Variants: list · compact · off
 *
 * Nothing here fetches anything. All network work happens in background.js,
 * on a timer and once immediately when a feed is added — this module only
 * reads what has already been fetched, marks items read, and asks the service
 * worker to add or remove a subscription. */

import { el, faviconImage, domainOf, safeURL, contextMenu, urlDedupeKey, emptyState } from '../shared/utils.js';
import { get, updateData } from '../shared/storage.js';
import { MAX_FEEDS } from '../shared/feeds.js';
import { sendMessage } from '../shared/messaging.js';

export const id = 'feeds';

/** Static, and identical in both languages — a domain is not translated. */
const HINTS = [
  { label: 'Medium', url: 'medium.com/feed/@username' },
  { label: 'Substack', url: 'yourname.substack.com/feed' },
  { label: 'YouTube', url: 'youtube.com/feeds/videos.xml?channel_id=ID' },
  { label: 'Reddit', url: 'reddit.com/r/name/.rss' },
  { label: 'GitHub', url: 'github.com/user/repo/releases.atom' },
];

export async function render(cfg, ctx) {
  if (cfg.variant === 'off') return null;

  const all = await get('feeds');
  const totalUnread = all.reduce((sum, feed) => sum + unreadCount(feed), 0);

  const wrap = el('div', { class: `feeds feeds-${cfg.variant}` });
  for (const feed of all) wrap.append(buildFeedRow(feed, cfg, ctx));
  wrap.append(buildAddRow(all.length, ctx));

  if (!all.length) {
    wrap.append(emptyState(ctx.t('feeds_empty'), '+'));
  }

  return ctx.section('sec_feeds', wrap, { module: id, count: totalUnread });
}

function unreadCount(feed) {
  return feed.items.filter((item) => !item.read).length;
}

function buildFeedRow(feed, cfg, ctx) {
  const unread = unreadCount(feed);
  const newest = feed.items[0];

  const head = el(
    'a',
    { class: 'l-row feed-head', href: feed.siteUrl || feed.url, title: feed.title || feed.url },
    [
      faviconImage(feed.siteUrl || feed.url, 16),
      el('span', { class: 'l-row-title', text: feed.title || domainOf(feed.url) || feed.url }),
      unread
        ? el('span', {
            class: 'feed-unread',
            text: unread === 1 ? ctx.t('feeds_unread_one') : ctx.t('feeds_unread_many', ctx.fmtNum(unread)),
          })
        : null,
      feed.lastError
        ? el(
            'span',
            { class: 'feed-error', role: 'img', 'aria-label': ctx.t('feeds_error_icon'), title: feed.lastError },
            [ctx.icon('alert', 12)]
          )
        : null,
    ]
  );

  const children = [head];

  if (cfg.variant === 'list' && newest) {
    children.push(
      el(
        'button',
        {
          class: 'feed-headline',
          type: 'button',
          title: newest.title,
          on: { click: () => openItem(feed.id, newest, ctx) },
        },
        [faviconImage(newest.link, 16), el('span', { text: newest.title })]
      )
    );
  }

  const row = el('div', { class: 'feed-row', dataset: { id: feed.id } }, children);

  row.addEventListener('contextmenu', (event) =>
    contextMenu(event, [
      unread
        ? { label: ctx.t('feeds_mark_read'), icon: 'check', onSelect: () => markAllRead(feed.id, ctx) }
        : null,
      { label: ctx.t('action_remove'), icon: 'trash', danger: true, onSelect: () => removeFeed(feed.id, ctx) },
    ])
  );

  return row;
}

function buildAddRow(count, ctx) {
  if (count >= MAX_FEEDS) {
    return el('p', { class: 'l-empty feed-max', text: ctx.t('feeds_max') });
  }
  return el(
    'button',
    { class: 'l-row feed-add', type: 'button', on: { click: () => openAddDialog(ctx) } },
    [ctx.icon('plus'), el('span', { class: 'l-row-title', text: ctx.t('feeds_add') })]
  );
}

/** Opens in a new tab rather than navigating in place — the new tab page
 *  underneath is the canvas Feeds sits on, not a page you meant to leave. */
function openItem(feedId, item, ctx) {
  chrome.tabs.create({ url: item.link });
  markRead(feedId, item.link, ctx);
}

async function markRead(feedId, link, ctx) {
  await updateData('feeds', (current) =>
    current.map((feed) =>
      feed.id === feedId
        ? { ...feed, items: feed.items.map((item) => (item.link === link ? { ...item, read: true } : item)) }
        : feed
    )
  );
  ctx.refresh(id);
}

async function markAllRead(feedId, ctx) {
  await updateData('feeds', (current) =>
    current.map((feed) =>
      feed.id === feedId ? { ...feed, items: feed.items.map((item) => ({ ...item, read: true })) } : feed
    )
  );
  ctx.refresh(id);
}

async function removeFeed(feedId, ctx) {
  await updateData('feeds', (current) => current.filter((feed) => feed.id !== feedId));
  ctx.refresh(id);
}

/** Add or edit. A <dialog>, the same pattern shortcuts.js uses for its own
 *  add flow — a labelled field, Add/Cancel, nothing modal-within-modal. */
function openAddDialog(ctx) {
  const urlField = el('input', {
    class: 'l-input',
    type: 'url',
    id: 'feed-url',
    required: true,
    placeholder: 'https://example.com/feed.xml',
  });

  const status = el('p', { class: 'feed-form-status', role: 'status' });

  const hints = el(
    'div',
    { class: 'feed-form-hints' },
    HINTS.map((hint) =>
      el('p', { class: 'feed-form-hint' }, [
        el('span', { class: 'feed-form-hint-label', text: `${hint.label}: ` }),
        hint.url,
      ])
    )
  );

  const submitButton = el('button', { class: 'l-btn l-btn-primary', type: 'submit', text: ctx.t('feeds_add') });

  const form = el('form', { method: 'dialog', class: 'feed-form' }, [
    el('label', { class: 'l-label', for: 'feed-url', text: ctx.t('feeds_url_label') }),
    urlField,
    el('p', { class: 'l-empty', text: ctx.t('feeds_hint_url') }),
    status,
    el('div', { class: 'shortcut-form-actions' }, [
      el('button', { class: 'l-btn', type: 'button', text: ctx.t('action_cancel'), on: { click: () => dialog.close() } }),
      submitButton,
    ]),
    hints,
  ]);

  const dialog = el('dialog', { class: 'l-dialog' }, [form]);
  document.body.append(dialog);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const parsed = safeURL(urlField.value.trim());
    if (!parsed || parsed.protocol !== 'https:') {
      status.textContent = ctx.t('feeds_add_error');
      urlField.focus();
      return;
    }

    const current = await get('feeds');
    if (current.length >= MAX_FEEDS) {
      status.textContent = ctx.t('feeds_max');
      return;
    }
    if (current.some((feed) => urlDedupeKey(feed.url) === urlDedupeKey(parsed.toString()))) {
      status.textContent = ctx.t('feeds_add_error');
      return;
    }

    submitButton.disabled = true;
    status.textContent = ctx.t('feeds_fetching');

    const response = await sendMessage({ type: 'lawha:add-feed', url: parsed.toString() });

    if (!response?.ok) {
      status.textContent = ctx.t('feeds_add_error');
      submitButton.disabled = false;
      return;
    }

    dialog.close();
    await ctx.refresh(id);
  });

  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
  urlField.focus();
}
