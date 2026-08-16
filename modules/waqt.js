/**
 * waqt.js
 * The Waqt module: a hairline showing how far through the day it is.
 */

/* Lawha — waqt (وقت).
 *
 * Variants: arc · bar · dots · off
 *
 * One hairline spanning the day from 00:00 to 23:59, with a single dot at the
 * present moment. No labels, no numbers, no tooltip. You notice it on the
 * fifth day, not the first, and then you cannot unsee where you are in your
 * day. This is the only place in Lawha where boldness is spent; it is also
 * aria-hidden, because it is atmosphere rather than information.
 *
 * In RTL the whole thing is mirrored in CSS, so time runs right to left for an
 * Arabic reader. */

import { el, dayProgress } from '../shared/utils.js';

export const id = 'waqt';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ARC_D = 'M 20 30 Q 500 4 980 30';

export async function render(cfg, ctx) {
  if (cfg.variant === 'off') return null;

  const builders = { arc: buildArc, bar: buildBar, dots: buildDots };
  const built = builders[cfg.variant]();

  built.update(dayProgress());
  // getPointAtLength is reliable once the path is in a rendered tree, so the
  // arc is positioned again on the first frame after mounting. The minute
  // ticks then keep it honest.
  requestAnimationFrame(() => built.update(dayProgress()));
  ctx.everyMinute(() => built.update(dayProgress()));

  return built.node;
}

function buildArc() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'waqt waqt-arc');
  svg.setAttribute('viewBox', '0 0 1000 40');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');

  const track = document.createElementNS(SVG_NS, 'path');
  track.setAttribute('class', 'waqt-track');
  track.setAttribute('d', ARC_D);
  track.setAttribute('pathLength', '1');

  const past = document.createElementNS(SVG_NS, 'path');
  past.setAttribute('class', 'waqt-past');
  past.setAttribute('d', ARC_D);
  past.setAttribute('pathLength', '1');

  const now = document.createElementNS(SVG_NS, 'circle');
  now.setAttribute('class', 'waqt-now');
  now.setAttribute('r', '4');

  svg.append(track, past, now);

  return {
    node: svg,
    update(p) {
      past.setAttribute('stroke-dasharray', `${p} 1`);
      // getTotalLength reports the real geometric length, which is what
      // getPointAtLength expects — pathLength only rescales the dash units.
      const point = track.getPointAtLength(p * track.getTotalLength());
      now.setAttribute('cx', String(point.x));
      now.setAttribute('cy', String(point.y));
    },
  };
}

function buildBar() {
  const fill = el('div', { class: 'waqt-bar-fill' });
  const dot = el('div', { class: 'waqt-bar-dot' });
  const node = el('div', { class: 'waqt waqt-bar', 'aria-hidden': 'true' }, [fill, dot]);

  return {
    node,
    update(p) {
      // A custom property rather than a physical width, so the fill grows from
      // the inline start whichever way the page runs.
      node.style.setProperty('--waqt-p', String(p));
    },
  };
}

function buildDots() {
  const dots = Array.from({ length: 24 }, (_, hour) =>
    el('span', { class: 'waqt-dot', dataset: { hour: String(hour) } })
  );
  const node = el('div', { class: 'waqt waqt-dots', 'aria-hidden': 'true' }, dots);

  return {
    node,
    update(p) {
      const current = Math.floor(p * 24);
      dots.forEach((dot, hour) => {
        dot.dataset.state = hour < current ? 'past' : hour === current ? 'now' : 'ahead';
      });
    },
  };
}
