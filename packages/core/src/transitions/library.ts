import { z } from 'zod';
import { evalKeys, type EffectUse, type Half, type Key, type TransitionPlan } from './plan.js';

/**
 * Our own transition designs (original implementations; nothing copied from other products).
 * Each transition is a small parametric builder that returns a host-neutral TransitionPlan.
 * Users adjust duration, strength (50–200 %), direction, colour and glitch seed; the resulting settings are a
 * plain JSON preset (TransitionPresetSchema) that can be saved and reused.
 */

export type Host = 'ae' | 'ppro';
export type Family = 'camera' | 'glitch' | 'distort' | 'light' | 'shape' | 'film' | 'blur';
export type Direction = 'left' | 'right' | 'up' | 'down' | 'cw' | 'ccw';

export interface BuildOptions {
  host: Host;
  duration: number;
  strength: number;            // 0.5 .. 2
  direction?: Direction;
  color?: [number, number, number];
  seed?: number;
  /** Frame width / height. Only used where coverage depends on it (Premiere spin). Default 16:9. */
  aspect?: number;
}

export interface TransitionDef {
  id: string;
  family: Family;
  name: { tr: string; en: string };
  desc: { tr: string; en: string };
  hosts: Host[];
  directions?: Direction[];
  usesColor?: boolean;
  /** Default colour (hex) when the transition uses one. */
  defaultColor?: string;
  defaultDuration: number;
  build(o: BuildOptions): TransitionPlan;
}

