import { z } from 'zod';
import type { EffectUse, Half, Key, TransitionPlan } from './plan.js';

/**
 * Our own transition designs (original implementations; nothing copied from other products).
 * Each transition is a small parametric builder that returns a host-neutral TransitionPlan.
 * Users adjust duration, strength (50–200 %), direction, colour and glitch seed; the resulting settings are a
 * plain JSON preset (TransitionPresetSchema) that can be saved and reused.
 */

export type Host = 'ae' | 'ppro';
export type Family = 'camera' | 'glitch' | 'distort' | 'light' | 'blur';
export type Direction = 'left' | 'right' | 'up' | 'down' | 'cw' | 'ccw';

export interface BuildOptions {
  host: Host;
  duration: number;
  strength: number;            // 0.5 .. 2
  direction?: Direction;
  color?: [number, number, number];
  seed?: number;
}

export interface TransitionDef {
  id: string;
  family: Family;
  name: { tr: string; en: string };
  desc: { tr: string; en: string };
  hosts: Host[];
  directions?: Direction[];
  usesColor?: boolean;
  defaultDuration: number;
  build(o: BuildOptions): TransitionPlan;
}

export const FAMILY_LABEL: Record<Family, { tr: string; en: string }> = {
  camera: { tr: 'Kamera', en: 'Camera' },
  glitch: { tr: 'Glitch', en: 'Glitch' },
  distort: { tr: 'Bozulma', en: 'Distortion' },
  light: { tr: 'Işık', en: 'Light' },
  blur: { tr: 'Bulanıklık', en: 'Blur' },
};

// ---------- helpers ----------
const k = (t: number, v: number | number[], ease?: string, hold?: boolean): Key =>
  ({ t, v, ...(ease ? { ease } : {}), ...(hold ? { hold } : {}) });
const half = (side: 'out' | 'in', effects: EffectUse[], extra: Partial<Half> = {}): Half =>
  ({ side, layer: 'adjustment', effects, ...extra });
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Motion blur from the Transform effect itself (works without the comp motion-blur switch). */
const SHUTTER = { useCompShutter: 0, shutterAngle: 360 };
/** Motion Tile output (%) big enough to cover the frame when the image is scaled down to 100/zoom. */
const tileFor = (zoom: number) => Math.min(1000, Math.ceil(zoom / 50) * 50 + 50);

function plan(id: string, name: string, o: BuildOptions, halves: Half[]): TransitionPlan {
  return { id, name, dOut: o.duration / 2, dIn: o.duration / 2, halves, schemaVersion: 1 };
}

/** Deterministic PRNG so the same seed gives the same glitch (reproducible, testable). */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIR_VEC: Record<string, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

