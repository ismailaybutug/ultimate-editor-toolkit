// AE motion + typography + layout tools: pure logic (packages/core/src/motion) and the host scripts
// (uet-ae-motion.jsx, uet-ae-layout.jsx) run against a mock AE DOM. Level U/G only; real AE test = H.
import { describe, it, expect } from 'vitest';
import {
  BUILTIN_TEXT_PRESETS, TextPresetSchema, planTextAnimator,
  SHAKE_PRESETS, ShakeSchema, shakeExpression,
  CounterSchema, formatCounter, counterExpression,
  CarouselSchema, autoRadius, carouselSlots, spinKeys, slotAngles,
} from '../packages/core/src/motion/index';
import { textAnimatorArgs, shakeArgs, counterArgs, carouselArgs } from '../apps/panel/src/modules/ae-motion';
import { loadAe, TextLayer, AVLayer, CameraLayer, type LayerBase } from './ae-mockdom';

describe('text presets (core)', () => {
  it('all built-ins are valid, unique and cover in + out', () => {
    const ids = new Set(BUILTIN_TEXT_PRESETS.map(p => p.id));
    expect(ids.size).toBe(BUILTIN_TEXT_PRESETS.length);
    for (const p of BUILTIN_TEXT_PRESETS) expect(TextPresetSchema.parse(p)).toEqual(p);
    expect(BUILTIN_TEXT_PRESETS.some(p => p.kind === 'out')).toBe(true);
    expect(BUILTIN_TEXT_PRESETS.length).toBeGreaterThanOrEqual(10);
  });
  it('cascade in: Ramp Up, offset -spread → 100', () => {
    const p = BUILTIN_TEXT_PRESETS.find(x => x.id === 'char-rise')!;
    const plan = planTextAnimator(p);
    expect(plan).toMatchObject({ shape: 2, basedOn: 2, units: 1, start: 0, end: p.spread, offset: -p.spread, animate: 'offset' });
    expect(plan.keys.map(k => [k.t, k.v])).toEqual([[0, -p.spread], [p.duration, 100]]);
  });
  it('cascade out uses Ramp Down; wipe uses a hard square selector', () => {
    expect(planTextAnimator(BUILTIN_TEXT_PRESETS.find(x => x.id === 'char-sink-out')!).shape).toBe(3);
    const tw = planTextAnimator(BUILTIN_TEXT_PRESETS.find(x => x.id === 'typewriter')!, 2);
    expect(tw).toMatchObject({ shape: 1, smoothness: 0, animate: 'start', end: 100 });
    expect(tw.keys.at(-1)).toMatchObject({ t: 2, v: 100 });
    const bs = planTextAnimator(BUILTIN_TEXT_PRESETS.find(x => x.id === 'backspace-out')!);
    expect(bs).toMatchObject({ animate: 'end', end: 0 });
  });
  it('rejects presets without properties', () => {
    expect(() => TextPresetSchema.parse({ ...BUILTIN_TEXT_PRESETS[0], props: {} })).toThrow();
  });
});

