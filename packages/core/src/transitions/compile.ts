import { EASINGS, bezierToAeEase, type Bezier } from '../easing.js';
import { effectDef, type EffectParam } from './effects.js';
import { evalKeys, type Half, type Key, type TransitionPlan, type Value } from './plan.js';

/**
 * Compile a host-neutral TransitionPlan into the exact data each host script applies.
 * All maths (units, frame rounding, easing) happens here in tested TypeScript; the ExtendScript side only
 * creates layers/effects and writes the numbers it is given.
 */

export interface Frame { fps: number; width: number; height: number }

// ---------- shared ----------
const arr = (v: Value): number[] => (Array.isArray(v) ? v : [v]);

function convert(unit: EffectParam['unit'], v: Value, f: Frame, host: 'ae' | 'ppro'): Value {
  switch (unit) {
    case 'px': return arr(v).length > 1 ? arr(v).map(x => (x * f.height) / 1080) : (arr(v)[0]! * f.height) / 1080;
    case 'point': {
      const [fx = 0, fy = 0] = arr(v);
      // AE effect points are in layer pixels; Premiere effect points are normalised 0..1 (UNVERIFIED).
      return host === 'ae' ? [f.width / 2 + fx * f.width, f.height / 2 + fy * f.height] : [0.5 + fx, 0.5 + fy];
    }
    case 'bool': return arr(v)[0] ? 1 : 0;
    default: return v;
  }
}

function param(effect: string, name: string): EffectParam {
  const p = (effectDef(effect as any).params as Record<string, EffectParam>)[name];
  if (!p) throw new Error(`Effect ${effect} has no parameter ${name}`);
  return p;
}

/** Frame-accurate half lengths; keys are stretched proportionally onto the rounded length. */
function roundHalves(plan: TransitionPlan, fps: number) {
  const n = (d: number) => Math.max(2, Math.round(d * fps));
  const nOut = n(plan.dOut), nIn = n(plan.dIn);
  return { nOut, nIn, kOut: plan.dOut > 0 ? nOut / fps / plan.dOut : 1, kIn: plan.dIn > 0 ? nIn / fps / plan.dIn : 1 };
}
const retime = (keys: Key[], k: number): Key[] => keys.map(x => ({ ...x, t: x.t * k }));

// ---------- After Effects ----------
export interface AeEase { speed: number; influence: number }
export interface AeKey { t: number; v: Value; hold?: boolean; inE: AeEase[]; outE: AeEase[]; inSp: AeEase[]; outSp: AeEase[] }
export interface AeTrack { param: string; match: string; keys: AeKey[] }
export interface AeEffect { effect: string; match: string; set: { param: string; match: string; value: Value }[]; tracks: AeTrack[] }
export interface AeHalf {
  side: 'out' | 'in'; start: number; end: number; layer: 'adjustment' | 'solid'; color?: number[]; blend?: string;
  /** Layer transform tracks (ADBE Opacity / ADBE Scale / ADBE Position). Scalar scale is expanded by the host. */
  opacity?: AeTrack; scale?: AeTrack; position?: AeTrack;
  /** Elliptical mask in layer pixels. */
  mask?: { radius: number; feather: number };
  effects: AeEffect[];
}
export interface AeTransition { host: 'ae'; id: string; name: string; fps: number; halves: AeHalf[] }

const DEFAULT_EASE: AeEase = { speed: 0, influence: 16.666667 };

/** Keys with AE temporal ease for every dimension (and a 1-D version for spatial properties). */
export function aeKeys(keys: Key[]): AeKey[] {
  const dims = arr(keys[0]!.v).length;
  const out: AeKey[] = keys.map(k => ({
    t: k.t, v: k.v, ...(k.hold ? { hold: true } : {}),
    inE: Array.from({ length: dims }, () => ({ ...DEFAULT_EASE })), outE: Array.from({ length: dims }, () => ({ ...DEFAULT_EASE })),
    inSp: [{ ...DEFAULT_EASE }], outSp: [{ ...DEFAULT_EASE }],
  }));
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!, b = keys[i + 1]!;
    if (a.hold) continue;
    const bez = (EASINGS[b.ease ?? 'easeInOut'] ?? EASINGS.easeInOut) as Bezier;
    const dur = b.t - a.t;
    const av = arr(a.v), bv = arr(b.v);
    for (let d = 0; d < dims; d++) {
      const e = bezierToAeEase(bez, av[d]!, bv[d] ?? av[d]!, dur);
      out[i]!.outE[d] = e.out; out[i + 1]!.inE[d] = e.in;
    }
    const dist = Math.sqrt(av.reduce((s, v, d) => s + ((bv[d] ?? v) - v) ** 2, 0));
    const sp = bezierToAeEase(bez, 0, dist, dur);
    out[i]!.outSp = [sp.out]; out[i + 1]!.inSp = [sp.in];
  }
  return out;
}

