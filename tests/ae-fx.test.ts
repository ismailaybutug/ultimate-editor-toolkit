// Layer animation library, glow, backgrounds and map routes: core logic + host scripts on the mock AE DOM. U/G only.
import { describe, it, expect } from 'vitest';
import { RecipeSchema, BUILTIN_RECIPES } from '@uet/core';
import {
  ALL_LAYER_RECIPES, EXTRA_RECIPES, GlowSchema, GLOW_PRESETS, glowPlan, BackgroundSchema, PALETTES, planBackground, driftExpression,
  RouteSchema, routePath, travellerExpressions,
} from '../packages/core/src/motion/index';
import { glowArgs, backgroundArgs, routeArgs } from '../apps/panel/src/modules/ae-motion';
import { loadAe, AVLayer, TextLayer, CameraLayer, type LayerBase } from './ae-mockdom';

describe('layer animation library', () => {
  it('30+ valid, unique recipes covering in/emphasis/out, each with a Turkish label', () => {
    expect(ALL_LAYER_RECIPES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(ALL_LAYER_RECIPES.map(r => r.id)).size).toBe(ALL_LAYER_RECIPES.length);
    for (const r of ALL_LAYER_RECIPES) {
      const { tr, ...plain } = r;
      expect(tr.length).toBeGreaterThan(1);
      expect(RecipeSchema.parse(plain)).toEqual(plain);
      for (const t of r.tracks) expect(t.keyframes.at(-1)!.t).toBeLessThanOrEqual(r.duration + 1e-9);
    }
    for (const k of ['in', 'emphasis', 'out']) expect(ALL_LAYER_RECIPES.filter(r => r.kind === k).length).toBeGreaterThanOrEqual(8);
    expect(ALL_LAYER_RECIPES.slice(0, BUILTIN_RECIPES.length).map(r => r.id)).toEqual(BUILTIN_RECIPES.map(r => r.id));
  });
  it('in recipes end at the layer\'s own values; emphasis recipes return to them', () => {
    for (const r of EXTRA_RECIPES.filter(x => x.kind !== 'out')) {
      for (const t of r.tracks) {
        const last = t.keyframes.at(-1)!.v;
        const neutral = t.mode === 'factor' ? 1 : 0;
        const expected = r.id === 'spin-360' ? 360 : neutral; // a full turn looks identical to 0
        for (const v of [last].flat()) expect(v, `${r.id} ${t.property}`).toBe(expected);
      }
    }
  });
  it('every recipe applies through the existing host applyRecipe with valid eases', () => {
    for (const r of ALL_LAYER_RECIPES) {
      const l = new AVLayer('L', 1, 6);
      const { tr: _t, ...recipe } = r;
      const res = loadAe([l]).call('applyRecipe', { recipe, stagger: 0 });
      expect(res, r.id + ' ' + res.error).toMatchObject({ ok: true });
    }
  });
});

describe('glow', () => {
  it('plans scale radius with comp height and intensity with strength', () => {
    const a = glowPlan(GlowSchema.parse({ preset: 'deep' }), 1080), b = glowPlan(GlowSchema.parse({ preset: 'deep', strength: 2 }), 2160);
    expect(a.passes.length).toBe(3);
    expect(b.passes[0]!.radius).toBeCloseTo(a.passes[0]!.radius * 2);
    expect(b.passes[0]!.intensity).toBeCloseTo(a.passes[0]!.intensity * 2);
    for (const k of Object.keys(GLOW_PRESETS)) expect(glowPlan(GlowSchema.parse({ preset: k }), 1080).passes.length).toBeGreaterThan(0);
  });
  it('adds named Glow effects with the planned values; re-apply replaces; remove cleans up', () => {
    const l = new TextLayer('Neon');
    const { call, undo } = loadAe([l]);
    const r = call('applyGlow', glowArgs(GlowSchema.parse({ preset: 'neon', color: '#FF0000' }), 1080));
    expect(r, r.error).toMatchObject({ ok: true, data: { layers: ['Neon'], passes: 2 } });
    expect(undo).toEqual(['begin:UET: Glow', 'end']);
    const fx = l.node('ADBE Effect Parade');
    expect(fx.children.map(c => c.name)).toEqual(['UET Glow 1', 'UET Glow 2']);
    const g1 = fx.find('UET Glow 1')!;
    expect(g1.find('ADBE Glo2-0003')!.val).toBe(12);
    expect(g1.find('ADBE Glo2-0007')!.val).toBe(2);
    expect(g1.find('ADBE Glo2-0012')!.val).toEqual([1, 0, 0, 1]);
    expect(g1.find('ADBE Glo2-0013')!.val).toEqual([1, 0.7, 0.7, 1]);
    call('applyGlow', glowArgs(GlowSchema.parse({ preset: 'soft' }), 1080));
    expect(fx.children.length).toBe(1);
    expect(fx.find('UET Glow 1')!.find('ADBE Glo2-0007')!.val).toBe(1); // untinted keeps original colours
    expect(call('removeGlow').data.removed).toBe(1);
    expect(fx.children.length).toBe(0);
  });
  it('skips layers without effects (cameras)', () => {
    const r = loadAe([new CameraLayer() as any]).call('applyGlow', glowArgs(GlowSchema.parse({}), 1080));
    expect(r.ok).toBe(false);
  });
});

