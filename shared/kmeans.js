/**
 * kmeans.js
 * k-means clustering over pixel colours, used to derive a palette from an image.
 */

/* Lawha — k-means clustering in RGB space.
 *
 * Sixty lines, no dependency, used once: to find the handful of colours an
 * image is actually made of so a palette can be derived from it.
 *
 * Initialisation is deliberately deterministic — seeds are taken at even
 * intervals through the sample sorted by luminance, rather than at random. The
 * same photograph must always produce the same palette, or a Scene someone
 * saved would drift every time it was reopened. */

/** Squared Euclidean distance. The square root would not change the ordering. */
function distance(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function rawLuminance([r, g, b]) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * @param {Uint8ClampedArray} data  RGBA bytes, as from getImageData
 * @param {number} k                how many clusters
 * @param {number} iterations       Lloyd's algorithm passes
 * @returns {Array<[number, number, number]>} centroids, one per cluster
 */
export function kMeans(data, k = 6, iterations = 10) {
  const points = [];
  for (let i = 0; i < data.length; i += 4) {
    // Skip anything meaningfully transparent: it is not a colour the viewer
    // sees, and averaging it in drags every cluster toward the same grey.
    if (data[i + 3] < 128) continue;
    points.push([data[i], data[i + 1], data[i + 2]]);
  }

  if (!points.length) return [];
  if (points.length <= k) return points.slice();

  const ordered = [...points].sort((a, b) => rawLuminance(a) - rawLuminance(b));
  const centroids = Array.from({ length: k }, (_, index) =>
    ordered[Math.floor(((index + 0.5) / k) * ordered.length)].slice()
  );

  const assignment = new Array(points.length).fill(0);

  for (let pass = 0; pass < iterations; pass += 1) {
    let moved = false;

    for (let i = 0; i < points.length; i += 1) {
      let best = 0;
      let bestDistance = Infinity;
      for (let c = 0; c < centroids.length; c += 1) {
        const d = distance(points[i], centroids[c]);
        if (d < bestDistance) {
          bestDistance = d;
          best = c;
        }
      }
      if (assignment[i] !== best) {
        assignment[i] = best;
        moved = true;
      }
    }

    const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (let i = 0; i < points.length; i += 1) {
      const bucket = sums[assignment[i]];
      bucket[0] += points[i][0];
      bucket[1] += points[i][1];
      bucket[2] += points[i][2];
      bucket[3] += 1;
    }

    for (let c = 0; c < k; c += 1) {
      const [r, g, b, count] = sums[c];
      if (!count) continue;
      centroids[c] = [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
    }

    // Converged; further passes would only burn time.
    if (!moved) break;
  }

  // Weight matters downstream — a cluster holding two pixels is not a colour
  // the image is "made of" — so report population alongside each centroid.
  const populations = new Array(k).fill(0);
  for (const index of assignment) populations[index] += 1;

  return centroids
    .map((centroid, index) => ({ centroid, weight: populations[index] / points.length }))
    .filter((entry) => entry.weight > 0)
    .map((entry) => Object.assign(entry.centroid.slice(), { weight: entry.weight }));
}
