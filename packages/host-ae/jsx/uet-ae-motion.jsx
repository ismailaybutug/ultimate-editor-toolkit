/*
 * Ultimate Editor Toolkit - After Effects motion + typography tools (ExtendScript, ES3).
 * Owner: "Build After Effects animation tools" thread. Loaded after uet-ae.jsx; adds functions to UET.ae.
 * All logic that can be pure (presets -> selector plans, layouts, expressions) lives in
 * packages/core/src/motion and is passed in as JSON; this file only writes it into the AE project.
 * Every public function: JSON string in, JSON string out ({ok, data|error}), ONE undo group.
 * STATUS: UNVERIFIED in After Effects until TEST_REPORT.md says otherwise.
 */
/* global app, CompItem, TextLayer, KeyframeEase, KeyframeInterpolationType, ParagraphJustification */
var UET = UET || {};
UET.ae = UET.ae || {};
UET.aeKit = (function () {
  function ok(data) { return JSON.stringify({ ok: true, data: data }); }
  function fail(e) { return JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e), line: e && e.line }); }
  function activeComp() {
    var c = app.project && app.project.activeItem;
    if (!c || !(c instanceof CompItem)) throw new Error('Open a composition first (no active comp).');
    return c;
  }
  function selected(comp, what) {
    var l = comp.selectedLayers;
    if (!l || l.length === 0) throw new Error('Select ' + what + '.');
    return l;
  }
  var EASE = {
    linear: [0, 0, 1, 1], easeIn: [0.42, 0, 1, 1], easeOut: [0, 0, 0.58, 1], easeInOut: [0.42, 0, 0.58, 1],
    expoOut: [0.16, 1, 0.3, 1], expoIn: [0.7, 0, 0.84, 0], expoInOut: [0.87, 0, 0.13, 1],
    backOut: [0.34, 1.56, 0.64, 1], smooth: [0.33, 0, 0.67, 1]
  };
  function clampInfluence(x) { var v = x * 100; return v < 0.1 ? 0.1 : (v > 100 ? 100 : v); }
  /** Same conversion as core/easing.ts bezierToAeEase. */
  function easePair(bez, v0, v1, dur) {
    var avg = dur > 0 ? (v1 - v0) / dur : 0;
    var outSpeed = bez[0] > 0 ? (bez[1] / bez[0]) * avg : 0;
    var inSpeed = (1 - bez[2]) > 0 ? ((1 - bez[3]) / (1 - bez[2])) * avg : 0;
    return { out: new KeyframeEase(outSpeed, clampInfluence(bez[0])), inn: new KeyframeEase(inSpeed, clampInfluence(1 - bez[2])) };
  }
  /**
   * Keyframe a 1-D property: keys = [{time, value, ease}], ease applies to the segment ENDING at that key.
   * 'linear' segments get LINEAR interpolation; others bezier temporal ease. 'hold' = hold keyframe.
   */
  function keys1D(prop, keys) {
    var i, idx = [];
    for (i = 0; i < keys.length; i++) prop.setValueAtTime(keys[i].time, keys[i].value);
    for (i = 0; i < keys.length; i++) idx.push(prop.nearestKeyIndex(keys[i].time));
    for (i = 0; i < keys.length - 1; i++) {
      var a = keys[i], b = keys[i + 1];
      if (b.ease === 'hold') {
        prop.setInterpolationTypeAtKey(idx[i], prop.keyInInterpolationType(idx[i]), KeyframeInterpolationType.HOLD);
      } else if (b.ease === 'linear' || !EASE[b.ease]) {
        prop.setInterpolationTypeAtKey(idx[i], prop.keyInInterpolationType(idx[i]), KeyframeInterpolationType.LINEAR);
        prop.setInterpolationTypeAtKey(idx[i + 1], KeyframeInterpolationType.LINEAR, prop.keyOutInterpolationType(idx[i + 1]));
      } else {
        prop.setInterpolationTypeAtKey(idx[i], prop.keyInInterpolationType(idx[i]), KeyframeInterpolationType.BEZIER);
        prop.setInterpolationTypeAtKey(idx[i + 1], KeyframeInterpolationType.BEZIER, prop.keyOutInterpolationType(idx[i + 1]));
        var p = easePair(EASE[b.ease], a.value, b.value, b.time - a.time);
        prop.setTemporalEaseAtKey(idx[i], prop.keyInTemporalEase(idx[i]), [p.out]);
        prop.setTemporalEaseAtKey(idx[i + 1], [p.inn], prop.keyOutTemporalEase(idx[i + 1]));
      }
    }
    return idx.length;
  }
  /** Like keys1D for non-spatial multi-dimensional values (e.g. shape group Scale [x, y]); one ease per dimension. */
  function keysND(prop, keys) {
    var i, d, idx = [];
    for (i = 0; i < keys.length; i++) prop.setValueAtTime(keys[i].time, keys[i].value);
    for (i = 0; i < keys.length; i++) idx.push(prop.nearestKeyIndex(keys[i].time));
    for (i = 0; i < keys.length - 1; i++) {
      var a = keys[i], b = keys[i + 1], bez = EASE[b.ease] || EASE.linear, outE = [], inE = [];
      prop.setInterpolationTypeAtKey(idx[i], prop.keyInInterpolationType(idx[i]), KeyframeInterpolationType.BEZIER);
      prop.setInterpolationTypeAtKey(idx[i + 1], KeyframeInterpolationType.BEZIER, prop.keyOutInterpolationType(idx[i + 1]));
      for (d = 0; d < a.value.length; d++) {
        var p = easePair(bez, a.value[d], b.value[d], b.time - a.time);
        outE.push(p.out); inE.push(p.inn);
      }
      prop.setTemporalEaseAtKey(idx[i], prop.keyInTemporalEase(idx[i]), outE);
      prop.setTemporalEaseAtKey(idx[i + 1], inE, prop.keyOutTemporalEase(idx[i + 1]));
    }
    return idx.length;
  }
  function startsWith(s, pre) { return String(s).substr(0, pre.length) === pre; }
  function frame(comp) { return comp.frameDuration || 1 / 30; }
  /** Run fn inside one undo group named 'UET: name'. */
  function undo(name, fn) {
    app.beginUndoGroup('UET: ' + name);
    try { return fn(); } finally { app.endUndoGroup(); }
  }
  return { ok: ok, fail: fail, activeComp: activeComp, selected: selected, keys1D: keys1D, keysND: keysND, startsWith: startsWith, frame: frame, undo: undo };
}());

