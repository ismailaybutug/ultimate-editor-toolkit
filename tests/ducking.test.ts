import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { planDucking, premiereLevelFromDb, dbFromPremiereLevel } from '@uet/core';

describe('planDucking (core)', () => {
  it('merges short pauses and adds attack/release ramps', () => {
    const k = planDucking([{ start: 2, end: 4 }, { start: 4.5, end: 6 }, { start: 10, end: 12 }], { duckDb: -12, attack: 0.25, release: 0.5, mergeGap: 0.8 });
    expect(k).toEqual([
      { t: 1.75, db: 0 }, { t: 2, db: -12 }, { t: 6, db: -12 }, { t: 6.5, db: 0 },
      { t: 9.75, db: 0 }, { t: 10, db: -12 }, { t: 12, db: -12 }, { t: 12.5, db: 0 },
    ]);
  });
  it('never produces backwards keys when speech parts are close', () => {
    const k = planDucking([{ start: 1, end: 2 }, { start: 3, end: 4 }], { attack: 0.6, release: 0.6, mergeGap: 0.5 });
    for (let i = 1; i < k.length; i++) expect(k[i]!.t).toBeGreaterThan(k[i - 1]!.t);
  });
  it('converts Premiere level units', () => {
    expect(premiereLevelFromDb(0)).toBeCloseTo(0.1778, 4);
    expect(dbFromPremiereLevel(premiereLevelFromDb(-6))).toBeCloseTo(-6, 6);
  });
});

describe('duckTrack (mock Premiere DOM)', () => {
  function setup(preKeyed = false) {
    const mkLevel = () => {
      const lv: any = { value: 0.1778, tv: preKeyed, keys: new Map<number, number>(), displayName: 'Level',
        isTimeVarying() { return this.tv; }, setTimeVarying(v: boolean) { this.tv = v; if (!v) this.keys.clear(); },
        getValue() { return this.value; }, setValue(v: number) { this.value = v; },
        addKey(t: number) { this.keys.set(t, this.value); }, setValueAtKey(t: number, v: number) { this.keys.set(t, v); } };
      return lv;
    };
    const mkClip = (id: string, start: number, end: number, inP: number) => {
      const level = mkLevel();
      const props = [{ displayName: 'Bypass' }, level];
      const comp = { matchName: 'Internal Volume Stereo', displayName: 'Volume', properties: Object.assign(props, { numItems: 2 }) };
      return { nodeId: id, start: { seconds: start }, end: { seconds: end }, inPoint: { seconds: inP }, components: Object.assign([comp], { numItems: 1 }), level };
    };
    const music = [mkClip('m1', 0, 8, 10), mkClip('m2', 8, 20, 0)];
    const tracks = [{ clips: Object.assign([], { numItems: 0 }) }, { clips: Object.assign(music, { numItems: music.length }) }];
    const app: any = { project: { activeSequence: { audioTracks: Object.assign(tracks, { numTracks: 2 }) } } };
    const ctx: any = { JSON, Math, Object, String, app };
    vm.createContext(ctx);
    vm.runInContext(readFileSync('packages/host-ppro/jsx/uet-ppro.jsx', 'utf8'), ctx);
    return { UET: ctx.UET, music };
  }
  const keys = [{ t: 1.75, db: 0 }, { t: 2, db: -12 }, { t: 9, db: -12 }, { t: 9.5, db: 0 }];

  it('keys each overlapping clip in source time and undoes', () => {
    const p = setup();
    const r = JSON.parse(p.UET.ppro.duckTrack(JSON.stringify({ trackIndex: 1, keys })));
    expect(r.data).toMatchObject({ clips: 2, keys: 4, skipped: 0 });
    // clip m1 starts at 0 with inPoint 10 → timeline 2 s = source 12 s
    expect(p.music[0]!.level.keys.get(12)).toBeCloseTo(0.1778 * Math.pow(10, -12 / 20), 6);
    expect(p.music[1]!.level.keys.get(1.5)).toBeCloseTo(0.1778, 6);
    const u = JSON.parse(p.UET.ppro.unduckTrack(JSON.stringify({ trackIndex: 1, touched: r.data.touched })));
    expect(u.data.restored).toBe(2);
    expect(p.music[0]!.level.keys.size).toBe(0);
  });
  it('skips clips that already have volume keyframes', () => {
    const p = setup(true);
    const r = JSON.parse(p.UET.ppro.duckTrack(JSON.stringify({ trackIndex: 1, keys })));
    expect(r.data).toMatchObject({ clips: 0, skipped: 2 });
  });
});