describe('text animator on mock AE', () => {
  const sel = (l: LayerBase, ...p: string[]) => l.node('ADBE Text Properties', 'ADBE Text Animators', ...p);
  it('applies every preset as one editable animator in one undo group', () => {
    for (const p of BUILTIN_TEXT_PRESETS) {
      const t = new TextLayer('Title', 1, 6);
      const { call, undo } = loadAe([t]);
      const r = call('applyTextAnimator', textAnimatorArgs(p));
      expect(r, p.id + ' ' + r.error).toMatchObject({ ok: true, data: { layers: ['Title'], skipped: [] } });
      expect(r.data.warnings).toEqual([]);
      expect(undo).toEqual([`begin:UET: ${p.name}`, 'end']);
      const anim = sel(t, '1');
      expect(anim.name).toBe('UET ' + p.name);
      const props = anim.find('ADBE Text Animator Properties')!.children.map(c => c.matchName);
      expect(props.length).toBe(Object.keys(p.props).length);
      const plan = planTextAnimator(p);
      const s = anim.find('ADBE Text Selectors')!.find(1)!;
      const adv = s.find('ADBE Text Range Advanced')!;
      expect(adv.find('ADBE Text Range Shape')!.val).toBe(plan.shape);
      expect(adv.find('ADBE Text Range Type2')!.val).toBe(plan.basedOn);
      expect(adv.find('ADBE Text Randomize Order')!.val).toBe(p.randomize ? 1 : 0);
      const animated = s.find({ start: 'ADBE Text Percent Start', end: 'ADBE Text Percent End', offset: 'ADBE Text Percent Offset' }[plan.animate])!;
      const t0 = p.kind === 'in' ? 1 : 6 - p.duration;
      expect(animated.keys.map(k => [+k.t.toFixed(6), k.v])).toEqual([[+t0.toFixed(6), plan.keys[0]!.v], [+(t0 + p.duration).toFixed(6), 100]]);
    }
  });
  it('writes hidden-state values with the right dimensions', () => {
    const t = new TextLayer('T');
    const { call } = loadAe([t]);
    call('applyTextAnimator', textAnimatorArgs(BUILTIN_TEXT_PRESETS.find(x => x.id === 'char-pop')!));
    call('applyTextAnimator', { ...textAnimatorArgs(BUILTIN_TEXT_PRESETS.find(x => x.id === 'tumble-in')!), replace: false });
    const props = (i: number) => sel(t, String(i), 'ADBE Text Animator Properties');
    expect(props(1).find('ADBE Text Scale 3D')!.val).toEqual([0, 0, 100]);
    expect(props(2).find('ADBE Text Position 3D')!.val).toEqual([0, -50, 0]);
    expect(props(2).find('ADBE Text Rotation')!.val).toBe(-35);
    call('applyTextAnimator', textAnimatorArgs(BUILTIN_TEXT_PRESETS.find(x => x.id === 'blur-in')!));
    expect(t.node('ADBE Text Properties', 'ADBE Text Animators').children.length).toBe(1); // replace removed both
    expect(props(1).find('ADBE Text Blur')!.val).toEqual([25, 25]);
  });
  it('playhead start, stagger, skips non-text layers, remove', () => {
    const a = new TextLayer('A'), b = new AVLayer('Video'), c = new TextLayer('C');
    const { call } = loadAe([a, b, c]);
    const p = BUILTIN_TEXT_PRESETS.find(x => x.id === 'word-rise')!;
    const r = call('applyTextAnimator', textAnimatorArgs(p, { atPlayhead: true, stagger: 0.25 }));
    expect(r.data).toMatchObject({ layers: ['A', 'C'], skipped: ['Video'] });
    expect(sel(a, '1', 'ADBE Text Selectors', '1', 'ADBE Text Percent Offset').keys[0]!.t).toBeCloseTo(2);
    expect(sel(c, '1', 'ADBE Text Selectors', '1', 'ADBE Text Percent Offset').keys[0]!.t).toBeCloseTo(2.25);
    expect(call('removeTextAnimators').data.removed).toBe(2);
    expect(call('applyTextAnimator', textAnimatorArgs(p)).ok).toBe(true);
  });
  it('clear error when nothing usable is selected', () => {
    expect(loadAe([]).call('applyTextAnimator', textAnimatorArgs(BUILTIN_TEXT_PRESETS[0]!)).error).toMatch(/Select/);
    expect(loadAe([new AVLayer('V')]).call('applyTextAnimator', textAnimatorArgs(BUILTIN_TEXT_PRESETS[0]!)).error).toMatch(/No text layer/);
  });
});

