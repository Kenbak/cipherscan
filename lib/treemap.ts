/**
 * Squarified treemap layout (Bruls, Huizing & van Wijk).
 *
 * Lays a set of weighted items into a rectangle so that each item's **area**
 * is proportional to its value, favouring cells close to square because
 * extreme aspect ratios make areas impossible to compare by eye.
 *
 * Deliberately applies no minimum cell size. A floor would make small items
 * visible at the cost of misstating every proportion in the chart, and the
 * accompanying table is the precise, accessible read of the same data.
 */

export interface TreemapItem<T> {
  /** Must be >= 0. Items with value 0 are dropped. */
  value: number;
  datum: T;
}

export interface TreemapCell<T> {
  x: number;
  y: number;
  w: number;
  h: number;
  value: number;
  datum: T;
}

/** Aspect-ratio cost of a row; lower is squarer. */
function worstRatio(areas: number[], length: number): number {
  if (areas.length === 0 || length <= 0) return Infinity;
  let sum = 0;
  let max = 0;
  let min = Infinity;
  for (const area of areas) {
    sum += area;
    if (area > max) max = area;
    if (area < min) min = area;
  }
  if (sum <= 0 || min <= 0) return Infinity;
  const sumSq = sum * sum;
  const lenSq = length * length;
  return Math.max((lenSq * max) / sumSq, sumSq / (lenSq * min));
}

export function squarify<T>(
  items: TreemapItem<T>[],
  width: number,
  height: number,
): TreemapCell<T>[] {
  const cells: TreemapCell<T>[] = [];
  if (width <= 0 || height <= 0) return cells;

  const positive = items.filter((i) => Number.isFinite(i.value) && i.value > 0);
  const total = positive.reduce((sum, i) => sum + i.value, 0);
  if (total <= 0) return cells;

  // Largest first — the algorithm depends on descending order.
  const sorted = [...positive].sort((a, b) => b.value - a.value);
  const scale = (width * height) / total;
  const queued = sorted.map((i) => ({ ...i, area: i.value * scale }));

  // Remaining free rectangle.
  let x = 0;
  let y = 0;
  let w = width;
  let h = height;
  let row: typeof queued = [];

  const place = (finished: typeof queued) => {
    const sum = finished.reduce((s, r) => s + r.area, 0);
    if (sum <= 0) return;
    if (w >= h) {
      // Fill a vertical strip down the left of the free rectangle.
      const stripW = Math.min(sum / h, w);
      let cy = y;
      for (const r of finished) {
        const cellH = r.area / stripW;
        cells.push({ x, y: cy, w: stripW, h: cellH, value: r.value, datum: r.datum });
        cy += cellH;
      }
      x += stripW;
      w -= stripW;
    } else {
      // Fill a horizontal strip across the top.
      const stripH = Math.min(sum / w, h);
      let cx = x;
      for (const r of finished) {
        const cellW = r.area / stripH;
        cells.push({ x: cx, y, w: cellW, h: stripH, value: r.value, datum: r.datum });
        cx += cellW;
      }
      y += stripH;
      h -= stripH;
    }
  };

  for (const item of queued) {
    const shortest = Math.min(w, h);
    const currentAreas = row.map((r) => r.area);
    const nextAreas = [...currentAreas, item.area];
    if (row.length > 0 && worstRatio(nextAreas, shortest) > worstRatio(currentAreas, shortest)) {
      place(row);
      row = [item];
    } else {
      row.push(item);
    }
  }
  if (row.length > 0) place(row);

  return cells;
}
