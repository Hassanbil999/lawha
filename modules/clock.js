/**
 * clock.js
 * The clock module: minimal, monumental and ring variants.
 */

/* Lawha — clock.
 *
 * Variants: minimal · monumental · ring · off
 *
 * The digits are the one place besides the active tab title where weight 600
 * appears. They are set in --font-body rather than --font-display because 600
 * is a weight we actually bundle for IBM Plex Sans Arabic; asking Tajawal for
 * 600 when only 500 and 700 ship would quietly render 700 instead. */

import { el, greetingKey } from '../shared/utils.js';

export const id = 'clock';

const SVG_NS = 'http://www.w3.org/2000/svg';

export async function render(cfg, ctx) {
  if (cfg.variant === 'off') return null;

  const root = el('div', { class: `clock clock-${cfg.variant}` });

  const time = el('div', { class: 'clock-time', role: 'timer' });
  const greeting = cfg.greeting ? el('p', { class: 'clock-greeting' }) : null;
  const date = cfg.date ? el('p', { class: 'clock-date' }) : null;

  // The text always lives in its own box so the ring variant can stack the
  // dial and the reading in one grid cell without three separate overlays.
  const text = el('div', { class: 'clock-text' }, [time, greeting, date]);

  let dial = null;
  if (cfg.variant === 'ring') {
    dial = buildDial();
    root.append(dial.svg);
  }

  root.append(text);

  let lastMinute = -1;

  const paint = () => {
    const now = new Date();
    const text = ctx.formatTime(now, { seconds: cfg.seconds });

    if (time.textContent !== text) {
      time.textContent = text;
      // A new minute arrives with a fade rather than a snap. Restarting the
      // animation needs the class off for one frame.
      if (now.getMinutes() !== lastMinute) {
        time.classList.remove('is-fresh');
        void time.offsetWidth;
        time.classList.add('is-fresh');
        lastMinute = now.getMinutes();
      }
    }

    if (greeting) greeting.textContent = ctx.t(greetingKey(now));
    if (date) date.textContent = ctx.formatDate(now);
    if (dial) dial.update(now);
  };

  paint();
  if (cfg.seconds) ctx.everySecond(paint);
  else ctx.everyMinute(paint);

  return root;
}

/** A 12-hour dial: a hairline track, an accent sweep for the elapsed half-day,
 *  and a dot at the present moment. Clockwise in both directions — a clock
 *  face is not a reading order. */
function buildDial() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'clock-dial');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.setAttribute('aria-hidden', 'true');

  const track = document.createElementNS(SVG_NS, 'circle');
  track.setAttribute('class', 'clock-dial-track');
  track.setAttribute('cx', '60');
  track.setAttribute('cy', '60');
  track.setAttribute('r', '52');
  track.setAttribute('pathLength', '1');

  const sweep = document.createElementNS(SVG_NS, 'circle');
  sweep.setAttribute('class', 'clock-dial-sweep');
  sweep.setAttribute('cx', '60');
  sweep.setAttribute('cy', '60');
  sweep.setAttribute('r', '52');
  sweep.setAttribute('pathLength', '1');
  // Start the sweep at 12 o'clock instead of 3.
  sweep.setAttribute('transform', 'rotate(-90 60 60)');

  const now = document.createElementNS(SVG_NS, 'circle');
  now.setAttribute('class', 'clock-dial-now');
  now.setAttribute('r', '4');

  svg.append(track, sweep, now);

  return {
    svg,
    update(date) {
      const p = ((date.getHours() % 12) * 60 + date.getMinutes()) / 720;
      sweep.setAttribute('stroke-dasharray', `${p} 1`);
      const angle = p * Math.PI * 2 - Math.PI / 2;
      now.setAttribute('cx', String(60 + Math.cos(angle) * 52));
      now.setAttribute('cy', String(60 + Math.sin(angle) * 52));
    },
  };
}
