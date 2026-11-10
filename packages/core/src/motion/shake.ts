import { z } from 'zod';

/**
 * Camera/layer shake (F-MG-08). The host script adds three Slider Controls to the layer and a wiggle()
 * expression on Position and Rotation, so amount and speed stay editable from the Effect Controls panel.
 * With `decay` > 0 the amount sliders are keyframed from full strength to 0 (an impact that settles).
 */
export const ShakeSchema = z.object({
  /** pixels */
  amount: z.number().min(0).max(500).default(20),
  /** wiggles per second */
  frequency: z.number().min(0.1).max(60).default(8),
  /** degrees */
  rotation: z.number().min(0).max(45).default(1.5),
  /** seconds from the playhead to fade the shake out; 0 = constant shake for the whole layer */
  decay: z.number().min(0).max(30).default(0),
  seed: z.number().int().min(0).max(9999).default(1),
  motionBlur: z.boolean().default(true),
});
export type ShakeParams = z.infer<typeof ShakeSchema>;

export const SHAKE_PRESETS: Record<string, { tr: string; params: ShakeParams }> = {
  handheld: { tr: 'El kamerası (hafif, sürekli)', params: ShakeSchema.parse({ amount: 6, frequency: 1.5, rotation: 0.6, decay: 0 }) },
  walk: { tr: 'Yürüyüş', params: ShakeSchema.parse({ amount: 12, frequency: 3, rotation: 1, decay: 0 }) },
  impact: { tr: 'Darbe (oynatma kafasında, söner)', params: ShakeSchema.parse({ amount: 45, frequency: 14, rotation: 3, decay: 0.6 }) },
  earthquake: { tr: 'Deprem (güçlü, sürekli)', params: ShakeSchema.parse({ amount: 35, frequency: 10, rotation: 2.5, decay: 0 }) },
  bass: { tr: 'Bas vuruşu (kısa)', params: ShakeSchema.parse({ amount: 25, frequency: 20, rotation: 1, decay: 0.3 }) },
};

/** Names of the Slider Controls the host adds (expressions refer to them by name). */
export const SHAKE_EFFECTS = { amount: 'UET Shake Amount', frequency: 'UET Shake Frequency', rotation: 'UET Shake Rotation' } as const;
export const SHAKE_TAG = '// UET shake';

/**
 * The exact expression written to Position or Rotation (or to X/Y Position when dimensions are separated:
 * wiggle on a 1-D property works the same way; pass a different seed per dimension).
 */
export function shakeExpression(target: 'position' | 'rotation', seed: number): string {
  const amp = target === 'rotation' ? SHAKE_EFFECTS.rotation : SHAKE_EFFECTS.amount;
  return [
    SHAKE_TAG,
    `var f = effect("${SHAKE_EFFECTS.frequency}")(1);`,
    `var a = effect("${amp}")(1);`,
    `seedRandom(${seed}, false);`,
    'wiggle(f, a);',
  ].join('\n');
}
