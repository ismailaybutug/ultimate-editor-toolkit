import { z } from 'zod';

/**
 * Glow without plug-ins (F-VFX-02 v1): one or more passes of After Effects' own Glow effect (match name
 * ADBE Glo2) with tuned settings, stacked for a "deep" look. Effects are named "UET Glow n" so they can be
 * edited in Effect Controls and removed/replaced cleanly.
 */
export interface GlowPass { threshold: number; radius: number; intensity: number }
export const GlowSchema = z.object({
  preset: z.enum(['soft', 'neon', 'deep', 'bloom']).default('soft'),
  /** multiplies every radius (1 = 1080p reference); the panel scales it by comp height */
  size: z.number().min(0.1).max(10).default(1),
  /** multiplies intensity */
  strength: z.number().min(0.1).max(5).default(1),
  /** tint colour for 'neon' (A&B colours); hex */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#38BDF8'),
});
export type GlowParams = z.infer<typeof GlowSchema>;

export const GLOW_PRESETS: Record<GlowParams['preset'], { tr: string; passes: GlowPass[]; tinted: boolean }> = {
  soft: { tr: 'Yumuşak parlama', tinted: false, passes: [{ threshold: 70, radius: 30, intensity: 0.8 }] },
  neon: { tr: 'Neon (renkli)', tinted: true, passes: [{ threshold: 40, radius: 12, intensity: 1.5 }, { threshold: 40, radius: 60, intensity: 1 }] },
  deep: { tr: 'Derin parlama (3 kat)', tinted: false, passes: [{ threshold: 55, radius: 10, intensity: 1 }, { threshold: 55, radius: 45, intensity: 0.8 }, { threshold: 55, radius: 160, intensity: 0.6 }] },
  bloom: { tr: 'Işık taşması (bloom)', tinted: false, passes: [{ threshold: 80, radius: 120, intensity: 0.5 }] },
};

/** Glow passes for a preset, scaled; radius scales with comp height (1080 = 1). */
export function glowPlan(p: GlowParams, compHeight: number) {
  const pr = GLOW_PRESETS[p.preset];
  const k = (compHeight / 1080) * p.size;
  return {
    tinted: pr.tinted,
    passes: pr.passes.map(x => ({ threshold: x.threshold, radius: Math.round(x.radius * k * 10) / 10, intensity: Math.round(x.intensity * p.strength * 100) / 100 })),
  };
}
