/**
 * palette-from-image.js
 * Derives a full palette from a wallpaper, on this machine, with no network and no upload.
 */

/* Lawha — Istikhrāj (استخراج, "extraction").
 *
 * The image does not sit behind the interface. The interface is grown from the
 * image: every token comes out of the photograph's own colour distribution, so
 * cards, rules and text already harmonise with what is behind them. That is
 * what separates this from "photo, with UI on top" — the scrim can then be
 * almost nothing (8–12%) instead of the 20% wash a mismatched UI needs to stay
 * legible.
 *
 * Everything runs locally on a 100×100 canvas in a couple of milliseconds. No
 * service, no upload, no network. */

import { kMeans } from './kmeans.js';
import {
  luminance,
  saturation,
  blend,
  hexToRGBTriple,
  contrastRatio,
  hslToHex,
  hexToHSL,
} from './utils.js';

const SAMPLE = 100;

function toHex([r, g, b]) {
  const channel = (v) => Math.round(v).toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode that image'));
    img.src = src;
  });
}

/**
 * Derive a complete palette from an image.
 *
 * @param {string} imageUrl  a data: URL produced by processImage
 * @returns {Promise<object|null>} palette tokens, or null if nothing usable
 */
export async function paletteFromImage(imageUrl) {
  let img;
  try {
    img = await loadImage(imageUrl);
  } catch {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE;
  canvas.height = SAMPLE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(img, 0, 0, SAMPLE, SAMPLE);

  const { data } = context.getImageData(0, 0, SAMPLE, SAMPLE);
  const clusters = kMeans(data, 6, 10);
  if (clusters.length < 2) return null;

  const hexes = clusters.map(toHex);
  const byLuminance = [...hexes].sort((a, b) => luminance(a) - luminance(b));

  const pick = (fraction) =>
    byLuminance[Math.min(byLuminance.length - 1, Math.round(fraction * (byLuminance.length - 1)))];

  const darkest = byLuminance[0];
  const dark = pick(0.2);
  const mid = pick(0.5);
  const light = pick(0.8);
  const lightest = byLuminance[byLuminance.length - 1];

  // The accent is the most saturated colour the image actually contains, so it
  // reads as belonging to the photograph rather than being applied to it.
  const accent = accentFrom(hexes, clusters);

  // A photograph whose midtone is dark wants a dark interface. Judged on the
  // midtone rather than the mean, which a bright sky would drag upward.
  const isDark = luminance(mid) < 0.18;

  const canvasColor = isDark ? darkest : lightest;
  const raised = isDark ? dark : light;
  const card = isDark ? dark : '#FFFFFF';

  return {
    'bg-canvas': canvasColor,
    'bg-raised': raised,
    'bg-card': card,
    'text-primary': isDark ? lightest : darkest,
    'text-secondary': isDark ? light : dark,
    'text-muted': mid,
    accent,
    'accent-soft': blend(accent, canvasColor, 0.15),
    'accent-text': contrastRatio(accent, '#FFFFFF') >= 4.5 ? '#FFFFFF' : darkest,
    border: blend(mid, canvasColor, 0.4),
    'shadow-color': hexToRGBTriple(darkest),
  };

  // The tokens above still pass through harmonizePalette on the way to the
  // page, so a photograph of fog cannot leave you with grey text on grey.
}

/**
 * The most saturated cluster, with a nudge toward ones that actually cover
 * some of the image. A vivid four-pixel highlight is not what the picture
 * looks like.
 */
function accentFrom(hexes, clusters) {
  let best = hexes[0];
  let bestScore = -Infinity;

  hexes.forEach((hex, index) => {
    const weight = clusters[index].weight ?? 0;
    const score = saturation(hex) * (0.5 + Math.min(weight, 0.3));
    if (score > bestScore) {
      bestScore = score;
      best = hex;
    }
  });

  // A nearly grey image gives a nearly grey accent, which reads as broken
  // rather than restrained. Give it enough saturation to look deliberate.
  const [h, s, l] = hexToHSL(best);
  if (s < 12) return hslToHex(h, 28, l < 50 ? Math.max(l, 42) : Math.min(l, 58));
  return best;
}