(function (K, AE) {
  // ======================= Text animation presets (F-MG-04) =======================
  var TEXT_PROP = {
    opacity: 'ADBE Text Opacity', position: 'ADBE Text Position 3D', scale: 'ADBE Text Scale 3D',
    rotation: 'ADBE Text Rotation', tracking: 'ADBE Text Tracking Amount', blur: 'ADBE Text Blur'
  };
  var TEXT_ORDER = ['opacity', 'position', 'scale', 'rotation', 'tracking', 'blur'];
  var SEL_PROP = { start: 'ADBE Text Percent Start', end: 'ADBE Text Percent End', offset: 'ADBE Text Percent Offset' };

  function animatorsOf(layer) { return layer.property('ADBE Text Properties').property('ADBE Text Animators'); }

  function textValue(key, v, prop) {
    var n = prop.value && prop.value.length ? prop.value.length : 1;
    if (key === 'position') return n === 3 ? [v[0], v[1], 0] : [v[0], v[1]];
    if (key === 'scale') return n === 3 ? [v, v, 100] : [v, v];
    if (key === 'blur') return n === 2 ? [v, v] : v;
    return v;
  }

  /** Remove animators this toolkit added (named 'UET ...'); returns how many. */
  function removeUetAnimators(layer) {
    var g = animatorsOf(layer), n = 0, i;
    for (i = g.numProperties; i >= 1; i--) {
      if (K.startsWith(g.property(i).name, 'UET ')) { g.property(i).remove(); n++; g = animatorsOf(layer); }
    }
    return n;
  }

  // Note: in AE, adding a property invalidates earlier references to its siblings/parents, so every
  // step below re-reads the animator through A() / S() instead of keeping old objects.
  function addAnimator(layer, name, props, plan, t0, warnings) {
    var created = animatorsOf(layer).addProperty('ADBE Text Animator');
    var idx = created.propertyIndex;
    created.name = 'UET ' + name;
    function A() { return animatorsOf(layer).property(idx); }
    var i, key;
    for (i = 0; i < TEXT_ORDER.length; i++) {
      key = TEXT_ORDER[i];
      if (props[key] === undefined || props[key] === null) continue;
      A().property('ADBE Text Animator Properties').addProperty(TEXT_PROP[key]);
      var p = A().property('ADBE Text Animator Properties').property(TEXT_PROP[key]);
      p.setValue(textValue(key, props[key], p));
    }
    if (A().property('ADBE Text Selectors').numProperties === 0) A().property('ADBE Text Selectors').addProperty('ADBE Text Selector');
    function S() { return A().property('ADBE Text Selectors').property(1); }
    function adv(match, v, optional) {
      try { S().property('ADBE Text Range Advanced').property(match).setValue(v); }
      catch (e) { if (!optional) throw e; warnings.push(match + ': ' + e.message); }
    }
    adv('ADBE Text Range Units', plan.units);
    adv('ADBE Text Range Type2', plan.basedOn);
    adv('ADBE Text Range Shape', plan.shape);
    if (plan.smoothness !== null && plan.smoothness !== undefined) adv('ADBE Text Selector Smoothness', plan.smoothness, true);
    if (plan.randomize) adv('ADBE Text Randomize Order', 1);
    S().property(SEL_PROP.start).setValue(plan.start);
    S().property(SEL_PROP.end).setValue(plan.end);
    S().property(SEL_PROP.offset).setValue(plan.offset);
    var keys = [];
    for (i = 0; i < plan.keys.length; i++) keys.push({ time: t0 + plan.keys[i].t, value: plan.keys[i].v, ease: plan.keys[i].ease });
    K.keys1D(S().property(SEL_PROP[plan.animate]), keys);
  }

  // shared with uet-ae-gfx.jsx (titles, callouts)
  K.addTextAnimator = addAnimator;

  /**
   * args: {name, kind:'in'|'out', duration, props, plan (core planTextAnimator), atPlayhead, stagger, replace}
   * 'in' starts at the layer in-point (or playhead), 'out' ends at the layer out-point (or starts at playhead).
   */
  AE.applyTextAnimator = function (json) {
    try {
      var args = JSON.parse(json), comp = K.activeComp(), layers = K.selected(comp, 'one or more text layers');
      var done = [], skipped = [], warnings = [];
      K.undo(args.name, function () {
        var i;
        for (i = 0; i < layers.length; i++) {
          var layer = layers[i];
          if (!(layer instanceof TextLayer)) { skipped.push(layer.name); continue; }
          if (args.replace) removeUetAnimators(layer);
          var off = done.length * (args.stagger || 0), t0;
          if (args.atPlayhead) t0 = comp.time + off;
          else if (args.kind === 'out') t0 = layer.outPoint - args.duration - off;
          else t0 = layer.inPoint + off;
          addAnimator(layer, args.name, args.props, args.plan, t0, warnings);
          done.push(layer.name);
        }
      });
      if (done.length === 0) throw new Error('No text layer in the selection.');
      return K.ok({ layers: done, skipped: skipped, warnings: warnings });
    } catch (e) { return K.fail(e); }
  };

  AE.removeTextAnimators = function () {
    try {
      var comp = K.activeComp(), layers = K.selected(comp, 'text layers'), n = 0;
      K.undo('Remove text animation', function () {
        var i; for (i = 0; i < layers.length; i++) if (layers[i] instanceof TextLayer) n += removeUetAnimators(layers[i]);
      });
      return K.ok({ removed: n });
    } catch (e) { return K.fail(e); }
  };

  // ======================= Shake (F-MG-08) =======================
  var SHAKE_TAG = '// UET shake';
  function fxOf(layer) { return layer.property('ADBE Effect Parade'); }
  function addSlider(layer, name, value) {
    var fx = fxOf(layer).addProperty('ADBE Slider Control');
    fx.name = name;
    var s = fxOf(layer).property(name).property(1);
    s.setValue(value);
    return s;
  }
  function isOurs(prop) { return !prop.expression || K.startsWith(prop.expression, SHAKE_TAG); }
  function removeShakeFrom(layer) {
    var tg = layer.property('ADBE Transform Group'), names = ['ADBE Position', 'ADBE Position_0', 'ADBE Position_1', 'ADBE Rotate Z'], i, n = 0;
    for (i = 0; i < names.length; i++) {
      var p = tg.property(names[i]);
      if (p && p.expression && K.startsWith(p.expression, SHAKE_TAG)) { p.expression = ''; n++; }
    }
    var fx = fxOf(layer);
    if (fx) {
      for (i = fx.numProperties; i >= 1; i--) {
        if (K.startsWith(fx.property(i).name, 'UET Shake ')) { fx.property(i).remove(); n++; fx = fxOf(layer); }
      }
    }
    return n;
  }

  /**
   * args: {name, amount, frequency, rotation, decay, motionBlur, expr:{position, rotation, x, y}}
   * Expressions come from core/motion/shake.ts. With decay > 0 the shake starts at the playhead and fades out.
   */
  AE.addShake = function (json) {
    try {
      var args = JSON.parse(json), comp = K.activeComp(), layers = K.selected(comp, 'one or more layers');
      var done = [], skipped = [];
      K.undo(args.name || 'Shake', function () {
        var i;
        for (i = 0; i < layers.length; i++) {
          var layer = layers[i], tg = layer.property('ADBE Transform Group');
          var pos = tg && tg.property('ADBE Position');
          if (!pos || !fxOf(layer)) { skipped.push(layer.name + ' (no position/effects)'); continue; }
          var sep = pos.dimensionsSeparated;
          var targets = sep ? [tg.property('ADBE Position_0'), tg.property('ADBE Position_1')] : [pos];
          if (args.rotation > 0) targets.push(tg.property('ADBE Rotate Z'));
          var j, foreign = false;
          for (j = 0; j < targets.length; j++) if (!isOurs(targets[j])) foreign = true;
          if (foreign) { skipped.push(layer.name + ' (has its own expression)'); continue; }
          removeShakeFrom(layer);
          var amt = addSlider(layer, 'UET Shake Amount', args.amount);
          addSlider(layer, 'UET Shake Frequency', args.frequency);
          var rot = addSlider(layer, 'UET Shake Rotation', args.rotation);
          if (args.decay > 0) {
            var t0 = comp.time, f = K.frame(comp);
            amt = fxOf(layer).property('UET Shake Amount').property(1);
            K.keys1D(amt, [{ time: t0 - f, value: 0 }, { time: t0, value: args.amount, ease: 'hold' }, { time: t0 + args.decay, value: 0, ease: 'easeOut' }]);
            rot = fxOf(layer).property('UET Shake Rotation').property(1);
            K.keys1D(rot, [{ time: t0 - f, value: 0 }, { time: t0, value: args.rotation, ease: 'hold' }, { time: t0 + args.decay, value: 0, ease: 'easeOut' }]);
          }
          tg = layer.property('ADBE Transform Group');
          if (sep) {
            tg.property('ADBE Position_0').expression = args.expr.x;
            tg.property('ADBE Position_1').expression = args.expr.y;
          } else tg.property('ADBE Position').expression = args.expr.position;
          if (args.rotation > 0) tg.property('ADBE Rotate Z').expression = args.expr.rotation;
          if (args.motionBlur) { try { layer.motionBlur = true; comp.motionBlur = true; } catch (e1) { /* not all layers */ } }
          done.push(layer.name);
        }
      });
      if (done.length === 0) throw new Error('Nothing shaken: ' + skipped.join(', '));
      return K.ok({ layers: done, skipped: skipped });
    } catch (e) { return K.fail(e); }
  };

  AE.removeShake = function () {
    try {
      var comp = K.activeComp(), layers = K.selected(comp, 'layers'), n = 0;
      K.undo('Remove shake', function () { var i; for (i = 0; i < layers.length; i++) n += removeShakeFrom(layers[i]); });
      return K.ok({ removed: n });
    } catch (e) { return K.fail(e); }
  };

  // ======================= Number counter (F-MG-06 part) =======================
  /**
   * args: {from, to, duration, ease, fontSize, expression, preview}
   * Uses the single selected text layer if there is one, otherwise creates a centred text layer.
   * Counting starts at the playhead.
   */
  AE.createCounter = function (json) {
    try {
      var args = JSON.parse(json), comp = K.activeComp(), sel = comp.selectedLayers, layer = null, created = false;
      if (sel && sel.length === 1 && sel[0] instanceof TextLayer) layer = sel[0];
      var name = '';
      K.undo('Counter', function () {
        if (!layer) {
          layer = comp.layers.addText(args.preview || '0');
          created = true;
          var doc = layer.property('ADBE Text Properties').property('ADBE Text Document'), td = doc.value;
          td.fontSize = args.fontSize; td.fillColor = [1, 1, 1];
          td.justification = ParagraphJustification.CENTER_JUSTIFY;
          doc.setValue(td);
          layer.property('ADBE Transform Group').property('ADBE Position').setValue([comp.width / 2, comp.height / 2 + args.fontSize * 0.35, 0]);
          layer.name = 'UET Counter';
        }
        var fx = layer.property('ADBE Effect Parade'), i;
        for (i = fx.numProperties; i >= 1; i--) if (fx.property(i).name === 'UET Counter') { fx.property(i).remove(); fx = layer.property('ADBE Effect Parade'); }
        layer.property('ADBE Effect Parade').addProperty('ADBE Slider Control').name = 'UET Counter';
        var s = layer.property('ADBE Effect Parade').property('UET Counter').property(1);
        K.keys1D(s, [{ time: comp.time, value: args.from }, { time: comp.time + args.duration, value: args.to, ease: args.ease }]);
        layer.property('ADBE Text Properties').property('ADBE Text Document').expression = args.expression;
        name = layer.name;
      });
      return K.ok({ layer: name, created: created });
    } catch (e) { return K.fail(e); }
  };

  // ======================= 3D carousel (F-MG-05) =======================
  /** Width/height (px, after scale) of the selected layers at the playhead; used by core autoRadius. */
  AE.selectedLayerSizes = function () {
    try {
      var comp = K.activeComp(), layers = K.selected(comp, 'layers'), out = [], i;
      for (i = 0; i < layers.length; i++) {
        var l = layers[i], w = 0, h = 0;
        if (typeof l.sourceRectAtTime === 'function') {
          var r = l.sourceRectAtTime(comp.time, false), s = l.property('ADBE Transform Group').property('ADBE Scale').value;
          w = r.width * Math.abs(s[0]) / 100; h = r.height * Math.abs(s[1]) / 100;
        }
        out.push({ name: l.name, width: w, height: h });
      }
      return K.ok({ layers: out, comp: { width: comp.width, height: comp.height } });
    } catch (e) { return K.fail(e); }
  };

  /**
   * args: {slots:[{x,y,z,rotY}] (core carouselSlots, one per selected layer, in selection order),
   *        radius, tilt, spinKeys:[[t, deg]], spinEase:'linear'|'easeInOut'}
   * Creates null 'UET Carousel' at the comp centre pushed back by `radius` (front item keeps its size),
   * parents the layers to it and keyframes the null's Y rotation from the playhead.
   */
  AE.buildCarousel = function (json) {
    try {
      var args = JSON.parse(json), comp = K.activeComp(), layers = K.selected(comp, 'two or more layers'), i;
      if (layers.length < 2) throw new Error('Select two or more layers.');
      if (args.slots.length !== layers.length) throw new Error('Layout does not match the selection.');
      for (i = 0; i < layers.length; i++) {
        var tg0 = layers[i].property('ADBE Transform Group');
        if (!tg0 || typeof layers[i].sourceRectAtTime !== 'function') throw new Error(layers[i].name + ': cameras and lights cannot be carousel items.');
        if (tg0.property('ADBE Position').numKeys > 0 || (tg0.property('ADBE Rotate Y') && tg0.property('ADBE Rotate Y').numKeys > 0)) {
          throw new Error(layers[i].name + ': position or Y rotation already has keyframes. Use a precomp or remove them.');
        }
        if (tg0.property('ADBE Position').dimensionsSeparated) throw new Error(layers[i].name + ': position dimensions are separated.');
      }
      var names = [], nullName = '';
      K.undo('3D carousel', function () {
        var nul = comp.layers.addNull(comp.duration);
        nul.name = 'UET Carousel';
        nul.threeDLayer = true;
        var ntg = nul.property('ADBE Transform Group');
        ntg.property('ADBE Position').setValue([comp.width / 2, comp.height / 2, args.radius]);
        var na = ntg.property('ADBE Anchor Point').value;
        for (i = 0; i < layers.length; i++) {
          var l = layers[i], s = args.slots[i];
          l.threeDLayer = true;
          l.parent = nul;
          var tg = l.property('ADBE Transform Group');
          tg.property('ADBE Position').setValue([na[0] + s.x, na[1] + s.y, (na.length > 2 ? na[2] : 0) + s.z]);
          tg.property('ADBE Orientation').setValue([0, 0, 0]);
          tg.property('ADBE Rotate X').setValue(0);
          tg.property('ADBE Rotate Y').setValue(s.rotY);
          names.push(l.name);
        }
        // tilt and spin are set after parenting so AE does not compensate the children
        ntg = nul.property('ADBE Transform Group');
        ntg.property('ADBE Rotate X').setValue(args.tilt);
        if (args.spinKeys && args.spinKeys.length > 1) {
          var keys = [];
          for (i = 0; i < args.spinKeys.length; i++) keys.push({ time: comp.time + args.spinKeys[i][0], value: args.spinKeys[i][1], ease: args.spinEase || 'easeInOut' });
          K.keys1D(ntg.property('ADBE Rotate Y'), keys);
        }
        nullName = nul.name;
      });
      return K.ok({ null: nullName, layers: names });
    } catch (e) { return K.fail(e); }
  };
}(UET.aeKit, UET.ae));
