/*
 * Ultimate Editor Toolkit - After Effects host library (ExtendScript, ES3).
 * Every public function takes/returns JSON strings and runs in ONE undo group.
 * STATUS: UNVERIFIED in After Effects until TEST_REPORT.md says otherwise.
 */
/* global app, CompItem, AVLayer, TextLayer, KeyframeEase, KeyframeInterpolationType */
var UET = UET || {};
UET.ae = (function () {
  // ---------- small helpers (ES3: no JSON in very old hosts, AE 2026 has it) ----------
  function ok(data) { return JSON.stringify({ ok: true, data: data }); }
  function fail(e) { return JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e), line: e && e.line }); }

  function activeComp() {
    var c = app.project && app.project.activeItem;
    if (!c || !(c instanceof CompItem)) throw new Error('Open a composition first (no active comp).');
    return c;
  }

  var PROP = {
    position: 'ADBE Position',
    scale: 'ADBE Scale',
    rotation: 'ADBE Rotate Z',
    opacity: 'ADBE Opacity',
    anchor: 'ADBE Anchor Point'
  };

  var EASE = {
    linear: [0, 0, 1, 1], easeIn: [0.42, 0, 1, 1], easeOut: [0, 0, 0.58, 1], easeInOut: [0.42, 0, 0.58, 1],
    expoOut: [0.16, 1, 0.3, 1], expoIn: [0.7, 0, 0.84, 0], expoInOut: [0.87, 0, 0.13, 1],
    backOut: [0.34, 1.56, 0.64, 1], smooth: [0.33, 0, 0.67, 1]
  };

  function transformProp(layer, key) {
    var name = PROP[key];
    if (!name) throw new Error('Unknown property ' + key);
    return layer.property('ADBE Transform Group').property(name);
  }

  function isArray(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
  function toArray(v) { return isArray(v) ? v.slice(0) : [v]; }

  /** Combine recipe value with the layer's current value. */
  function resolveValue(mode, base, v) {
    var b = toArray(base), r = toArray(v), out = [], i;
    for (i = 0; i < b.length; i++) {
      var vi = r[Math.min(i, r.length - 1)];
      if (mode === 'absolute') out.push(i < r.length ? vi : b[i]);
      else if (mode === 'offset') out.push(b[i] + (i < r.length ? vi : 0));
      else out.push(b[i] * (i < r.length ? vi : 1));
    }
    // Opacity/rotation are 1-D
    return isArray(base) ? out : out[0];
  }

  function clampInfluence(x) { var v = x * 100; return v < 0.1 ? 0.1 : (v > 100 ? 100 : v); }

  /** Bezier easing -> AE KeyframeEase pair for one dimension (see core/easing.ts). */
  function easePair(bez, v0, v1, dur) {
    var avg = dur > 0 ? (v1 - v0) / dur : 0;
    var outSpeed = bez[0] > 0 ? (bez[1] / bez[0]) * avg : 0;
    var inSpeed = (1 - bez[2]) > 0 ? ((1 - bez[3]) / (1 - bez[2])) * avg : 0;
    return { out: new KeyframeEase(outSpeed, clampInfluence(bez[0])), inn: new KeyframeEase(inSpeed, clampInfluence(1 - bez[2])) };
  }

  function dist(a, b) {
    var s = 0, i; for (i = 0; i < a.length; i++) { s += (b[i] - a[i]) * (b[i] - a[i]); } return Math.sqrt(s);
  }

  /** Write keyframes [{time, value, ease}] to a property with bezier temporal ease. */
  function writeKeys(prop, keys) {
    var idx = [], i, k;
    for (i = 0; i < keys.length; i++) idx.push(prop.addKey(keys[i].time));
    for (i = 0; i < keys.length; i++) prop.setValueAtKey(idx[i], keys[i].value);
    // Re-find indices because addKey order can shift when keys are added out of order.
    for (i = 0; i < keys.length; i++) idx[i] = prop.nearestKeyIndex(keys[i].time);
    var dims = isArray(keys[0].value) ? keys[0].value.length : 1;
    var spatial = prop.isSpatial;
    for (i = 0; i < keys.length; i++) {
      prop.setInterpolationTypeAtKey(idx[i], KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
    }
    for (i = 0; i < keys.length - 1; i++) {
      var a = keys[i], b = keys[i + 1];
      var bez = EASE[b.ease] || EASE.easeInOut;
      var dur = b.time - a.time;
      var inEase = [], outEase = [], d;
      if (spatial || dims === 1) {
        var v0 = 0, v1 = (dims === 1) ? (b.value - a.value) : dist(a.value, b.value);
        if (dims === 1) { v0 = a.value; v1 = b.value; }
        var p = easePair(bez, v0, v1, dur);
        if (spatial) { p = easePair(bez, 0, Math.abs(v1), dur); }
        outEase = [p.out]; inEase = [p.inn];
      } else {
        for (d = 0; d < dims; d++) {
          var q = easePair(bez, a.value[d], b.value[d], dur);
          outEase.push(q.out); inEase.push(q.inn);
        }
      }
      // keep the existing "in" ease on key a and "out" ease on key b
      var aIn = prop.keyInTemporalEase(idx[i]);
      var bOut = prop.keyOutTemporalEase(idx[i + 1]);
      prop.setTemporalEaseAtKey(idx[i], aIn, outEase);
      prop.setTemporalEaseAtKey(idx[i + 1], inEase, bOut);
    }
    if (spatial && dims > 1) {
      // straight motion paths for recipe moves (no unwanted overshoot curves)
      for (i = 0; i < keys.length; i++) {
        try { prop.setSpatialTangentsAtKey(idx[i], [0, 0, 0].slice(0, dims), [0, 0, 0].slice(0, dims)); } catch (e1) { /* 2D vs 3D */ }
      }
    }
  }

  /**
   * Apply a recipe to the selected layers.
   * 'in' recipes start at the layer in-point, 'out' recipes end at the out-point,
   * 'emphasis' recipes start at the current time. Stagger offsets each layer.
   */
  function applyRecipe(json) {
    try {
      var args = JSON.parse(json);
      var r = args.recipe, stagger = args.stagger || 0;
      var comp = activeComp();
      var layers = comp.selectedLayers;
      if (!layers || layers.length === 0) throw new Error('Select one or more layers.');
      app.beginUndoGroup('UET: ' + r.name);
      try {
        var done = [], li, ti, ki;
        for (li = 0; li < layers.length; li++) {
          var layer = layers[li];
          var start;
          if (r.kind === 'in') start = layer.inPoint + li * stagger;
          else if (r.kind === 'out') start = layer.outPoint - r.duration - li * stagger;
          else start = comp.time + li * stagger;
          for (ti = 0; ti < r.tracks.length; ti++) {
            var tr = r.tracks[ti];
            var prop = transformProp(layer, tr.property);
            if (prop.numKeys > 0 && args.replace) {
              while (prop.numKeys > 0) prop.removeKey(1);
            }
            var base = prop.numKeys > 0 ? prop.valueAtTime(start, true) : prop.value;
            // Opacity factor recipes work on 0..100 scale
            var keys = [];
            for (ki = 0; ki < tr.keyframes.length; ki++) {
              var kf = tr.keyframes[ki];
              var v = kf.v;
              if (tr.property === 'scale' && tr.mode === 'absolute') v = toArray(v);
              keys.push({ time: start + kf.t, value: resolveValue(tr.mode, base, v), ease: kf.ease });
            }
            writeKeys(prop, keys);
          }
          done.push(layer.name);
        }
        return ok({ layers: done, recipe: r.id });
      } finally {
        app.endUndoGroup();
      }
    } catch (e) { return fail(e); }
  }

  /**
   * Speed ramp on the selected layer using Time Remap.
   * args.keys = [[outputSeconds, sourceSeconds], ...] computed by @uet/core buildRampKeyframes.
   * Keys are real and editable (F-SP-02).
   */
  function speedRamp(json) {
    try {
      var args = JSON.parse(json);
      var comp = activeComp();
      var layer = comp.selectedLayers[0];
      if (!layer) throw new Error('Select one footage layer.');
      if (!layer.canSetTimeRemapEnabled) throw new Error('This layer cannot use Time Remap (needs video footage or a precomp).');
      app.beginUndoGroup('UET: Speed ramp');
      try {
        layer.timeRemapEnabled = true;
        var tr = layer.property('ADBE Time Remapping');
        while (tr.numKeys > 0) tr.removeKey(1);
        var t0 = layer.inPoint, i, keys = args.keys;
        var times = [], values = [];
        for (i = 0; i < keys.length; i++) { times.push(t0 + keys[i][0]); values.push(keys[i][1]); }
        tr.setValuesAtTimes(times, values);
        for (i = 1; i <= tr.numKeys; i++) tr.setInterpolationTypeAtKey(i, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
        var endT = t0 + keys[keys.length - 1][0];
        if (endT > layer.outPoint) layer.outPoint = Math.min(endT, comp.duration);
        else layer.outPoint = endT;
        return ok({ layer: layer.name, keys: tr.numKeys, outputDuration: keys[keys.length - 1][0] });
      } finally {
        app.endUndoGroup();
      }
    } catch (e) { return fail(e); }
  }

  /** Spike S1: build a test comp with a title and an eased entrance, in one undo step. */
  function createTestTitle(json) {
    try {
      var args = JSON.parse(json);
      app.beginUndoGroup('UET: Test title');
      try {
        var w = args.width || 1920, h = args.height || 1080;
        var comp = app.project.items.addComp(args.compName || 'UET Test', w, h, 1, args.duration || 5, args.fps || 30);
        comp.bgColor = [0.06, 0.06, 0.08];
        var t = comp.layers.addText(args.text || 'Ultimate Editor Toolkit');
        var doc = t.property('ADBE Text Properties').property('ADBE Text Document');
        var td = doc.value;
        td.fontSize = args.fontSize || 110;
        td.fillColor = [1, 1, 1];
        td.justification = ParagraphJustification.CENTER_JUSTIFY;
        doc.setValue(td);
        // center anchor on the text box
        var r = t.sourceRectAtTime(0, false);
        t.property('ADBE Transform Group').property('ADBE Anchor Point').setValue([r.left + r.width / 2, r.top + r.height / 2]);
        t.property('ADBE Transform Group').property('ADBE Position').setValue([w / 2, h / 2]);
        t.name = 'Title';
        comp.openInViewer();
        t.selected = true;
        return ok({ comp: comp.name, layer: t.name });
      } finally {
        app.endUndoGroup();
      }
    } catch (e) { return fail(e); }
  }

  function ping() {
    try {
      return ok({ app: 'ae', version: app.version, project: app.project && app.project.file ? app.project.file.name : null });
    } catch (e) { return fail(e); }
  }

  return { ping: ping, applyRecipe: applyRecipe, speedRamp: speedRamp, createTestTitle: createTestTitle };
}());
