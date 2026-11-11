// Runs the real transition host scripts (uet-transitions-ae.jsx / uet-transitions-ppro.jsx) against small mocks of
// the After Effects and Premiere DOMs. Catches logic and JS errors before the real-app test; it is NOT a
// substitute for it (TEST_REPORT.md level H).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { TRANSITIONS, buildTransition, compileForAe, compileForPpro } from '../packages/core/src/transitions/index';

// ---------------- After Effects mock ----------------
class KeyframeEase { constructor(public speed: number, public influence: number) {} }
const KIT = { BEZIER: 6613, LINEAR: 6612, HOLD: 6614 };

class AeProp {
  keys: { t: number; v: any; outType?: number; inE?: KeyframeEase[]; outE?: KeyframeEase[] }[] = [];
  value: any;
  constructor(public match: string, value: any, public isSpatial = false) { this.value = value; }
  get numKeys() { return this.keys.length; }
  private dims() { return this.isSpatial ? 1 : Array.isArray(this.value) ? this.value.length : 1; }
  private shape(v: any) {
    if (Array.isArray(this.value) !== Array.isArray(v) || (Array.isArray(v) && v.length !== this.value.length)) throw new Error(`${this.match}: bad value shape ${JSON.stringify(v)}`);
    if ((Array.isArray(v) ? v : [v]).some((x: number) => !Number.isFinite(x))) throw new Error(`${this.match}: not finite`);
  }
  setValue(v: any) { this.shape(v); this.value = v; }
  setValueAtTime(t: number, v: any) {
    this.shape(v);
    const i = this.keys.findIndex(k => Math.abs(k.t - t) < 1e-9);
    if (i >= 0) { this.keys[i]!.v = v; return; }
    this.keys.push({ t, v }); this.keys.sort((a, b) => a.t - b.t);
  }
  nearestKeyIndex(t: number) { let best = 1, d = Infinity; this.keys.forEach((k, i) => { if (Math.abs(k.t - t) < d) { d = Math.abs(k.t - t); best = i + 1; } }); return best; }
  setInterpolationTypeAtKey(i: number, _in: number, out: number) { this.keys[i - 1]!.outType = out; }
  setTemporalEaseAtKey(i: number, inE: KeyframeEase[], outE: KeyframeEase[]) {
    if (inE.length !== this.dims() || outE.length !== this.dims()) throw new Error(`${this.match}: ease length ${inE.length} != ${this.dims()}`);
    for (const e of [...inE, ...outE]) if (!(e.influence >= 0.1 && e.influence <= 100) || !Number.isFinite(e.speed)) throw new Error('bad ease');
    this.keys[i - 1]!.inE = inE; this.keys[i - 1]!.outE = outE;
  }
  setSpatialTangentsAtKey() {}
}

/** Default values of the effect properties we use (shape matters: points are 2-D and spatial). */
const AE_DEFAULTS: Record<string, [any, boolean?]> = {
  'ADBE Geometry2-0002': [[960, 540], true], 'ADBE Offset-0001': [[960, 540], true],
};

function aeEffect(match: string) {
  const props: Record<string, AeProp> = {};
  return {
    matchName: match, props,
    property(m: string) {
      if (!m.startsWith(match + '-')) return null;
      if (!props[m]) { const d = AE_DEFAULTS[m]; props[m] = new AeProp(m, d ? d[0] : 0, d ? !!d[1] : false); }
      return props[m];
    },
  };
}

const KNOWN_AE = ['ADBE Mirror', 'ADBE Geometry2', 'ADBE Tile', 'ADBE Offset', 'ADBE Motion Blur', 'ADBE Gaussian Blur 2', 'ADBE Wave Warp', 'ADBE Brightness & Contrast 2', 'ADBE Glo2'];

