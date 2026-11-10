// Small mock of the After Effects scripting DOM for the AE motion/layout tests. It also simulates AE's
// "Object is invalid" behaviour: adding/removing a property invalidates property objects fetched earlier
// from the same layer, which is the most common real-world ExtendScript bug.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export class KeyframeEase { constructor(public speed: number, public influence: number) {} }
export const KIT = { LINEAR: 6612, BEZIER: 6613, HOLD: 6614 };

interface Key { t: number; v: any; inT: number; outT: number; inE?: KeyframeEase[]; outE?: KeyframeEase[] }
export class Node {
  children: Node[] = [];
  parent: Node | null = null;
  keys: Key[] = [];
  expression = '';
  dimensionsSeparated = false;
  constructor(public matchName: string, public name: string, public val: any = undefined, public factory?: (match: string) => Node) {}
  add(n: Node) { n.parent = this; this.children.push(n); return n; }
  get isGroup() { return this.val === undefined; }
  get dims() { return Array.isArray(this.val) ? this.val.length : 1; }
  valueAt(t: number): any {
    if (!this.keys.length) return this.val;
    let k = this.keys[0]!;
    for (const x of this.keys) if (x.t <= t + 1e-9) k = x;
    return k.v;
  }
  find(x: number | string): Node | undefined {
    if (typeof x === 'number') return this.children[x - 1];
    return this.children.find(c => c.matchName === x || c.name === x);
  }
}

export class LayerBase {
  epoch = 0;
  root = new Node('root', 'root');
  parent: any = null;
  threeDLayer = false;
  motionBlur = false;
  startTime = 0;
  constructor(public name: string, public inPoint = 0, public outPoint = 5, public rect = { left: 0, top: 0, width: 200, height: 100 }) {
    const tg = this.root.add(new Node('ADBE Transform Group', 'Transform'));
    tg.add(new Node('ADBE Anchor Point', 'Anchor Point', [100, 50, 0]));
    tg.add(new Node('ADBE Position', 'Position', [960, 540, 0]));
    tg.add(new Node('ADBE Position_0', 'X Position', 960));
    tg.add(new Node('ADBE Position_1', 'Y Position', 540));
    tg.add(new Node('ADBE Scale', 'Scale', [100, 100, 100]));
    tg.add(new Node('ADBE Orientation', 'Orientation', [0, 0, 0]));
    tg.add(new Node('ADBE Rotate X', 'X Rotation', 0));
    tg.add(new Node('ADBE Rotate Y', 'Y Rotation', 0));
    tg.add(new Node('ADBE Rotate Z', 'Rotation', 0));
    tg.add(new Node('ADBE Opacity', 'Opacity', 100));
    this.root.add(new Node('ADBE Effect Parade', 'Effects', undefined, m => {
      if (m !== 'ADBE Slider Control') throw new Error('mock: unsupported effect ' + m);
      const fx = new Node(m, 'Slider Control');
      fx.add(new Node('ADBE Slider Control-0001', 'Slider', 0));
      return fx;
    }));
  }
  property(x: string) { const n = this.root.find(x); return n ? wrap(n, this) : null; }
  sourceRectAtTime() { return this.rect; }
  /** test helper: raw node by matchName path */
  node(...path: string[]): Node { let n: Node = this.root; for (const p of path) { const c = n.find(/^\d+$/.test(p) ? Number(p) : p); if (!c) throw new Error('no ' + p); n = c; } return n; }
}

