/**
 * feeds.js
 * Feed constants and RSS/Atom parsing, shared by the service worker, the offscreen document and the new tab.
 */

/* Lawha — feeds (متابعات).
 *
 * parseFeedDocument needs a real DOMParser, which a Manifest V3 service
 * worker does not have. background.js fetches; offscreen.js is the page that
 * actually calls this. Nothing here touches chrome.* or the network, so it is
 * safe to import from either place, or from the new tab, without pulling in
 * an API that context does not have. */

import { capped, LIMITS } from './storage.js';
import { isSafeURL } from './utils.js';

export const MAX_FEEDS = 12;
export const MAX_ITEMS_PER_FEED = 10;
export const FEED_REFRESH_MINUTES = 30;

/** Read a feed's items, title and site link out of a parsed RSS or Atom
 *  document. `existingLinks` carries read state forward across a refetch —
 *  an item does not un-read itself because it was fetched again. */
export function parseFeedDocument(doc, existingLinks = []) {
  const isAtom = doc.querySelector('feed') !== null;
  const seen = new Set(existingLinks);
  const rawItems = isAtom ? parseAtomItems(doc) : parseRSSItems(doc);

  const title = capped(
    (isAtom ? doc.querySelector('feed > title') : doc.querySelector('channel > title'))
      ?.textContent?.trim() || '',
    LIMITS.feedTitle
  );

  const rawSiteUrl = isAtom
    ? doc.querySelector('feed > link[rel="alternate"]')?.getAttribute('href') ||
      doc.querySelector('feed > link:not([rel])')?.getAttribute('href') ||
      ''
    : doc.querySelector('channel > link')?.textContent?.trim() || '';
  // A feed is untrusted content. isSafeURL is the same http(s)-only gate the
  // rest of Lawha puts on any URL it did not construct itself — without it, a
  // feed's own <link> could carry a javascript: URI that runs the moment
  // someone clicks what looks like a headline.
  const siteUrl = isSafeURL(rawSiteUrl) ? rawSiteUrl : '';

  const items = rawItems
    .filter((item) => isSafeURL(item.link))
    .map((item) => ({ ...item, read: seen.has(item.link) }))
    .sort((a, b) => b.pubDate - a.pubDate)
    .slice(0, MAX_ITEMS_PER_FEED);

  return { title, siteUrl, items };
}

function parseRSSItems(doc) {
  return Array.from(doc.querySelectorAll('item')).map((item) => ({
    title: capped((item.querySelector('title')?.textContent || '').trim(), LIMITS.feedItemTitle),
    link: (item.querySelector('link')?.textContent || '').trim(),
    pubDate: Date.parse(item.querySelector('pubDate')?.textContent || '') || 0,
  }));
}

function parseAtomItems(doc) {
  return Array.from(doc.querySelectorAll('entry')).map((entry) => ({
    title: capped((entry.querySelector('title')?.textContent || '').trim(), LIMITS.feedItemTitle),
    link:
      entry.querySelector('link[rel="alternate"]')?.getAttribute('href') ||
      entry.querySelector('link')?.getAttribute('href') ||
      '',
    pubDate:
      Date.parse(
        entry.querySelector('updated')?.textContent ||
          entry.querySelector('published')?.textContent ||
          ''
      ) || 0,
  }));
}
