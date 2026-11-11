/*
 * Ultimate Editor Toolkit - After Effects graphics: parametric titles (F-MG-01) and callouts/arrows (F-MG-06).
 * Needs uet-ae-motion.jsx (UET.aeKit incl. addTextAnimator). Adds functions to UET.ae.
 * Layout, geometry, colours and expressions come from packages/core/src/motion (titles.ts, callouts.ts).
 * STATUS: UNVERIFIED in After Effects until TEST_REPORT.md says otherwise.
 */
/* global app, UET, Shape, ParagraphJustification */
(function (K, AE) {
  var JUSTIFY = { left: 'LEFT_JUSTIFY', right: 'RIGHT_JUSTIFY', center: 'CENTER_JUSTIFY' };
  function rgba(c) { return [c[0], c[1], c[2], 1]; }

  function addText(comp, e) {
    var l = comp.layers.addText(e.text);
    var doc = l.property('ADBE Text Properties').property('ADBE Text Document'), td = doc.value;
    td.fontSize = e.fontSize;
    td.fillColor = [e.color[0], e.color[1], e.color[2]];
    td.justification = ParagraphJustification[JUSTIFY[e.justify]];
    try { td.fauxBold = !!e.bold; } catch (e1) { /* older AE */ }
    doc.setValue(td);
    l.property('ADBE Transform Group').property('ADBE Position').setValue([e.x, e.y, 0]);
    l.name = e.name;
    return l;
  }

  function contents(l) { return l.property('ADBE Root Vectors Group'); }
  /** Add a vector group named `name` to a shape layer and return a getter that re-reads it (AE invalidates refs). */
  function addGroup(l, name) {
    contents(l).addProperty('ADBE Vector Group').name = name;
    return function () { return contents(l).property(name); };
  }
  function vecs(G) { return G().property('ADBE Vectors Group'); }
  function addFill(G, color) {
    vecs(G).addProperty('ADBE Vector Graphic - Fill');
    vecs(G).property('ADBE Vector Graphic - Fill').property('ADBE Vector Fill Color').setValue(rgba(color));
  }
  function addStroke(G, color, width) {
    vecs(G).addProperty('ADBE Vector Graphic - Stroke');
    var s = function () { return vecs(G).property('ADBE Vector Graphic - Stroke'); };
    s().property('ADBE Vector Stroke Color').setValue(rgba(color));
    s().property('ADBE Vector Stroke Width').setValue(width);
    try { s().property('ADBE Vector Stroke Line Cap').setValue(2); s().property('ADBE Vector Stroke Line Join').setValue(2); } catch (e) { /* round caps optional */ }
  }
  function addPath(G, pts, closed) {
    vecs(G).addProperty('ADBE Vector Shape - Group');
    var sh = new Shape(), v = [], i;
    for (i = 0; i < pts.length; i++) v.push([pts[i][0], pts[i][1]]);
    sh.vertices = v; sh.closed = !!closed;
    vecs(G).property('ADBE Vector Shape - Group').property('ADBE Vector Shape').setValue(sh);
  }
  function groupScale(G) { return G().property('ADBE Vector Transform Group').property('ADBE Vector Scale'); }
  /** Scale a shape group from `from` to `to` between t0 and t1 with an eased curve. */
  function keys2(prop, t0, t1, from, to) {
    K.keysND(prop, [{ time: t0, value: from }, { time: t1, value: to, ease: 'expoOut' }]);
  }
  function setSpan(l, t0, t1) { l.inPoint = t0; l.outPoint = t1; }

  function addBar(comp, e, t0, t1) {
    var l = comp.layers.addShape();
    l.name = e.name;
    var G = addGroup(l, 'Bar');
    vecs(G).addProperty('ADBE Vector Shape - Rect');
    var rect = function () { return vecs(G).property('ADBE Vector Shape - Rect'); };
    rect().property('ADBE Vector Rect Size').setValue([e.width, e.height]);
    var left = e.growFrom === 'left';
    rect().property('ADBE Vector Rect Position').setValue([left ? e.width / 2 : 0, 0]);
    addFill(G, e.color);
    l.property('ADBE Transform Group').property('ADBE Position').setValue([left ? e.x : e.x + e.width / 2, e.y, 0]);
    // grow along the long side
    var alongX = e.width >= e.height;
    var zero = alongX ? [0, 100] : [100, 0];
    keys2(groupScale(G), t0, t0 + 0.5, zero, [100, 100]);
    if (t1 - 0.4 > t0 + 0.5) keys2(groupScale(G), t1 - 0.4, t1, [100, 100], zero);
    setSpan(l, t0, t1);
    return l;
  }

  function addBox(comp, e, expr, t0, t1, textLayer) {
    var l = comp.layers.addShape();
    l.name = e.name;
    var G = addGroup(l, 'Box');
    vecs(G).addProperty('ADBE Vector Shape - Rect');
    var rect = function () { return vecs(G).property('ADBE Vector Shape - Rect'); };
    rect().property('ADBE Vector Rect Size').expression = expr.size;
    rect().property('ADBE Vector Rect Position').expression = expr.position;
    rect().property('ADBE Vector Rect Roundness').setValue(e.roundness);
    addFill(G, e.color);
    l.property('ADBE Transform Group').property('ADBE Position').expression = expr.layerPosition;
    keys2(groupScale(G), t0, t0 + 0.5, [0, 100], [100, 100]);
    if (t1 - 0.4 > t0 + 0.5) keys2(groupScale(G), t1 - 0.4, t1, [100, 100], [0, 100]);
    setSpan(l, t0, t1);
    if (textLayer) l.moveAfter(textLayer);
    return l;
  }

  /** Active comp size, playhead and selected layer names (for layout in core). */
  AE.compInfo = function () {
    try {
      var c = K.activeComp(), sel = [], i, l = c.selectedLayers || [];
      for (i = 0; i < l.length; i++) sel.push(l[i].name);
      return K.ok({ width: c.width, height: c.height, time: c.time, duration: c.duration, frameRate: c.frameRate, selected: sel });
    } catch (e) { return K.fail(e); }
  };

  /**
   * args: {tag, elements (core layoutTitle, colours already [r,g,b]), boxExpr (core boxExpressions, for 'box'),
   *        duration, animIn:{name,props,plan,duration}, animOut:{...}}
   * Builds the title at the playhead in ONE undo group; all layers except the box are parented to a null.
   */
  AE.createTitle = function (json) {
    try {
      var args = JSON.parse(json), comp = K.activeComp(), warnings = [], names = [];
      var t0 = comp.time, t1 = Math.min(comp.duration, t0 + args.duration);
      if (t1 - t0 < 0.5) throw new Error('Not enough room after the playhead (move the playhead earlier).');
      K.undo('Title', function () {
        var made = [], texts = {}, boxes = [], i, e;
        for (i = 0; i < args.elements.length; i++) {
          e = args.elements[i];
          if (e.kind === 'text') {
            var tl = addText(comp, e);
            setSpan(tl, t0, t1);
            if (args.animIn) K.addTextAnimator(tl, args.animIn.name, args.animIn.props, args.animIn.plan, t0 + 0.1, warnings);
            if (args.animOut) K.addTextAnimator(tl, args.animOut.name, args.animOut.props, args.animOut.plan, t1 - args.animOut.duration, warnings);
            texts[e.name] = tl; made.push(tl);
          } else if (e.kind === 'bar') made.push(addBar(comp, e, t0, t1));
          else if (e.kind === 'box') boxes.push(e);
        }
        // boxes need their text layer to exist before the expressions are set
        for (i = 0; i < boxes.length; i++) addBox(comp, boxes[i], args.boxExpr, t0, t1, texts[boxes[i].fitTo]);
        var nul = comp.layers.addNull(t1 - t0);
        nul.name = 'UET Title ' + args.tag + ' (move me)';
        setSpan(nul, t0, t1);
        for (i = 0; i < made.length; i++) { made[i].parent = nul; names.push(made[i].name); }
        for (i = 0; i < boxes.length; i++) names.push(boxes[i].name);
        names.push(nul.name);
      });
      return K.ok({ layers: names, warnings: warnings, start: t0, end: t1 });
    } catch (e) { return K.fail(e); }
  };

  /**
   * args: {tag, geometry (core calloutGeometry), color [r,g,b], stroke, fontSize, label, duration,
   *        followExpr (core followExpression, uses the selected layer's name) , labelAnim:{name,props,plan}}
   * Target = the single selected layer (followed by expression when followExpr is given), else the comp centre.
   */
  AE.createCallout = function (json) {
    try {
      var args = JSON.parse(json), comp = K.activeComp(), sel = comp.selectedLayers, target = null, warnings = [];
      if (sel && sel.length === 1) target = sel[0];
      if (sel && sel.length > 1) throw new Error('Select one layer to point at (or none for the centre).');
      var g = args.geometry, t0 = comp.time, d = args.duration, out = {};
      K.undo('Callout', function () {
        var l = comp.layers.addShape();
        l.name = 'UET Callout ' + args.tag;
        var pos = l.property('ADBE Transform Group').property('ADBE Position');
        if (target && args.followExpr) pos.expression = args.followExpr;
        else if (target && !target.parent) pos.setValue(target.property('ADBE Transform Group').property('ADBE Position').valueAtTime(t0, false));
        else pos.setValue([comp.width / 2, comp.height / 2, 0]);

        var line = addGroup(l, 'Line');
        addPath(line, g.path, false);
        addStroke(line, args.color, args.stroke);
        vecs(line).addProperty('ADBE Vector Filter - Trim');
        var trimEnd = vecs(line).property('ADBE Vector Filter - Trim').property('ADBE Vector Trim End');
        K.keys1D(trimEnd, [{ time: t0 + d * 0.15, value: 0 }, { time: t0 + d * 0.8, value: 100, ease: 'expoOut' }]);

        if (g.dotRadius > 0) {
          var dot = addGroup(l, 'Dot');
          vecs(dot).addProperty('ADBE Vector Shape - Ellipse');
          vecs(dot).property('ADBE Vector Shape - Ellipse').property('ADBE Vector Ellipse Size').setValue([g.dotRadius * 2, g.dotRadius * 2]);
          addFill(dot, args.color);
          keys2(groupScale(dot), t0, t0 + d * 0.3, [0, 0], [100, 100]);
        }
        if (g.head) {
          var head = addGroup(l, 'Head');
          addPath(head, g.head, true);
          addFill(head, args.color);
          var tip = g.head[0], tr = head().property('ADBE Vector Transform Group');
          tr.property('ADBE Vector Anchor').setValue([tip[0], tip[1]]);
          head().property('ADBE Vector Transform Group').property('ADBE Vector Position').setValue([tip[0], tip[1]]);
          keys2(groupScale(head), t0 + d * 0.7, t0 + d, [0, 0], [100, 100]);
        }
        setSpan(l, t0, comp.duration);
        out.shape = l.name;

        if (args.label) {
          var tl = comp.layers.addText(args.label);
          var doc = tl.property('ADBE Text Properties').property('ADBE Text Document'), td = doc.value;
          td.fontSize = args.fontSize; td.fillColor = [args.color[0], args.color[1], args.color[2]];
          td.justification = ParagraphJustification[JUSTIFY[g.label.justify]];
          doc.setValue(td);
          tl.name = 'UET Callout Label ' + args.tag;
          tl.parent = l;
          // after parenting, Position is relative to the callout layer's origin (its anchor is 0,0)
          tl.property('ADBE Transform Group').property('ADBE Position').setValue([g.label.x, g.label.y, 0]);
          setSpan(tl, t0, comp.duration);
          if (args.labelAnim) K.addTextAnimator(tl, args.labelAnim.name, args.labelAnim.props, args.labelAnim.plan, t0 + d * 0.6, warnings);
          out.label = tl.name;
        }
        out.target = target ? target.name : null;
      });
      out.warnings = warnings;
      return K.ok(out);
    } catch (e) { return K.fail(e); }
  };
}(UET.aeKit, UET.ae));