describe('backgrounds', () => {
  it('drift expressions loop seamlessly (value at time 0 == value at time L)', () => {
    const e = driftExpression(0.2, 0.3, 0.1, 0.05, 8, 0.25, 1, 2);
    const run = (time: number) => new Function('time', 'thisComp', e.split('\n').slice(1, -1).join('\n') + '\nreturn ' + e.split('\n').at(-1))(time, { width: 1000, height: 500 });
    const a = run(0), b = run(8);
    expect(b[0]).toBeCloseTo(a[0], 6); expect(b[1]).toBeCloseTo(a[1], 6);
    expect(run(2)[0]).not.toBeCloseTo(a[0], 1);
  });
  it('plans: mesh uses 4 points, blobs 3; size presets and match', () => {
    expect(planBackground(BackgroundSchema.parse({ type: 'mesh' })).points.length).toBe(4);
    const b = planBackground(BackgroundSchema.parse({ type: 'blobs', size: 'vertical' }));
    expect(b.points.length).toBe(3);
    expect([b.width, b.height]).toEqual([1080, 1920]);
    expect(planBackground(BackgroundSchema.parse({}), 1280, 720).width).toBe(1280);
    expect(() => BackgroundSchema.parse({ palette: 'nope' })).toThrow();
    expect(Object.keys(PALETTES).length).toBe(8);
  });
  it('mesh background: new comp with gradient expressions, grain, placed at the bottom of the active comp and looped', () => {
    const x = loadAe([]);
    const r = x.call('createBackground', backgroundArgs(BackgroundSchema.parse({ palette: 'sunset' }), { width: 1920, height: 1080, frameRate: 25 }, 'k1'));
    expect(r, r.error).toMatchObject({ ok: true, data: { comp: 'UET BG sunset 1920x1080 k1', placedIn: 'Main' } });
    const bg = x.created[0];
    expect([bg.width, bg.height, bg.duration, bg.frameRate]).toEqual([1920, 1080, 10, 25]);
    const base = (bg.all as LayerBase[]).find(l => l.name === 'UET BG Base')!;
    const grad = base.node('ADBE Effect Parade', 'UET Gradient');
    for (const i of [1, 3, 5, 7]) expect(grad.find(`ADBE 4ColorGradient-000${i}`)!.expression).toContain('seamless loop');
    expect(grad.find('ADBE 4ColorGradient-0002')!.val).toEqual([1, 0.42, 0.42, 1]);
    const grain = (bg.all as LayerBase[]).find(l => l.name === 'UET BG Grain')!;
    expect(grain.adjustmentLayer).toBe(true);
    const placed = (x.comp as any).all[0] as LayerBase;
    expect((placed as any).__movedToEnd).toBe(true);
    expect(placed.timeRemapEnabled).toBe(true);
    expect(placed.node('ADBE Time Remapping').expression).toContain('loopOut("cycle")');
    expect(placed.outPoint).toBe(20);
  });
  it('blobs background without an active comp opens the new comp', () => {
    const x = loadAe([]);
    x.project.activeItem = null;
    const r = x.call('createBackground', backgroundArgs(BackgroundSchema.parse({ type: 'blobs', grain: false, size: 'square' }), null, 'k2'));
    expect(r, r.error).toMatchObject({ ok: true });
    const bg = x.created[0];
    expect(bg.__opened).toBe(true);
    const blobs = (bg.all as LayerBase[]).find(l => l.name === 'UET BG Blobs')!;
    expect(blobs.node('ADBE Root Vectors Group').children.map(c => c.name)).toEqual(['Blob 1', 'Blob 2', 'Blob 3']);
    expect(blobs.node('ADBE Root Vectors Group', 'Blob 2', 'ADBE Vector Transform Group', 'ADBE Vector Position').expression).toContain('Math.sin');
    expect(blobs.node('ADBE Effect Parade', 'UET Blur', 'ADBE Gaussian Blur 2-0001').val).toBe(130);
  });
});