describe('shake', () => {
  it('presets are valid; expressions reference the slider names', () => {
    for (const p of Object.values(SHAKE_PRESETS)) expect(ShakeSchema.parse(p.params)).toEqual(p.params);
    const e = shakeExpression('rotation', 7);
    expect(e).toContain('effect("UET Shake Rotation")(1)');
    expect(e).toContain('seedRandom(7, false)');
    expect(e.startsWith('// UET shake')).toBe(true);
  });
  it('adds sliders + expressions; decay keys start at the playhead; re-apply replaces; remove cleans up', () => {
    const l = new AVLayer('Clip');
    const { call } = loadAe([l]);
    const r = call('addShake', shakeArgs(SHAKE_PRESETS.impact!.params));
    expect(r, r.error).toMatchObject({ ok: true, data: { layers: ['Clip'] } });
    const fx = l.node('ADBE Effect Parade');
    expect(fx.children.map(c => c.name)).toEqual(['UET Shake Amount', 'UET Shake Frequency', 'UET Shake Rotation']);
    const amt = fx.find('UET Shake Amount')!.find(1)!;
    expect(amt.keys.map(k => [+k.t.toFixed(3), k.v])).toEqual([[1.96, 0], [2, 45], [2.6, 0]]);
    expect(l.node('ADBE Transform Group', 'ADBE Position').expression).toContain('wiggle(f, a)');
    expect(l.node('ADBE Transform Group', 'ADBE Rotate Z').expression).toContain('UET Shake Rotation');
    expect(l.motionBlur).toBe(true);
    call('addShake', shakeArgs(SHAKE_PRESETS.handheld!.params));
    expect(fx.children.length).toBe(3);
    expect(fx.find('UET Shake Amount')!.find(1)!.keys.length).toBe(0);
    expect(call('removeShake').data.removed).toBe(5);
    expect(fx.children.length).toBe(0);
    expect(l.node('ADBE Transform Group', 'ADBE Position').expression).toBe('');
  });
  it('separated position gets X/Y expressions; foreign expressions are never overwritten', () => {
    const a = new AVLayer('Sep'); a.node('ADBE Transform Group', 'ADBE Position').dimensionsSeparated = true;
    const b = new AVLayer('Mine'); b.node('ADBE Transform Group', 'ADBE Position').expression = 'loopOut()';
    const { call } = loadAe([a, b]);
    const r = call('addShake', shakeArgs(ShakeSchema.parse({ rotation: 0 })));
    expect(r.data.skipped).toEqual(['Mine (has its own expression)']);
    expect(a.node('ADBE Transform Group', 'ADBE Position_0').expression).toContain('wiggle');
    expect(a.node('ADBE Transform Group', 'ADBE Position_1').expression).toContain('wiggle');
    expect(a.node('ADBE Transform Group', 'ADBE Rotate Z').expression).toBe('');
    expect(b.node('ADBE Transform Group', 'ADBE Position').expression).toBe('loopOut()');
  });
});

describe('counter', () => {
  it('formats Turkish/English numbers', () => {
    expect(formatCounter(1234567.891, { decimals: 2, thousands: '.', decimal: ',', prefix: '₺', suffix: '' })).toBe('₺1.234.567,89');
    expect(formatCounter(-1500, { decimals: 0, thousands: ',', decimal: '.', prefix: '', suffix: ' TL' })).toBe('-1,500 TL');
    expect(formatCounter(42.5, { decimals: 1, thousands: '', decimal: '.', prefix: '%', suffix: '' })).toBe('%42.5');
  });
  it('the AE expression gives the same text as formatCounter', () => {
    const c = CounterSchema.parse({ decimals: 1, prefix: '+', suffix: '%' });
    const expr = counterExpression(c);
    for (const v of [0, 12.34, 9999.95, -123456.7, 1e6]) {
      const run = new Function('effect', expr.split('\n').slice(0, -1).join('\n') + '\nreturn ' + expr.split('\n').at(-1));
      expect(run(() => () => ({ value: v }))).toBe(formatCounter(v, c));
    }
  });
  it('creates a counter layer keyed from the playhead, or uses the selected text layer', () => {
    const { call, comp } = loadAe([]);
    const r = call('createCounter', counterArgs(CounterSchema.parse({ from: 0, to: 500, duration: 3 })));
    expect(r, r.error).toMatchObject({ ok: true, data: { created: true, layer: 'UET Counter' } });
    const layer = (comp as any).all[0] as LayerBase;
    expect(layer.node('ADBE Effect Parade', 'UET Counter', '1').keys.map(k => [k.t, k.v])).toEqual([[2, 0], [5, 500]]);
    expect(layer.node('ADBE Text Properties', 'ADBE Text Document').expression).toContain('UET Counter');
    const t = new TextLayer('Mine');
    const r2 = loadAe([t]).call('createCounter', counterArgs(CounterSchema.parse({})));
    expect(r2.data).toEqual({ layer: 'Mine', created: false });
  });
});

