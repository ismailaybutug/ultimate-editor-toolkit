// Unit tests for the transition engine (packages/core/src/transitions). Level U/G only: real-app behaviour is
// checked by the H test (tests/host/TRANSITIONS_TEST_TR.md).
import { describe, it, expect } from 'vitest';
import {
  TRANSITIONS, buildTransition, compileForAe, compileForPpro, evalKeys, TransitionPlanSchema, mulberry32,
  type Host, type TransitionPlan,
} from '../packages/core/src/transitions/index';

const FRAMES = [
  { fps: 30, width: 1920, height: 1080 },
  { fps: 25, width: 1080, height: 1920 },
  { fps: 23.976, width: 3840, height: 2160 },
];

/** Neutral value per abstract param: what the image looks like with no effect. */
const NEUTRAL: Record<string, number | number[]> = {
  scale: 100, rotation: 0, shift: [0, 0], length: 0, blurriness: 0, height: 0, brightness: 0, intensity: 0,
  radius: 0, opacity: 0,
};
/** Mirror lines are neutral when they sit on the frame edge (nothing beyond the edge to reflect into view). */
const onEdge = (v: number[]) => Math.abs(Math.abs(v[0]!) - 0.5) < 1e-9 || Math.abs(Math.abs(v[1]!) - 0.5) < 1e-9;

function variants(host: Host) {
  const out: { name: string; plan: TransitionPlan }[] = [];
  for (const def of TRANSITIONS.filter(d => d.hosts.includes(host))) {
    for (const strength of [0.5, 1, 2]) {
      for (const direction of def.directions ?? [undefined]) {
        const plan = buildTransition({ transition: def.id, strength, direction: direction as any, color: def.usesColor ? '#ff8800' : undefined, seed: 3 }, host);
        out.push({ name: `${def.id}/${strength}/${direction ?? '-'}`, plan });
      }
    }
  }
  return out;
}

describe('transition library', () => {
  it('has unique ids and every family is represented', () => {
    expect(new Set(TRANSITIONS.map(t => t.id)).size).toBe(TRANSITIONS.length);
    expect(new Set(TRANSITIONS.map(t => t.family))).toEqual(new Set(['camera', 'glitch', 'distort', 'light', 'shape', 'film', 'blur']));
    expect(TRANSITIONS.every(t => t.hosts.includes('ae') && t.hosts.includes('ppro'))).toBe(true);
  });

  for (const host of ['ae', 'ppro'] as Host[]) {
    it(`every ${host} plan is valid and returns to neutral at both outer ends`, () => {
      for (const { name, plan } of variants(host)) {
        expect(() => TransitionPlanSchema.parse(plan), name).not.toThrow();
        for (const h of plan.halves) {
          const edge = h.side === 'out' ? -plan.dOut : plan.dIn;
          for (const e of h.effects) for (const t of e.tracks ?? []) {
            const v = evalKeys(t.keys, edge), label = `${name} ${h.side} ${e.effect}.${t.param}`;
            if (e.effect === 'mirror') expect(onEdge(v as number[]), label).toBe(true);
            else if (e.effect === 'circle' && t.param === 'center') { /* film burn: invisible because opacity is 0 */ }
            else expect(v, label).toEqual(NEUTRAL[t.param]);
            const ts = t.keys.map(k => k.t);
            expect(Math.min(...ts)).toBeGreaterThanOrEqual(h.side === 'out' ? -plan.dOut - 1e-9 : 0);
            expect(Math.max(...ts)).toBeLessThanOrEqual(h.side === 'out' ? 1e-9 : plan.dIn + 1e-9);
          }
          if (h.opacity) expect(evalKeys(h.opacity, edge), name).toBe(0);
          else if (h.scale) expect(evalKeys(h.scale, edge), name).toBe(0);
          if (h.layer === 'solid') expect(h.opacity || h.scale, `${name}: solid must fade or scale away`).toBeTruthy();
        }
      }
    });
  }

  it('refuses transitions a host cannot do, with a clear message', () => {
    expect(() => buildTransition({ transition: 'whip', strength: 1, direction: 'cw' }, 'ae')).toThrow(/direction/);
    expect(() => buildTransition({ transition: 'nope', strength: 1 }, 'ae')).toThrow(/Unknown transition/);
    expect(() => buildTransition({ transition: 'blur', strength: 3 }, 'ae')).toThrow();
  });

  it('strength scales the effect amplitude', () => {
    const peak = (s: number) => {
      const p = buildTransition({ transition: 'blur', strength: s }, 'ae');
      return evalKeys(p.halves[0]!.effects[0]!.tracks![0]!.keys, 0) as number;
    };
    expect(peak(2)).toBeCloseTo(peak(1) * 2);
    expect(peak(0.5)).toBeCloseTo(peak(1) / 2);
  });

  it('whip motion is continuous across the cut (offset wraps by one frame)', () => {
    for (const direction of ['left', 'right', 'up', 'down'] as const) {
      const p = buildTransition({ transition: 'whip', strength: 1, direction }, 'ppro');
      const a = evalKeys(p.halves[0]!.effects[0]!.tracks![0]!.keys, 0) as number[];
      const b = evalKeys(p.halves[1]!.effects[0]!.tracks![0]!.keys, 0) as number[];
      expect(Math.abs(a[0]! - b[0]!) + Math.abs(a[1]! - b[1]!)).toBeCloseTo(1);
    }
  });

  it('glitch is reproducible from its seed and changes with it', () => {
    const g = (seed: number) => JSON.stringify(buildTransition({ transition: 'glitch', strength: 1, seed }, 'ae'));
    expect(g(5)).toBe(g(5));
    expect(g(5)).not.toBe(g(6));
    const r = mulberry32(1);
    const xs = Array.from({ length: 1000 }, r);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
  });
});

