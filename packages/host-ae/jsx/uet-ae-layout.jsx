/*
 * Ultimate Editor Toolkit - After Effects layout utilities (ExtendScript, ES3): anchor point, align,
 * distribute, sequence layers. Needs uet-ae-motion.jsx (UET.aeKit). Adds functions to UET.ae.
 * Works on 2D geometry (Z rotation and scale); parented layers are skipped for align/distribute.
 * STATUS: UNVERIFIED in After Effects until TEST_REPORT.md says otherwise.
 */
/* global app, UET */
(function (K, AE) {
  function tgOf(l) { return l.property('ADBE Transform Group'); }
  function hasRect(l) { return typeof l.sourceRectAtTime === 'function' && tgOf(l) && tgOf(l).property('ADBE Anchor Point'); }

  function rotate(x, y, deg) {
    var r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    return [x * c - y * s, x * s + y * c];
  }
  /** Layer-space point -> parent-space point at time t (anchor, scale, Z rotation). */
  function toParent(l, pt, t) {
    var tg = tgOf(l);
    var a = tg.property('ADBE Anchor Point').valueAtTime(t, false), s = tg.property('ADBE Scale').valueAtTime(t, false);
    var p = tg.property('ADBE Position').valueAtTime(t, false), rz = tg.property('ADBE Rotate Z').valueAtTime(t, false);
    var v = rotate((pt[0] - a[0]) * s[0] / 100, (pt[1] - a[1]) * s[1] / 100, rz);
    return [p[0] + v[0], p[1] + v[1]];
  }
  function box(l, t) {
    var r = l.sourceRectAtTime(t, false);
    var pts = [[r.left, r.top], [r.left + r.width, r.top], [r.left, r.top + r.height], [r.left + r.width, r.top + r.height]];
    var b = { l: 1e9, t: 1e9, r: -1e9, b: -1e9 }, i;
    for (i = 0; i < 4; i++) {
      var q = toParent(l, pts[i], t);
      if (q[0] < b.l) b.l = q[0]; if (q[0] > b.r) b.r = q[0];
      if (q[1] < b.t) b.t = q[1]; if (q[1] > b.b) b.b = q[1];
    }
    b.cx = (b.l + b.r) / 2; b.cy = (b.t + b.b) / 2;
    return b;
  }
  /** Move a layer by (dx, dy) in parent space; shifts every position keyframe when animated. */
  function shift(l, dx, dy) {
    var tg = tgOf(l), pos = tg.property('ADBE Position'), i;
    if (pos.dimensionsSeparated) {
      var px = tg.property('ADBE Position_0'), py = tg.property('ADBE Position_1');
      shift1(px, dx); shift1(py, dy);
      return;
    }
    if (pos.numKeys > 0) {
      for (i = 1; i <= pos.numKeys; i++) { var v = pos.keyValue(i); v[0] += dx; v[1] += dy; pos.setValueAtKey(i, v); }
    } else { var w = pos.value; w[0] += dx; w[1] += dy; pos.setValue(w); }
  }
  function shift1(p, d) {
    var i;
    if (p.numKeys > 0) { for (i = 1; i <= p.numKeys; i++) p.setValueAtKey(i, p.keyValue(i) + d); }
    else p.setValue(p.value + d);
  }

  var ANCHOR = { tl: [0, 0], t: [0.5, 0], tr: [1, 0], l: [0, 0.5], c: [0.5, 0.5], r: [1, 0.5], bl: [0, 1], b: [0.5, 1], br: [1, 1] };

  /** args: {pos: tl|t|tr|l|c|r|bl|b|br}. Moves the anchor to that point of the layer's box without moving the layer. */
  AE.setAnchor = function (json) {
    try {
      var args = JSON.parse(json), comp = K.activeComp(), layers = K.selected(comp, 'one or more layers');
      var f = ANCHOR[args.pos];
      if (!f) throw new Error('Unknown anchor position ' + args.pos);
      var done = [], skipped = [];
      K.undo('Anchor point', function () {
        var i;
        for (i = 0; i < layers.length; i++) {
          var l = layers[i];
          if (!hasRect(l)) { skipped.push(l.name); continue; }
          var tg = tgOf(l), ap = tg.property('ADBE Anchor Point');
          if (ap.numKeys > 0 || ap.expression) { skipped.push(l.name + ' (animated anchor)'); continue; }
          var t = comp.time, r = l.sourceRectAtTime(t, false), a = ap.value;
          var na = [r.left + r.width * f[0], r.top + r.height * f[1]];
          var before = toParent(l, [a[0], a[1]], t), after = toParent(l, na, t);
          // position must move by where the new anchor currently sits relative to the old one
          var dx = after[0] - before[0], dy = after[1] - before[1];
          var nv = a.length > 2 ? [na[0], na[1], a[2]] : na;
          ap.setValue(nv);
          shift(l, dx, dy);
          done.push(l.name);
        }
      });
      return K.ok({ layers: done, skipped: skipped });
    } catch (e) { return K.fail(e); }
  };

  /** args: {edge: left|hcenter|right|top|vcenter|bottom, to: 'comp'|'selection'} */
  AE.alignLayers = function (json) {
    try {
      var args = JSON.parse(json), comp = K.activeComp(), layers = K.selected(comp, 'one or more layers');
      var t = comp.time, items = [], skipped = [], i;
      for (i = 0; i < layers.length; i++) {
        if (!hasRect(layers[i]) || layers[i].parent) { skipped.push(layers[i].name); continue; }
        items.push({ l: layers[i], b: box(layers[i], t) });
      }
      if (items.length === 0) throw new Error('No layer can be aligned (cameras, lights and parented layers are skipped).');
      var ref;
      if (args.to === 'selection') {
        if (items.length < 2) throw new Error('Select two or more layers to align to the selection.');
        ref = { l: 1e9, t: 1e9, r: -1e9, b: -1e9 };
        for (i = 0; i < items.length; i++) {
          var b = items[i].b;
          if (b.l < ref.l) ref.l = b.l; if (b.r > ref.r) ref.r = b.r; if (b.t < ref.t) ref.t = b.t; if (b.b > ref.b) ref.b = b.b;
        }
      } else ref = { l: 0, t: 0, r: comp.width, b: comp.height };
      ref.cx = (ref.l + ref.r) / 2; ref.cy = (ref.t + ref.b) / 2;
      K.undo('Align', function () {
        for (i = 0; i < items.length; i++) {
          var b = items[i].b, dx = 0, dy = 0;
          if (args.edge === 'left') dx = ref.l - b.l;
          else if (args.edge === 'right') dx = ref.r - b.r;
          else if (args.edge === 'hcenter') dx = ref.cx - b.cx;
          else if (args.edge === 'top') dy = ref.t - b.t;
          else if (args.edge === 'bottom') dy = ref.b - b.b;
          else if (args.edge === 'vcenter') dy = ref.cy - b.cy;
          else throw new Error('Unknown edge ' + args.edge);
          shift(items[i].l, dx, dy);
        }
      });
      return K.ok({ aligned: items.length, skipped: skipped });
    } catch (e) { return K.fail(e); }
  };

  /** args: {axis: 'h'|'v'}. Spaces the centres evenly between the two outermost layers. */
  AE.distributeLayers = function (json) {
    try {
      var args = JSON.parse(json), comp = K.activeComp(), layers = K.selected(comp, 'three or more layers');
      var t = comp.time, items = [], i, h = args.axis !== 'v';
      for (i = 0; i < layers.length; i++) if (hasRect(layers[i]) && !layers[i].parent) items.push({ l: layers[i], b: box(layers[i], t) });
      if (items.length < 3) throw new Error('Select three or more unparented layers.');
      items.sort(function (a, b) { return h ? a.b.cx - b.b.cx : a.b.cy - b.b.cy; });
      var first = h ? items[0].b.cx : items[0].b.cy, last = h ? items[items.length - 1].b.cx : items[items.length - 1].b.cy;
      var step = (last - first) / (items.length - 1);
      K.undo('Distribute', function () {
        for (i = 1; i < items.length - 1; i++) {
          var target = first + step * i, cur = h ? items[i].b.cx : items[i].b.cy;
          shift(items[i].l, h ? target - cur : 0, h ? 0 : target - cur);
        }
      });
      return K.ok({ distributed: items.length });
    } catch (e) { return K.fail(e); }
  };

  /** args: {gap: seconds (negative = overlap)}. Places layers one after another in selection order. */
  AE.sequenceLayers = function (json) {
    try {
      var args = JSON.parse(json), comp = K.activeComp(), layers = K.selected(comp, 'two or more layers');
      if (layers.length < 2) throw new Error('Select two or more layers.');
      var gap = args.gap || 0;
      K.undo('Sequence layers', function () {
        var i;
        for (i = 1; i < layers.length; i++) {
          var want = layers[i - 1].outPoint + gap;
          layers[i].startTime += want - layers[i].inPoint;
        }
      });
      return K.ok({ layers: layers.length, end: layers[layers.length - 1].outPoint });
    } catch (e) { return K.fail(e); }
  };
}(UET.aeKit, UET.ae));
