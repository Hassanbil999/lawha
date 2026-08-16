/**
 * tuning.js
 * The tuning panel: palette, density, labels, background, language and numerals, hosted by both the panel and the popup.
 */

/* Lawha — the tuning panel.
 *
 * One job: adjust how the active Scene looks, without leaving the new tab.
 * Colours, density, labels, background, language, numerals. Nothing here
 * creates or edits a Scene's structure — that is the gallery's work, and the
 * link at the bottom is the only door to it.
 *
 * Built once and hosted twice, by the side panel and by the toolbar popup, so
 * the two can never drift apart.
 *
 * Everything writes through setPresentation. Not one control in this file can
 * reach a DATA_KEY, which is why a tuning panel can be this direct about
 * saving on every interaction. */

import {
  PALETTE_IDS,
  PALETTE_NAMES,
  DENSITIES,
  getScene,
  readPaletteTokens,
  applyPresentation,
  harmonizePalette,
  normalizePaletteKeys,
} from './scenes.js';
import {
  t,
  currentLanguage,
  setLanguage,
  setNumerals,
  onLanguageChange,
} from './i18n.js';
import { GRADIENT_PRESETS, SCRIM_MAX, applyBackground, processImage } from './background.js';
import { paletteFromImage } from './palette-from-image.js';
import { el, replaceChildren, icon, contrastRatio, debounce, blend } from './utils.js';
import { get, getMany, setData, setPresentation } from './storage.js';

/**
 * @param {HTMLElement} root   where to mount
 * @param {object} options
 * @param {(message: string) => void} options.onToast
 */