// ---------- the library ----------
export const TRANSITIONS: TransitionDef[] = [
  {
    id: 'zoom-in', family: 'camera', defaultDuration: 0.5, hosts: ['ae', 'ppro'],
    name: { tr: 'Zoom İçeri', en: 'Zoom In' },
    desc: { tr: 'Hızla içeri dalar, yeni çekim yerine oturur', en: 'Fast push in, the next shot settles' },
    build(o) {
      const z = 100 + 150 * o.strength;
      const out = half('out', [{ effect: 'transform', set: SHUTTER, tracks: [{ param: 'scale', keys: [k(-o.duration / 2, 100), k(0, z, 'expoIn')] }] }]);
      // AE: true continuation (incoming shot grows from small to full; mirrored tiles fill the edges).
      // Premiere has no Motion Tile; the incoming shot starts zoomed in and settles (edges always covered).
      const inn = o.host === 'ae'
        ? half('in', [
            { effect: 'motionTile', set: { outputWidth: tileFor(z), outputHeight: tileFor(z), mirrorEdges: 1 } },
            { effect: 'transform', set: SHUTTER, tracks: [{ param: 'scale', keys: [k(0, (100 * 100) / z), k(o.duration / 2, 100, 'expoOut')] }] },
          ])
        : half('in', [{ effect: 'transform', set: SHUTTER, tracks: [{ param: 'scale', keys: [k(0, z), k(o.duration / 2, 100, 'expoOut')] }] }]);
      return plan('zoom-in', 'Zoom In', o, [out, inn]);
    },
  },
  {
    id: 'zoom-out', family: 'camera', defaultDuration: 0.5, hosts: ['ae'],
    name: { tr: 'Zoom Dışarı', en: 'Zoom Out' },
    desc: { tr: 'Görüntü küçülerek uzaklaşır, yenisi içeriden gelir', en: 'Pulls back fast, next shot arrives from inside' },
    build(o) {
      const z = 100 + 150 * o.strength;
      return plan('zoom-out', 'Zoom Out', o, [
        half('out', [
          { effect: 'motionTile', set: { outputWidth: tileFor(z), outputHeight: tileFor(z), mirrorEdges: 1 } },
          { effect: 'transform', set: SHUTTER, tracks: [{ param: 'scale', keys: [k(-o.duration / 2, 100), k(0, (100 * 100) / z, 'expoIn')] }] },
        ]),
        half('in', [{ effect: 'transform', set: SHUTTER, tracks: [{ param: 'scale', keys: [k(0, z), k(o.duration / 2, 100, 'expoOut')] }] }]),
      ]);
    },
  },
  {
    id: 'whip', family: 'camera', defaultDuration: 0.4, hosts: ['ae', 'ppro'], directions: ['left', 'right', 'up', 'down'],
    name: { tr: 'Whip Pan', en: 'Whip Pan' },
    desc: { tr: 'Kamerayı hızla savurur gibi kaydırır', en: 'Fast camera whip with motion blur' },
    build(o) {
      const [dx, dy] = DIR_VEC[o.direction ?? 'left']!;
      const horizontal = dx !== 0;
      const blur = 160 * o.strength;
      const h = o.duration / 2;
      const db = { direction: horizontal ? 90 : 0 };
      return plan('whip', 'Whip Pan', o, [
        half('out', [
          { effect: 'offset', tracks: [{ param: 'shift', keys: [k(-h, [0, 0]), k(0, [0.5 * dx, 0.5 * dy], 'expoIn')] }] },
          { effect: 'directionalBlur', set: db, tracks: [{ param: 'length', keys: [k(-h, 0), k(0, blur, 'expoIn')] }] },
        ]),
        half('in', [
          { effect: 'offset', tracks: [{ param: 'shift', keys: [k(0, [-0.5 * dx, -0.5 * dy]), k(h, [0, 0], 'expoOut')] }] },
          { effect: 'directionalBlur', set: db, tracks: [{ param: 'length', keys: [k(0, blur), k(h, 0, 'expoOut')] }] },
        ]),
      ]);
    },
  },
  {
    id: 'spin', family: 'camera', defaultDuration: 0.5, hosts: ['ae'], directions: ['cw', 'ccw'],
    name: { tr: 'Dönüş', en: 'Spin' },
    desc: { tr: 'Görüntü hızla döner, yeni çekim dönerek gelir', en: 'Fast spin into the next shot' },
    build(o) {
      const sign = o.direction === 'ccw' ? -1 : 1;
      const a = clamp(180 * o.strength, 90, 360) * sign;
      const tile = { effect: 'motionTile' as const, set: { outputWidth: 300, outputHeight: 300, mirrorEdges: 1 } };
      return plan('spin', 'Spin', o, [
        half('out', [tile, { effect: 'transform', set: SHUTTER, tracks: [{ param: 'rotation', keys: [k(-o.duration / 2, 0), k(0, a, 'expoIn')] }] }]),
        half('in', [tile, { effect: 'transform', set: SHUTTER, tracks: [{ param: 'rotation', keys: [k(0, -a), k(o.duration / 2, 0, 'expoOut')] }] }]),
      ]);
    },
  },
  {
    id: 'glitch', family: 'glitch', defaultDuration: 0.4, hosts: ['ae', 'ppro'],
    name: { tr: 'Glitch', en: 'Glitch' },
    desc: { tr: 'Dijital titreme ve kayma, her seferinde aynı (tohum ile değişir)', en: 'Digital jitter and smear; the seed changes the pattern' },
    build(o) {
      const rnd = mulberry32(o.seed ?? 7);
      const h = o.duration / 2;
      const steps = 6;
      const mk = (side: 'out' | 'in'): Half => {
        const shift: Key[] = [], smear: Key[] = [], flash: Key[] = [];
        for (let i = 0; i <= steps; i++) {
          // out: -h..0 (envelope grows to the cut); in: 0..h (envelope fades)
          const t = side === 'out' ? -h + (h * i) / steps : (h * i) / steps;
          const env = side === 'out' ? i / steps : 1 - i / steps;
          const edge = (side === 'out' && i === 0) || (side === 'in' && i === steps);
          const a = edge ? 0 : env * o.strength;
          const big = rnd() < 0.5;
          const sx = (rnd() * 2 - 1) * 0.08 * a, sy = (rnd() * 2 - 1) * 0.02 * a;
          shift.push(k(t, edge ? [0, 0] : [sx, sy], undefined, true));
          smear.push(k(t, big ? 90 * a : 15 * a, undefined, true));
          flash.push(k(t, rnd() < 0.35 ? clamp(40 * a, 0, 150) : 0, undefined, true));
        }
        return half(side, [
          { effect: 'offset', tracks: [{ param: 'shift', keys: shift }] },
          { effect: 'directionalBlur', set: { direction: 90 }, tracks: [{ param: 'length', keys: smear }] },
          { effect: 'brightness', tracks: [{ param: 'brightness', keys: flash }] },
        ]);
      };
      return plan('glitch', 'Glitch', o, [mk('out'), mk('in')]);
    },
  },
  {
    id: 'wave', family: 'distort', defaultDuration: 0.6, hosts: ['ae', 'ppro'],
    name: { tr: 'Dalga', en: 'Wave' },
    desc: { tr: 'Görüntü su gibi dalgalanarak değişir', en: 'Liquid wave distortion across the cut' },
    build(o) {
      const hgt = 45 * o.strength, h = o.duration / 2;
      const ww = { effect: 'waveWarp' as const, set: { width: 140, direction: 90, speed: 0 } };
      const gb = (keys: Key[]): EffectUse => ({ effect: 'gaussianBlur', set: { repeatEdge: 1 }, tracks: [{ param: 'blurriness', keys }] });
      return plan('wave', 'Wave', o, [
        half('out', [{ ...ww, tracks: [{ param: 'height', keys: [k(-h, 0), k(0, hgt, 'easeIn')] }] }, gb([k(-h, 0), k(0, 8 * o.strength, 'easeIn')])]),
        half('in', [{ ...ww, tracks: [{ param: 'height', keys: [k(0, hgt), k(h, 0, 'easeOut')] }] }, gb([k(0, 8 * o.strength), k(h, 0, 'easeOut')])]),
      ]);
    },
  },
  {
    id: 'light-burst', family: 'light', defaultDuration: 0.6, hosts: ['ae', 'ppro'],
    name: { tr: 'Işık Patlaması', en: 'Light Burst' },
    desc: { tr: 'Görüntü parlayıp aydınlanarak geçer', en: 'Overexposed glow burn across the cut' },
    build(o) {
      const b = clamp(80 * o.strength, 0, 150), h = o.duration / 2;
      const soft: (keys: Key[]) => EffectUse = o.host === 'ae'
        ? keys => ({ effect: 'glow', set: { threshold: 55, radius: 90 }, tracks: [{ param: 'intensity', keys }] })
        : keys => ({ effect: 'gaussianBlur', set: { repeatEdge: 1 }, tracks: [{ param: 'blurriness', keys: keys.map(x => ({ ...x, v: (x.v as number) * 15 })) }] });
      const peak = 1.5 * o.strength;
      return plan('light-burst', 'Light Burst', o, [
        half('out', [{ effect: 'brightness', tracks: [{ param: 'brightness', keys: [k(-h, 0), k(0, b, 'expoIn')] }] }, soft([k(-h, 0), k(0, peak, 'expoIn')])]),
        half('in', [{ effect: 'brightness', tracks: [{ param: 'brightness', keys: [k(0, b), k(h, 0, 'expoOut')] }] }, soft([k(0, peak), k(h, 0, 'expoOut')])]),
      ]);
    },
  },
  {
    id: 'flash', family: 'light', defaultDuration: 0.4, hosts: ['ae'], usesColor: true,
    name: { tr: 'Flaş', en: 'Flash' },
    desc: { tr: 'Seçtiğin renkte kısa bir parlama', en: 'Short flash in the colour you pick' },
    build(o) {
      const peak = clamp(60 + 40 * o.strength, 0, 100), h = o.duration / 2;
      const color = o.color ?? [1, 1, 1];
      return plan('flash', 'Flash', o, [
        half('out', [], { layer: 'solid', color, blend: 'add', opacity: [k(-h, 0), k(0, peak, 'expoIn')] }),
        half('in', [], { layer: 'solid', color, blend: 'add', opacity: [k(0, peak), k(h, 0, 'expoOut')] }),
      ]);
    },
  },
  {
    id: 'blur', family: 'blur', defaultDuration: 0.6, hosts: ['ae', 'ppro'],
    name: { tr: 'Bulanık Geçiş', en: 'Blur' },
    desc: { tr: 'Bulanıklaşıp yeni çekimde netleşir', en: 'Blurs out and resolves on the next shot' },
    build(o) {
      const b = 50 * o.strength, h = o.duration / 2;
      const set = { repeatEdge: 1 };
      return plan('blur', 'Blur', o, [
        half('out', [{ effect: 'gaussianBlur', set, tracks: [{ param: 'blurriness', keys: [k(-h, 0), k(0, b, 'easeIn')] }] }]),
        half('in', [{ effect: 'gaussianBlur', set, tracks: [{ param: 'blurriness', keys: [k(0, b), k(h, 0, 'easeOut')] }] }]),
      ]);
    },
  },
];

