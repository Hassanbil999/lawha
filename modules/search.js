/**
 * search.js
 * The search module: a bar or an icon that opens the command palette.
 */

/* Lawha — search.
 *
 * Variants: bar · icon · off
 *
 * This module is only the doorway. The searching itself lives in the command
 * palette, which is reachable with Ctrl+K in every Scene whatever this module
 * is set to — so `off` costs you a visible affordance, never the capability.
 *
 * Both visible variants are buttons rather than inputs. An input here would
 * have to hand its keystrokes to the palette overlay and then take focus back
 * when it closed, which produces a field that reopens the moment you dismiss
 * it. A button that says what it does is the honest version of the same
 * gesture. */

import { el } from '../shared/utils.js';

export const id = 'search';

export async function render(cfg, ctx) {
  if (cfg.variant === 'off') return null;

  const button = el(
    'button',
    {
      class: `search search-${cfg.variant}`,
      type: 'button',
      'aria-label': ctx.t('cmd_placeholder'),
      'aria-keyshortcuts': 'Control+K',
      on: { click: () => ctx.openPalette('') },
    },
    [
      ctx.icon('search'),
      el('span', { class: 'search-placeholder', text: ctx.t('cmd_placeholder') }),
      el('kbd', { class: 'search-key', text: 'Ctrl K' }),
    ]
  );

  return button;
}
