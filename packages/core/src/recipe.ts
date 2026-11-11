import { z } from 'zod';
import { EASINGS } from './easing.js';

/**
 * A Recipe is a reusable animation: keyframes relative to the layer's current
 * values, so the same recipe works on any layer. Values are offsets or factors.
 */
export const KeyframeSchema = z.object({
  t: z.number().min(0),                       // seconds from recipe start
  v: z.union([z.number(), z.array(z.number()).min(1).max(3)]),
  ease: z.string().refine(e => e in EASINGS, 'unknown easing').default('easeInOut'),
});

export const TrackSchema = z.object({
  /** AE property path from the layer, e.g. "Transform/Opacity". */
  property: z.enum(['position', 'scale', 'rotation', 'opacity', 'anchor']),
  /** How `v` is combined with the current value. */
  mode: z.enum(['absolute', 'offset', 'factor']),
  keyframes: z.array(KeyframeSchema).min(2),
});

export const RecipeSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  kind: z.enum(['in', 'emphasis', 'out']),
  duration: z.number().positive(),
  tracks: z.array(TrackSchema).min(1),
  schemaVersion: z.literal(1).default(1),
});

export type Recipe = z.infer<typeof RecipeSchema>;
export type Track = z.infer<typeof TrackSchema>;

export function parseRecipe(json: unknown): Recipe {
  return RecipeSchema.parse(json);
}

/** Scale a recipe's timing (e.g. user changes duration). */
export function retimeRecipe(r: Recipe, duration: number): Recipe {
  const k = duration / r.duration;
  return {
    ...r,
    duration,
    tracks: r.tracks.map(tr => ({ ...tr, keyframes: tr.keyframes.map(kf => ({ ...kf, t: kf.t * k })) })),
  };
}
