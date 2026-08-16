/**
 * icons.js
 * The icon sprite, built with DOM calls so it inherits currentColor and needs no markup injection.
 */

/* Lawha — the icon sprite.
 *
 * Built with DOM calls rather than shipped as an SVG file, for two reasons:
 * the extension CSP forbids injecting markup, and an external <use> reference
 * would not inherit currentColor from the page, so icons would stop following
 * the palette. One source of truth, no fetch, no innerHTML.
 *
 * Every path is drawn on a 16-unit grid with a 1.5 stroke and round caps, so
 * they sit at the same optical weight as the hairline rules around them. */

export const ICON_PATHS = {
  close: 'M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5',
  plus: 'M8 3.5v9M3.5 8h9',
  search: 'M7.25 11.5a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5ZM10.5 10.5 13.5 13.5',
  chevron_end: 'M6.5 4 10.5 8 6.5 12',
  chevron_down: 'M4 6.5 8 10.5 12 6.5',
  pin: 'M9.5 2.5 13.5 6.5M10.5 3.5 7 7l-3 .8L8.2 12l.8-3 3.5-3.5M6 10 2.5 13.5',
  mute: 'M8 3.5 5 6H2.5v4H5l3 2.5v-9ZM10.5 6.5l3 3M13.5 6.5l-3 3',
  sound: 'M8 3.5 5 6H2.5v4H5l3 2.5v-9ZM10.75 5.75a3 3 0 0 1 0 4.5',
  bookmark: 'M4 2.5h8v11l-4-3-4 3v-11Z',
  note: 'M3.5 2.5h9v11h-9zM6 5.5h4M6 8h4M6 10.5h2.5',
  later: 'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM8 5v3.2l2.2 1.3',
  trash: 'M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.6 8.5h4.8l.6-8.5',
  check: 'M3.5 8.5 6.5 11.5 12.5 4.5',
  image: 'M2.5 3.5h11v9h-11zM2.5 10.5 6 7l3 3 2-2 2.5 2.5M10.5 6.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z',
  panel: 'M2.5 3.5h11v9h-11zM6.5 3.5v9',
  settings: 'M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM8 1.75v1.6M8 12.65v1.6M2.6 8h1.6M11.8 8h1.6M4.18 4.18l1.13 1.13M10.69 10.69l1.13 1.13M11.82 4.18l-1.13 1.13M5.31 10.69l-1.13 1.13',
  external: 'M9.5 3.5h3v3M12.5 3.5 7.5 8.5M11.5 9.5v3h-8v-8h3',
  grip: 'M6 4.5h.01M10 4.5h.01M6 8h.01M10 8h.01M6 11.5h.01M10 11.5h.01',
  arrow_start: 'M12.5 8h-9M7 3.5 2.5 8 7 12.5',
  palette: 'M8 2.5a5.5 5.5 0 0 0 0 11c.83 0 1.5-.67 1.5-1.5 0-.83.67-1.5 1.5-1.5h1a2.5 2.5 0 0 0 2.5-2.5A5.5 5.5 0 0 0 8 2.5ZM5.25 6.5h.01M8 5h.01M10.75 6.5h.01',
  gallery: 'M2.5 2.5h5v5h-5zM8.5 2.5h5v5h-5zM2.5 8.5h5v5h-5zM8.5 8.5h5v5h-5z',
  copy: 'M6.5 6.5h6v6h-6zM3.5 9.5v-6h6',
  // The turning-back arrow on the restore-your-tabs strip.
  restore: 'M13 12.5a5 5 0 0 0-5-5H3.5M3.5 7.5 6.5 4.5M3.5 7.5 6.5 10.5',
  // The letter lam, at sprite scale. The standalone assets/icons/logo.svg
  // carries the present-moment dot as well; here the upright reads on its own.
  logo: 'M10.5 3.5v6a3 3 0 0 1-3 3 3 3 0 0 1-3-3',
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Append the sprite to a document. Idempotent — calling it twice is a no-op,
 * so a page can call it without knowing whether something else already did.
 */
export function mountIconSprite(doc = document) {
  if (doc.getElementById('l-icon-sprite')) return;

  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.id = 'l-icon-sprite';
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.style.setProperty('position', 'absolute');
  svg.style.setProperty('width', '0');
  svg.style.setProperty('height', '0');
  svg.style.setProperty('overflow', 'hidden');

  for (const [name, d] of Object.entries(ICON_PATHS)) {
    const symbol = doc.createElementNS(SVG_NS, 'symbol');
    symbol.id = `i-${name}`;
    symbol.setAttribute('viewBox', '0 0 16 16');

    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');

    symbol.append(path);
    svg.append(symbol);
  }

  doc.body.prepend(svg);
}
