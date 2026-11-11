import { z } from 'zod';
import { EASINGS, bezierAt, type Bezier } from '../easing.js';
import { EFFECTS, type EffectId } from './effects.js';

/**
 * A transition is placed on a cut. It has two halves:
 *  - 'out': the last part of the outgoing shot (times -dOut..0, relative to the cut)
 *  - 'in' : the first part of the incoming shot (times 0..dIn)
 * After Effects gets one adjustment (or solid) layer per half above the shots.
 * Premiere gets the same effects directly on the outgoing / incoming clip (no adjustment layers via script).
 * Everything returns to neutral values at the outer ends, so the clips look untouched outside the transition.
 */

export type Value = number | number[];

export const KeySchema = z.object({
  t: z.number(),                              // seconds relative to the cut
  v: z.union([z.number(), z.array(z.number()).min(1).max(3)]),
  /** Easing of the segment that ENDS at this key (same convention as recipes). */
  ease: z.string().refine(e => e in EASINGS, 'unknown easing').optional(),
  /** Hold this value until the next key (stepped, for glitches). */
  hold: z.boolean().optional(),
});
export type Key = z.infer<typeof KeySchema>;

const effectIds = Object.keys(EFFECTS) as [EffectId, ...EffectId[]];

export const EffectUseSchema = z.object({
  effect: z.enum(effectIds),
  /** Constant parameter values. */
  set: z.record(z.union([z.number(), z.array(z.number())])).optional(),
  /** Animated parameters. */
  tracks: z.array(z.object({ param: z.string(), keys: z.array(KeySchema).min(2) })).optional(),
});
export type EffectUse = z.infer<typeof EffectUseSchema>;

export const HalfSchema = z.object({
  side: z.enum(['out', 'in']),
  /** 'adjustment' = effects on everything below (AE) / on the clip (Premiere). 'solid' = coloured layer (AE only). */
  layer: z.enum(['adjustment', 'solid']).default('adjustment'),
  color: z.array(z.number().min(0).max(1)).length(3).optional(),
  blend: z.enum(['normal', 'add', 'screen']).optional(),
  /** Solid layers: layer opacity animation (0..100). */
  opacity: z.array(KeySchema).min(2).optional(),
  /** Solid layers (AE): layer scale in % (uniform) and position as [fx, fy] offset from the frame centre. */
  scale: z.array(KeySchema).min(2).optional(),
  position: z.array(KeySchema).min(2).optional(),
  /** Solid layers (AE): elliptical mask. radius = multiple of the frame's half-diagonal; feather in px at 1080. */
  mask: z.object({ shape: z.literal('ellipse'), radius: z.number().positive(), feather: z.number().min(0).default(0) }).optional(),
  effects: z.array(EffectUseSchema),
});
export type Half = z.infer<typeof HalfSchema>;

export const TransitionPlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  dOut: z.number().min(0),
  dIn: z.number().min(0),
  halves: z.array(HalfSchema).min(1),
  schemaVersion: z.literal(1).default(1),
});
export type TransitionPlan = z.infer<typeof TransitionPlanSchema>;

const asArr = (v: Value): number[] => (Array.isArray(v) ? v : [v]);

/** Value of a keyed track at time t (seconds relative to the cut). */
export function evalKeys(keys: Key[], t: number): Value {
  const first = keys[0]!, last = keys[keys.length - 1]!;
  const eps = 1e-9; // float noise from frame rounding must not pick the previous (held) key
  if (t <= first.t + eps) return first.v;
  if (t >= last.t - eps) return last.v;
  let i = 0;
  while (i < keys.length - 2 && t >= keys[i + 1]!.t - eps) i++;
  const a = keys[i]!, b = keys[i + 1]!;
  if (a.hold) return a.v;
  const x = (t - a.t) / (b.t - a.t);
  const y = bezierAt((EASINGS[b.ease ?? 'easeInOut'] ?? EASINGS.easeInOut) as Bezier, x);
  const av = asArr(a.v), bv = asArr(b.v);
  const out = av.map((v, d) => v + (bv[Math.min(d, bv.length - 1)]! - v) * y);
  return Array.isArray(a.v) ? out : out[0]!;
}

/** Times where the plan touches each half, for validation and tests. */
export function halfRange(plan: TransitionPlan, side: 'out' | 'in'): [number, number] {
  return side === 'out' ? [-plan.dOut, 0] : [0, plan.dIn];
}