describe('3D carousel', () => {
  const ring = CarouselSchema.parse({ layout: 'ring' });
  it('ring slots: front item nearest the viewer, all at the same radius, facing outwards', () => {
    const s = carouselSlots(4, 500, ring);
    expect(s[0]).toEqual({ x: 0, y: 0, z: -500, rotY: 0 });
    for (const x of s) expect(Math.hypot(x.x, x.z)).toBeCloseTo(500, 2);
    expect(s[1]).toMatchObject({ x: 500, rotY: -90 });
  });
  it('arc and helix layouts', () => {
    expect(slotAngles(3, { layout: 'arc', arcDegrees: 120 })).toEqual([-60, 0, 60]);
    const h = carouselSlots(3, 400, CarouselSchema.parse({ layout: 'helix', helixStep: 100 }));
    expect(h.map(x => x.y)).toEqual([-100, 0, 100]);
  });
  it('auto radius leaves room for each item', () => {
    const r = autoRadius(6, 400, ring);
    expect((2 * Math.PI * r) / 6).toBeGreaterThanOrEqual(400 * 1.2 - 1e-6);
  });
  it('step spin brings each item to the front in turn and ends on a full turn', () => {
    const k = spinKeys(4, ring);
    expect(k[0]).toEqual([0, 0]);
    expect(k.at(-1)![1]).toBe(360);
    for (let i = 1; i < k.length; i++) { expect(k[i]![0]).toBeGreaterThan(k[i - 1]![0]); expect(k[i]![1]).toBeGreaterThanOrEqual(k[i - 1]![1]); }
    const holds = k.map(x => x[1]);
    for (const a of [0, 90, 180, 270]) expect(holds).toContain(a);
    expect(spinKeys(4, CarouselSchema.parse({ spin: 'continuous', speed: 4, turns: 2 }))).toEqual([[0, 0], [8, 720]]);
  });
  it('builds the null rig on mock AE', () => {
    const ls = [new AVLayer('A'), new AVLayer('B'), new AVLayer('C')];
    const { call, comp, undo } = loadAe(ls);
    const args = carouselArgs([200, 200, 200], ring);
    const r = call('buildCarousel', args);
    expect(r, r.error).toMatchObject({ ok: true, data: { null: 'UET Carousel', layers: ['A', 'B', 'C'] } });
    expect(undo).toEqual(['begin:UET: 3D carousel', 'end']);
    const nul = (comp as any).all[0] as LayerBase;
    expect(nul.threeDLayer).toBe(true);
    expect(nul.node('ADBE Transform Group', 'ADBE Position').val).toEqual([960, 540, args.radius]);
    expect(nul.node('ADBE Transform Group', 'ADBE Rotate X').val).toBe(-8);
    expect(nul.node('ADBE Transform Group', 'ADBE Rotate Y').keys.length).toBe(args.spinKeys.length);
    for (const [i, l] of ls.entries()) {
      expect(l.parent).toBeDefined(); expect(l.threeDLayer).toBe(true);
      const s = args.slots[i]!;
      expect(l.node('ADBE Transform Group', 'ADBE Position').val).toEqual([50 + s.x, 50 + s.y, s.z]);
      expect(l.node('ADBE Transform Group', 'ADBE Rotate Y').val).toBe(s.rotY);
    }
  });
  it('refuses keyframed layers and cameras before changing anything', () => {
    const a = new AVLayer('A'), b = new AVLayer('B');
    b.node('ADBE Transform Group', 'ADBE Position').keys.push({ t: 0, v: [0, 0, 0], inT: 0, outT: 0 });
    const x = loadAe([a, b]);
    expect(x.call('buildCarousel', carouselArgs([1, 1], ring)).error).toMatch(/keyframes/);
    expect(x.undo).toEqual([]);
    expect(loadAe([a, new CameraLayer()]).call('buildCarousel', carouselArgs([1, 1], ring)).error).toMatch(/cameras/);
  });
});