function loadAe(opts: { time?: number; selectedInPoints?: number[] } = {}) {
  const undo: string[] = [];
  const layers: any[] = [];
  const mkLayer = (name: string, inPoint: number, outPoint: number) => {
    const effects: any[] = [];
    const opacity = new AeProp('ADBE Opacity', 100);
    const scale = new AeProp('ADBE Scale', [100, 100, 100]);
    const position = new AeProp('ADBE Position', [960, 540, 0], true);
    const masks: any[] = [];
    const l: any = {
      name, inPoint, outPoint, startTime: inPoint, comment: '', adjustmentLayer: false, blendingMode: 0, label: 0, effects, opacity, scale, position, masks,
      get index() { return layers.indexOf(l) + 1; },
      remove() { layers.splice(layers.indexOf(l), 1); },
      moveBefore(o: any) { layers.splice(layers.indexOf(l), 1); layers.splice(layers.indexOf(o), 0, l); },
      property(n: string) {
        if (n === 'ADBE Effect Parade') return { addProperty: (m: string) => { if (!KNOWN_AE.includes(m)) return null; const e = aeEffect(m); effects.push(e); return e; } };
        if (n === 'ADBE Transform Group') return { property: (p: string) => ({ 'ADBE Opacity': opacity, 'ADBE Scale': scale, 'ADBE Position': position } as any)[p] ?? null };
        if (n === 'ADBE Mask Parade') return { addProperty: (m: string) => {
          if (m !== 'ADBE Mask Atom') return null;
          const mk: any = { shape: null, feather: null, property: (p: string) => ({ 'ADBE Mask Shape': { setValue: (v: any) => { mk.shape = v; } }, 'ADBE Mask Feather': { setValue: (v: any) => { mk.feather = v; } } } as any)[p] };
          masks.push(mk); return mk;
        } };
        throw new Error('no prop ' + n);
      },
    };
    return l;
  };
  layers.push(mkLayer('A', 0, 5), mkLayer('B', 5, 10));
  class CompItem {
    frameRate = 30; width = 1920; height = 1080; pixelAspect = 1; time = opts.time ?? 5; name = 'Comp';
    get numLayers() { return layers.length; }
    layer(i: number) { return layers[i - 1]; }
    get selectedLayers() { return (opts.selectedInPoints ?? []).map(t => layers.find(l => l.inPoint === t && !l.comment)); }
    layers = { addSolid: (color: number[], name: string, w: number, h: number, pa: number, dur: number) => { const l = mkLayer(name, 0, dur); l.color = color; layers.unshift(l); return l; } };
  }
  const comp = new CompItem();
  const ctx: any = {
    JSON, Math, String, Object, KeyframeEase, CompItem, Shape: class { vertices: any; inTangents: any; outTangents: any; closed = false; }, KeyframeInterpolationType: KIT, BlendingMode: { ADD: 5220, SCREEN: 5222 },
    app: { project: { activeItem: comp }, beginUndoGroup: (n: string) => undo.push('begin:' + n), endUndoGroup: () => undo.push('end') },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync('packages/host-ae/jsx/uet-transitions-ae.jsx', 'utf8'), ctx);
  return { T: ctx.UET.transitions, undo, layers, comp };
}