describe('map route', () => {
  it('path passes through every waypoint, bulges upwards, arrival fractions increase to 1', () => {
    const p = routePath([[100, 500], [900, 500], [1500, 300]], 0.25);
    expect(p.vertices).toEqual([[100, 500], [900, 500], [1500, 300]]);
    expect(p.outTangents[0]![1]).toBeLessThan(0); // first arc goes up
    expect(p.arrival[0]).toBe(0); expect(p.arrival.at(-1)).toBe(1);
    expect(p.arrival[1]!).toBeGreaterThan(0.4); expect(p.arrival[1]!).toBeLessThan(0.7);
    // cubic midpoint of segment 0 is ~curve*len above the chord
    const [x0, y0] = p.vertices[0]!, [x1, y1] = p.vertices[1]!;
    const c1 = [x0 + p.outTangents[0]![0], y0 + p.outTangents[0]![1]], c2 = [x1 + p.inTangents[1]![0], y1 + p.inTangents[1]![1]];
    const midY = 0.125 * y0 + 0.375 * c1[1]! + 0.375 * c2[1]! + 0.125 * y1;
    expect(500 - midY).toBeCloseTo(0.25 * 800, 0);
    expect(routePath([[0, 0], [100, 0]], 0).outTangents[0]).toEqual([33.33, 0]);
    expect(() => routePath([[0, 0]], 0.2)).toThrow();
  });
  it('traveller expressions use the route layer, path and trim names the host creates', () => {
    const e = travellerExpressions('UET Route r1');
    expect(e.position).toContain('thisComp.layer("UET Route r1")');
    expect(e.position).toContain('content("Route")'); expect(e.position).toContain('content("Path")'); expect(e.position).toContain('content("Trim")');
    expect(e.rotation).toContain('tangentOnPath');
  });
  it('builds route, pins and traveller from the selected markers', () => {
    const a = new AVLayer('İstanbul'), b = new AVLayer('Ankara'), c = new AVLayer('İzmir');
    a.node('ADBE Transform Group', 'ADBE Position').val = [400, 300, 0];
    b.node('ADBE Transform Group', 'ADBE Position').val = [900, 420, 0];
    c.node('ADBE Transform Group', 'ADBE Position').val = [300, 700, 0];
    const x = loadAe([a, b, c]);
    const w = x.call('waypoints');
    expect(w.data.points.map((p: any) => p.name)).toEqual(['İstanbul', 'Ankara', 'İzmir']);
    const args = routeArgs(RouteSchema.parse({}), w.data.points, 'r1');
    const r = x.call('createRoute', args);
    expect(r, r.error).toMatchObject({ ok: true, data: { route: 'UET Route r1', traveller: 'UET Route Traveller r1', warnings: [] } });
    const all = (x.comp as any).all as LayerBase[];
    const route = all.find(l => l.name === 'UET Route r1')!;
    const path = route.node('ADBE Root Vectors Group', 'Route', 'ADBE Vectors Group', 'Path', 'ADBE Vector Shape').val;
    expect(path.vertices).toEqual([[400, 300], [900, 420], [300, 700]]);
    expect(path.closed).toBe(false);
    expect(path.inTangents.length).toBe(3);
    expect(route.node('ADBE Root Vectors Group', 'Route', 'ADBE Vectors Group', 'Trim', 'ADBE Vector Trim End').keys.map(k => [k.t, k.v])).toEqual([[2, 0], [5, 100]]);
    expect(route.node('ADBE Root Vectors Group', 'Route', 'ADBE Vectors Group', 'ADBE Vector Graphic - Stroke', 'ADBE Vector Stroke Dashes').children.length).toBe(1);
    const pin3 = route.node('ADBE Root Vectors Group', 'Pin 3', 'ADBE Vector Transform Group');
    expect(pin3.find('ADBE Vector Position')!.val).toEqual([300, 700]);
    expect(pin3.find('ADBE Vector Scale')!.keys[0]!.t).toBeCloseTo(5);
    const trav = all.find(l => l.name === 'UET Route Traveller r1')!;
    expect(trav.node('ADBE Transform Group', 'ADBE Position').expression).toContain('pointOnPath');
    expect(route.inPoint).toBe(2);
  });
  it('refuses parented markers and single points', () => {
    const a = new AVLayer('A'), b = new AVLayer('B'); b.parent = a;
    expect(loadAe([a, b]).call('waypoints').error).toMatch(/parented/);
    expect(loadAe([a]).call('waypoints').error).toMatch(/two or more/);
  });
});
