// Runs the real Premiere ExtendScript library against a small mock of the Premiere DOM.
// Not a substitute for the real-app test (TEST_REPORT.md, level H).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function makeProject() {
  const calls: string[] = [];
  const item = {
    name: 'talk.mov', getMediaPath: () => '/media/talk.mov',
    inP: null as number | null, outP: null as number | null,
    setInPoint(s: number, t: number) { this.inP = s; calls.push(`in:${s}:${t}`); },
    setOutPoint(s: number, t: number) { this.outP = s; calls.push(`out:${s}:${t}`); },
    clearInPoint() { this.inP = null; }, clearOutPoint() { this.outP = null; },
  };
  const mkTrack = () => {
    const clips: any[] = [];
    const list: any = { get numItems() { return clips.length; } };
    const proxy = new Proxy(list, { get: (o, k) => (typeof k === 'string' && /^\d+$/.test(k) ? clips[Number(k)] : o[k as any]) });
    return {
      clips: proxy, raw: clips,
      overwriteClip(pi: any, t: number) { clips.push({ start: t, in: pi.inP, out: pi.outP, remove() { clips.splice(clips.indexOf(this), 1); } }); },
    };
  };
  const mkSeq = (id: string, name: string) => {
    const v = [mkTrack(), mkTrack()], a = [mkTrack()];
    const seq: any = {
      sequenceID: id, name,
      videoTracks: Object.assign([...v], { numTracks: v.length }),
      audioTracks: Object.assign([...a], { numTracks: a.length }),
      markers: { list: [] as any[], createMarker(t: number) { const m = { start: t, end: t, name: '', comments: '', setColorByIndex() {} }; this.list.push(m); return m; } },
      getSettings: () => ({ videoFrameRate: { seconds: 1 / 25 } }),
      getSelection: () => [clip],
      clone() { const c = mkSeq('copy-' + id, name + ' Copy'); c.videoTracks[0].raw.push({ start: 0, remove() { c.videoTracks[0].raw.splice(0, 1); } }); seqs.push(c); },
    };
    return seq;
  };
  const clip = { name: 'talk', projectItem: item, mediaType: 'Video', inPoint: { seconds: 2 }, outPoint: { seconds: 10 }, start: { seconds: 5 } };
  const seqs: any[] = [];
  const main = mkSeq('main', 'Main');
  seqs.push(main);
  const sequences = new Proxy({} as any, { get: (_o, k) => (k === 'numSequences' ? seqs.length : seqs[Number(k)]) });
  let opened = '';
  const app: any = { version: '26.5.2', build: '1', project: { activeSequence: main, sequences, openSequence: (id: string) => { opened = id; } }, enableQE() {} };
  const ctx: any = { JSON, Math, Object, app };
  vm.createContext(ctx);
  vm.runInContext(readFileSync('packages/host-ppro/jsx/uet-ppro.jsx', 'utf8'), ctx);
  return { UET: ctx.UET, main, seqs, item, calls, get opened() { return opened; } };
}

describe('uet-ppro.jsx on mock Premiere DOM', () => {
  it('reports the selected clip', () => {
    const p = makeProject();
    const r = JSON.parse(p.UET.ppro.getSelectedClipInfo());
    expect(r).toMatchObject({ ok: true, data: { mediaPath: '/media/talk.mov', sourceIn: 2, sourceOut: 10, sequenceFps: 25 } });
  });
  it('adds markers mapped from source time to timeline time, skipping ranges outside the clip', () => {
    const p = makeProject();
    const r = JSON.parse(p.UET.ppro.addMarkers(JSON.stringify({ ranges: [{ start: 0, end: 1 }, { start: 3, end: 4 }], useSelection: true, name: 'x' })));
    expect(r.data.markers).toBe(1);
    expect(p.main.markers.list[0]).toMatchObject({ start: 6, end: 7, name: 'x' });
  });
  it('builds a new sequence from kept ranges inside the used part, original untouched', () => {
    const p = makeProject();
    const r = JSON.parse(p.UET.ppro.buildFromRanges(JSON.stringify({ keep: [{ start: 0, end: 3 }, { start: 4, end: 5 }, { start: 9, end: 12 }] })));
    expect(r.ok, r.error).toBe(true);
    expect(r.data.clips).toBe(3);
    expect(r.data.duration).toBeCloseTo(1 + 1 + 1);
    const copy = p.seqs[1];
    expect(copy.name).toBe('Main - UET cut');
    expect(copy.videoTracks[0].raw.map((c: any) => [c.start, c.in, c.out])).toEqual([[0, 2, 3], [1, 4, 5], [2, 9, 10]]);
    expect(p.item.inP).toBeNull(); // in/out cleared afterwards
    expect(p.opened).toBe('copy-main');
    expect(p.main.markers.list.length).toBe(0);
  });
  it('fails clearly when nothing is inside the clip', () => {
    const p = makeProject();
    const r = JSON.parse(p.UET.ppro.buildFromRanges(JSON.stringify({ keep: [{ start: 20, end: 21 }] })));
    expect(r.ok).toBe(false);
    expect(p.seqs.length).toBe(1); // no sequence created
  });
});
