// Rough shorelines used to measure how far a listing is from the water.
// Points are hand-placed along each shore, so distances are approximate
// (usually within a mile or two). Islands are traced as short lines.

export const WATERS = [
  { name: 'Pacific Ocean', paths: [
    // WA outer coast, Cape Flattery to Cape Disappointment
    [[48.38, -124.72], [48.17, -124.73], [47.91, -124.64], [47.6, -124.37], [47.35, -124.29], [47.24, -124.22], [47.08, -124.18], [46.97, -124.17], [46.89, -124.11], [46.79, -124.09], [46.71, -124.05], [46.65, -124.05], [46.5, -124.06], [46.35, -124.06], [46.28, -124.05]],
    // Grays Harbor and Willapa Bay inner shores
    [[46.92, -124.1], [46.95, -123.95], [46.98, -123.89], [46.97, -123.82], [46.93, -123.95]],
    [[46.71, -123.98], [46.69, -123.73], [46.63, -123.95], [46.52, -123.88], [46.37, -123.81], [46.45, -123.95]],
    // OR coast, Columbia mouth to California
    [[46.2, -123.96], [45.99, -123.93], [45.89, -123.96], [45.72, -123.94], [45.61, -123.94], [45.5, -123.9], [45.43, -123.95], [45.2, -123.97], [45.1, -123.98], [44.96, -124.02], [44.81, -124.06], [44.63, -124.06], [44.43, -124.08], [44.31, -124.11], [43.97, -124.11], [43.68, -124.18], [43.43, -124.27], [43.34, -124.33], [43.12, -124.42], [42.74, -124.5], [42.41, -124.42], [42.05, -124.28], [42.0, -124.21]],
    [[43.43, -124.27], [43.37, -124.22], [43.4, -124.15]], // Coos Bay
  ] },
  { name: 'Strait of Juan de Fuca', paths: [
    [[48.37, -124.62], [48.26, -124.3], [48.14, -123.73], [48.12, -123.43], [48.15, -123.12], [48.05, -123.02], [48.1, -122.9], [48.12, -122.76]],
  ] },
  { name: 'Hood Canal', paths: [
    [[47.85, -122.58], [47.86, -122.63], [47.82, -122.87], [47.68, -122.9], [47.5, -123.05], [47.4, -123.14], [47.36, -123.1], [47.4, -122.95], [47.45, -122.83]],
  ] },
  { name: 'Puget Sound', paths: [
    // South Sound
    [[47.05, -122.9], [47.1, -122.95], [47.21, -123.1], [47.25, -122.95], [47.3, -122.8], [47.17, -122.6], [47.27, -122.45]],
    // Main basin, east shore north to Everett
    [[47.27, -122.45], [47.35, -122.33], [47.45, -122.36], [47.6, -122.35], [47.7, -122.4], [47.81, -122.38], [47.95, -122.3], [47.98, -122.22]],
    // Kitsap / west shore
    [[47.33, -122.58], [47.45, -122.55], [47.54, -122.64], [47.57, -122.63], [47.63, -122.52], [47.73, -122.64], [47.8, -122.5], [47.9, -122.55], [47.85, -122.58]],
    [[47.35, -122.5], [47.45, -122.46], [47.5, -122.45]], // Vashon
    // Whidbey and Camano
    [[47.98, -122.35], [48.04, -122.41], [48.15, -122.55], [48.22, -122.69], [48.29, -122.65], [48.4, -122.65]],
    [[48.05, -122.45], [48.17, -122.5], [48.24, -122.37]],
    // Skagit, Bellingham and Birch Bay
    [[48.24, -122.37], [48.39, -122.5], [48.51, -122.61], [48.6, -122.5], [48.75, -122.49], [48.82, -122.6], [48.92, -122.77], [48.99, -122.75]],
    // San Juan Islands
    [[48.53, -123.01], [48.61, -123.15], [48.7, -122.9], [48.5, -122.88], [48.53, -123.01]],
  ] },
  { name: 'Columbia River', paths: [
    [[46.25, -124.0], [46.19, -123.83], [46.2, -123.38], [46.12, -122.94], [46.0, -122.84], [45.86, -122.8], [45.62, -122.67], [45.58, -122.4], [45.55, -122.25], [45.67, -121.89], [45.71, -121.52], [45.6, -121.18], [45.67, -120.83], [45.73, -120.2], [45.92, -119.34], [46.23, -119.15]],
    [[46.95, -119.98], [47.42, -120.31], [47.67, -120.21], [47.8, -119.98], [48.05, -119.9], [48.1, -119.78], [47.95, -118.98]],
  ] },
  { name: 'Lake Chelan', paths: [
    [[47.84, -120.02], [47.88, -120.16], [48.0, -120.33], [48.15, -120.5], [48.31, -120.66]],
  ] },
];

const R = 3958.8; // earth radius, miles
const rad = (d) => d * Math.PI / 180;

export function milesBetween(a, b) {
  const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Distance from point p to segment ab, using a flat projection around p.
function segMiles(p, a, b) {
  const k = Math.cos(rad(p[0]));
  const ax = (a[1] - p[1]) * k, ay = a[0] - p[0];
  const bx = (b[1] - p[1]) * k, by = b[0] - p[0];
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
  const x = ax + t * dx, y = ay + t * dy;
  return Math.sqrt(x * x + y * y) * 69.05;
}

/** Nearest listed body of water: { name, miles } (null without coordinates). */
export function nearestWater(lat, lon) {
  if (lat == null || lon == null) return null;
  const p = [lat, lon];
  let best = { name: null, miles: Infinity };
  for (const w of WATERS) {
    for (const path of w.paths) {
      for (let i = 0; i < path.length - 1; i++) {
        const d = segMiles(p, path[i], path[i + 1]);
        if (d < best.miles) best = { name: w.name, miles: d };
      }
    }
  }
  return { name: best.name, miles: Math.round(best.miles * 10) / 10 };
}

/** First region whose circle contains the point. */
export function regionFor(lat, lon, regions) {
  if (lat == null || lon == null) return null;
  return regions.find((r) => milesBetween([lat, lon], [r.latitude, r.longitude]) <= r.radius) || null;
}
