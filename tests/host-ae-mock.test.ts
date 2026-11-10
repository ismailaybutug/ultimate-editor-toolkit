// Runs the real After Effects ExtendScript library against a small mock of the AE DOM.
// This catches logic/JS errors before testing in After Effects. It is NOT a substitute for
// the real-app test (TEST_REPORT.md, level H).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { BUILTIN_RECIPES, buildRampKeyframes } from '@uet/core';

class KeyframeEase { constructor(public speed: number, public influence: number) {} }

class Prop {
  keys: { t: number; v: any; inE?: KeyframeEase[]; outE?: KeyframeEase[] }[] = [];
  constructor(public value: any, public isSpatial = false) {}
  get numKeys() { return this.keys.length; }
  get dims() { return this.isSpatial ? 1 : Array.isArray(this.value) ? this.value.length : 1; }
  addKey(t: number) {
    const i = this.keys.findIndex(k => k.t > t);
    const k = { t, v: this.value };
    if (i < 0) { this.keys.push(k); return this.keys.length; }
    this.keys.splice(i, 0, k); return i + 1;
  }
  nearestKeyIndex(t: number) { let best = 1, d = Infinity; this.keys.forEach((k, i) => { if (Math.abs(k.t - t) < d) { d = Math.abs(k.t - t); best = i + 1; } }); return best; }
  setValueAtKey(i: number, v: any) {
    if (Array.isArray(this.value) !== Array.isArray(v) || (Array.isArray(v) && v.length !== this.value.length)) throw new Error(`bad value shape ${JSON.stringify(v)}`);
    this.keys[i - 1]!.v = v;
  }
  removeKey(i: number) { this.keys.splice(i - 1, 1); }
  setInterpolationTypeAtKey() {}
  setSpatialTangentsAtKey() {}
  keyInTemporalEase(i: number) { return this.keys[i - 1]!.inE ?? Array.from({ length: this.dims }, () => new KeyframeEase(0, 16.7)); }
  keyOutTemporalEase(i: number) { return this.keys[i - 1]!.outE ?? Array.from({ length: this.dims }, () => new KeyframeEase(0, 16.7)); }
  setTemporalEaseAtKey(i: number, inE: KeyframeEase[], outE: KeyframeEase[]) {
    if (inE.length !== this.dims || outE.length !== this.dims) throw new Error(`ease length ${inE.length}/${outE.length} != ${this.dims}`);
    for (const e of [...inE, ...outE]) if (!(e.influence >= 0.1 && e.influence <= 100) || !Number.isFinite(e.speed)) throw new Error('bad ease');
    this.keys[i - 1]!.inE = inE; this.keys[i - 1]!.outE = outE;
  }
  valueAtTime() { return this.value; }
  setValuesAtTimes(ts: number[], vs: number[]) { ts.forEach((t, i) => { const k = this.addKey(t); this.keys[k - 1]!.v = vs[i]; }); }
}

function makeLayer(name: string) {
  const props: Record<string, Prop> = {
    'ADBE Position': new Prop([960, 540, 0], true),
    'ADBE Scale': new Prop([100, 100, 100]),
    'ADBE Rotate Z': new Prop(0),
    'ADBE Opacity': new Prop(100),
    'ADBE Anchor Point': new Prop([0, 0, 0], true),
  };
  const tr = new Prop(0);
  return {
    name, inPoint: 1, outPoint: 6, startTime: 0, canSetTimeRemapEnabled: true, timeRemapEnabled: false, props, tr,
    property(n: string) {
      if (n === 'ADBE Transform Group') return { property: (p: string) => props[p] };
      if (n === 'ADBE Time Remapping') return tr;
      throw new Error('no prop ' + n);
    },
  };
}

function loadAe(layers: any[]) {
  class CompItem { selectedLayers = layers; time = 2; duration = 30; }
  const comp = new CompItem();
  const undo: string[] = [];
  const ctx: any = {
    JSON, Math, KeyframeEase, CompItem,
    KeyframeInterpolationType: { BEZIER: 6613, LINEAR: 6612 },
    app: { version: '26.0', project: { activeItem: comp, file: null }, beginUndoGroup: (n: string) => undo.push('begin:' + n), endUndoGroup: () => undo.push('end') },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync('packages/host-ae/jsx/uet-ae.jsx', 'utf8'), ctx);
  return { UET: ctx.UET, undo, comp };
}

describe('uet-ae.jsx on mock AE DOM', () => {
  it('applies every built-in recipe with valid eases in one undo group', () => {
    for (const recipe of BUILTIN_RECIPES) {
      const l1 = makeLayer('A'), l2 = makeLayer('B');
      const { UET, undo } = loadAe([l1, l2]);
      const res = JSON.parse(UET.ae.applyRecipe(JSON.stringify({ recipe, stagger: 0.1 })));
      expect(res, recipe.id + ' ' + res.error).toMatchObject({ ok: true });
      expect(undo).toEqual([`begin:UET: ${recipe.name}`, 'end']);
      const keyed = Object.values(l2.props).filter(p => p.numKeys > 0);
      expect(keyed.length).toBe(recipe.tracks.length);
    }
  });
  it('fade-up-in starts transparent and 40px lower, ends at original values', () => {
    const l = makeLayer('T');
    const { UET } = loadAe([l]);
    UET.ae.applyRecipe(JSON.stringify({ recipe: BUILTIN_RECIPES.find(r => r.id === 'fade-up-in') }));
    const op = l.props['ADBE Opacity']!, pos = l.props['ADBE Position']!;
    expect(op.keys.map(k => [k.t, k.v])).toEqual([[1, 0], [1.6, 100]]);
    expect(pos.keys[0]!.v).toEqual([960, 580, 0]);
    expect(pos.keys[1]!.v).toEqual([960, 540, 0]);
  });
  it('out recipe ends at the layer out-point', () => {
    const l = makeLayer('T');
    const { UET } = loadAe([l]);
    UET.ae.applyRecipe(JSON.stringify({ recipe: BUILTIN_RECIPES.find(r => r.id === 'fade-down-out') }));
    expect(l.props['ADBE Opacity']!.keys.at(-1)!.t).toBeCloseTo(6);
  });
  it('reports a clear error with no selection', () => {
    const { UET, undo } = loadAe([]);
    const res = JSON.parse(UET.ae.applyRecipe(JSON.stringify({ recipe: BUILTIN_RECIPES[0] })));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Select/);
    expect(undo).toEqual([]);
  });
  it('speed ramp writes time remap keys and sets the out-point', () => {
    const l = makeLayer('Clip');
    const { UET } = loadAe([l]);
    const keys = buildRampKeyframes({ sourceStart: 1, sourceEnd: 6, targetSpeed: 3, rampFraction: 0.3, shape: 'both' });
    const res = JSON.parse(UET.ae.speedRamp(JSON.stringify({ keys })));
    expect(res.ok).toBe(true);
    expect(l.timeRemapEnabled).toBe(true);
    expect(l.tr.numKeys).toBe(keys.length);
    expect(l.outPoint).toBeCloseTo(1 + keys.at(-1)![0], 5);
  });
});