describe('evalKeys', () => {
  it('interpolates with easing and respects holds', () => {
    const keys = [{ t: 0, v: 0 }, { t: 1, v: 10, ease: 'linear' }];
    expect(evalKeys(keys, 0.5)).toBeCloseTo(5);
    expect(evalKeys(keys, -1)).toBe(0);
    expect(evalKeys(keys, 2)).toBe(10);
    expect(evalKeys([{ t: 0, v: 0 }, { t: 1, v: 10, ease: 'easeIn' }], 0.5)).toBeLessThan(5);
    expect(evalKeys([{ t: 0, v: [1, 2], hold: true }, { t: 1, v: [3, 4] }], 0.99)).toEqual([1, 2]);
  });
});

describe('compileForAe', () => {
  it('produces frame-aligned halves, AE match names and valid eases', () => {
    for (const f of FRAMES) for (const { name, plan } of variants('ae')) {
      const c = compileForAe(plan, f);
      for (const h of c.halves) {
        expect(Math.abs(Math.round(h.start * f.fps) - h.start * f.fps), name).toBeLessThan(1e-6);
        expect(Math.abs(Math.round(h.end * f.fps) - h.end * f.fps), name).toBeLessThan(1e-6);
        expect(h.end - h.start).toBeGreaterThanOrEqual(2 / f.fps - 1e-9);
        const tracks = [...h.effects.flatMap(e => e.tracks), ...(h.opacity ? [h.opacity] : [])];
        for (const e of h.effects) {
          expect(e.match).toMatch(/^ADBE /);
          for (const s of [...e.set, ...e.tracks]) expect(s.match.startsWith(e.match + '-')).toBe(true);
        }
        for (const t of tracks) for (const k of t.keys) {
          expect(k.t).toBeGreaterThanOrEqual(h.start - 1e-9);
          expect(k.t).toBeLessThanOrEqual(h.end + 1e-9);
          for (const e of [...k.inE, ...k.outE, ...k.inSp, ...k.outSp]) {
            expect(Number.isFinite(e.speed), name).toBe(true);
            expect(e.influence).toBeGreaterThanOrEqual(0.1);
            expect(e.influence).toBeLessThanOrEqual(100);
          }
          expect(k.inE.length).toBe(Array.isArray(k.v) ? k.v.length : 1);
        }
      }
    }
  });

  it('converts units: points to layer pixels, blur to frame height', () => {
    const p = buildTransition({ transition: 'whip', strength: 1, direction: 'right' }, 'ae');
    const c = compileForAe(p, { fps: 30, width: 1080, height: 1920 });
    const shift = c.halves[0]!.effects[0]!.tracks[0]!;
    expect(shift.keys[0]!.v).toEqual([540, 960]);
    expect(shift.keys.at(-1)!.v).toEqual([540 + 540, 960]);
    const blur = c.halves[0]!.effects[1]!.tracks[0]!;
    expect(blur.keys.at(-1)!.v).toBeCloseTo((160 * 1920) / 1080);
  });

  it('zoom-in: incoming shot grows from 100/zoom with mirrored tiles big enough to cover the frame', () => {
    const p = buildTransition({ transition: 'zoom-in', strength: 2 }, 'ae');
    const c = compileForAe(p, FRAMES[0]!);
    const zoom = c.halves[0]!.effects[0]!.tracks[0]!.keys.at(-1)!.v as number;
    const inn = c.halves[1]!;
    const tile = inn.effects.find(e => e.effect === 'motionTile')!;
    expect(tile.set.find(s => s.param === 'outputWidth')!.value as number).toBeGreaterThanOrEqual(zoom);
    expect(inn.effects.find(e => e.effect === 'transform')!.tracks[0]!.keys[0]!.v).toBeCloseTo((100 * 100) / zoom);
  });

  it('flash solid keeps colour and blend mode', () => {
    const c = compileForAe(buildTransition({ transition: 'flash', strength: 1, color: '#00ff00' }, 'ae'), FRAMES[0]!);
    expect(c.halves[0]).toMatchObject({ layer: 'solid', blend: 'add', color: [0, 1, 0] });
    expect(c.halves[0]!.opacity!.keys.at(-1)!.v).toBe(100);
  });
});