describe('layout tools on mock AE', () => {
  const box = (l: LayerBase) => {
    const tg = (m: string) => l.node('ADBE Transform Group', m).val;
    const a = tg('ADBE Anchor Point'), p = tg('ADBE Position'), s = tg('ADBE Scale'), rz = tg('ADBE Rotate Z') * Math.PI / 180;
    const pts = [[0, 0], [200, 0], [0, 100], [200, 100]].map(([x, y]) => {
      const dx = (x! - a[0]) * s[0] / 100, dy = (y! - a[1]) * s[1] / 100;
      return [p[0] + dx * Math.cos(rz) - dy * Math.sin(rz), p[1] + dx * Math.sin(rz) + dy * Math.cos(rz)];
    });
    return { l: Math.min(...pts.map(q => q[0]!)), r: Math.max(...pts.map(q => q[0]!)), t: Math.min(...pts.map(q => q[1]!)), b: Math.max(...pts.map(q => q[1]!)) };
  };
  it('anchor moves without moving the layer (scaled + rotated)', () => {
    const l = new AVLayer('L');
    l.node('ADBE Transform Group', 'ADBE Scale').val = [150, 80, 100];
    l.node('ADBE Transform Group', 'ADBE Rotate Z').val = 30;
    const before = box(l);
    const { call } = loadAe([l]);
    for (const pos of ['tl', 'br', 'c', 'r']) {
      expect(call('setAnchor', { pos }).ok).toBe(true);
      const after = box(l);
      for (const k of ['l', 'r', 't', 'b'] as const) expect(after[k]).toBeCloseTo(before[k], 6);
    }
    expect(l.node('ADBE Transform Group', 'ADBE Anchor Point').val).toEqual([200, 50, 0]);
  });
  it('anchor shifts every position keyframe of an animated layer', () => {
    const l = new AVLayer('K');
    l.node('ADBE Transform Group', 'ADBE Position').keys.push({ t: 0, v: [100, 100, 0], inT: 0, outT: 0 }, { t: 1, v: [500, 100, 0], inT: 0, outT: 0 });
    loadAe([l]).call('setAnchor', { pos: 'tl' });
    expect(l.node('ADBE Transform Group', 'ADBE Position').keys.map(k => k.v)).toEqual([[0, 50, 0], [400, 50, 0]]);
  });
  it('align left to comp, right to selection; distribute; sequence', () => {
    const a = new AVLayer('A'), b = new AVLayer('B'), c = new AVLayer('C');
    a.node('ADBE Transform Group', 'ADBE Position').val = [300, 200, 0];
    b.node('ADBE Transform Group', 'ADBE Position').val = [1000, 500, 0];
    c.node('ADBE Transform Group', 'ADBE Position').val = [1500, 800, 0];
    const { call } = loadAe([a, b, c]);
    expect(call('alignLayers', { edge: 'left', to: 'comp' }).data.aligned).toBe(3);
    for (const l of [a, b, c]) expect(box(l).l).toBeCloseTo(0);
    call('alignLayers', { edge: 'bottom', to: 'selection' });
    for (const l of [a, b, c]) expect(box(l).b).toBeCloseTo(850);
    a.node('ADBE Transform Group', 'ADBE Position').val = [100, 0, 0];
    b.node('ADBE Transform Group', 'ADBE Position').val = [1700, 0, 0];
    c.node('ADBE Transform Group', 'ADBE Position').val = [300, 0, 0];
    call('distributeLayers', { axis: 'h' });
    expect(c.node('ADBE Transform Group', 'ADBE Position').val[0]).toBeCloseTo(900);
    a.outPoint = 3; b.inPoint = 0; b.outPoint = 4;
    const seq = call('sequenceLayers', { gap: -0.5 });
    expect(seq.ok).toBe(true);
    expect(b.startTime).toBeCloseTo(2.5);
  });
});
