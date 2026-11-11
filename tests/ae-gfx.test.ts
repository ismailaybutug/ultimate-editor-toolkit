// Titles (F-MG-01) and callouts (F-MG-06): layout/geometry in core + uet-ae-gfx.jsx on the mock AE DOM. U/G only.
import { describe, it, expect } from 'vitest';
import { TitleSchema, layoutTitle, aspectOf, splitFields, hexToAe, boxExpressions, CalloutSchema, calloutGeometry, followExpression, type TitleText } from '../packages/core/src/motion/index';
import { titleArgs, calloutArgs } from '../apps/panel/src/modules/ae-motion';
import { loadAe, AVLayer, type LayerBase } from './ae-mockdom';

const texts = (l: ReturnType<typeof layoutTitle>) => l.elements.filter((e): e is TitleText => e.kind === 'text');

describe('title layout (core)', () => {
  it('splits fields on "/" and detects aspect', () => {
    expect(splitFields(' Ayşe Yılmaz / Yönetmen /  ')).toEqual(['Ayşe Yılmaz', 'Yönetmen']);
    expect([aspectOf(1920, 1080), aspectOf(1080, 1920), aspectOf(1080, 1080)]).toEqual(['landscape', 'vertical', 'square']);
    expect(hexToAe('#FF8000')).toEqual([1, 0.502, 0]);
  });
  it('every style fits inside the frame in all three aspects', () => {
    for (const style of ['lowerThird', 'headline', 'kicker', 'boxed'] as const) {
      for (const [w, h] of [[1920, 1080], [1080, 1920], [1080, 1080], [3840, 2160]] as const) {
        const lay = layoutTitle(TitleSchema.parse({ style, text: 'Başlık / Alt satır' }), w, h, 'ab12');
        expect(lay.elements.length).toBeGreaterThan(1);
        for (const e of lay.elements) {
          if (e.kind === 'box') continue;
          expect(e.x, `${style} ${w}x${h} ${e.name}`).toBeGreaterThan(0); expect(e.x).toBeLessThan(w);
          expect(e.y).toBeGreaterThan(0); expect(e.y).toBeLessThan(h);
          expect(e.name.endsWith(' ab12')).toBe(true);
        }
        for (const t of texts(lay)) { expect(t.fontSize).toBeGreaterThan(h * 0.01); expect(t.fontSize).toBeLessThan(h * 0.2); }
      }
    }
  });
  it('vertical lower third sits above the platform UI zone; scales with size', () => {
    const v = texts(layoutTitle(TitleSchema.parse({ text: 'Ad / Unvan' }), 1080, 1920))[0]!;
    expect(v.y / 1920).toBeLessThan(0.72);
    const a = texts(layoutTitle(TitleSchema.parse({ text: 'X', size: 1 }), 1920, 1080))[0]!;
    const b = texts(layoutTitle(TitleSchema.parse({ text: 'X', size: 2 }), 1920, 1080))[0]!;
    expect(b.fontSize).toBeCloseTo(a.fontSize * 2, -1);
  });
  it('kicker is upper-cased with Turkish rules; single field has no subtitle', () => {
    const k = texts(layoutTitle(TitleSchema.parse({ style: 'kicker', text: 'istanbul / Yeni bölüm' }), 1920, 1080));
    expect(k[0]!.text).toBe('İSTANBUL');
    expect(texts(layoutTitle(TitleSchema.parse({ text: 'Tek' }), 1920, 1080)).length).toBe(1);
  });
  it('box expressions reference the text layer by name', () => {
    const e = boxExpressions('UET Title ab12', 20, 10);
    expect(e.size).toContain('thisComp.layer("UET Title ab12")');
    expect(e.size).toContain('r.width + 40');
    expect(e.layerPosition).toContain('toComp([0, 0])');
  });
});

describe('createTitle on mock AE', () => {
  const run = (style: string, text = 'Ayşe Yılmaz / Yönetmen') => {
    const x = loadAe([]);
    const r = x.call('createTitle', titleArgs(TitleSchema.parse({ style, text }), 1920, 1080, 't1'));
    return { ...x, r, layers: (x.comp as any).all as LayerBase[] };
  };
  it('lower third: texts + bar + null, timed from the playhead, one undo group', () => {
    const { r, undo, layers } = run('lowerThird');
    expect(r, r.error).toMatchObject({ ok: true, data: { start: 2, end: 6, warnings: [] } });
    expect(undo).toEqual(['begin:UET: Title', 'end']);
    const names = layers.map(l => l.name);
    expect(names).toEqual(expect.arrayContaining(['UET Title t1', 'UET Subtitle t1', 'UET Title Bar t1', 'UET Title t1 (move me)']));
    const title = layers.find(l => l.name === 'UET Title t1')!;
    expect(title.inPoint).toBe(2); expect(title.outPoint).toBe(6);
    expect(title.parent?.name).toBe('UET Title t1 (move me)');
    expect(title.node('ADBE Text Properties', 'ADBE Text Animators').children.map(c => c.name)).toEqual(['UET Words rise', 'UET Characters sink (out)']);
    const bar = layers.find(l => l.name === 'UET Title Bar t1')!;
    const scale = bar.node('ADBE Root Vectors Group', 'Bar', 'ADBE Vector Transform Group', 'ADBE Vector Scale');
    expect(scale.keys.map(k => k.v)).toEqual([[100, 0], [100, 100], [100, 100], [100, 0]]); // vertical bar grows in Y
    expect(bar.node('ADBE Root Vectors Group', 'Bar', 'ADBE Vectors Group', 'ADBE Vector Graphic - Fill', 'ADBE Vector Fill Color').val).toEqual([1, 0.353, 0.212, 1]);
  });
  it('boxed: box layer fitted by expression, placed behind its text, not parented', () => {
    const { r, layers } = run('boxed', 'Kutulu');
    expect(r.ok).toBe(true);
    const box = layers.find(l => l.name === 'UET Title Box t1')!;
    expect(box.node('ADBE Root Vectors Group', 'Box', 'ADBE Vectors Group', 'ADBE Vector Shape - Rect', 'ADBE Vector Rect Size').expression).toContain('UET Title t1');
    expect(box.node('ADBE Transform Group', 'ADBE Position').expression).toContain('toComp');
    expect((box as any).__movedAfter).toBe('UET Title t1');
    expect(box.parent).toBeNull();
  });
  it('all four styles build without errors; refuses when the playhead is at the end', () => {
    for (const s of ['headline', 'kicker']) expect(run(s).r.ok).toBe(true);
    const x = loadAe([]); (x.comp as any).time = 19.8;
    expect(x.call('createTitle', titleArgs(TitleSchema.parse({ text: 'A' }), 1920, 1080, 'z')).error).toMatch(/playhead/);
  });
});