describe('uet-transitions-ae.jsx on mock AE DOM', () => {
  it('cutInfo uses the later of two selected layers, else the current time', () => {
    expect(JSON.parse(loadAe({ selectedInPoints: [0, 5], time: 2 }).T.cutInfo()).data).toMatchObject({ cut: 5, how: 'selection', fps: 30 });
    expect(JSON.parse(loadAe({ time: 3.01 }).T.cutInfo()).data).toMatchObject({ cut: 3, how: 'time' });
  });

  for (const def of TRANSITIONS.filter(t => t.hosts.includes('ae'))) {
    it(`applies ${def.id} as two tagged layers around the cut in one undo group`, () => {
      const { T, undo, layers } = loadAe({ selectedInPoints: [0, 5] });
      const info = JSON.parse(T.cutInfo()).data;
      const plan = compileForAe(buildTransition({ transition: def.id, strength: 1.5, color: '#ff0000' }, 'ae'), info);
      const res = JSON.parse(T.apply(JSON.stringify({ plan, cut: info.cut })));
      expect(res, res.error).toMatchObject({ ok: true });
      expect(undo).toEqual([`begin:UET: ${plan.name} transition`, 'end']);
      const ours = layers.filter(l => l.comment.startsWith('uet-transition:'));
      expect(ours.length).toBe(2);
      const [outL, inL] = [ours.find(l => l.comment.endsWith(':out'))!, ours.find(l => l.comment.endsWith(':in'))!];
      expect(outL.outPoint).toBeCloseTo(5); expect(inL.inPoint).toBeCloseTo(5);
      expect(outL.inPoint).toBeCloseTo(5 + plan.halves[0]!.start);
      // above both shots
      expect(Math.max(outL.index, inL.index)).toBeLessThan(layers.findIndex(l => l.name === 'A') + 1);
      for (const [l, h] of [[outL, plan.halves[0]!], [inL, plan.halves[1]!]] as const) {
        expect(l.adjustmentLayer).toBe(h.layer === 'adjustment');
        expect(l.effects.map((e: any) => e.matchName)).toEqual(h.effects.map(e => e.match));
        h.effects.forEach((e, i) => e.tracks.forEach(t => {
          const p = l.effects[i].props[t.match] as AeProp;
          expect(p.numKeys).toBe(t.keys.length);
          expect(p.keys[0]!.t).toBeCloseTo(5 + t.keys[0]!.t);
          t.keys.forEach((k, j) => expect(p.keys[j]!.outType).toBe(k.hold ? KIT.HOLD : KIT.BEZIER));
        }));
        if (h.opacity) expect(l.opacity.numKeys).toBe(h.opacity.keys.length);
        if (h.scale) { expect(l.scale.numKeys).toBe(h.scale.keys.length); expect(l.scale.keys[0]!.v).toHaveLength(3); }
        if (h.position) { expect(l.position.numKeys).toBe(h.position.keys.length); expect(l.position.keys[0]!.v).toHaveLength(3); }
        if (h.mask) { expect(l.masks).toHaveLength(1); expect(l.masks[0].shape.vertices).toHaveLength(4); expect(l.masks[0].shape.closed).toBe(true); }
      }
      // Applying again at the same cut replaces instead of stacking.
      const again = JSON.parse(T.apply(JSON.stringify({ plan, cut: info.cut })));
      expect(again.data.replaced).toBe(2);
      expect(layers.filter(l => l.comment.startsWith('uet-transition:')).length).toBe(2);
      // And remove clears them.
      expect(JSON.parse(T.remove(JSON.stringify({ cut: 5 }))).data.removed).toBe(2);
      expect(layers.length).toBe(2);
    });
  }

  it('refuses a plan compiled for another frame rate or before 0:00', () => {
    const { T } = loadAe({ time: 0.1 });
    const plan25 = compileForAe(buildTransition({ transition: 'blur', strength: 1 }, 'ae'), { fps: 25, width: 1920, height: 1080 });
    expect(JSON.parse(T.apply(JSON.stringify({ plan: plan25 }))).error).toMatch(/fps/);
    const plan = compileForAe(buildTransition({ transition: 'blur', strength: 1 }, 'ae'), { fps: 30, width: 1920, height: 1080 });
    expect(JSON.parse(T.apply(JSON.stringify({ plan }))).error).toMatch(/before 0:00/);
  });
});

