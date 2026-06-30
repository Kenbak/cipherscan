/**
 * Solar geometry helpers for the Usage Clock.
 *
 * All math is pure and cheap — operates on a handful of points. The map uses a
 * plain equirectangular projection so lat/lon map linearly to pixels, which
 * keeps the day/night terminator a simple per-longitude curve.
 */

export const MAP_WIDTH = 960;
export const MAP_HEIGHT = 500;

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export function project(lat: number, lon: number): { x: number; y: number } {
  return {
    x: ((lon + 180) / 360) * MAP_WIDTH,
    y: ((90 - lat) / 180) * MAP_HEIGHT,
  };
}

function wrapLon(lon: number): number {
  let l = lon;
  while (l > 180) l -= 360;
  while (l < -180) l += 360;
  return l;
}

/** Solar declination in degrees for a given date (Cooper's approximation). */
export function declinationDeg(date = new Date()): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start) / 86400000);
  return -23.44 * Math.cos(D2R * (360 / 365) * (dayOfYear + 10));
}

/** Longitude (deg) directly under the sun at a given fractional UTC hour. */
export function subsolarLon(hourUTC: number): number {
  return wrapLon((12 - hourUTC) * 15);
}

/** cos(solar zenith). > 0 means the sun is above the horizon (daylight). */
export function cosZenith(lat: number, lon: number, hourUTC: number, decl: number): number {
  const latR = lat * D2R;
  const dR = decl * D2R;
  const H = (lon - subsolarLon(hourUTC)) * D2R;
  return Math.sin(latR) * Math.sin(dR) + Math.cos(latR) * Math.cos(dR) * Math.cos(H);
}

export function isDaylight(lat: number, lon: number, hourUTC: number, decl: number): boolean {
  return cosZenith(lat, lon, hourUTC, decl) > 0;
}

/**
 * SVG path for the night (dark) region at a given UTC hour.
 * Night sits on the winter-hemisphere side of the terminator curve.
 */
export function nightPath(hourUTC: number, declRaw: number): string {
  // Avoid the tan(0) singularity at the equinoxes.
  const decl = Math.abs(declRaw) < 1 ? (declRaw < 0 ? -1 : 1) : declRaw;
  const sunLon = subsolarLon(hourUTC);
  const tanD = Math.tan(decl * D2R);

  const pts: Array<{ x: number; y: number }> = [];
  for (let lon = -180; lon <= 180; lon += 2) {
    const H = (lon - sunLon) * D2R;
    const latTerm = Math.atan(-Math.cos(H) / tanD) * R2D;
    pts.push(project(latTerm, lon));
  }

  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`;
  }
  // decl > 0 (N. summer): night is to the south → close along the bottom edge.
  // decl < 0: night is to the north → close along the top edge.
  if (decl > 0) {
    d += ` L ${MAP_WIDTH} ${MAP_HEIGHT} L 0 ${MAP_HEIGHT} Z`;
  } else {
    d += ` L ${MAP_WIDTH} 0 L 0 0 Z`;
  }
  return d;
}

/** Human-readable description of where the sun is overhead. */
export function sunRegionLabel(hourUTC: number): string {
  const lon = subsolarLon(hourUTC);
  const bands: Array<[number, number, string]> = [
    [-180, -150, 'the central Pacific'],
    [-150, -110, 'the eastern Pacific'],
    [-110, -70, 'the Americas'],
    [-70, -30, 'the western Atlantic'],
    [-30, -8, 'the eastern Atlantic'],
    [-8, 22, 'Europe & West Africa'],
    [22, 52, 'Africa & the Mid-East'],
    [52, 90, 'the Indian Ocean & South Asia'],
    [90, 130, 'SE Asia & China'],
    [130, 162, 'the western Pacific & Japan'],
    [162, 180, 'the central Pacific'],
  ];
  for (const [lo, hi, name] of bands) {
    if (lon >= lo && lon < hi) return name;
  }
  return 'the open ocean';
}

/** Representative macro-regions for the "in daylight now" readout. */
export const REGIONS: Array<{ name: string; lat: number; lon: number }> = [
  { name: 'Americas', lat: 40, lon: -100 },
  { name: 'S. America', lat: -15, lon: -60 },
  { name: 'Europe', lat: 50, lon: 10 },
  { name: 'Africa', lat: 5, lon: 20 },
  { name: 'Mid-East', lat: 30, lon: 45 },
  { name: 'India', lat: 22, lon: 78 },
  { name: 'E. Asia', lat: 35, lon: 115 },
  { name: 'SE Asia', lat: 5, lon: 105 },
  { name: 'Japan', lat: 36, lon: 138 },
  { name: 'Australia', lat: -25, lon: 135 },
];

export function regionsInDaylight(hourUTC: number, decl: number): string[] {
  return REGIONS.filter((r) => isDaylight(r.lat, r.lon, hourUTC, decl)).map((r) => r.name);
}

// ---------------------------------------------------------------------------
// User-base inference
// ---------------------------------------------------------------------------

/**
 * Canonical human activity profile by LOCAL hour (0-23), peaking across the
 * daytime/evening waking window. Normalized so it sums to 1.
 */
const WAKING_RAW = [
  0.20, 0.14, 0.10, 0.09, 0.09, 0.14, 0.30, 0.50, 0.70, 0.85, 0.95, 1.00,
  1.00, 1.00, 1.00, 1.00, 0.97, 0.95, 1.00, 1.00, 0.90, 0.70, 0.48, 0.30,
];

function normalize(arr: number[]): number[] {
  const sum = arr.reduce((s, v) => s + v, 0) || 1;
  return arr.map((v) => v / sum);
}

export const WAKING = normalize(WAKING_RAW);

/** Activity profile (by UTC hour) for a user base at a fixed UTC offset. */
export function regionProfile(utcOffset: number): number[] {
  const out = new Array(24).fill(0);
  for (let h = 0; h < 24; h++) {
    const local = ((h + utcOffset) % 24 + 24) % 24;
    out[h] = WAKING[local];
  }
  return normalize(out);
}

export const REGION_OFFSETS = { americas: -6, europe: 1, asia: 8 };

/**
 * Decompose an observed UTC activity curve into a non-negative mix of three
 * macro-region waking profiles via a coarse simplex grid search (NNLS-lite).
 */
export function decomposeRegions(hourlyFrac: number[]): {
  americas: number;
  europe: number;
  asia: number;
  rmse: number;
} {
  const pA = regionProfile(REGION_OFFSETS.americas);
  const pE = regionProfile(REGION_OFFSETS.europe);
  const pAs = regionProfile(REGION_OFFSETS.asia);

  let best = { americas: 1 / 3, europe: 1 / 3, asia: 1 / 3, rmse: Infinity };
  const step = 0.02;
  for (let a = 0; a <= 1.0001; a += step) {
    for (let b = 0; a + b <= 1.0001; b += step) {
      const c = 1 - a - b;
      let se = 0;
      for (let h = 0; h < 24; h++) {
        const pred = a * pA[h] + b * pE[h] + c * pAs[h];
        const diff = hourlyFrac[h] - pred;
        se += diff * diff;
      }
      const rmse = Math.sqrt(se / 24);
      if (rmse < best.rmse) best = { americas: a, europe: b, asia: c, rmse };
    }
  }
  return best;
}

/** Pearson correlation between two equal-length series. */
export function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n === 0) return 0;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}