export function wrap(n: Node, layer: LayerBase): any {
  const epoch = layer.epoch;
  const check = () => { if (layer.epoch !== epoch) throw new Error(`Object is invalid (${n.matchName})`); };
  const api: any = {
    get name() { check(); return n.name; },
    set name(v: string) { check(); n.name = v; },
    get matchName() { check(); return n.matchName; },
    get propertyIndex() { check(); return n.parent!.children.indexOf(n) + 1; },
    get numProperties() { check(); return n.children.length; },
    property(x: number | string) { check(); const c = n.find(x); return c ? wrap(c, layer) : null; },
    addProperty(m: string) {
      check();
      if (!n.factory) throw new Error(`mock: cannot add ${m} to ${n.matchName}`);
      const c = n.add(n.factory(m)); layer.epoch++; return wrap(c, layer);
    },
    remove() { check(); n.parent!.children.splice(n.parent!.children.indexOf(n), 1); layer.epoch++; },
    get value() { check(); return clone(n.val); },
    get dimensionsSeparated() { check(); return n.dimensionsSeparated; },
    get expression() { check(); return n.expression; },
    set expression(v: string) { check(); n.expression = v; },
    get numKeys() { check(); return n.keys.length; },
    get isSpatial() { return false; },
    setValue(v: any) {
      check();
      if (n.keys.length) throw new Error('setValue on keyframed property');
      shapeCheck(n, v); n.val = clone(v);
    },
    valueAtTime(t: number) { check(); return clone(n.valueAt(t)); },
    setValueAtTime(t: number, v: any) {
      check(); shapeCheck(n, v);
      const i = n.keys.findIndex(k => Math.abs(k.t - t) < 1e-9);
      if (i >= 0) { n.keys[i]!.v = clone(v); return; }
      n.keys.push({ t, v: clone(v), inT: KIT.BEZIER, outT: KIT.BEZIER }); n.keys.sort((a, b) => a.t - b.t);
    },
    nearestKeyIndex(t: number) { check(); let b = 1, d = Infinity; n.keys.forEach((k, i) => { if (Math.abs(k.t - t) < d) { d = Math.abs(k.t - t); b = i + 1; } }); return b; },
    keyValue(i: number) { check(); return clone(n.keys[i - 1]!.v); },
    setValueAtKey(i: number, v: any) { check(); shapeCheck(n, v); n.keys[i - 1]!.v = clone(v); },
    keyInInterpolationType(i: number) { return n.keys[i - 1]!.inT; },
    keyOutInterpolationType(i: number) { return n.keys[i - 1]!.outT; },
    setInterpolationTypeAtKey(i: number, a: number, b: number) { check(); if (a === undefined || b === undefined) throw new Error('interp type undefined'); n.keys[i - 1]!.inT = a; n.keys[i - 1]!.outT = b; },
    keyInTemporalEase(i: number) { return n.keys[i - 1]!.inE ?? Array.from({ length: n.dims }, () => new KeyframeEase(0, 16.7)); },
    keyOutTemporalEase(i: number) { return n.keys[i - 1]!.outE ?? Array.from({ length: n.dims }, () => new KeyframeEase(0, 16.7)); },
    setTemporalEaseAtKey(i: number, inE: KeyframeEase[], outE: KeyframeEase[]) {
      check();
      if (inE.length !== n.dims || outE.length !== n.dims) throw new Error('ease dims');
      for (const e of [...inE, ...outE]) if (!(e.influence >= 0.1 && e.influence <= 100) || !Number.isFinite(e.speed)) throw new Error('bad ease');
      n.keys[i - 1]!.inE = inE; n.keys[i - 1]!.outE = outE;
    },
  };
  return api;
}
function clone(v: any) { return Array.isArray(v) ? v.slice() : v && typeof v === 'object' ? { ...v } : v; }
function shapeCheck(n: Node, v: any) {
  if (n.isGroup) throw new Error(`setValue on group ${n.matchName}`);
  if (typeof n.val === 'object' && !Array.isArray(n.val)) return; // TextDocument
  if (Array.isArray(n.val) !== Array.isArray(v) || (Array.isArray(v) && v.length !== n.val.length)) throw new Error(`bad value shape for ${n.matchName}: ${JSON.stringify(v)}`);
  if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('NaN value');
}

