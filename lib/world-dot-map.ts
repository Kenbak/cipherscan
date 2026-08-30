'use client';

import { useEffect, useState } from 'react';
import { feature } from 'topojson-client';

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

export const WORLD_TOPO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json';
export const MAP_WIDTH = 960;
export const MAP_HEIGHT = 500;
export const DOT_SPACING = 2.5;
export const DOT_RADIUS = 2.4;

export function project(lat: number, lon: number): { x: number; y: number } {
  const x = ((lon + 180) / 360) * MAP_WIDTH;
  const y = ((90 - lat) / 180) * MAP_HEIGHT;
  return { x, y };
}

function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (
      (yi > lat) !== (yj > lat) &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function isPointOnLand(lat: number, lon: number, features: any[]): boolean {
  for (const feat of features) {
    const geom = feat.geometry || feat;
    if (geom.type === 'Polygon') {
      if (pointInRing(lon, lat, geom.coordinates[0])) return true;
    } else if (geom.type === 'MultiPolygon') {
      for (const polygon of geom.coordinates) {
        if (pointInRing(lon, lat, polygon[0])) return true;
      }
    }
  }
  return false;
}

function generateWorldDots(landFeatures: any[]): DotPosition[] {
  const dots: DotPosition[] = [];
  for (let lat = 84; lat >= -60; lat -= DOT_SPACING) {
    for (let lon = -180; lon < 180; lon += DOT_SPACING) {
      if (isPointOnLand(lat, lon, landFeatures)) {
        dots.push(project(lat, lon));
      }
    }
  }
  return dots;
}

/** Fetches the world land topology once and returns the dot-matrix background positions. */
export function useWorldLandDots(): DotPosition[] {
  const [dots, setDots] = useState<DotPosition[]>([]);

  useEffect(() => {
    fetch(WORLD_TOPO_URL)
      .then((res) => res.json())
      .then((topology: any) => {
        const land = feature(topology, topology.objects.land) as any;
        const features = land.features ? land.features : [land];
        setDots(generateWorldDots(features));
      })
      .catch((err) => {
        console.error('Failed to load world topology:', err);
      });
  }, []);

  return dots;
}
