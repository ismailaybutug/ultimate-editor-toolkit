import { z } from 'zod';

/**
 * Animated backgrounds (F-MG-07), procedural and seamlessly looping: every motion is a sine of
 * time / loop, so frame 0 and frame `loop` match. Built from native effects/shapes only.
 *  - mesh: a solid with 4-Color Gradient whose 4 points drift on loops (soft "mesh gradient").
 *  - blobs: big blurred circles orbiting over a dark base.
 */
export const PALETTES: Record<string, { tr: string; colors: [string, string, string, string] }> = {
  sunset: { tr: 'Gün batımı', colors: ['#FF6B6B', '#FFB347', '#C850C0', '#4158D0'] },
  ocean: { tr: 'Okyanus', colors: ['#0F2027', '#2C5364', '#00C9FF', '#92FE9D'] },
  aurora: { tr: 'Kuzey ışıkları', colors: ['#0B0F2A', '#1FD1A4', '#5B5BF0', '#A855F7'] },
  candy: { tr: 'Şeker', colors: ['#FF9A9E', '#FAD0C4', '#A18CD1', '#FBC2EB'] },
  forest: { tr: 'Orman', colors: ['#0B3D2E', '#1E6F50', '#8CC084', '#DDE8B9'] },
  fire: { tr: 'Ateş', colors: ['#2B0A0A', '#E63946', '#F77F00', '#FCBF49'] },
  mono: { tr: 'Gri tonlar', colors: ['#0D0D0F', '#2A2A32', '#55556A', '#9A9AB0'] },
  neon: { tr: 'Neon gece', colors: ['#09001F', '#FF00C8', '#00E5FF', '#7B2FF7'] },
};

export const SIZES: Record<string, { tr: string; w: number; h: number }> = {
  landscape: { tr: 'Yatay 1920x1080', w: 1920, h: 1080 },
  vertical: { tr: 'Dikey 1080x1920', w: 1080, h: 1920 },
  square: { tr: 'Kare 1080x1080', w: 1080, h: 1080 },
  uhd: { tr: '4K 3840x2160', w: 3840, h: 2160 },
};

export const BackgroundSchema = z.object({
  type: z.enum(['mesh', 'blobs']).default('mesh'),
  palette: z.string().refine(p => p in PALETTES, 'unknown palette').default('aurora'),
  /** 'match' = size of the active comp */
  size: z.string().refine(s => s === 'match' || s in SIZES, 'unknown size').default('match'),
  /** seconds per seamless loop */
  loop: z.number().min(2).max(60).default(10),
  /** how far things drift, 0..1 */
  motion: z.number().min(0).max(1).default(0.5),
  grain: z.boolean().default(true),
});
export type BackgroundParams = z.infer<typeof BackgroundSchema>;

const fx = (v: number) => Math.round(v * 1000) / 1000;

/** Looping 2-D drift expression around a centre (fractions of width/height). */
export function driftExpression(cx: number, cy: number, ax: number, ay: number, loop: number, phase: number, turnsX = 1, turnsY = 1): string {
  return [
    '// UET background (seamless loop)',
    `var L = ${loop}; var a = 2 * Math.PI * (time / L + ${fx(phase)});`,
    `[thisComp.width * (${fx(cx)} + ${fx(ax)} * Math.sin(${turnsX} * a)), thisComp.height * (${fx(cy)} + ${fx(ay)} * Math.cos(${turnsY} * a))];`,
  ].join('\n');
}

export interface BackgroundPlan {
  width: number; height: number; loop: number; colors: string[]; base: string;
  points: Array<{ color: string; expr: string }>;
  grain: boolean;
  blurRadius: number;
}

export function planBackground(p: BackgroundParams, activeW?: number, activeH?: number): BackgroundPlan {
  const pal = PALETTES[p.palette]!.colors;
  const size = p.size === 'match' ? { w: activeW ?? 1920, h: activeH ?? 1080 } : SIZES[p.size]!;
  const m = p.motion;
  // mesh: points start near the 4 corners; blobs: 3 circles orbit inside the frame
  const anchors = p.type === 'mesh'
    ? [[0.15, 0.15], [0.85, 0.2], [0.2, 0.85], [0.85, 0.85]]
    : [[0.3, 0.35], [0.7, 0.4], [0.5, 0.72]];
  const colors = p.type === 'mesh' ? pal : pal.slice(1);
  const points = anchors.map(([cx, cy], i) => ({
    color: colors[i]!,
    expr: driftExpression(cx!, cy!, 0.25 * m, 0.2 * m, p.loop, i / anchors.length, 1, i % 2 === 0 ? 1 : 2),
  }));
  return { width: size.w, height: size.h, loop: p.loop, colors: [...pal], base: pal[0]!, points, grain: p.grain, blurRadius: Math.round(Math.min(size.w, size.h) * 0.12) };
}