// ---------------- Premiere mock ----------------
const TICKS = 254016000000;
const tm = (s: number) => ({ seconds: s, ticks: String(Math.round(s * TICKS)) });
const PPR_PARAMS: Record<string, string[]> = {
  Transform: ['Anchor Point', 'Position', 'Uniform Scale', 'Scale', 'Scale Width', 'Skew', 'Skew Axis', 'Rotation', 'Opacity', "Use Composition's Shutter Angle", 'Shutter Angle', 'Sampling'],
  Offset: ['Shift Center To', 'Blend With Original'],
  'Directional Blur': ['Direction', 'Blur Length'],
  'Gaussian Blur': ['Blurriness', 'Blur Dimensions', 'Repeat Edge Pixels'],
  'Wave Warp': ['Wave Type', 'Wave Height', 'Wave Width', 'Direction', 'Wave Speed', 'Pinning', 'Phase', 'Antialiasing'],
  'Brightness & Contrast': ['Brightness', 'Contrast'],
  Mirror: ['Reflection Center', 'Reflection Angle'],
  Circle: ['Center', 'Radius', 'Edge', 'Thickness', 'Feather Outer Edge', 'Feather Inner Edge', 'Invert Circle', 'Color', 'Opacity', 'Blending Mode'],
};

function pprComponent(name: string) {
  const params = PPR_PARAMS[name]!.map(displayName => {
    const p: any = {
      displayName, value: 0, varying: false, keys: [] as { t: number; v: any }[],
      setValue(v: any) { p.value = v; },
      setColorValue(a: number, r: number, g: number, b: number) { p.value = [a, r, g, b]; },
      setTimeVarying(b: boolean) { p.varying = b; },
      isTimeVarying() { return p.varying; },
      getValue() { return p.value; },
      addKey(t: any) { if (!p.varying) throw new Error('not time varying'); p.keys.push({ t: Number(t.ticks) / TICKS, v: undefined }); },
      setValueAtKey(t: any, v: any) { const k = p.keys.find((x: any) => Math.abs(x.t - Number(t.ticks) / TICKS) < 1e-6); if (!k) throw new Error('no key'); k.v = v; },
    };
    return p;
  });
  const props: any = { numItems: params.length }; params.forEach((p, i) => { props[i] = p; });
  return { displayName: name, matchName: 'AE.' + name, properties: props, params };
}

function loadPpro(opts: { playhead?: number; effectNames?: string[] } = {}) {
  const mkClip = (name: string, start: number, end: number, inPoint: number) => {
    const comps: any[] = [pprComponent('Transform')].slice(0, 0); // Motion/Opacity are not modelled
    const components: any = { get numItems() { return comps.length; } };
    const c: any = { name, start: tm(start), end: tm(end), inPoint: tm(inPoint), components, comps, isSelected: () => false };
    Object.defineProperty(components, 'list', { value: comps });
    return c;
  };
  const clips = [mkClip('A', 0, 4, 10), mkClip('B', 4, 9, 2)];
  const sync = (c: any) => { c.comps.forEach((x: any, i: number) => { c.components[i] = x; }); };
  const track: any = { clips: { numItems: clips.length, 0: clips[0], 1: clips[1] } };
  const seq: any = {
    name: 'Seq', frameSizeHorizontal: 1920, frameSizeVertical: 1080,
    videoTracks: { numTracks: 1, 0: track },
    getSettings: () => ({ videoFrameRate: { seconds: 1 / 25 } }),
    getPlayerPosition: () => tm(opts.playhead ?? 4),
  };
  const known = opts.effectNames ?? Object.keys(PPR_PARAMS);
  const qeItems = [{ type: 'Clip', start: { ticks: clips[0].start.ticks }, c: clips[0] }, { type: 'Empty', start: { ticks: '0' } }, { type: 'Clip', start: { ticks: clips[1].start.ticks }, c: clips[1] }]
    .map((it: any) => ({ ...it, addVideoEffect(fx: any) { it.c.comps.push(pprComponent(fx.name)); sync(it.c); } }));
  const ctx: any = {
    JSON, Math, String, Object,
    Time: class { ticks = '0'; },
    app: { project: { activeSequence: seq }, enableQE() {} },
    qe: { project: {
      getActiveSequence: () => ({ getVideoTrackAt: () => ({ numItems: qeItems.length, getItemAt: (i: number) => qeItems[i] }) }),
      getVideoEffectByName: (n: string) => (known.includes(n) ? { name: n } : null),
      getVideoEffectList: () => known.join(','),
    } },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync('packages/host-ppro/jsx/uet-transitions-ppro.jsx', 'utf8'), ctx);
  return { T: ctx.UET.transitions, clips };
}