describe('compileForPpro', () => {
  it('writes one key per frame, frame-exact, starting/ending neutral', () => {
    for (const f of FRAMES) for (const { name, plan } of variants('ppro')) {
      const c = compileForPpro(plan, f);
      for (const h of c.halves) for (const e of h.effects) {
        expect(e.names.length).toBeGreaterThan(0);
        for (const t of e.tracks) {
          const n = Math.round((h.end - h.start) * f.fps) + 1;
          expect(t.keys.length, name).toBe(n);
          t.keys.forEach(k => expect(Math.abs(k.t * f.fps - Math.round(k.t * f.fps))).toBeLessThan(1e-3));
          const edge = h.side === 'out' ? t.keys[0]! : t.keys.at(-1)!;
          if (e.effect === 'mirror') expect(onEdge((edge.v as number[]).map(x => x - 0.5))).toBe(true);
          else if (e.effect === 'circle' && t.param === 'center') continue;
          else if (t.param === 'shift') expect(edge.v).toEqual([0.5, 0.5]);
          else if (t.param === 'scale') expect(edge.v).toBe(100);
          else expect(edge.v, `${name} ${t.param}`).toBe(0);
        }
      }
    }
  });

  it('refuses plans that need an AE-only layer or effect', () => {
    const flash = buildTransition({ transition: 'flash', strength: 1 }, 'ae');
    expect(() => compileForPpro(flash, FRAMES[0]!)).toThrow(/coloured layer/);
    const spin = buildTransition({ transition: 'spin', strength: 1 }, 'ae');
    expect(() => compileForPpro(spin, FRAMES[0]!)).toThrow(/not available in Premiere/);
  });
});

describe('Premiere versions of AE-style transitions', () => {
  it('zoom-out mirrors follow the frame edge while it shrinks (never shows black borders)', () => {
    const c = compileForPpro(buildTransition({ transition: 'zoom-out', strength: 2 }, 'ppro'), FRAMES[0]!);
    const out = c.halves[0]!;
    const scale = out.effects[0]!.tracks.find(t => t.param === 'scale')!.keys;
    const right = out.effects.find(e => e.effect === 'mirror' && e.set[0]!.value === 0)!.tracks[0]!.keys;
    scale.forEach((k, i) => expect(right[i]!.v).toEqual([0.5 + (k.v as number) / 200, 0.5].map(x => Math.round(x * 1e6) / 1e6)));
    expect(Math.min(...scale.map(k => k.v as number))).toBeGreaterThanOrEqual(40 - 1e-9);
  });

  it('spin scales up just enough to cover the frame at every angle', () => {
    for (const f of [FRAMES[0]!, FRAMES[1]!]) {
      const p = buildTransition({ transition: 'spin', strength: 1 }, 'ppro', f);
      const c = compileForPpro(p, f);
      for (const h of c.halves) {
        const tr = h.effects[0]!.tracks;
        const rot = tr.find(t => t.param === 'rotation')!.keys, sc = tr.find(t => t.param === 'scale')!.keys;
        rot.forEach((k, i) => {
          const r = ((k.v as number) * Math.PI) / 180, s = (sc[i]!.v as number) / 100;
          // every frame corner, rotated back into the scaled image, must lie inside it
          for (const [x, y] of [[f.width / 2, f.height / 2], [f.width / 2, -f.height / 2]] as const) {
            const xr = Math.abs(x * Math.cos(r) + y * Math.sin(r)), yr = Math.abs(-x * Math.sin(r) + y * Math.cos(r));
            expect(xr).toBeLessThanOrEqual((s * f.width) / 2 + 0.5);
            expect(yr).toBeLessThanOrEqual((s * f.height) / 2 + 0.5);
          }
        });
      }
    }
  });

  it('flash, circle and film burn use the Circle effect with the chosen colour', () => {
    for (const id of ['flash', 'circle', 'film-burn']) {
      const c = compileForPpro(buildTransition({ transition: id, strength: 1, color: '#336699' }, 'ppro'), FRAMES[0]!);
      for (const h of c.halves) {
        expect(h.effects[0]!.effect).toBe('circle');
        expect(h.effects[0]!.set.find(s => s.param === 'color')!.value).toEqual([0x33 / 255, 0x66 / 255, 0x99 / 255]);
      }
    }
  });
});

describe('AE solid transitions', () => {
  it('circle uses an elliptical mask covering the frame and scales from 0', () => {
    const f = FRAMES[1]!;
    const c = compileForAe(buildTransition({ transition: 'circle', strength: 1 }, 'ae'), f);
    expect(c.halves[0]!.mask!.radius).toBeCloseTo(Math.hypot(f.width, f.height) / 2);
    expect(c.halves[0]!.scale!.keys[0]!.v).toBe(0);
    expect(c.halves[1]!.scale!.keys.at(-1)!.v).toBe(0);
  });
  it('film burn sweeps its position in layer pixels', () => {
    const c = compileForAe(buildTransition({ transition: 'film-burn', strength: 1 }, 'ae'), FRAMES[0]!);
    expect(c.halves[0]!.position!.keys.at(-1)!.v).toEqual([960, 540]);
    expect(c.halves[0]!).toMatchObject({ layer: 'solid', blend: 'add' });
  });
});
