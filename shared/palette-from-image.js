/**
 * palette-from-image.js
 * Derives a full palette from a wallpaper, on this machine, with no network and no upload.
 */

/* Lawha — Istikhrāj (استخراج, "extraction").
 *
 * The image does not sit behind the interface. The interface is grown from the
 * image: every surface, rule and accent comes out of the photograph's own
 * colour distribution, so the whole thing harmonises with what is behind it.
 * That is what separates this from "photo, with UI on top".
 *
 * Text is the exception, and it is deliberate. Harmony is the wrong goal for
 * something you have to read off a photograph — a colour drawn from the picture
 * is by definition close to the picture. See the note above the text tokens.
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

/** Not pure black: #000 against a photograph reads as a hole punched in it. */
const INK = '#0A0A0A';

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

  /* Text over a wallpaper does not sit on --bg-canvas. It sits on the
   * photograph, and harmonizePalette — which measures text against the canvas
   * and the card — is therefore checking it against a surface that is nowhere
   * on screen. A palette can pass that check and still put grey-on-grey over
   * the picture, which is exactly how a clock becomes unreadable.
   *
   * So the text tokens stop being drawn from the image and become the only two
   * colours that are safe against all of it: white or near-black, whichever
   * stands further off the photograph's own midtone. Everything else — canvas,
   * card, accent, border — still comes out of the picture, so the interface
   * keeps its colour DNA and only the reading surface is made absolute. */
  // Driven by the same isDark that chose the canvas and the card, not by an
  // independent contrast comparison against the midtone. Those two can disagree
  // on an image whose midtone sits near the threshold, and the disagreement is
  // ugly in a specific way: white text picked for the photograph, over a canvas
  // picked light for the same photograph, is invisible on every card.
  //
  // One decision, three surfaces. For a genuinely dark or genuinely light image
  // this lands on the same answer either method would give; for a midtone one,
  // neither white nor black clears 7:1 against the picture and no choice here
  // could — that is what the scrim is for.
  const textPrimary = isDark ? '#FFFFFF' : INK;

  /* Secondary and muted are that same colour, stepped back toward the canvas.
   * Written as opaque hex rather than rgba(): isSafeColor admits #RGB, #RRGGBB
   * and an "r g b" triple and nothing else, so an alpha colour here would be
   * refused the moment this palette was exported and imported again. */
  return {
    'bg-canvas': canvasColor,
    'bg-raised': raised,
    'bg-card': card,
    'text-primary': textPrimary,
    'text-secondary': blend(textPrimary, canvasColor, 0.72),
    'text-muted': blend(textPrimary, canvasColor, 0.45),
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