export function getTransition(id: string): TransitionDef {
  const d = TRANSITIONS.find(t => t.id === id);
  if (!d) throw new Error(`Unknown transition ${id}`);
  return d;
}

/** Saved/reusable transition settings (what the panel, MCP and presets pass around). */
export const TransitionPresetSchema = z.object({
  transition: z.string(),
  duration: z.number().min(0.1).max(3).optional(),
  strength: z.number().min(0.5).max(2).default(1),
  direction: z.enum(['left', 'right', 'up', 'down', 'cw', 'ccw']).optional(),
  color: z.string().regex(/^#?[0-9a-fA-F]{6}$/).optional(),
  seed: z.number().int().min(0).optional(),
});
export type TransitionPreset = z.infer<typeof TransitionPresetSchema>;

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

/** Build the plan for a preset on a host. Throws a clear error for unsupported combinations. */
export function buildTransition(preset: TransitionPreset, host: Host): TransitionPlan {
  const p = TransitionPresetSchema.parse(preset);
  const def = getTransition(p.transition);
  if (!def.hosts.includes(host)) throw new Error(`${def.name.en} is not available in ${host === 'ae' ? 'After Effects' : 'Premiere Pro'} yet`);
  if (p.direction && def.directions && !def.directions.includes(p.direction)) throw new Error(`${def.name.en}: direction must be one of ${def.directions.join(', ')}`);
  return def.build({
    host,
    duration: p.duration ?? def.defaultDuration,
    strength: p.strength,
    direction: p.direction ?? def.directions?.[0],
    color: p.color ? hexToRgb(p.color) : undefined,
    seed: p.seed,
  });
}
