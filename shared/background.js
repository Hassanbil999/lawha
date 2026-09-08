/**
 * background.js
 * Paints the background layer — theme colour, gradient, or a local image — and prepares a picked file.
 */

/* Lawha — backgrounds.
 *
 * Three options, all local: the Scene's own canvas colour, a gradient you mix
 * yourself, or an image off your disk. Nothing is fetched, nothing is
 * uploaded, and the image never leaves chrome.storage.local.
 *
 * The scrim is the reason a photograph does not wreck legibility: a wash of
 * --bg-canvas sits between the image and the content, so --text-primary keeps
 * something to sit against whatever the photo is doing underneath.
 *
 * How much of a wash is the one thing about a background that nobody else can
 * decide for you — it depends on the photograph, on the palette, and on how
 * much you would rather see the picture than the words. So it is a slider, not
 * a constant, and "beautiful photo, can't read anything" stops being a review
 * and starts being a five-second fix. */

import { t } from './i18n.js';
import { blend, contrastRatio, hexToRgb } from './utils.js';

/** Ten presets. Names are the ids; the labels live in i18n under grad_*. */
export const GRADIENT_PRESETS = [
  { id: 'fajr', colors: ['#1B2A4A', '#B76E79', '#E8A87C'], angle: 160 },
  { id: 'sahara', colors: ['#F3E3C3', '#D9A566'], angle: 135 },
  { id: 'bahr', colors: ['#0F3A4B', '#4FA3A5'], angle: 150 },
  { id: 'zaytoun', colors: ['#E8EADF', '#7C8C5A'], angle: 135 },
  { id: 'layl', colors: ['#0B0E14', '#232B3E'], angle: 165 },
  { id: 'ward', colors: ['#F7E3E8', '#C97B92'], angle: 135 },
  { id: 'raml', colors: ['#F5EFE2', '#CBB08A'], angle: 120 },
  { id: 'dukhan', colors: ['#E7E7E9', '#9AA0A6'], angle: 140 },
  { id: 'nuhas', colors: ['#F0DCCB', '#A85C32'], angle: 135 },
  { id: 'thalj', colors: ['#FFFFFF', '#DDE6EE'], angle: 160 },
];

export function gradientLabel(presetId) {
  return t(`grad_${presetId}`);
}

const HEX = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i;

/** A gradient is two or three hex colours and an angle. Anything else falls
 *  back to the palette's own canvas, rather than emitting CSS we did not
 *  write. */
export function gradientCSS(gradient) {
  const colors = (gradient?.colors ?? []).filter((c) => HEX.test(String(c).trim()));
  if (colors.length < 2) return null;

  const angle = Number(gradient?.angle);
  const safeAngle = Number.isFinite(angle) ? ((angle % 360) + 360) % 360 : 135;

  return `linear-gradient(${safeAngle}deg, ${colors.slice(0, 3).join(', ')})`;
}

/**
 * Paint the background layer.
 *
 * Everything is written as custom properties through CSSOM — base.css owns the
 * actual .l-bg rules. That keeps the CSP happy and means the ambient drift
 * animation is a stylesheet concern rather than something JavaScript drives.
 */
/** Past this the background has stopped being a background. */
export const SCRIM_MAX = 80;

/* ---- The legibility floor -----------------------------------------------
 * A palette's text colours are mixed against that palette's own canvas. Put a
 * night-sky gradient behind them and the canvas is no longer what the text is
 * sitting on, so the ratios the palette was built to hold stop holding — near
 * black type on a near black photograph, which is what "beautiful background,
 * can't read anything" actually means.
 *
 * Correcting the text instead of the backdrop is the tempting fix and it is
 * wrong: the same tokens are drawn on opaque cards, so lightening them for a
 * dark backdrop makes a note invisible on its own white card. The backdrop is
 * the only surface that can move without taking something else with it.
 *
 * So the stored scrim is a preference and this is a floor under it: enough
 * wash of --bg-canvas that --text-primary clears 4.5:1 against what it ends up
 * on. On a background that suits the palette it computes to zero and nothing
 * changes.
 *
 * The floor is measured on --text-primary alone, and that is a decision rather
 * than an oversight. Holding the quieter tokens to their own ratios as well
 * needs half again as much wash, and past about half a night sky is a grey
 * rectangle — the background has been deleted to save the labels on top of it.
 * The labels are handled the other way instead, in base.css: over anything but
 * a flat canvas they step toward --text-primary, which costs the picture
 * nothing because it only ever raises contrast, on the backdrop and on an
 * opaque card alike. */
const TEXT_PRIMARY_MIN = 4.5;

/** The colour content actually sits on: the layer with `percent` of the canvas
 *  washed over it. */
function composite(canvasHex, layerHex, percent) {
  return blend(canvasHex, layerHex, percent / 100);
}

function readable(primary, backdrop) {
  return contrastRatio(primary, backdrop) >= TEXT_PRIMARY_MIN;
}