export function compileForAe(plan: TransitionPlan, f: Frame): AeTransition {
  const r = roundHalves(plan, f.fps);
  const halves = plan.halves.map((h: Half): AeHalf => {
    const k = h.side === 'out' ? r.kOut : r.kIn;
    const res: AeHalf = {
      side: h.side,
      start: h.side === 'out' ? -r.nOut / f.fps : 0,
      end: h.side === 'out' ? 0 : r.nIn / f.fps,
      layer: h.layer,
      ...(h.color ? { color: h.color } : {}),
      ...(h.blend ? { blend: h.blend } : {}),
      effects: h.effects.map(e => {
        const def = effectDef(e.effect);
        if (!def.ae) throw new Error(`${e.effect} is not available in After Effects`);
        return {
          effect: e.effect, match: def.ae,
          set: Object.entries(e.set ?? {}).map(([name, v]) => {
            const p = param(e.effect, name);
            return { param: name, match: p.ae!, value: convert(p.unit, v, f, 'ae') };
          }),
          tracks: (e.tracks ?? []).map(t => {
            const p = param(e.effect, t.param);
            const keys = retime(t.keys, k).map(x => ({ ...x, v: convert(p.unit, x.v, f, 'ae') }));
            return { param: t.param, match: p.ae!, keys: aeKeys(keys) };
          }),
        };
      }),
    };
    if (h.opacity) res.opacity = { param: 'opacity', match: 'ADBE Opacity', keys: aeKeys(retime(h.opacity, k)) };
    if (h.scale) res.scale = { param: 'scale', match: 'ADBE Scale', keys: aeKeys(retime(h.scale, k)) };
    if (h.position) res.position = { param: 'position', match: 'ADBE Position', keys: aeKeys(retime(h.position, k).map(x => ({ ...x, v: convert('point', x.v, f, 'ae') }))) };
    if (h.mask) res.mask = { radius: (h.mask.radius * Math.hypot(f.width, f.height)) / 2, feather: (h.mask.feather * f.height) / 1080 };
    return res;
  });
  return { host: 'ae', id: plan.id, name: plan.name, fps: f.fps, halves };
}

// ---------- Premiere Pro ----------
export interface PprParam { param: string; names: string[]; index?: number; unit: string }
export interface PprEffect { effect: string; names: string[]; match?: string; set: (PprParam & { value: Value })[]; tracks: (PprParam & { keys: { t: number; v: Value }[] })[] }
export interface PprHalf { side: 'out' | 'in'; start: number; end: number; effects: PprEffect[] }
export interface PprTransition { host: 'ppro'; id: string; name: string; fps: number; halves: PprHalf[] }

/**
 * Premiere scripting cannot set bezier handles, so eased curves are written as one linear key per frame.
 * Video is only sampled on frames, so the result is frame-exact (and holds/steps stay steps).
 */
export function compileForPpro(plan: TransitionPlan, f: Frame): PprTransition {
  const r = roundHalves(plan, f.fps);
  const halves = plan.halves.map((h: Half): PprHalf => {
    if (h.layer !== 'adjustment') throw new Error(`${plan.name} needs a coloured layer, which Premiere scripts cannot create yet`);
    const k = h.side === 'out' ? r.kOut : r.kIn;
    const frames = h.side === 'out' ? Array.from({ length: r.nOut + 1 }, (_, i) => (i - r.nOut) / f.fps) : Array.from({ length: r.nIn + 1 }, (_, i) => i / f.fps);
    return {
      side: h.side,
      start: frames[0]!, end: frames[frames.length - 1]!,
      effects: h.effects.map(e => {
        const def = effectDef(e.effect);
        if (!def.pprNames) throw new Error(`${e.effect} is not available in Premiere Pro`);
        const ref = (name: string): PprParam => {
          const p = param(e.effect, name);
          if (!p.ppr) throw new Error(`${e.effect}.${name} is not available in Premiere Pro`);
          return { param: name, names: p.ppr, ...(p.pprIndex !== undefined ? { index: p.pprIndex } : {}), unit: p.unit };
        };
        return {
          effect: e.effect, names: def.pprNames, ...(def.pprMatch ? { match: def.pprMatch } : {}),
          set: Object.entries(e.set ?? {}).map(([name, v]) => ({ ...ref(name), value: convert(param(e.effect, name).unit, v, f, 'ppro') })),
          tracks: (e.tracks ?? []).map(t => {
            const p = param(e.effect, t.param);
            const keys = retime(t.keys, k);
            return { ...ref(t.param), keys: frames.map(tt => ({ t: round6(tt), v: roundV(convert(p.unit, evalKeys(keys, tt), f, 'ppro')) })) };
          }),
        };
      }),
    };
  });
  return { host: 'ppro', id: plan.id, name: plan.name, fps: f.fps, halves };
}

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;
const roundV = (v: Value): Value => (Array.isArray(v) ? v.map(round6) : round6(v));
