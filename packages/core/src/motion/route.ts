import { z } from 'zod';

/**
 * Route animation for maps (brief "maps & geographic animation", first step): the user places their own map
 * image and puts layers (nulls, pins, text) on the cities; the selected layers, in selection order, become
 * the waypoints. We draw a curved route through them that draws on, pins that pop as the line arrives, and
 * an optional traveller (dot/plane) that follows the path by expression. No map data is bundled.
 */
export const RouteSchema = z.object({
  /** 0 = straight, 0.5 = strong arcs */
  curve: z.number().min(0).max(0.6).default(0.25),
  duration: z.number().min(0.3).max(30).default(3),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#FFD166'),
  stroke: z.number().min(1).max(40).default(6),
  dashed: z.boolean().default(true),
  traveller: z.boolean().default(true),
  pins: z.boolean().default(true),
});
export type RouteParams = z.infer<typeof RouteSchema>;

export interface RoutePath {
  vertices: Array<[number, number]>; inTangents: Array<[number, number]>; outTangents: Array<[number, number]>;
  /** fraction (0..1) of the drawn length at which the line reaches each waypoint */
  arrival: number[];
}

const r2 = (v: number) => Math.round(v * 100) / 100 + 0;

/**
 * Cubic path through the points. Each segment bulges perpendicular to its chord (towards the top of the
 * frame) by `curve` × chord length; tangents are relative to their vertex, as AE Shape expects.
 */
export function routePath(points: Array<[number, number]>, curve: number): RoutePath {
  if (points.length < 2) throw new Error('A route needs at least 2 points');
  const n = points.length;
  const inT: Array<[number, number]> = points.map(() => [0, 0]);
  const outT: Array<[number, number]> = points.map(() => [0, 0]);
  const lens: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i]!, [x1, y1] = points[i + 1]!;
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len, ny = dx / len;
    if (ny > 0) { nx = -nx; ny = -ny; } // bulge upwards (AE y grows downwards)
    const k = curve * len * (4 / 3); // cubic midpoint offset = 0.75·k  →  bulge = curve·len
    outT[i] = [r2(dx / 3 + nx * k), r2(dy / 3 + ny * k)];
    inT[i + 1] = [r2(-dx / 3 + nx * k), r2(-dy / 3 + ny * k)];
    // arc length estimate of the bulged segment
    lens.push(len * (1 + (8 / 3) * curve * curve));
  }
  const total = lens.reduce((a, b) => a + b, 0);
  const arrival = [0];
  let acc = 0;
  for (const l of lens) { acc += l; arrival.push(Math.round((acc / total) * 10000) / 10000); }
  return { vertices: points.map(p => [r2(p[0]), r2(p[1])]), inTangents: inT, outTangents: outT, arrival };
}

/** Traveller expressions: position on the path at the trim progress, rotated along the tangent. */
export function travellerExpressions(routeLayer: string) {
  const head = `var R = thisComp.layer(${JSON.stringify(routeLayer)}); var g = R.content("Route"); var p = g.content("Path").path; var t = Math.min(0.9999, Math.max(0, g.content("Trim").end / 100));`;
  return {
    position: `// UET route\n${head}\nR.toComp(p.pointOnPath(t));`,
    rotation: `// UET route\n${head}\nvar d = p.tangentOnPath(t); radiansToDegrees(Math.atan2(d[1], d[0]));`,
  };
}