/**
 * The smallest scrim, at or above `from`, that keeps the palette's text
 * readable over `layers`. Returns `from` unchanged when nothing is fighting,
 * and never exceeds SCRIM_MAX — past that the background has stopped being one.
 *
 * @param {string[]} layers  the colours behind the content: a gradient's stops,
 *                           or the dominant colours of an image.
 */
export function legibilityFloor(layers, { canvas, primary }, from = 0) {
  const stops = layers.filter((hex) => hexToRgb(hex));
  if (!stops.length || !hexToRgb(canvas) || !hexToRgb(primary)) return from;

  let percent = Math.max(0, from);
  // Five points at a time: finer steps buy a fraction of a ratio point and
  // cost a wash nobody can see the difference in.
  while (
    percent < SCRIM_MAX &&
    !stops.every((hex) => readable(primary, composite(canvas, hex, percent)))
  ) {
    percent += 5;
  }
  return Math.min(SCRIM_MAX, percent);
}

/**
 * Paint the background layer.
 *
 * `imagePalette` is the palette Istikhraj derived from the wallpaper, when
 * there is one. It is the only read we have on what an image is doing under
 * the text, so it is what the floor is measured against; without it an image
 * keeps whatever scrim it was given.
 */
export function applyBackground(
  { background = 'theme', gradient = null, wallpaper = null, scrim = 20, imagePalette = null } = {},
  root = document.documentElement
) {
  const chosen = Math.min(SCRIM_MAX, Math.max(0, Number(scrim) || 0));
  const percent = Math.min(
    SCRIM_MAX,
    Math.max(chosen, floorFor(background, gradient, imagePalette, root, chosen))
  );
  const wash = `color-mix(in srgb, var(--bg-canvas) ${percent}%, transparent)`;

  const setLayer = (layer, { scrim: over = 'transparent', size = 'auto', position = '50% 50%' } = {}) => {
    root.style.setProperty('--bg-layer', layer);
    root.style.setProperty('--bg-scrim', over);
    root.style.setProperty('--bg-size', size);
    root.style.setProperty('--bg-position', position);
  };

  if (background === 'image' && wallpaper) {
    // The data: URL is ours — it was produced by the canvas below, never taken
    // from a Scene file — so it is safe to put inside url().
    setLayer(`url("${wallpaper}")`, { scrim: wash, size: 'cover' });
    root.dataset.bg = 'image';
    return;
  }

  if (background === 'gradient') {
    const css = gradientCSS(gradient);
    if (css) {
      setLayer(css, { scrim: wash });
      root.dataset.bg = 'gradient';
      return;
    }
  }

  // The Scene's own canvas colour is already --bg-canvas. Washing it with more
  // of itself would do nothing but cost a paint.
  setLayer('var(--bg-canvas)');
  root.dataset.bg = 'theme';
}

/**
 * The floor for the background actually being painted.
 *
 * Tokens are read off the element rather than kept as a second copy in
 * JavaScript, exactly as readPaletteTokens does, so a custom or extracted
 * palette is measured as it really resolves — and so this stays correct after
 * a palette change without knowing one happened.
 */
function floorFor(background, gradient, imagePalette, root, from) {
  const element = root.nodeType === 1 ? root : document.documentElement;
  if (!element || typeof getComputedStyle !== 'function') return from;

  let layers = [];
  if (background === 'gradient') {
    layers = (gradient?.colors ?? []).map((c) => String(c).trim()).filter((c) => HEX.test(c));
  } else if (background === 'image' && imagePalette) {
    // The two surfaces Istikhraj read out of the picture. Its accent is a
    // highlight rather than something text sits on, so it is left out.
    layers = [imagePalette['bg-canvas'], imagePalette['bg-card']].filter(Boolean);
  }
  if (!layers.length) return from;

  const styles = getComputedStyle(element);
  const token = (name) => styles.getPropertyValue(`--${name}`).trim();

  return legibilityFloor(layers, { canvas: token('bg-canvas'), primary: token('text-primary') }, from);
}

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_IMAGE_WIDTH = 2560;

/** High enough that a photograph keeps its grain, low enough that a wallpaper
 *  is not the largest thing in local storage. */
const IMAGE_QUALITY = 0.86;

/**
 * Turn a picked file into something a new tab can paint in under a frame.
 *
 * Rejects anything over 3 MB up front — the point of the limit is that new
 * tabs stay fast, and a person deserves to be told before waiting on a decode.
 * What survives is downscaled to 2560px and re-encoded, so the stored copy is
 * usually a fraction of the original either way.
 *
 * @returns {Promise<{ok: true, dataURL: string} | {ok: false, reason: string}>}
 */
export async function processImage(file) {
  if (!file || !file.type.startsWith('image/')) return { ok: false, reason: 'import_bad' };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, reason: 'image_too_big' };

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, reason: 'import_bad' };
  }

  const scale = Math.min(1, MAX_IMAGE_WIDTH / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // PNG for anything with transparency, JPEG otherwise — a photograph stored
  // as PNG is several megabytes for no visible gain.
  const type = file.type === 'image/png' || file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
  return { ok: true, dataURL: canvas.toDataURL(type, IMAGE_QUALITY) };
}