const TEXT_ANIM_PROPS: Record<string, any> = {
  'ADBE Text Opacity': 100, 'ADBE Text Position 3D': [0, 0, 0], 'ADBE Text Scale 3D': [100, 100, 100],
  'ADBE Text Rotation': 0, 'ADBE Text Tracking Amount': 0, 'ADBE Text Blur': [0, 0],
};
function textSelector(): Node {
  const s = new Node('ADBE Text Selector', 'Range Selector 1');
  s.add(new Node('ADBE Text Percent Start', 'Start', 0));
  s.add(new Node('ADBE Text Percent End', 'End', 100));
  s.add(new Node('ADBE Text Percent Offset', 'Offset', 0));
  const adv = s.add(new Node('ADBE Text Range Advanced', 'Advanced'));
  for (const [m, v] of [['ADBE Text Range Units', 1], ['ADBE Text Range Type2', 1], ['ADBE Text Selector Mode', 1], ['ADBE Text Selector Max Amount', 100], ['ADBE Text Range Shape', 1], ['ADBE Text Selector Smoothness', 100], ['ADBE Text Levels Max Ease', 0], ['ADBE Text Levels Min Ease', 0], ['ADBE Text Randomize Order', 0], ['ADBE Text Random Seed', 0]] as const) adv.add(new Node(m, m, v));
  return s;
}

export class AVLayer extends LayerBase {}
export class TextLayer extends LayerBase {
  constructor(name: string, inPoint = 0, outPoint = 5, text = 'Hello') {
    super(name, inPoint, outPoint);
    const tp = this.root.add(new Node('ADBE Text Properties', 'Text'));
    tp.add(new Node('ADBE Text Document', 'Source Text', { text, fontSize: 50, fillColor: [0, 0, 0], justification: 0 }));
    let count = 0;
    tp.add(new Node('ADBE Text Animators', 'Animators', undefined, m => {
      if (m !== 'ADBE Text Animator') throw new Error('mock: ' + m);
      const a = new Node(m, `Animator ${++count}`);
      a.add(new Node('ADBE Text Selectors', 'Selectors', undefined, mm => { if (mm !== 'ADBE Text Selector') throw new Error('mock: ' + mm); return textSelector(); }));
      a.add(new Node('ADBE Text Animator Properties', 'Properties', undefined, mm => {
        if (!(mm in TEXT_ANIM_PROPS)) throw new Error('mock: unknown text property ' + mm);
        return new Node(mm, mm, clone(TEXT_ANIM_PROPS[mm]));
      }));
      return a;
    }));
  }
}
export class CameraLayer { name = 'Camera'; inPoint = 0; outPoint = 5; parent = null; property() { return null; } }

export function makeComp(selected: any[]) {
  const all: any[] = [...selected];
  class CompItem {
    width = 1920; height = 1080; time = 2; duration = 20; frameDuration = 1 / 25; motionBlur = false;
    selectedLayers = selected;
    layers = {
      addText: (s: string) => { const l = new TextLayer('Text', 0, 20, s); all.unshift(l); return l; },
      addNull: () => { const l = new AVLayer('Null 1', 0, 20, { left: 0, top: 0, width: 100, height: 100 }); l.node('ADBE Transform Group', 'ADBE Anchor Point').val = [50, 50, 0]; all.unshift(l); return l; },
    };
    all = all;
  }
  return new CompItem();
}

export function loadAe(selected: any[], files = ['uet-ae.jsx', 'uet-ae-motion.jsx', 'uet-ae-layout.jsx']) {
  const comp = makeComp(selected);
  const undo: string[] = [];
  const ctx: any = {
    JSON, Math, String, Object, KeyframeEase, TextLayer, AVLayer, CompItem: comp.constructor,
    KeyframeInterpolationType: KIT,
    ParagraphJustification: { CENTER_JUSTIFY: 7415 },
    app: { version: '26.0', project: { activeItem: comp, file: null }, beginUndoGroup: (n: string) => undo.push('begin:' + n), endUndoGroup: () => undo.push('end') },
  };
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(readFileSync(`packages/host-ae/jsx/${f}`, 'utf8'), ctx, { filename: f });
  const call = (fn: string, args?: unknown) => JSON.parse(ctx.UET.ae[fn](args === undefined ? undefined : JSON.stringify(args)));
  return { ctx, comp, undo, call };
}