export async function mountTuningPanel(root, { onToast = () => {} } = {}) {
  const prefs = await getMany([
    'palette',
    'density',
    'sectionLabels',
    'numerals',
    'background',
    'gradient',
    'wallpaper',
    'extractPalette',
    'imageExtractedPalette',
    'bgScrim',
    'badgeCount',
  ]);

  const state = { prefs, scene: await getScene(await get('activeScene')) };

  const sections = {
    palette: el('div', { class: 'tune-swatches', role: 'radiogroup' }),
    density: el('div', { class: 'tune-segment', role: 'radiogroup' }),
    labels: el('div', { class: 'tune-segment', role: 'radiogroup' }),
    background: el('div', { class: 'tune-segment', role: 'radiogroup' }),
    language: el('div', { class: 'tune-segment', role: 'radiogroup' }),
    numerals: el('div', { class: 'tune-segment', role: 'radiogroup' }),
    badge: el('div', { class: 'tune-segment', role: 'radiogroup' }),
  };

  const bgEditor = el('div', { class: 'tune-bg-editor' });
  const bgPreview = el('div', { class: 'tune-bg-preview', 'aria-hidden': 'true' });

  const galleryLink = el(
    'button',
    {
      class: 'tune-gallery',
      type: 'button',
      on: {
        click: () => {
          chrome.tabs
            .create({ url: chrome.runtime.getURL('gallery/gallery.html') })
            .catch((error) => console.error('Lawha: could not open the gallery', error));
          // The side panel stays; a popup would otherwise sit orphaned over the
          // page the gallery just replaced.
          if (!chrome.sidePanel || location.pathname.includes('popup')) window.close();
        },
      },
    },
    [icon('gallery'), el('span', { text: t('set_gallery') }), icon('chevron_end')]
  );

  replaceChildren(root, [
    group('set_palette', sections.palette),
    group('set_density', sections.density),
    group('set_labels', sections.labels),
    group('set_background', [sections.background, bgPreview, bgEditor]),
    group('set_language', sections.language),
    group('set_numerals', sections.numerals),
    group('set_badge', sections.badge),
    galleryLink,
  ]);

  /* ---- Painting -------------------------------------------------------- */

  function paintAll() {
    paintPalettes();
    paintDensity();
    paintLabels();
    paintLanguage();
    paintNumerals();
    paintBadge();
    paintBackground();
    galleryLink.querySelector('span').textContent = t('set_gallery');
    for (const node of root.querySelectorAll('[data-group]')) {
      node.querySelector('.l-label').textContent = t(node.dataset.group);
    }
  }

  /* ---- Palette ---------------------------------------------------------- */

  function paintPalettes() {
    const current = state.prefs.palette ?? null;
    const isCustom = current !== null && typeof current === 'object';

    const options = [
      { id: null, label: t('set_scene') },
      ...PALETTE_IDS.map((id) => ({ id, label: PALETTE_NAMES[id][currentLanguage()] })),
      { id: 'auto', label: t('opt_auto') },
    ];

    const swatches = options.map(({ id, label }) => {
      const selected = id === current || (id === null && current === null);
      const button = el('button', {
        class: `tune-swatch${id === null ? ' tune-swatch-inherit' : ''}${id === 'auto' ? ' tune-swatch-auto' : ''}`,
        type: 'button',
        role: 'radio',
        'aria-checked': String(selected && !isCustom),
        'aria-label': label,
        title: label,
        on: { click: () => choosePalette(id) },
      });

      if (id && id !== 'auto') {
        button.dataset.palette = id;
        button.append(contrastDot(readPaletteTokens(id)));
      }
      return button;
    });

    // The custom accent. Its swatch is the colour input itself, so the control
    // and its result are the same object.
    const customField = el('input', {
      class: 'tune-custom',
      type: 'color',
      'aria-label': t('pal_pick'),
      title: t('pal_custom'),
      value: currentAccent(),
    });
    customField.addEventListener('input', debounce(() => chooseAccent(customField.value), 90));

    const customWrap = el('span', { class: 'tune-custom-wrap' }, [customField]);
    if (isCustom) {
      customWrap.dataset.selected = 'true';
      customWrap.append(contrastDot(harmonizePalette(normalizePaletteKeys(current)).tokens));
    }

    replaceChildren(sections.palette, [...swatches, customWrap]);
  }

  function currentAccent() {
    const palette = state.prefs.palette;
    if (palette && typeof palette === 'object') {
      return normalizePaletteKeys(palette).accent ?? '#1F6E63';
    }
    return readPaletteTokens(palette ?? state.scene.palette).accent ?? '#1F6E63';
  }

  /** A 6px traffic light in the corner of a swatch: green at 4.5:1 and up,
   *  amber from 3.0, red below. Post-correction the red should never show. */
  function contrastDot(tokens) {
    const worst = Math.min(
      contrastRatio(tokens['text-primary'], tokens['bg-canvas']),
      contrastRatio(tokens['accent-text'], tokens.accent)
    );
    const level = worst >= 4.5 ? 'pass' : worst >= 3 ? 'warn' : 'fail';
    return el('span', {
      class: 'tune-dot',
      dataset: { level },
      'aria-hidden': 'true',
      title: t(level === 'pass' ? 'contrast_pass' : level === 'warn' ? 'contrast_warn' : 'contrast_fail'),
    });
  }

  async function choosePalette(id) {
    state.prefs.palette = id;
    await setPresentation('palette', id);
    await applyPresentation(state.scene);
    paintPalettes();
  }

  /**
   * A custom accent layered over whichever palette is showing. The rest of the
   * tokens come from that base, so one colour pick cannot leave you with an
   * unrelated interface — and harmonizePalette then guarantees the text on it
   * stays readable.
   */
  async function chooseAccent(hex) {
    const base = readPaletteTokens(
      typeof state.prefs.palette === 'string' && state.prefs.palette !== 'auto'
        ? state.prefs.palette
        : state.scene.palette
    );

    const tokens = {
      ...base,
      accent: hex.toUpperCase(),
      'accent-soft': blend(hex, base['bg-canvas'], 0.15),
      'accent-text': contrastRatio(hex, '#FFFFFF') >= 4.5 ? '#FFFFFF' : base['text-primary'],
    };

    const { corrected } = harmonizePalette(tokens);
    state.prefs.palette = tokens;
    await setPresentation('palette', tokens);
    await applyPresentation(state.scene);
    paintPalettes();
    if (corrected.length) pulse(sections.palette.querySelector('.tune-custom-wrap'));
  }

  /* ---- Density, labels, language, numerals ------------------------------ */

  function segment(node, options, current, onPick) {
    replaceChildren(
      node,
      options.map(({ value, label }) =>
        el('button', {
          class: 'tune-seg',
          type: 'button',
          role: 'radio',
          text: label,
          'aria-checked': String(value === current),
          on: { click: () => onPick(value) },
        })
      )
    );
  }

  function paintDensity() {
    segment(
      sections.density,
      [
        { value: null, label: t('set_scene') },
        ...DENSITIES.map((d) => ({ value: d, label: t(`dens_${d}`) })),
      ],
      state.prefs.density ?? null,
      async (value) => {
        state.prefs.density = value;
        await setPresentation('density', value);
        await applyPresentation(state.scene);
        paintDensity();
      }
    );
  }

  function paintLabels() {
    const current =
      state.prefs.sectionLabels === null || state.prefs.sectionLabels === undefined
        ? null
        : state.prefs.sectionLabels;

    segment(
      sections.labels,
      [
        { value: null, label: t('set_scene') },
        { value: true, label: t('opt_on') },
        { value: false, label: t('opt_off') },
      ],
      current,
      async (value) => {
        state.prefs.sectionLabels = value;
        await setPresentation('sectionLabels', value);
        await applyPresentation(state.scene);
        paintLabels();
      }
    );
  }

  function paintLanguage() {
    segment(
      sections.language,
      [
        { value: 'en', label: 'English' },
        { value: 'ar', label: 'العربية' },
      ],
      currentLanguage(),
      async (value) => {
        await setLanguage(value);
        paintAll();
      }
    );
  }

  function paintNumerals() {
    segment(
      sections.numerals,
      [
        { value: 'latin', label: t('num_latin') },
        { value: 'arabic', label: t('num_arabic') },
      ],
      state.prefs.numerals ?? 'latin',
      async (value) => {
        state.prefs.numerals = value;
        await setNumerals(value);
        paintNumerals();
      }
    );
  }

  /**
   * The tab count on the toolbar icon. Off unless asked for.
   *
   * It is the single most requested feature in tab-manager reviews and it is
   * also a number that changes every time you open a tab, which is the exact
   * restlessness the rest of this product is arranged to avoid. Both of those
   * are true, so it ships — behind a switch that starts in the off position.
   */
  function paintBadge() {
    segment(
      sections.badge,
      [
        { value: false, label: t('opt_off') },
        { value: true, label: t('opt_on') },
      ],
      Boolean(state.prefs.badgeCount),
      async (value) => {
        state.prefs.badgeCount = value;
        await setPresentation('badgeCount', value);
        paintBadge();
      }
    );
  }

  /* ---- Background ------------------------------------------------------- */

  function paintBackground() {
    const mode = state.prefs.background ?? 'theme';

    segment(
      sections.background,
      [
        { value: 'theme', label: t('bg_theme') },
        { value: 'gradient', label: t('bg_gradient') },
        { value: 'image', label: t('bg_image') },
      ],
      mode,
      async (value) => {
        state.prefs.background = value;
        await setPresentation('background', value);
        paintBackground();
      }
    );

    if (mode === 'gradient') paintGradientEditor();
    else if (mode === 'image') paintImageEditor();
    else replaceChildren(bgEditor, []);

    // The scrim only means anything over something — a wash of the canvas
    // colour over the canvas colour is invisible by definition.
    if (mode !== 'theme') bgEditor.append(scrimRow());

    applyBackground(
      {
        background: state.prefs.background,
        gradient: state.prefs.gradient,
        wallpaper: state.prefs.wallpaper,
        scrim: state.prefs.bgScrim,
      },
      bgPreview
    );
  }

  /**
   * One slider between the picture and the words.
   *
   * The most-asked-for control on any new tab that allows a photograph, and the
   * reason is always the same: the image is lovely and the text on top of it
   * has become a rumour. Nothing here is clever — it is the amount of canvas
   * colour laid over the background, from none to most.
   */
  function scrimRow() {
    const slider = el('input', {
      class: 'tune-range',
      type: 'range',
      min: '0',
      max: String(SCRIM_MAX),
      step: '5',
      value: String(state.prefs.bgScrim ?? 20),
      'aria-label': t('bg_scrim'),
    });

    const readout = el('span', {
      class: 'tune-row-note',
      text: `${state.prefs.bgScrim ?? 20}%`,
    });

    // Live while dragging, written at a rate storage is happy with.
    const save = debounce(async () => {
      await setPresentation('bgScrim', state.prefs.bgScrim);
    }, 140);

    slider.addEventListener('input', () => {
      state.prefs.bgScrim = Number(slider.value);
      readout.textContent = `${state.prefs.bgScrim}%`;
      applyBackground(
        {
          background: state.prefs.background,
          gradient: state.prefs.gradient,
          wallpaper: state.prefs.wallpaper,
          scrim: state.prefs.bgScrim,
        },
        bgPreview
      );
      save();
    });

    return el('label', { class: 'tune-row tune-scrim' }, [
      el('span', { class: 'tune-row-label' }, [el('span', { text: t('bg_scrim') }), readout]),
      slider,
    ]);
  }

  function paintGradientEditor() {
    const gradient = state.prefs.gradient ?? { colors: ['#FBFAF7', '#D6E8E4'], angle: 135 };
    const colors = [...gradient.colors];
    while (colors.length < 3) colors.push(colors[colors.length - 1]);

    const presets = el(
      'div',
      { class: 'tune-presets' },
      GRADIENT_PRESETS.map((preset) =>
        el('button', {
          class: 'tune-preset',
          type: 'button',
          'aria-label': t(`grad_${preset.id}`),
          title: t(`grad_${preset.id}`),
          style: { '--preset': `linear-gradient(${preset.angle}deg, ${preset.colors.join(', ')})` },
          on: {
            click: async () => {
              state.prefs.gradient = {
                colors: preset.colors.length >= 3 ? preset.colors : [...preset.colors, preset.colors.at(-1)],
                angle: preset.angle,
              };
              await setPresentation('gradient', state.prefs.gradient);
              paintBackground();
            },
          },
        })
      )
    );

    const fields = colors.slice(0, 3).map((color, index) =>
      el('input', {
        class: 'tune-color',
        type: 'color',
        value: color,
        'aria-label': `${t('bg_colors')} ${index + 1}`,
      })
    );

    const angle = el('input', {
      class: 'tune-range',
      type: 'range',
      min: '0',
      max: '359',
      step: '1',
      value: String(gradient.angle ?? 135),
      'aria-label': t('bg_angle'),
    });

    const save = debounce(async () => {
      state.prefs.gradient = {
        colors: fields.map((field) => field.value),
        angle: Number(angle.value),
      };
      await setPresentation('gradient', state.prefs.gradient);
      paintBackground();
    }, 110);

    for (const field of fields) field.addEventListener('input', save);
    angle.addEventListener('input', save);

    replaceChildren(bgEditor, [
      presets,
      el('div', { class: 'tune-colors' }, fields),
      el('label', { class: 'tune-row' }, [
        el('span', { class: 'tune-row-label', text: t('bg_angle') }),
        angle,
      ]),
    ]);
  }

  function paintImageEditor() {
    const file = el('input', { type: 'file', accept: 'image/*', class: 'l-sr-only' });
    file.addEventListener('change', (event) => handleImage(event.target));

    const extractToggle = el('button', {
      class: 'tune-toggle',
      type: 'button',
      role: 'switch',
      'aria-checked': String(Boolean(state.prefs.extractPalette)),
      on: {
        click: async () => {
          state.prefs.extractPalette = !state.prefs.extractPalette;
          await setPresentation('extractPalette', state.prefs.extractPalette);
          await applyExtraction();
          paintBackground();
        },
      },
    });

    replaceChildren(bgEditor, [
      el('label', { class: 'l-btn tune-file' }, [
        el('span', { text: t('bg_choose_image') }),
        file,
      ]),
      el('button', {
        class: 'l-btn',
        type: 'button',
        text: t('bg_clear_image'),
        on: {
          click: async () => {
            await setData('wallpaper', null);
            state.prefs.wallpaper = null;
            state.prefs.imageExtractedPalette = null;
            await setPresentation('imageExtractedPalette', null);
            await applyExtraction();
            paintBackground();
          },
        },
      }),
      // Istikhrāj. On by default: an image the interface does not match is the
      // worse of the two defaults.
      el('div', { class: 'tune-row tune-extract' }, [
        el('span', { class: 'tune-row-label' }, [
          el('span', { text: t('bg_extract') }),
          el('span', { class: 'tune-row-note', text: t('bg_extract_note') }),
        ]),
        extractToggle,
      ]),
    ]);
  }

  async function handleImage(input) {
    const picked = input.files?.[0];
    input.value = '';
    if (!picked) return;

    const result = await processImage(picked);
    if (!result.ok) {
      onToast(t(result.reason));
      return;
    }

    await setData('wallpaper', result.dataURL);
    state.prefs.wallpaper = result.dataURL;

    // Derive once, on upload, and cache. Re-running k-means on every new tab
    // would be milliseconds wasted on an answer that cannot have changed.
    const derived = await paletteFromImage(result.dataURL);
    state.prefs.imageExtractedPalette = derived;
    await setPresentation('imageExtractedPalette', derived);

    await applyExtraction();
    paintBackground();
    paintPalettes();
  }

  /** Push the extracted palette into the live palette override, or take it
   *  back out when the toggle goes off. */
  async function applyExtraction() {
    const derived = state.prefs.imageExtractedPalette;

    if (state.prefs.extractPalette && derived) {
      state.prefs.palette = derived;
      await setPresentation('palette', derived);

      // An interface that already shares the photograph's colour DNA needs far
      // less separating it from the photograph. Halving the scrim is the visible
      // argument for deriving the palette at all — but only from the untouched
      // default, and as a real stored value the slider can put back.
      if ((state.prefs.bgScrim ?? 20) === 20) {
        state.prefs.bgScrim = 10;
        await setPresentation('bgScrim', 10);
      }
    } else if (state.prefs.palette && typeof state.prefs.palette === 'object') {
      // Only clear an override we put there ourselves.
      state.prefs.palette = null;
      await setPresentation('palette', null);
    }

    await applyPresentation(state.scene);
  }

  /* ---- Helpers ---------------------------------------------------------- */

  function group(labelKey, body) {
    return el('section', { class: 'tune-group', dataset: { group: labelKey } }, [
      el('h2', { class: 'l-label', text: t(labelKey) }),
      ...[].concat(body),
    ]);
  }

  /** A 400ms accent ring: "I adjusted this slightly." Not an interruption. */
  function pulse(node) {
    if (!node) return;
    node.classList.remove('is-adjusted');
    void node.offsetWidth;
    node.classList.add('is-adjusted');
    node.title = t('tune_adjusted');
  }

  onLanguageChange(paintAll);
  paintAll();

  return {
    async refresh() {
      state.scene = await getScene(await get('activeScene'));
      Object.assign(
        state.prefs,
        await getMany([
          'palette',
          'density',
          'sectionLabels',
          'background',
          'wallpaper',
          'bgScrim',
          'badgeCount',
        ])
      );
      paintAll();
    },
  };
}
