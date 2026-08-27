/**
 * Minimal type declarations for `d3-force-3d`.
 * The package mirrors the `d3-force` API but supports up to three dimensions.
 * Only the surface we use in the topology graph is typed here.
 */
declare module 'd3-force-3d' {
  export interface SimulationNode {
    index?: number;
    x?: number;
    y?: number;
    z?: number;
    vx?: number;
    vy?: number;
    vz?: number;
    fx?: number | null;
    fy?: number | null;
    fz?: number | null;
  }

  export interface SimulationLink<N> {
    source: number | string | N;
    target: number | string | N;
    index?: number;
  }

  export interface Force<N> {
    (alpha: number): void;
    initialize?: (nodes: N[]) => void;
  }

  export interface Simulation<N extends SimulationNode> {
    tick(iterations?: number): this;
    restart(): this;
    stop(): this;
    nodes(): N[];
    nodes(nodes: N[]): this;
    alpha(): number;
    alpha(alpha: number): this;
    alphaMin(min: number): this;
    alphaDecay(decay: number): this;
    alphaTarget(target: number): this;
    velocityDecay(decay: number): this;
    numDimensions(n: number): this;
    force(name: string): Force<N> | undefined;
    force(name: string, force: Force<N> | null): this;
    on(typenames: string, listener: (this: Simulation<N>) => void): this;
    find(x: number, y: number, z?: number, radius?: number): N | undefined;
  }

  export interface LinkForce<N, L> extends Force<N> {
    links(): L[];
    links(links: L[]): this;
    id(id: (node: N, i: number, nodes: N[]) => number | string): this;
    distance(distance: number | ((link: L, i: number, links: L[]) => number)): this;
    strength(strength: number | ((link: L, i: number, links: L[]) => number)): this;
  }

  export interface ManyBodyForce<N> extends Force<N> {
    strength(strength: number | ((node: N, i: number, nodes: N[]) => number)): this;
    theta(theta: number): this;
    distanceMin(distance: number): this;
    distanceMax(distance: number): this;
  }

  export interface CenterForce<N> extends Force<N> {
    x(x: number): this;
    y(y: number): this;
    z(z: number): this;
    strength(strength: number): this;
  }

  export interface CollideForce<N> extends Force<N> {
    radius(radius: number | ((node: N, i: number, nodes: N[]) => number)): this;
    strength(strength: number): this;
  }

  export interface PositioningForce<N> extends Force<N> {
    strength(strength: number | ((node: N, i: number, nodes: N[]) => number)): this;
    x(x: number | ((node: N, i: number, nodes: N[]) => number)): this;
    y(y: number | ((node: N, i: number, nodes: N[]) => number)): this;
    z(z: number | ((node: N, i: number, nodes: N[]) => number)): this;
  }

  export function forceSimulation<N extends SimulationNode>(nodes?: N[], numDimensions?: number): Simulation<N>;
  export function forceLink<N extends SimulationNode, L extends SimulationLink<N>>(links?: L[]): LinkForce<N, L>;
  export function forceManyBody<N extends SimulationNode>(): ManyBodyForce<N>;
  export function forceCenter<N extends SimulationNode>(x?: number, y?: number, z?: number): CenterForce<N>;
  export function forceCollide<N extends SimulationNode>(radius?: number): CollideForce<N>;
  export function forceX<N extends SimulationNode>(x?: number): PositioningForce<N>;
  export function forceY<N extends SimulationNode>(y?: number): PositioningForce<N>;
  export function forceZ<N extends SimulationNode>(z?: number): PositioningForce<N>;
}
