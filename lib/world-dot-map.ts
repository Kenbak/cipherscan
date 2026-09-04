import { WORLD_LAND_DOTS } from './world-land-dots.generated';

/**
 * Shared geometry for the world dot-matrix background used by every
 * geographic node-map view (density on /network, client/infra lenses on
 * /network/nodes). Extracted from the original NodeMap component so the
 * land-projection logic has exactly one implementation.
 */

export interface DotPosition {
  x: number;
  y: number;
}

export const MAP_WIDTH = 960;
export const MAP_HEIGHT = 500;
export const DOT_RADIUS = 2.4;

export function project(lat: number, lon: number): { x: number; y: number } {
  const x = ((lon + 180) / 360) * MAP_WIDTH;
  const y = ((90 - lat) / 180) * MAP_HEIGHT;
  return { x, y };
}

/** Build-time generated geometry: no third-party request or browser CPU scan. */
export function useWorldLandDots(): ReadonlyArray<DotPosition> {
  return WORLD_LAND_DOTS;
}