describe('callouts', () => {
  it('pointer geometry: dot at origin, leader goes towards the chosen corner, label on the shelf', () => {
    const g = calloutGeometry(CalloutSchema.parse({ direction: 'nw', length: 200 }));
    expect(g.path[0]).toEqual([0, 0]);
    expect(g.path[1]![0]).toBeLessThan(0); expect(g.path[1]![1]).toBeLessThan(0);
    expect(g.path[2]![1]).toBe(g.path[1]![1]);
    expect(g.label.justify).toBe('right');
    expect(g.head).toBeNull();
  });
  it('arrow geometry: head tip points at the target, shaft ends at the head base', () => {
    const g = calloutGeometry(CalloutSchema.parse({ style: 'arrow', direction: 'se', length: 300, stroke: 5 }));
    const tip = g.head![0]!;
    expect(Math.hypot(tip[0], tip[1])).toBeLessThan(20);
    expect(Math.hypot(g.path[0]![0], g.path[0]![1])).toBeGreaterThan(300);
    // head base midpoint == shaft end
    const mid = [(g.head![1]![0] + g.head![2]![0]) / 2, (g.head![1]![1] + g.head![2]![1]) / 2];
    expect(mid[0]).toBeCloseTo(g.path[1]![0], 1); expect(mid[1]).toBeCloseTo(g.path[1]![1], 1);
    expect(followExpression('Logo')).toContain('thisComp.layer("Logo")');
  });
  it('pointer attached to the selected layer: follow expression, trim draw-on, dot pop, parented label', () => {
    const target = new AVLayer('Logo');
    const x = loadAe([target]);
    const r = x.call('createCallout', calloutArgs(CalloutSchema.parse({ label: 'Yeni ürün' }), 'c1', 'Logo'));
    expect(r, r.error).toMatchObject({ ok: true, data: { shape: 'UET Callout c1', label: 'UET Callout Label c1', target: 'Logo' } });
    const all = (x.comp as any).all as LayerBase[];
    const shape = all.find(l => l.name === 'UET Callout c1')!;
    expect(shape.node('ADBE Transform Group', 'ADBE Position').expression).toContain('"Logo"');
    const trim = shape.node('ADBE Root Vectors Group', 'Line', 'ADBE Vectors Group', 'ADBE Vector Filter - Trim', 'ADBE Vector Trim End');
    expect(trim.keys.map(k => k.v)).toEqual([0, 100]);
    expect(shape.node('ADBE Root Vectors Group', 'Line', 'ADBE Vectors Group', 'ADBE Vector Shape - Group', 'ADBE Vector Shape').val.closed).toBe(false);
    expect(shape.node('ADBE Root Vectors Group', 'Dot', 'ADBE Vector Transform Group', 'ADBE Vector Scale').keys.length).toBe(2);
    const label = all.find(l => l.name === 'UET Callout Label c1')!;
    expect(label.parent).toBe(shape);
    expect(label.node('ADBE Text Properties', 'ADBE Text Animators').children.length).toBe(1);
  });
  it('arrow without selection goes to the comp centre with a closed head scaled from its tip', () => {
    const x = loadAe([]);
    const args = calloutArgs(CalloutSchema.parse({ style: 'arrow', label: '' }), 'a1', null);
    const r = x.call('createCallout', args);
    expect(r.ok).toBe(true);
    const shape = ((x.comp as any).all as LayerBase[])[0]!;
    expect(shape.node('ADBE Transform Group', 'ADBE Position').val).toEqual([960, 540, 0]);
    const head = shape.node('ADBE Root Vectors Group', 'Head');
    expect(head.find('ADBE Vectors Group')!.find('ADBE Vector Shape - Group')!.find('ADBE Vector Shape')!.val.closed).toBe(true);
    expect(head.find('ADBE Vector Transform Group')!.find('ADBE Vector Anchor')!.val).toEqual(args.geometry.head![0]);
    expect(r.data.label).toBeUndefined();
  });
  it('refuses a multi-layer selection', () => {
    expect(loadAe([new AVLayer('A'), new AVLayer('B')]).call('createCallout', calloutArgs(CalloutSchema.parse({}), 'x', null)).error).toMatch(/one layer/);
  });
});