describe('uet-transitions-ppro.jsx on mock Premiere DOM', () => {
  it('cutInfo finds the two clips at the playhead', () => {
    const r = JSON.parse(loadPpro().T.cutInfo());
    expect(r.data).toMatchObject({ cut: 4, track: 0, outClip: 'A', inClip: 'B', fps: 25, width: 1920 });
    expect(JSON.parse(loadPpro({ playhead: 2 }).T.cutInfo()).error).toMatch(/playhead on a cut/);
  });

  for (const def of TRANSITIONS.filter(t => t.hosts.includes('ppro'))) {
    it(`applies ${def.id} as keyframed effects on both clips (source-time keys)`, () => {
      const { T, clips } = loadPpro();
      const info = JSON.parse(T.cutInfo()).data;
      const plan = compileForPpro(buildTransition({ transition: def.id, strength: 1 }, 'ppro'), info);
      const res = JSON.parse(T.apply(JSON.stringify({ plan })));
      expect(res, res.error).toMatchObject({ ok: true });
      expect(res.data.applied.map((a: any) => a.clip)).toEqual(['A', 'B']);
      plan.halves.forEach((h, hi) => {
        const clip = clips[hi]!;
        expect(clip.comps.map((c: any) => c.displayName)).toEqual(h.effects.map(e => e.names[0]));
        h.effects.forEach((e, ei) => {
          const comp = clip.comps[ei];
          for (const s of e.set) {
            const p = comp.params.find((x: any) => s.names.includes(x.displayName));
            expect(p, `${e.effect}.${s.param}`).toBeTruthy();
            const want = s.unit === 'bool' ? !!s.value : s.unit === 'color' ? [255, ...(s.value as number[]).map(x => Math.round(x * 255))] : s.value;
            expect(p.value).toEqual(want);
          }
          for (const t of e.tracks) {
            const p = comp.params.find((x: any) => t.names.includes(x.displayName));
            expect(p.keys.length).toBe(t.keys.length);
            // source time = clip in-point + (timeline time - clip start)
            const srcIn = clip.inPoint.seconds, start = clip.start.seconds;
            expect(p.keys[0].t).toBeCloseTo(srcIn + (4 + t.keys[0]!.t - start), 5);
            expect(p.keys.at(-1).v).toEqual(t.keys.at(-1)!.v);
          }
        });
      });
    });
  }

  it('can write keys in clip time for the H test', () => {
    const { T, clips } = loadPpro();
    const info = JSON.parse(T.cutInfo()).data;
    const plan = compileForPpro(buildTransition({ transition: 'blur', strength: 1 }, 'ppro'), info);
    JSON.parse(T.apply(JSON.stringify({ plan, keyTime: 'clip' })));
    expect(clips[1]!.comps[0].params[0].keys[0].t).toBeCloseTo(0, 5);
  });

  it('skips keys outside a clip and a missing side, and names missing effects', () => {
    const { T, clips } = loadPpro({ playhead: 9 });
    clips[1]!.start = tm(8); // outgoing clip B is only 1 s long now
    const plan = compileForPpro(buildTransition({ transition: 'blur', strength: 1, duration: 3 }, 'ppro'), { fps: 25, width: 1920, height: 1080 });
    const r = JSON.parse(T.apply(JSON.stringify({ plan })));
    expect(r.data.skipped).toEqual(['in']); // nothing after B
    expect(r.data.applied[0].keys).toBe(26); // out half is 38 frames, only the last 1 s (25 frames + cut) is inside B
    const { T: T2 } = loadPpro({ effectNames: ['Transform'] });
    const r2 = JSON.parse(T2.apply(JSON.stringify({ plan: compileForPpro(buildTransition({ transition: 'wave', strength: 1 }, 'ppro'), { fps: 25, width: 1920, height: 1080 }) })));
    expect(r2.error).toMatch(/Premiere effect not found: Wave Warp.*Transform/);
  });
});
