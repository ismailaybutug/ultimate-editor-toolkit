/*
 * Ultimate Editor Toolkit - Transitions for Premiere Pro (ExtendScript + QE DOM, ES3).
 * Premiere scripts cannot create adjustment layers, so a transition is applied as native video effects on the
 * two clips that meet at the cut (end of the outgoing clip, start of the incoming clip) with per-frame keys
 * compiled by @uet/core (packages/core/src/transitions/compile.ts). Values return to neutral outside the
 * transition, so the rest of each clip looks unchanged.
 * Known limits: Premiere ExtendScript has no undo group (each effect is its own undo step) and effects are found
 * by their display name, so a Premiere running in another language may need extra names (see effects.ts).
 * STATUS: UNVERIFIED in Premiere Pro until TEST_REPORT.md says otherwise. In particular the time base of
 * effect keyframes (source time vs. clip time) must be confirmed; args.keyTime switches between both.
 */
/* global app, qe, Time */
var UET = UET || {};
UET.transitions = (function () {
  var TICKS = 254016000000;

  function ok(data) { return JSON.stringify({ ok: true, data: data }); }
  function fail(e) { return JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e), line: e && e.line }); }

  function activeSeq() {
    var s = app.project.activeSequence;
    if (!s) throw new Error('Open a sequence first (no active sequence).');
    return s;
  }

  function seqFps(seq) { return 1 / seq.getSettings().videoFrameRate.seconds; }

  /** Clips on video track ti that end / start at time t (within tol seconds). */
  function clipsAt(seq, ti, t, tol) {
    var tr = seq.videoTracks[ti], res = { outClip: null, inClip: null }, i;
    for (i = 0; i < tr.clips.numItems; i++) {
      var c = tr.clips[i];
      if (!res.outClip && Math.abs(c.end.seconds - t) <= tol) res.outClip = c;
      if (!res.inClip && Math.abs(c.start.seconds - t) <= tol) res.inClip = c;
    }
    return res;
  }

  function selectedTrack(seq) {
    var t, i;
    for (t = seq.videoTracks.numTracks - 1; t >= 0; t--) {
      var tr = seq.videoTracks[t];
      for (i = 0; i < tr.clips.numItems; i++) {
        try { if (tr.clips[i].isSelected()) return t; } catch (e) { /* older API */ }
      }
    }
    return -1;
  }

  /** Find the cut at the playhead: selected clip's track first, otherwise the top-most track with a cut there. */
  function findCut(seq) {
    var fps = seqFps(seq), tol = 1 / fps + 0.0001;
    var t = seq.getPlayerPosition().seconds;
    var sel = selectedTrack(seq), tracks = [], i;
    if (sel >= 0) tracks.push(sel);
    else for (i = seq.videoTracks.numTracks - 1; i >= 0; i--) tracks.push(i);
    var best = null;
    for (i = 0; i < tracks.length; i++) {
      var r = clipsAt(seq, tracks[i], t, tol);
      if (r.outClip && r.inClip) { best = { track: tracks[i], r: r }; break; }
      if (!best && (r.outClip || r.inClip)) best = { track: tracks[i], r: r };
    }
    if (!best) throw new Error('Put the playhead on a cut between two clips (no clip starts or ends at the playhead).');
    var cut = best.r.inClip ? best.r.inClip.start.seconds : best.r.outClip.end.seconds;
    return { cut: cut, track: best.track, outClip: best.r.outClip, inClip: best.r.inClip, fps: fps };
  }

  /** Info the panel needs to compile. Changes nothing. */
  function cutInfo() {
    try {
      var seq = activeSeq();
      var c = findCut(seq);
      return ok({
        fps: c.fps, width: seq.frameSizeHorizontal, height: seq.frameSizeVertical, cut: c.cut, track: c.track,
        outClip: c.outClip ? c.outClip.name : null, inClip: c.inClip ? c.inClip.name : null, sequence: seq.name
      });
    } catch (e) { return fail(e); }
  }

  function qeTicks(x) {
    try { if (x && x.ticks !== undefined) return String(x.ticks); } catch (e) { /* fallthrough */ }
    return String(x);
  }

  /** The QE track item for a DOM clip: match by start ticks, else by order among non-empty items. */
  function qeItemFor(ti, clip, ordinal) {
    app.enableQE();
    var tr = qe.project.getActiveSequence().getVideoTrackAt(ti), i, n = 0, byOrder = null;
    var want = String(clip.start.ticks);
    for (i = 0; i < tr.numItems; i++) {
      var it = tr.getItemAt(i);
      if (!it || it.type === 'Empty') continue;
      if (qeTicks(it.start) === want) return it;
      if (n === ordinal) byOrder = it;
      n++;
    }
    if (byOrder) return byOrder;
    throw new Error('Could not find clip ' + clip.name + ' in the QE DOM.');
  }

  function ordinalOf(seq, ti, clip) {
    var tr = seq.videoTracks[ti], i;
    for (i = 0; i < tr.clips.numItems; i++) if (String(tr.clips[i].start.ticks) === String(clip.start.ticks)) return i;
    return -1;
  }

  function effectByNames(names) {
    var i, fx = null;
    for (i = 0; i < names.length && !fx; i++) { try { fx = qe.project.getVideoEffectByName(names[i]); } catch (e) { fx = null; } }
    if (fx) return fx;
    var list = '';
    try { list = String(qe.project.getVideoEffectList()).slice(0, 400); } catch (e2) { list = '(list unavailable)'; }
    throw new Error('Premiere effect not found: ' + names.join(' / ') + '. Available effects start with: ' + list);
  }

  function findParam(comp, ref) {
    var i, j, props = comp.properties;
    for (j = 0; j < ref.names.length; j++) {
      for (i = 0; i < props.numItems; i++) if (props[i].displayName === ref.names[j]) return props[i];
    }
    if (ref.index !== undefined && ref.index < props.numItems) return props[ref.index];
    throw new Error('Parameter ' + ref.names[0] + ' not found on ' + comp.displayName);
  }

  function value(ref, v) { return ref.unit === 'bool' ? !!v : v; }

  /** Constant value; colours ([r, g, b] 0..1) go through setColorValue(alpha, r, g, b) with 0..255. */
  function setParam(p, ref) {
    if (ref.unit === 'color') {
      var c = ref.value;
      p.setColorValue(255, Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255), true);
    } else {
      p.setValue(value(ref, ref.value), true);
    }
  }

  function timeObj(seconds) {
    if (typeof Time === 'undefined') return seconds;
    var t = new Time();
    t.ticks = String(Math.round(seconds * TICKS));
    return t;
  }

  /** Apply one half's effects to one clip. */
  function applyHalf(seq, ti, clip, half, cut, keyTime) {
    var ord = ordinalOf(seq, ti, clip), i, j, k;
    var cStart = clip.start.seconds, cEnd = clip.end.seconds, srcIn = clip.inPoint.seconds;
    var keys = 0;
    for (i = 0; i < half.effects.length; i++) {
      var ef = half.effects[i];
      var fx = effectByNames(ef.names);
      var before = clip.components.numItems;
      qeItemFor(ti, clip, ord).addVideoEffect(fx);
      if (clip.components.numItems <= before) throw new Error('Premiere did not add ' + ef.names[0] + ' to ' + clip.name);
      var comp = clip.components[clip.components.numItems - 1];
      for (j = 0; j < ef.set.length; j++) setParam(findParam(comp, ef.set[j]), ef.set[j]);
      for (j = 0; j < ef.tracks.length; j++) {
        var tr = ef.tracks[j], p = findParam(comp, tr);
        p.setTimeVarying(true);
        for (k = 0; k < tr.keys.length; k++) {
          var abs = cut + tr.keys[k].t;
          if (abs < cStart - 0.0001 || abs > cEnd + 0.0001) continue; // outside this clip
          var kt = keyTime === 'clip' ? abs - cStart : srcIn + (abs - cStart);
          var tm = timeObj(kt);
          p.addKey(tm);
          p.setValueAtKey(tm, value(tr, tr.keys[k].v), k === tr.keys.length - 1);
          keys++;
        }
      }
    }
    return keys;
  }

  /**
   * args: { plan: PprTransition (compileForPpro), keyTime?: 'source' | 'clip' }
   * The cut is found again at the playhead, so the timeline must not change between cutInfo and apply.
   */
  function apply(json) {
    try {
      var args = JSON.parse(json);
      var plan = args.plan;
      if (!plan || plan.host !== 'ppro') throw new Error('Expected a transition compiled for Premiere Pro.');
      var seq = activeSeq();
      var c = findCut(seq);
      if (Math.abs(plan.fps - c.fps) > 0.01) throw new Error('Transition was compiled for ' + plan.fps + ' fps but the sequence is ' + c.fps + ' fps.');
      var done = [], skipped = [], i;
      for (i = 0; i < plan.halves.length; i++) {
        var h = plan.halves[i];
        var clip = h.side === 'out' ? c.outClip : c.inClip;
        if (!clip) { skipped.push(h.side); continue; }
        var n = applyHalf(seq, c.track, clip, h, c.cut, args.keyTime || 'source');
        done.push({ side: h.side, clip: clip.name, effects: h.effects.length, keys: n });
      }
      return ok({ cut: c.cut, track: c.track + 1, applied: done, skipped: skipped });
    } catch (e) { return fail(e); }
  }

  /** Diagnostics for the H test: effects and parameters on the clips at the cut. Changes nothing. */
  function probe() {
    try {
      var seq = activeSeq();
      var c = findCut(seq), out = {}, sides = { out: c.outClip, inn: c.inClip }, s, i, j;
      for (s in sides) {
        if (!sides.hasOwnProperty(s) || !sides[s]) continue;
        var comps = [], cl = sides[s];
        for (i = 0; i < cl.components.numItems; i++) {
          var cp = cl.components[i], ps = [];
          for (j = 0; j < cp.properties.numItems; j++) {
            var pr = cp.properties[j], v = null;
            try { v = pr.getValue(); } catch (e1) { v = '?'; }
            ps.push({ name: pr.displayName, value: v, keyed: (function () { try { return pr.isTimeVarying(); } catch (e2) { return null; } }()) });
          }
          comps.push({ name: cp.displayName, match: cp.matchName, params: ps });
        }
        out[s] = { clip: cl.name, inPoint: cl.inPoint.seconds, start: cl.start.seconds, components: comps };
      }
      out.cut = c.cut;
      return ok(out);
    } catch (e) { return fail(e); }
  }

  return { cutInfo: cutInfo, apply: apply, probe: probe };
}());
