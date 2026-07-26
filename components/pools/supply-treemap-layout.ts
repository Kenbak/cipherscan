export const MAX_SUPPLY_ZAT = 21_000_000 * 1e8;

export type TopLevelKey = 'transparent' | 'shielded' | 'unmined';
export type ShieldedPoolKey = 'sprout' | 'sapling' | 'orchard' | 'ironwood';
export type SupplyPoolKey = TopLevelKey | ShieldedPoolKey;

export const SHIELDED_POOL_KEYS: ShieldedPoolKey[] = ['sprout', 'sapling', 'orchard', 'ironwood'];

export function isShieldedPoolKey(key: SupplyPoolKey | null): key is ShieldedPoolKey {
  return key != null && (SHIELDED_POOL_KEYS as string[]).includes(key);
}

export interface SupplySegmentInput {
  key: SupplyPoolKey;
  label: string;
  zat: number;
  color: string;
  href?: string;
  hatch?: boolean;
}

export interface SupplyTreemapRect extends SupplySegmentInput {
  x: number;
  y: number;
  w: number;
  h: number;
  supplyPct: number;
  parent?: TopLevelKey;
}

export interface SupplyMapLayout {
  topLevel: SupplyTreemapRect[];
  shieldedChildren: SupplyTreemapRect[];
}

function pctOfCap(zat: number): number {
  return (zat / MAX_SUPPLY_ZAT) * 100;
}

function layoutWeight(item: SupplySegmentInput): number {
  if (item.zat > 0) return item.zat;
  if (item.key === 'ironwood') return 1;
  return 0;
}

function layoutHorizontalBands(
  segments: SupplySegmentInput[],
  rect: { x: number; y: number; w: number; h: number },
  totalZat: number,
  parent?: TopLevelKey,
): SupplyTreemapRect[] {
  const items = segments.filter((seg) => layoutWeight(seg) > 0);
  if (!items.length || totalZat <= 0) return [];

  let offset = 0;

  return items.map((item, index) => {
    const isLast = index === items.length - 1;
    const width = isLast ? rect.w - offset : (layoutWeight(item) / totalZat) * rect.w;
    const node: SupplyTreemapRect = {
      ...item,
      x: rect.x + offset,
      y: rect.y,
      w: Math.max(0, width),
      h: rect.h,
      supplyPct: pctOfCap(item.zat),
      parent,
    };
    offset += node.w;
    return node;
  });
}

export function buildTopLevelSegments(input: {
  transparent: number;
  shielded: number;
  chainSupply: number;
  colors: {
    transparent: string;
    shielded: string;
    unmined: string;
  };
}): SupplySegmentInput[] {
  const chainSupply = input.chainSupply > 0 ? input.chainSupply : 0;
  const unmined = Math.max(0, MAX_SUPPLY_ZAT - chainSupply);

  return [
    {
      key: 'transparent',
      label: 'Transparent',
      zat: input.transparent,
      color: input.colors.transparent,
    },
    {
      key: 'shielded',
      label: 'Shielded',
      zat: input.shielded,
      color: input.colors.shielded,
    },
    {
      key: 'unmined',
      label: 'Unmined',
      zat: unmined,
      color: input.colors.unmined,
      hatch: true,
    },
  ];
}

export function buildShieldedPoolSegments(input: {
  sprout: number;
  sapling: number;
  orchard: number;
  ironwood: number;
  colors: {
    sprout: string;
    sapling: string;
    orchard: string;
    ironwood: string;
  };
}): SupplySegmentInput[] {
  const segments: SupplySegmentInput[] = [
    { key: 'sapling', label: 'Sapling', zat: input.sapling, color: input.colors.sapling },
    { key: 'orchard', label: 'Orchard', zat: input.orchard, color: input.colors.orchard },
    { key: 'sprout', label: 'Sprout', zat: input.sprout, color: input.colors.sprout },
    {
      key: 'ironwood',
      label: 'Ironwood',
      zat: input.ironwood,
      color: input.colors.ironwood,
      href: '/ironwood',
    },
  ];
  return segments.filter((seg) => seg.zat > 0 || seg.key === 'ironwood');
}

export function layoutSupplyMap(
  topLevel: SupplySegmentInput[],
  shieldedChildren: SupplySegmentInput[],
  width: number,
  height: number,
  padding = 2,
): SupplyMapLayout {
  const rect = { x: padding, y: padding, w: width - padding * 2, h: height - padding * 2 };
  const topRects = layoutHorizontalBands(topLevel, rect, MAX_SUPPLY_ZAT);

  const shieldedRect = topRects.find((r) => r.key === 'shielded');
  let childRects: SupplyTreemapRect[] = [];
  if (shieldedRect && shieldedRect.w > 0) {
    const childTotal = shieldedChildren.reduce((sum, seg) => sum + layoutWeight(seg), 0);
    childRects = layoutHorizontalBands(
      shieldedChildren,
      {
        x: shieldedRect.x,
        y: shieldedRect.y,
        w: shieldedRect.w,
        h: shieldedRect.h,
      },
      childTotal > 0 ? childTotal : 1,
      'shielded',
    );
  }

  return { topLevel: topRects, shieldedChildren: childRects };
}
