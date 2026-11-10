import { z } from 'zod';

/**
 * Callouts and arrows (F-MG-06). A callout is one shape layer (dot + leader line, or arrow) and one text
 * label. When a layer is selected the callout's position follows that layer by expression, so it stays
 * attached when the layer moves.
 */
export const CalloutSchema = z.object({
  style: z.enum(['pointer', 'arrow']).default('pointer'),
  label: z.string().max(120).default(''),
  /** where the label sits relative to the target */
  direction: z.enum(['ne', 'nw', 'se', 'sw']).default('ne'),
  /** leader / arrow length in px */
  length: z.number().min(20).max(2000).default(220),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#FFFFFF'),
  stroke: z.number().min(1).max(40).default(5),
  fontSize: z.number().min(8).max(400).default(56),
  /** seconds for the draw-on */
  duration: z.number().min(0.2).max(10).default(0.8),
  follow: z.boolean().default(true),
});
export type CalloutParams = z.infer<typeof CalloutSchema>;

export interface CalloutGeometry {
  /** open path vertices relative to the target point (shape layer origin) */
  path: Array<[number, number]>;
  /** arrow head vertices (closed triangle) relative to the target, or null */
  head: Array<[number, number]> | null;
  dotRadius: number;
  /** label position relative to the target and its justification */
  label: { x: number; y: number; justify: 'left' | 'right' };
}

const SIGN = { ne: [1, -1], nw: [-1, -1], se: [1, 1], sw: [-1, 1] } as const;

export function calloutGeometry(p: Pick<CalloutParams, 'style' | 'direction' | 'length' | 'stroke' | 'fontSize'>): CalloutGeometry {
  const [sx, sy] = SIGN[p.direction];
  const r = (v: number) => Math.round(v * 100) / 100 + 0;
  if (p.style === 'pointer') {
    // dot at the target, diagonal leader, then a horizontal shelf the label sits on
    const d = p.length * 0.45;
    const knee: [number, number] = [r(sx * d), r(sy * d)];
    const end: [number, number] = [r(knee[0] + sx * p.length * 0.55), knee[1]];
    return {
      path: [[0, 0], knee, end], head: null, dotRadius: r(Math.max(6, p.stroke * 2.2)),
      label: { x: r(sx > 0 ? knee[0] + 4 : knee[0] - 4), y: r(knee[1] - p.stroke - p.fontSize * 0.25), justify: sx > 0 ? 'left' : 'right' },
    };
  }
  // arrow: tail away from the target, tip at a small gap from it
  const ux = sx / Math.SQRT2, uy = sy / Math.SQRT2;
  const gap = p.stroke * 3;
  const tip: [number, number] = [r(ux * gap), r(uy * gap)];
  const tail: [number, number] = [r(ux * (gap + p.length)), r(uy * (gap + p.length))];
  const hl = Math.max(14, p.stroke * 4), hw = hl * 0.6;
  // head: tip, then two points back along the shaft, offset perpendicular (-uy, ux)
  const bx = tip[0] + ux * hl, by = tip[1] + uy * hl;
  const head: Array<[number, number]> = [tip, [r(bx - uy * hw), r(by + ux * hw)], [r(bx + uy * hw), r(by - ux * hw)]];
  return {
    path: [tail, [r(bx), r(by)]], head, dotRadius: 0,
    label: { x: r(tail[0] + sx * 10), y: r(tail[1] + (sy > 0 ? p.fontSize * 0.9 : -10)), justify: sx > 0 ? 'left' : 'right' },
  };
}

/** Shape layer Position expression that follows a layer's anchor point in comp space. */
export function followExpression(layerName: string): string {
  return `// UET callout\nvar L = thisComp.layer(${JSON.stringify(layerName)});\nL.toComp(L.anchorPoint);`;
}
