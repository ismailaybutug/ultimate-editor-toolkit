/*
 * Ultimate Editor Toolkit - After Effects: glow (F-VFX-02 v1), animated backgrounds (F-MG-07) and map routes.
 * Needs uet-ae-motion.jsx (UET.aeKit). Adds functions to UET.ae. Plans/expressions come from
 * packages/core/src/motion (glow.ts, backgrounds.ts, route.ts).
 * STATUS: UNVERIFIED in After Effects until TEST_REPORT.md says otherwise.
 */
/* global app, UET, Shape, CompItem */
(function (K, AE) {
  function rgba(c) { return [c[0], c[1], c[2], 1]; }
  function fxOf(l) { return l.property('ADBE Effect Parade'); }
  /** Add an effect, name it, return a getter that re-reads it by name. */
  function addEffect(l, match, name) {
    fxOf(l).addProperty(match).name = name;
    return function () { return fxOf(l).property(name); };
  }
  function setP(E, idx, v) { E().property(idx).setValue(v); }

  // ======================= Glow =======================
  function removeGlows(l) {
    var fx = fxOf(l), i, n = 0;
    if (!fx) return 0;
    for (i = fx.numProperties; i >= 1; i--) if (K.startsWith(fx.property(i).name, 'UET Glow')) { fx.property(i).remove(); n++; fx = fxOf(l); }
    return n;
  }
  /** args: {passes:[{threshold,radius,intensity}], tinted, colorA [r,g,b], colorB [r,g,b]} */
  AE.applyGlow = function (json) {
    try {
      var args = JSON.parse(json), comp = K.activeComp(), layers = K.selected(comp, 'one or more layers');
      var done = [], skipped = [];
      K.undo('Glow', function () {
        var i, j;
        for (i = 0; i < layers.length; i++) {
          var l = layers[i];
          if (!fxOf(l)) { skipped.push(l.name); continue; }
          removeGlows(l);
          for (j = 0; j < args.passes.length; j++) {
            var p = args.passes[j], E = addEffect(l, 'ADBE Glo2', 'UET Glow ' + (j + 1));
            setP(E, 'ADBE Glo2-0002', p.threshold);
            setP(E, 'ADBE Glo2-0003', p.radius);
            setP(E, 'ADBE Glo2-0004', p.intensity);
            if (args.tinted) {
              setP(E, 'ADBE Glo2-0007', 2); // A & B colours
              setP(E, 'ADBE Glo2-0012', rgba(args.colorA));
              setP(E, 'ADBE Glo2-0013', rgba(args.colorB));
            }
          }
          done.push(l.name);
        }
      });
      if (done.length === 0) throw new Error('These layers cannot take effects: ' + skipped.join(', '));
      return K.ok({ layers: done, skipped: skipped, passes: args.passes.length });
    } catch (e) { return K.fail(e); }
  };
  AE.removeGlow = function () {
    try {
      var comp = K.activeComp(), layers = K.selected(comp, 'layers'), n = 0;
      K.undo('Remove glow', function () { var i; for (i = 0; i < layers.length; i++) n += removeGlows(layers[i]); });
      return K.ok({ removed: n });
    } catch (e) { return K.fail(e); }
  };

  // ======================= Backgrounds =======================
  /**
   * args: {name, type:'mesh'|'blobs', width, height, loop, fps, base [r,g,b], points:[{color [r,g,b], expr}],
   *        grain, blurRadius, placeInActive}
   * Creates comp `name` (duration = one seamless loop). When a comp is active and placeInActive, the new
   * comp is added at the bottom of it and looped for the whole comp with Time Remap loopOut("cycle").
   */
  AE.createBackground = function (json) {
    try {
      var args = JSON.parse(json), active = app.project.activeItem, out = {};
      if (!(active instanceof CompItem)) active = null;
      K.undo('Background', function () {
        var c = app.project.items.addComp(args.name, args.width, args.height, 1, args.loop, args.fps);
        var i, base = c.layers.addSolid(args.base, 'UET BG Base', args.width, args.height, 1, args.loop);
        if (args.type === 'mesh') {
          var G = addEffect(base, 'ADBE 4ColorGradient', 'UET Gradient');
          for (i = 0; i < 4; i++) {
            G().property('ADBE 4ColorGradient-' + pad(2 * i + 1)).expression = args.points[i].expr;
            setP(G, 'ADBE 4ColorGradient-' + pad(2 * i + 2), rgba(args.points[i].color));
          }
        } else {
          var s = c.layers.addShape();
          s.name = 'UET BG Blobs';
          s.property('ADBE Transform Group').property('ADBE Position').setValue([0, 0, 0]);
          for (i = 0; i < args.points.length; i++) {
            var nm = 'Blob ' + (i + 1);
            s.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group').name = nm;
            var grp = function () { return s.property('ADBE Root Vectors Group').property(nm); };
            grp().property('ADBE Vectors Group').addProperty('ADBE Vector Shape - Ellipse');
            var d = Math.round(Math.min(args.width, args.height) * 0.65);
            grp().property('ADBE Vectors Group').property('ADBE Vector Shape - Ellipse').property('ADBE Vector Ellipse Size').setValue([d, d]);
            grp().property('ADBE Vectors Group').addProperty('ADBE Vector Graphic - Fill');
            grp().property('ADBE Vectors Group').property('ADBE Vector Graphic - Fill').property('ADBE Vector Fill Color').setValue(rgba(args.points[i].color));
            grp().property('ADBE Vector Transform Group').property('ADBE Vector Position').expression = args.points[i].expr;
          }
          var B = addEffect(s, 'ADBE Gaussian Blur 2', 'UET Blur');
          setP(B, 'ADBE Gaussian Blur 2-0001', args.blurRadius);
          try { setP(B, 'ADBE Gaussian Blur 2-0003', 1); } catch (e1) { /* repeat edge pixels */ }
        }
        if (args.grain) {
          var a = c.layers.addSolid([0.5, 0.5, 0.5], 'UET BG Grain', args.width, args.height, 1, args.loop);
          a.adjustmentLayer = true;
          var N = addEffect(a, 'ADBE Noise', 'UET Grain');
          setP(N, 'ADBE Noise-0001', 4);
        }
        out.comp = c.name;
        if (active && args.placeInActive) {
          var L = active.layers.add(c);
          L.moveToEnd();
          if (L.canSetTimeRemapEnabled) {
            L.timeRemapEnabled = true;
            L.property('ADBE Time Remapping').expression = '// UET background\nloopOut("cycle");';
            L.outPoint = active.duration;
          }
          out.placedIn = active.name;
        } else c.openInViewer();
      });
      return K.ok(out);
    } catch (e) { return K.fail(e); }
  };
  function pad(n) { return n < 10 ? '000' + n : '00' + n; }

  // ======================= Map route =======================
  /** Positions (comp space, at the playhead) and names of the selected layers, in selection order. */
  AE.waypoints = function () {
    try {
      var comp = K.activeComp(), layers = K.selected(comp, 'two or more layers on your map (in route order)'), out = [], i;
      if (layers.length < 2) throw new Error('Select two or more layers on your map (in route order).');
      for (i = 0; i < layers.length; i++) {
        var l = layers[i], tg = l.property('ADBE Transform Group');
        if (!tg) throw new Error(l.name + ' has no position.');
        if (l.parent) throw new Error(l.name + ' is parented; unparent it or use a null as the city marker.');
        var p = tg.property('ADBE Position').valueAtTime(comp.time, false);
        out.push({ name: l.name, x: p[0], y: p[1] });
      }
      return K.ok({ points: out, width: comp.width, height: comp.height });
    } catch (e) { return K.fail(e); }
  };

  function shapeOf(pts, inT, outT, closed) {
    var sh = new Shape();
    sh.vertices = pts; sh.inTangents = inT || []; sh.outTangents = outT || []; sh.closed = !!closed;
    return sh;
  }

  /**
   * args: {tag, path:{vertices,inTangents,outTangents,arrival}, color [r,g,b], stroke, dashed, duration,
   *        pins, traveller:{position, rotation}|null}
   * The route draws on from the playhead (Trim Paths End 0 → 100).
   */
  AE.createRoute = function (json) {
    try {
      var args = JSON.parse(json), comp = K.activeComp(), t0 = comp.time, d = args.duration, warnings = [], out = {};
      K.undo('Map route', function () {
        var l = comp.layers.addShape(), i;
        l.name = 'UET Route ' + args.tag;
        l.property('ADBE Transform Group').property('ADBE Position').setValue([0, 0, 0]);
        var C = function () { return l.property('ADBE Root Vectors Group'); };
        C().addProperty('ADBE Vector Group').name = 'Route';
        var V = function () { return C().property('Route').property('ADBE Vectors Group'); };
        V().addProperty('ADBE Vector Shape - Group').name = 'Path';
        V().property('Path').property('ADBE Vector Shape').setValue(shapeOf(args.path.vertices, args.path.inTangents, args.path.outTangents, false));
        V().addProperty('ADBE Vector Graphic - Stroke');
        var S = function () { return V().property('ADBE Vector Graphic - Stroke'); };
        S().property('ADBE Vector Stroke Color').setValue(rgba(args.color));
        S().property('ADBE Vector Stroke Width').setValue(args.stroke);
        try { S().property('ADBE Vector Stroke Line Cap').setValue(2); } catch (e0) { /* optional */ }
        if (args.dashed) {
          try {
            S().property('ADBE Vector Stroke Dashes').addProperty('ADBE Vector Stroke Dash 1');
            S().property('ADBE Vector Stroke Dashes').property('ADBE Vector Stroke Dash 1').setValue(args.stroke * 2.5);
          } catch (e1) { warnings.push('dashes: ' + e1.message); }
        }
        V().addProperty('ADBE Vector Filter - Trim').name = 'Trim';
        K.keys1D(V().property('Trim').property('ADBE Vector Trim End'), [{ time: t0, value: 0 }, { time: t0 + d, value: 100, ease: 'easeInOut' }]);
        if (args.pins) {
          for (i = 0; i < args.path.vertices.length; i++) {
            var nm = 'Pin ' + (i + 1), v = args.path.vertices[i];
            C().addProperty('ADBE Vector Group').name = nm;
            var P = function () { return C().property(nm); };
            P().property('ADBE Vectors Group').addProperty('ADBE Vector Shape - Ellipse');
            P().property('ADBE Vectors Group').property('ADBE Vector Shape - Ellipse').property('ADBE Vector Ellipse Size').setValue([args.stroke * 4, args.stroke * 4]);
            P().property('ADBE Vectors Group').addProperty('ADBE Vector Graphic - Fill');
            P().property('ADBE Vectors Group').property('ADBE Vector Graphic - Fill').property('ADBE Vector Fill Color').setValue(rgba(args.color));
            P().property('ADBE Vector Transform Group').property('ADBE Vector Position').setValue([v[0], v[1]]);
            // arrival time of the line at this waypoint (the trim is eased, so this is approximate)
            var ta = t0 + d * args.path.arrival[i];
            K.keysND(P().property('ADBE Vector Transform Group').property('ADBE Vector Scale'), [{ time: ta, value: [0, 0] }, { time: ta + 0.3, value: [100, 100], ease: 'backOut' }]);
          }
        }
        l.inPoint = t0;
        out.route = l.name;
        if (args.traveller) {
          var tr = comp.layers.addShape();
          tr.name = 'UET Route Traveller ' + args.tag;
          tr.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group').name = 'Arrow';
          var A = function () { return tr.property('ADBE Root Vectors Group').property('Arrow').property('ADBE Vectors Group'); };
          var s = args.stroke * 3;
          A().addProperty('ADBE Vector Shape - Group');
          A().property('ADBE Vector Shape - Group').property('ADBE Vector Shape').setValue(shapeOf([[s * 1.6, 0], [-s, -s], [-s * 0.4, 0], [-s, s]], null, null, true));
          A().addProperty('ADBE Vector Graphic - Fill');
          A().property('ADBE Vector Graphic - Fill').property('ADBE Vector Fill Color').setValue(rgba(args.color));
          tr.property('ADBE Transform Group').property('ADBE Position').expression = args.traveller.position;
          tr.property('ADBE Transform Group').property('ADBE Rotate Z').expression = args.traveller.rotation;
          tr.inPoint = t0;
          out.traveller = tr.name;
        }
      });
      out.warnings = warnings;
      return K.ok(out);
    } catch (e) { return K.fail(e); }
  };
}(UET.aeKit, UET.ae));
