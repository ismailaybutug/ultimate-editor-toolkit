// Project Tidy + Frame Export on a mock Premiere DOM (level G). Real-app behaviour still needs the H test.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const BIN = 2, CLIP = 1;
function mkList(arr: any[]) { return new Proxy({} as any, { get: (_o, k) => (k === 'numItems' ? arr.length : arr[Number(k)]) }); }
function mkBin(name: string, parent: any = null): any {
  const kids: any[] = [];
  const b: any = {
    name, type: BIN, nodeId: 'bin-' + name, parent, kids, children: mkList(kids),
    createBin(n: string) { const c = mkBin(n, b); kids.push(c); return c; },
    deleteBin() { parent.kids.splice(parent.kids.indexOf(b), 1); },
  };
  return b;
}
function mkItem(root: any, name: string, path: string, seq = false) {
  const it: any = {
    name, type: CLIP, nodeId: 'n-' + name, parent: root,
    getMediaPath: () => path, isSequence: () => seq,
    moveBin(dest: any) { it.parent.kids.splice(it.parent.kids.indexOf(it), 1); dest.kids.push(it); it.parent = dest; },
  };
  root.kids.push(it);
  return it;
}

function setup() {
  const root = mkBin('root');
  mkItem(root, 'a.mp4', '/m/a.mp4'); mkItem(root, 'b.wav', '/m/b.wav'); mkItem(root, 'c.png', '/m/c.png');
  mkItem(root, 'Main', '', true); mkItem(root, 'x.mogrt', '/m/x.mogrt'); mkItem(root, 'notes.txt', '/m/notes.txt');
  const keep = root.createBin('My stuff'); mkItem(keep, 'd.mov', '/m/d.mov');
  const written: string[] = [];
  const qeSeq = { CTI: { timecode: '00:00:05:10' }, exportFramePNG: (_tc: string, p: string) => { written.push(p + '.png'); } };
  class File { constructor(public p: string) {} get exists() { return written.includes(this.p); } get fsName() { return this.p; } }
  const app: any = { project: { rootItem: root, activeSequence: { name: 'Main seq' }, importFiles: () => true }, enableQE() {} };
  const ctx: any = { JSON, Math, Object, String, app, qe: { project: { getActiveSequence: () => qeSeq } }, ProjectItemType: { BIN, CLIP }, File };
  vm.createContext(ctx);
  vm.runInContext(readFileSync('packages/host-ppro/jsx/uet-ppro.jsx', 'utf8'), ctx);
  return { UET: ctx.UET, root, written };
}
const names = (b: any) => b.kids.map((k: any) => k.name).sort();

describe('Project Tidy (mock)', () => {
  it('previews without moving anything', () => {
    const p = setup();
    const r = JSON.parse(p.UET.ppro.tidyProject(JSON.stringify({ dryRun: true })));
    expect(r.data.items).toBe(6);
    expect(r.data.bins).toEqual({ 'UET Video': 1, 'UET Audio': 1, 'UET Images': 1, 'UET Sequences': 1, 'UET Graphics': 1, 'UET Other': 1 });
    expect(p.root.kids.length).toBe(7);
  });
  it('moves root items into bins, leaves existing bins alone, and undoes cleanly', () => {
    const p = setup();
    const r = JSON.parse(p.UET.ppro.tidyProject('{}'));
    expect(r.data.moved.length).toBe(6);
    expect(names(p.root)).toEqual(['My stuff', 'UET Audio', 'UET Graphics', 'UET Images', 'UET Other', 'UET Sequences', 'UET Video']);
    expect(names(p.root.kids.find((k: any) => k.name === 'My stuff'))).toEqual(['d.mov']);
    const u = JSON.parse(p.UET.ppro.untidyProject(JSON.stringify({ moved: r.data.moved })));
    expect(u.data.restored).toBe(6);
    expect(names(p.root)).toEqual(['Main', 'My stuff', 'a.mp4', 'b.wav', 'c.png', 'notes.txt', 'x.mogrt']);
  });
});

describe('Frame Export (mock)', () => {
  it('writes a PNG named after sequence and timecode', () => {
    const p = setup();
    const r = JSON.parse(p.UET.ppro.exportFrame(JSON.stringify({ folder: '/out' })));
    expect(r.ok).toBe(true);
    expect(r.data.path).toBe('/out/Main_seq_00-00-05-10.png');
    expect(r.data.exists).toBe(true);
  });
});