export const FAMILY_LABEL: Record<Family, { tr: string; en: string }> = {
  camera: { tr: 'Kamera', en: 'Camera' },
  glitch: { tr: 'Glitch', en: 'Glitch' },
  distort: { tr: 'Bozulma', en: 'Distortion' },
  light: { tr: 'Işık', en: 'Light' },
  shape: { tr: 'Şekil', en: 'Shape' },
  film: { tr: 'Film', en: 'Film' },
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

/**
 * Sample an eased curve into N linear keys and derive other values from it (e.g. mirror lines that follow a
 * scale, or a cover scale that follows a rotation). Premiere writes one key per frame anyway, so this is exact
 * on frames; in AE the derived tracks stay editable as plain keys.
 */
function sampled(keys: Key[], n = 24): { t: number; v: number }[] {
  const t0 = keys[0]!.t, t1 = keys[keys.length - 1]!.t;
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = t0 + ((t1 - t0) * i) / n;
    return { t, v: evalKeys(keys, t) as number };
  });
}
const lin = (pts: { t: number; v: number | number[] }[]): Key[] => pts.map(p => ({ t: p.t, v: p.v, ease: 'linear' }));
const SHAPE_R = 1300; // px at 1080 high: more than the half-diagonal of 16:9 and 9:16 frames
const deg = Math.PI / 180;

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
    id: 'zoom-out', family: 'camera', defaultDuration: 0.5, hosts: ['ae', 'ppro'],
    name: { tr: 'Zoom Dışarı', en: 'Zoom Out' },
    desc: { tr: 'Görüntü küçülerek uzaklaşır, yenisi içeriden gelir', en: 'Pulls back fast, next shot arrives from inside' },
    build(o) {
      const z = 100 + 150 * o.strength;
      if (o.host === 'ppro') {
        // No Motion Tile in Premiere: four Mirror effects follow the shrinking frame and reflect it into the
        // empty borders. One reflection covers the frame down to 1/3 size, so the scale stops at 40 %.
        const h = o.duration / 2;
        const pts = sampled([k(-h, 100), k(0, Math.max(40, (100 * 100) / z), 'expoIn')]);
        const edge = (dx: number, dy: number, angle: number): EffectUse => ({
          effect: 'mirror', set: { angle },
          tracks: [{ param: 'center', keys: lin(pts.map(p => ({ t: p.t, v: [(dx * p.v) / 200, (dy * p.v) / 200] }))) }],
        });
        return plan('zoom-out', 'Zoom Out', o, [
          half('out', [
            { effect: 'transform', set: SHUTTER, tracks: [{ param: 'scale', keys: lin(pts) }] },
            edge(1, 0, 0), edge(-1, 0, 180), edge(0, 1, 90), edge(0, -1, 270),
          ]),
          half('in', [{ effect: 'transform', set: SHUTTER, tracks: [{ param: 'scale', keys: [k(0, z), k(h, 100, 'expoOut')] }] }]),
        ]);
      }
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
    id: 'spin', family: 'camera', defaultDuration: 0.5, hosts: ['ae', 'ppro'], directions: ['cw', 'ccw'],
    name: { tr: 'Dönüş', en: 'Spin' },
    desc: { tr: 'Görüntü hızla döner, yeni çekim dönerek gelir', en: 'Fast spin into the next shot' },
    build(o) {
      const sign = o.direction === 'ccw' ? -1 : 1;
      const a = clamp(180 * o.strength, 90, 360) * sign;
      if (o.host === 'ppro') {
        // No Motion Tile in Premiere: scale up just enough that the rotated frame always covers the screen.
        // Cover factor for a w×h frame rotated by r: |cos r| + max(w/h, h/w)·|sin r| (exactly 1 at r = 0).
        const ar = o.aspect ?? 16 / 9, R = Math.max(ar, 1 / ar), h = o.duration / 2;
        // (+4 % × |sin r| keeps the linear in-between keys on the safe side; still exactly 100 % at r = 0.)
        const cover = (r: number) => { const s = Math.abs(Math.sin(r * deg)); return 100 * (Math.abs(Math.cos(r * deg)) + R * s) * (1 + 0.04 * s); };
        const tr = (keys: Key[]): EffectUse => {
          const pts = sampled(keys, 32);
          return { effect: 'transform', set: SHUTTER, tracks: [{ param: 'rotation', keys: lin(pts) }, { param: 'scale', keys: lin(pts.map(p => ({ t: p.t, v: cover(p.v) }))) }] };
        };
        return plan('spin', 'Spin', o, [half('out', [tr([k(-h, 0), k(0, a, 'expoIn')])]), half('in', [tr([k(0, -a), k(h, 0, 'expoOut')])])]);
      }
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
    id: 'flash', family: 'light', defaultDuration: 0.4, hosts: ['ae', 'ppro'], usesColor: true, defaultColor: '#ffffff',
    name: { tr: 'Flaş', en: 'Flash' },
    desc: { tr: 'Seçtiğin renkte kısa bir parlama', en: 'Short flash in the colour you pick' },
    build(o) {
      const peak = clamp(60 + 40 * o.strength, 0, 100), h = o.duration / 2;
      const color = o.color ?? [1, 1, 1];
      if (o.host === 'ppro') {
        // Premiere scripts cannot add a colour layer: a frame-filling Circle effect on each clip does the same job.
        const c = (keys: Key[]): EffectUse => ({ effect: 'circle', set: { center: [0, 0], radius: SHAPE_R, featherOuter: 0, color }, tracks: [{ param: 'opacity', keys }] });
        return plan('flash', 'Flash', o, [half('out', [c([k(-h, 0), k(0, peak, 'expoIn')])]), half('in', [c([k(0, peak), k(h, 0, 'expoOut')])])]);
      }
      return plan('flash', 'Flash', o, [
        half('out', [], { layer: 'solid', color, blend: 'add', opacity: [k(-h, 0), k(0, peak, 'expoIn')] }),
        half('in', [], { layer: 'solid', color, blend: 'add', opacity: [k(0, peak), k(h, 0, 'expoOut')] }),
      ]);
    },
  },
  {
    id: 'circle', family: 'shape', defaultDuration: 0.6, hosts: ['ae', 'ppro'], usesColor: true, defaultColor: '#111111',
    name: { tr: 'Daire', en: 'Circle' },
    desc: { tr: 'Renkli bir daire büyüyüp ekranı örter, yeni çekimde küçülerek açılır', en: 'A colour circle grows over the cut and shrinks open on the next shot' },
    build(o) {
      const h = o.duration / 2, color = o.color ?? [0.07, 0.07, 0.07];
      const grow = [k(-h, 0), k(0, 1, 'expoIn')], shrink = [k(0, 1), k(h, 0, 'expoOut')];
      if (o.host === 'ppro') {
        const c = (keys: Key[]): EffectUse => ({ effect: 'circle', set: { center: [0, 0], featherOuter: 0, color, opacity: 100 }, tracks: [{ param: 'radius', keys: keys.map(x => ({ ...x, v: (x.v as number) * SHAPE_R })) }] });
        return plan('circle', 'Circle', o, [half('out', [c(grow)]), half('in', [c(shrink)])]);
      }
      const solid = (keys: Key[]): Half => half(keys[0]!.t < 0 ? 'out' : 'in', [], {
        layer: 'solid', color, mask: { shape: 'ellipse', radius: 1, feather: 0 }, scale: keys.map(x => ({ ...x, v: (x.v as number) * 100 })),
      });
      return plan('circle', 'Circle', o, [solid(grow), solid(shrink)]);
    },
  },
  {
    id: 'film-burn', family: 'film', defaultDuration: 0.8, hosts: ['ae', 'ppro'], usesColor: true, defaultColor: '#ff7a1f',
    name: { tr: 'Film Yanığı', en: 'Film Burn' },
    desc: { tr: 'Sıcak renkli bir ışık lekesi ekranı süpürerek geçer', en: 'A warm light leak sweeps across the cut' },
    build(o) {
      const h = o.duration / 2, color = o.color ?? [1, 0.48, 0.12];
      const peak = clamp(50 + 35 * o.strength, 0, 100);
      const fade = { out: [k(-h, 0), k(0, peak, 'expoIn')], in: [k(0, peak), k(h, 0, 'expoOut')] };
      const sweep = { out: [k(-h, [-0.6, 0.12]), k(0, [0, 0], 'easeOut')], in: [k(0, [0, 0]), k(h, [0.6, -0.12], 'easeIn')] };
      if (o.host === 'ppro') {
        const c = (side: 'out' | 'in'): EffectUse => ({
          effect: 'circle', set: { radius: 650 * o.strength, featherOuter: 450, color },
          tracks: [{ param: 'opacity', keys: fade[side] }, { param: 'center', keys: sweep[side] }],
        });
        return plan('film-burn', 'Film Burn', o, [half('out', [c('out')]), half('in', [c('in')])]);
      }
      const solid = (side: 'out' | 'in'): Half => half(side, [], {
        layer: 'solid', color, blend: 'add', mask: { shape: 'ellipse', radius: 0.45 * o.strength, feather: 380 },
        opacity: fade[side], position: sweep[side],
      });
      return plan('film-burn', 'Film Burn', o, [solid('out'), solid('in')]);
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
export function buildTransition(preset: TransitionPreset, host: Host, frame?: { width: number; height: number }): TransitionPlan {
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
    aspect: frame ? frame.width / frame.height : undefined,
  });
}
