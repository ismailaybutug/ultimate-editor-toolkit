/*
 * Ultimate Editor Toolkit - Transitions for After Effects (ExtendScript, ES3).
 * Applies a transition compiled by @uet/core (packages/core/src/transitions/compile.ts) at a cut:
 * one adjustment (or solid) layer for the end of the outgoing shot and one for the start of the incoming shot,
 * with native effects and real, editable keyframes. One undo group per call.
 * Layers are tagged in their comment ("uet-transition:<id>:<side>") so applying again at the same cut replaces them.
 * STATUS: UNVERIFIED in After Effects until TEST_REPORT.md says otherwise.
 */
/* global app, CompItem, KeyframeEase, KeyframeInterpolationType, BlendingMode, Shape */
var UET = UET || {};
UET.transitions = (function () {
  var TAG = 'uet-transition:';

  function ok(data) { return JSON.stringify({ ok: true, data: data }); }
  function fail(e) { return JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e), line: e && e.line }); }
  function isArray(v) { return Object.prototype.toString.call(v) === '[object Array]'; }

  function activeComp() {
    var c = app.project && app.project.activeItem;
    if (!c || !(c instanceof CompItem)) throw new Error('Open a composition first (no active comp).');
    return c;
  }

  function snap(t, fps) { return Math.round(t * fps) / fps; }

  /** Cut = start of the later of 2+ selected layers, otherwise the current time. */
  function findCut(comp) {
    var sel = comp.selectedLayers, cut = comp.time, how = 'time', i;
    if (sel && sel.length >= 2) {
      cut = sel[0].inPoint;
      for (i = 1; i < sel.length; i++) if (sel[i].inPoint > cut) cut = sel[i].inPoint;
      how = 'selection';
    }
    return { cut: snap(cut, comp.frameRate), how: how };
  }

  function isOurs(layer) { return String(layer.comment || '').indexOf(TAG) === 0; }

  function removeAt(comp, cut) {
    var n = 0, i, eps = 0.5 / comp.frameRate;
    for (i = comp.numLayers; i >= 1; i--) {
      var l = comp.layer(i);
      if (isOurs(l) && l.inPoint <= cut + eps && l.outPoint >= cut - eps) { l.remove(); n++; }
    }
    return n;
  }

  /** Info the panel needs to compile: frame rate, size and the cut time. Changes nothing. */
  function cutInfo() {
    try {
      var comp = activeComp();
      var c = findCut(comp);
      var existing = 0, i, eps = 0.5 / comp.frameRate;
      for (i = 1; i <= comp.numLayers; i++) {
        var l = comp.layer(i);
        if (isOurs(l) && l.inPoint <= c.cut + eps && l.outPoint >= c.cut - eps) existing++;
      }
      return ok({ fps: comp.frameRate, width: comp.width, height: comp.height, cut: c.cut, how: c.how, existing: existing, comp: comp.name });
    } catch (e) { return fail(e); }
  }

  function easeList(list) {
    var out = [], i;
    for (i = 0; i < list.length; i++) out.push(new KeyframeEase(list[i].speed, list[i].influence));
    return out;
  }

  /**
   * Fit a compiled value to the property's shape: a scalar scale becomes [s, s(, s)], a 2-D position keeps the
   * layer's z. Returns { v, n } where n = how many times each ease entry must be repeated.
   */
  function fitValue(prop, v) {
    var cur = prop.value, out, i;
    if (!isArray(cur)) return { v: v, n: 1 };
    if (!isArray(v)) { out = []; for (i = 0; i < cur.length; i++) out.push(v); return { v: out, n: cur.length }; }
    out = v.slice(0, cur.length);
    for (i = out.length; i < cur.length; i++) out.push(cur[i]);
    return { v: out, n: 1 };
  }

  function repeatEase(list, n, len) {
    if (n === 1 && list.length === len) return list;
    var out = [], i;
    for (i = 0; i < len; i++) out.push(list[Math.min(i, list.length - 1)]);
    return out;
  }

  /** Write compiled keys (times relative to the cut) with their precomputed AE eases. */
  function writeKeys(prop, keys, cut) {
    var i, idx = [], fit = [];
    for (i = 0; i < keys.length; i++) { fit.push(fitValue(prop, keys[i].v)); prop.setValueAtTime(cut + keys[i].t, fit[i].v); }
    for (i = 0; i < keys.length; i++) idx.push(prop.nearestKeyIndex(cut + keys[i].t));
    for (i = 0; i < keys.length; i++) {
      var hold = keys[i].hold ? KeyframeInterpolationType.HOLD : KeyframeInterpolationType.BEZIER;
      prop.setInterpolationTypeAtKey(idx[i], KeyframeInterpolationType.BEZIER, hold);
    }
    var spatial = false;
    try { spatial = prop.isSpatial; } catch (e0) { spatial = false; }
    for (i = 0; i < keys.length; i++) {
      var k = keys[i], fv = fit[i].v;
      var dims = spatial || !isArray(fv) ? 1 : fv.length;
      var inE = spatial ? k.inSp : k.inE, outE = spatial ? k.outSp : k.outE;
      if (!spatial && !isArray(k.v)) { inE = k.inE; outE = k.outE; }
      prop.setTemporalEaseAtKey(idx[i], easeList(repeatEase(inE, fit[i].n, dims)), easeList(repeatEase(outE, fit[i].n, dims)));
      if (spatial && isArray(fv)) {
        try { prop.setSpatialTangentsAtKey(idx[i], [0, 0, 0].slice(0, fv.length), [0, 0, 0].slice(0, fv.length)); } catch (e1) { /* 2D vs 3D */ }
      }
    }
  }

  function child(group, match, what) {
    var p = group.property(match);
    if (!p) throw new Error(what + ': property ' + match + ' not found in this After Effects version');
    return p;
  }

  /** Circle mask (4 bezier vertices) centred on (cx, cy) in layer pixels. */
  function addEllipseMask(layer, cx, cy, r, feather) {
    var m = layer.property('ADBE Mask Parade').addProperty('ADBE Mask Atom');
    var s = new Shape(), t = r * 0.5523;
    s.vertices = [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]];
    s.inTangents = [[-t, 0], [0, -t], [t, 0], [0, t]];
    s.outTangents = [[t, 0], [0, t], [-t, 0], [0, -t]];
    s.closed = true;
    m.property('ADBE Mask Shape').setValue(s);
    if (feather > 0) m.property('ADBE Mask Feather').setValue([feather, feather]);
    return m;
  }

  function addHalf(comp, plan, h, cut, ref) {
    var start = cut + h.start, dur = h.end - h.start;
    if (start < 0) throw new Error('The transition starts before 0:00. Move the cut later or shorten the transition.');
    var color = h.color || [1, 1, 1];
    var name = 'UET ' + plan.name + (h.side === 'out' ? ' (out)' : ' (in)');
    var layer = comp.layers.addSolid(color, name, comp.width, comp.height, comp.pixelAspect, dur);
    layer.startTime = start;
    layer.inPoint = start;
    layer.outPoint = start + dur;
    if (h.layer === 'adjustment') layer.adjustmentLayer = true;
    if (h.blend === 'add') layer.blendingMode = BlendingMode.ADD;
    else if (h.blend === 'screen') layer.blendingMode = BlendingMode.SCREEN;
    layer.comment = TAG + plan.id + ':' + h.side;
    try { layer.label = 14; } catch (e0) { /* label colours vary */ }
    if (ref) layer.moveBefore(ref);

    var parade = layer.property('ADBE Effect Parade'), i, j;
    for (i = 0; i < h.effects.length; i++) {
      var ef = h.effects[i];
      var fx = parade.addProperty(ef.match);
      if (!fx) throw new Error('Effect ' + ef.match + ' could not be added');
      for (j = 0; j < ef.set.length; j++) child(fx, ef.set[j].match, ef.effect).setValue(ef.set[j].value);
      for (j = 0; j < ef.tracks.length; j++) writeKeys(child(fx, ef.tracks[j].match, ef.effect), ef.tracks[j].keys, cut);
    }
    var xf = layer.property('ADBE Transform Group');
    if (h.opacity) writeKeys(xf.property('ADBE Opacity'), h.opacity.keys, cut);
    if (h.scale) writeKeys(xf.property('ADBE Scale'), h.scale.keys, cut);
    if (h.position) writeKeys(xf.property('ADBE Position'), h.position.keys, cut);
    if (h.mask) addEllipseMask(layer, comp.width / 2, comp.height / 2, h.mask.radius, h.mask.feather);
    return layer;
  }

  /**
   * args: { plan: AeTransition (compileForAe), cut?: seconds (default: found like cutInfo), replace?: true }
   * New layers go right above the top-most selected layer (or to the top of the comp).
   */
  function apply(json) {
    try {
      var args = JSON.parse(json);
      var plan = args.plan;
      if (!plan || plan.host !== 'ae') throw new Error('Expected a transition compiled for After Effects.');
      var comp = activeComp();
      if (Math.abs(plan.fps - comp.frameRate) > 0.01) throw new Error('Transition was compiled for ' + plan.fps + ' fps but the comp is ' + comp.frameRate + ' fps.');
      var cut = typeof args.cut === 'number' ? snap(args.cut, comp.frameRate) : findCut(comp).cut;
      var sel = comp.selectedLayers, ref = null, i;
      for (i = 0; sel && i < sel.length; i++) if (!isOurs(sel[i]) && (!ref || sel[i].index < ref.index)) ref = sel[i];
      app.beginUndoGroup('UET: ' + plan.name + ' transition');
      try {
        var removed = args.replace === false ? 0 : removeAt(comp, cut);
        var made = [];
        for (i = 0; i < plan.halves.length; i++) made.push(addHalf(comp, plan, plan.halves[i], cut, ref).name);
        return ok({ cut: cut, layers: made, replaced: removed });
      } finally {
        app.endUndoGroup();
      }
    } catch (e) { return fail(e); }
  }

  /** Remove our transition layers at the cut. args: { cut?: seconds } */
  function remove(json) {
    try {
      var args = json ? JSON.parse(json) : {};
      var comp = activeComp();
      var cut = typeof args.cut === 'number' ? args.cut : findCut(comp).cut;
      app.beginUndoGroup('UET: remove transition');
      try { return ok({ removed: removeAt(comp, cut), cut: cut }); } finally { app.endUndoGroup(); }
    } catch (e) { return fail(e); }
  }

  return { cutInfo: cutInfo, apply: apply, remove: remove };
}());
