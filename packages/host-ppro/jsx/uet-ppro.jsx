/*
 * Ultimate Editor Toolkit - Premiere Pro host library (ExtendScript, ES3).
 * Non-destructive by design: cuts build a NEW sequence; the original is never changed (TD-004).
 * STATUS: UNVERIFIED in Premiere Pro until TEST_REPORT.md says otherwise.
 */
/* global app, qe, ProjectItemType, Sequence, File */
var UET = UET || {};
UET.ppro = (function () {
  var TICKS = 254016000000;

  function ok(data) { return JSON.stringify({ ok: true, data: data }); }
  function fail(e) { return JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e), line: e && e.line }); }

  function activeSeq() {
    var s = app.project.activeSequence;
    if (!s) throw new Error('Open a sequence first (no active sequence).');
    return s;
  }

  /** First selected video (or audio) clip in the active sequence. */
  function selectedClip(seq) {
    var sel = seq.getSelection();
    var i;
    for (i = 0; i < sel.length; i++) {
      if (sel[i].projectItem && sel[i].mediaType === 'Video') return sel[i];
    }
    for (i = 0; i < sel.length; i++) {
      if (sel[i].projectItem) return sel[i];
    }
    throw new Error('Select a clip on the timeline.');
  }

  function ping() {
    try {
      var s = app.project.activeSequence;
      return ok({ app: 'ppro', version: app.version, build: app.build, sequence: s ? s.name : null });
    } catch (e) { return fail(e); }
  }

  /** Info the panel needs for analysis: media file path and the used source range. */
  function getSelectedClipInfo() {
    try {
      var seq = activeSeq();
      var c = selectedClip(seq);
      var fps = 1 / seq.getSettings().videoFrameRate.seconds;
      return ok({
        name: c.name,
        mediaPath: c.projectItem.getMediaPath(),
        sourceIn: c.inPoint.seconds,
        sourceOut: c.outPoint.seconds,
        timelineStart: c.start.seconds,
        sequence: seq.name,
        sequenceFps: fps
      });
    } catch (e) { return fail(e); }
  }

  /** Add sequence markers for each range (e.g. silences to review). */
  function addMarkers(json) {
    try {
      var args = JSON.parse(json);
      var seq = activeSeq();
      var c = args.useSelection ? selectedClip(seq) : null;
      // map source time -> timeline time for the selected clip
      var offset = c ? (c.start.seconds - c.inPoint.seconds) : 0;
      var n = 0, i;
      for (i = 0; i < args.ranges.length; i++) {
        var r = args.ranges[i];
        if (c && (r.end <= c.inPoint.seconds || r.start >= c.outPoint.seconds)) continue;
        var m = seq.markers.createMarker(r.start + offset);
        m.end = r.end + offset;
        m.name = args.name || 'UET';
        m.comments = 'Ultimate Editor Toolkit';
        try { m.setColorByIndex(args.colorIndex || 1); } catch (e1) { /* older versions */ }
        n++;
      }
      return ok({ markers: n });
    } catch (e) { return fail(e); }
  }

  /**
   * Build a new sequence that contains only the KEEP ranges of the selected clip's media.
   * keep: [{start, end}] in seconds of source media.
   */
  function buildFromRanges(json) {
    try {
      var args = JSON.parse(json);
      var seq = activeSeq();
      var c = selectedClip(seq);
      var item = c.projectItem;
      var srcIn = c.inPoint.seconds, srcOut = c.outPoint.seconds;
      // Only keep ranges inside the part of the media the editor actually used.
      var keep = [], i;
      for (i = 0; i < args.keep.length; i++) {
        var s = Math.max(args.keep[i].start, srcIn), e = Math.min(args.keep[i].end, srcOut);
        if (e - s > 0.001) keep.push({ start: s, end: e });
      }
      if (keep.length === 0) throw new Error('Nothing to keep inside the selected clip.');

      // New sequence with the same settings: clone the current one, then empty it.
      var known = {}, q;
      for (q = 0; q < app.project.sequences.numSequences; q++) known[app.project.sequences[q].sequenceID] = true;
      seq.clone();
      var copy = null;
      for (q = 0; q < app.project.sequences.numSequences; q++) {
        if (!known[app.project.sequences[q].sequenceID]) { copy = app.project.sequences[q]; break; }
      }
      if (!copy) throw new Error('Could not clone the sequence.');
      copy.name = (args.name || (seq.name + ' - UET cut'));

      var t, k;
      for (t = 0; t < copy.videoTracks.numTracks; t++) {
        for (k = copy.videoTracks[t].clips.numItems - 1; k >= 0; k--) copy.videoTracks[t].clips[k].remove(false, false);
      }
      for (t = 0; t < copy.audioTracks.numTracks; t++) {
        for (k = copy.audioTracks[t].clips.numItems - 1; k >= 0; k--) copy.audioTracks[t].clips[k].remove(false, false);
      }

      // Insert each kept range back to back via in/out points on the project item.
      var cursor = 0;
      var vTrack = copy.videoTracks[0];
      for (i = 0; i < keep.length; i++) {
        item.setInPoint(keep[i].start, 4); // 4 = all media types
        item.setOutPoint(keep[i].end, 4);
        vTrack.overwriteClip(item, cursor);
        cursor += keep[i].end - keep[i].start;
      }
      item.clearInPoint(4);
      item.clearOutPoint(4);
      app.project.openSequence(copy.sequenceID);
      return ok({ sequence: copy.name, clips: keep.length, duration: cursor, original: seq.name });
    } catch (e) {
      return fail(e);
    }
  }

  function findItemByPath(bin, path) {
    var i, found = null;
    for (i = 0; i < bin.children.numItems; i++) {
      var it = bin.children[i];
      if (it.type === ProjectItemType.BIN) { var f = findItemByPath(it, path); if (f) found = f; }
      else { try { if (it.getMediaPath() === path) found = it; } catch (e1) { /* not media */ } }
    }
    return found;
  }

  /** Import an .srt and put it on a new caption track of the active sequence (times are already timeline times). */
  function importCaptions(json) {
    try {
      var args = JSON.parse(json);
      var seq = activeSeq();
      if (typeof seq.createCaptionTrack !== 'function') throw new Error('This Premiere version cannot create caption tracks from scripts.');
      app.project.importFiles([args.srtPath], true, app.project.rootItem, false);
      var item = findItemByPath(app.project.rootItem, args.srtPath);
      if (!item) throw new Error('Imported captions not found in the project.');
      var fmt = (typeof Sequence !== 'undefined' && Sequence.CAPTION_FORMAT_SUBTITLE) ? Sequence.CAPTION_FORMAT_SUBTITLE : undefined;
      var res = fmt === undefined ? seq.createCaptionTrack(item, 0) : seq.createCaptionTrack(item, 0, fmt);
      return ok({ item: item.name, created: res !== false });
    } catch (e) { return fail(e); }
  }

  /**
   * Export the frame under the playhead as PNG (F-PROD-06). Uses the QE DOM (as in Adobe's PProPanel sample).
   * args.folder: output folder; args.importToProject: also import the PNG.
   */
  function exportFrame(json) {
    try {
      var args = JSON.parse(json);
      var seq = activeSeq();
      app.enableQE();
      var qs = qe.project.getActiveSequence();
      if (!qs) throw new Error('QE: no active sequence.');
      var tc = qs.CTI.timecode;
      var safeName = String(seq.name).replace(/[^A-Za-z0-9_\-]+/g, '_');
      var base = args.folder + '/' + safeName + '_' + String(tc).replace(/[^0-9]+/g, '-');
      qs.exportFramePNG(tc, base);
      var f = new File(base + '.png');
      var path = f.exists ? f.fsName : (new File(base).exists ? new File(base).fsName : base + '.png');
      var imported = false;
      if (args.importToProject && new File(path).exists) {
        app.project.importFiles([path], true, app.project.rootItem, false);
        imported = true;
      }
      return ok({ path: path, timecode: tc, exists: new File(path).exists, imported: imported });
    } catch (e) { return fail(e); }
  }

  var TIDY = {
    'UET Video': /\.(mp4|mov|mxf|avi|mkv|m4v|mts|m2ts|r3d|braw|webm|wmv|3gp)$/i,
    'UET Audio': /\.(wav|mp3|aac|m4a|aif|aiff|flac|ogg|wma)$/i,
    'UET Images': /\.(png|jpe?g|tiff?|psd|gif|webp|heic|exr|dpx|bmp|svg|ai|eps)$/i,
    'UET Graphics': /\.(mogrt|aegraphic|prproj|aep)$/i
  };

  function findOrCreateBin(name) {
    var root = app.project.rootItem, i;
    for (i = 0; i < root.children.numItems; i++) {
      var c = root.children[i];
      if (c.type === ProjectItemType.BIN && c.name === name) return c;
    }
    return root.createBin(name);
  }

  /**
   * Project Tidy (F-PROD-02): move ROOT-level items into bins by type. Items already inside bins are left alone.
   * args.dryRun: only report. Returns moved nodeIds so untidy() can put them back.
   */
  function tidyProject(json) {
    try {
      var args = JSON.parse(json || '{}');
      var root = app.project.rootItem, plan = [], i;
      for (i = 0; i < root.children.numItems; i++) {
        var it = root.children[i];
        if (it.type === ProjectItemType.BIN) continue;
        var bin = null, path = '';
        try { if (it.isSequence && it.isSequence()) bin = 'UET Sequences'; } catch (e1) { /* older */ }
        if (!bin) {
          try { path = it.getMediaPath() || ''; } catch (e2) { path = ''; }
          var k;
          for (k in TIDY) { if (TIDY.hasOwnProperty(k) && TIDY[k].test(path)) { bin = k; break; } }
        }
        if (!bin) bin = 'UET Other';
        plan.push({ item: it, nodeId: it.nodeId, name: it.name, bin: bin });
      }
      var counts = {}, moved = [];
      for (i = 0; i < plan.length; i++) counts[plan[i].bin] = (counts[plan[i].bin] || 0) + 1;
      if (!args.dryRun) {
        var bins = {};
        for (i = 0; i < plan.length; i++) {
          var b = bins[plan[i].bin] || (bins[plan[i].bin] = findOrCreateBin(plan[i].bin));
          plan[i].item.moveBin(b);
          moved.push(plan[i].nodeId);
        }
      }
      return ok({ items: plan.length, bins: counts, moved: moved, dryRun: !!args.dryRun });
    } catch (e) { return fail(e); }
  }

  function findByNodeId(bin, id) {
    var i;
    for (i = 0; i < bin.children.numItems; i++) {
      var c = bin.children[i];
      if (c.nodeId === id) return c;
      if (c.type === ProjectItemType.BIN) { var f = findByNodeId(c, id); if (f) return f; }
    }
    return null;
  }

  /** Undo tidyProject: move the given nodeIds back to the project root; remove UET bins that became empty. */
  function untidyProject(json) {
    try {
      var args = JSON.parse(json), root = app.project.rootItem, n = 0, i;
      for (i = 0; i < args.moved.length; i++) {
        var it = findByNodeId(root, args.moved[i]);
        if (it) { it.moveBin(root); n++; }
      }
      for (i = root.children.numItems - 1; i >= 0; i--) {
        var c = root.children[i];
        if (c.type === ProjectItemType.BIN && /^UET /.test(c.name) && c.children.numItems === 0) c.deleteBin();
      }
      return ok({ restored: n });
    } catch (e) { return fail(e); }
  }

  function volumeLevel(clip) {
    var comps = clip.components, i, j;
    for (i = 0; i < comps.numItems; i++) {
      var c = comps[i];
      if (c.matchName === 'Internal Volume Stereo' || c.matchName === 'Internal Volume Mono' || c.displayName === 'Volume') {
        for (j = 0; j < c.properties.numItems; j++) if (c.properties[j].displayName === 'Level') return c.properties[j];
        // non-English Premiere: Level is the 2nd param (after Bypass)
        if (c.properties.numItems > 1) return c.properties[1];
      }
    }
    return null;
  }

  /**
   * Music ducking (F-AU-03). args: { trackIndex (audio track, 0-based), keys: [{t (timeline s), db}], undo?: [nodeIds] }
   * Adds Volume Level keyframes to every clip on the track that overlaps the keys. Clips that already have
   * volume keyframes are skipped (never overwrites the editor's work). Returns touched clip ids for unduck.
   * Keyframe time base = source media time (timeline - clip.start + clip.inPoint). UNVERIFIED in Premiere.
   */
  function duckTrack(json) {
    try {
      var args = JSON.parse(json);
      var seq = activeSeq();
      if (args.trackIndex >= seq.audioTracks.numTracks) throw new Error('Audio track A' + (args.trackIndex + 1) + ' does not exist.');
      var track = seq.audioTracks[args.trackIndex], touched = [], skipped = 0, nkeys = 0, i, k;
      for (i = 0; i < track.clips.numItems; i++) {
        var clip = track.clips[i];
        var t0 = clip.start.seconds, t1 = clip.end.seconds, inP = clip.inPoint.seconds;
        var inside = [];
        for (k = 0; k < args.keys.length; k++) if (args.keys[k].t >= t0 && args.keys[k].t <= t1) inside.push(args.keys[k]);
        if (!inside.length) continue;
        var lvl = volumeLevel(clip);
        if (!lvl) { skipped++; continue; }
        if (lvl.isTimeVarying()) { skipped++; continue; }
        var base = lvl.getValue();
        lvl.setTimeVarying(true);
        for (k = 0; k < inside.length; k++) {
          var st = inside[k].t - t0 + inP;
          lvl.addKey(st);
          lvl.setValueAtKey(st, base * Math.pow(10, inside[k].db / 20), true);
          nkeys++;
        }
        touched.push({ nodeId: clip.nodeId, base: base });
      }
      return ok({ clips: touched.length, keys: nkeys, skipped: skipped, touched: touched });
    } catch (e) { return fail(e); }
  }

  /** Undo duckTrack: clear keyframes on the clips it touched and restore their level. */
  function unduckTrack(json) {
    try {
      var args = JSON.parse(json);
      var seq = activeSeq(), track = seq.audioTracks[args.trackIndex], n = 0, i, k;
      for (i = 0; i < track.clips.numItems; i++) {
        var clip = track.clips[i];
        for (k = 0; k < args.touched.length; k++) {
          if (args.touched[k].nodeId === clip.nodeId) {
            var lvl = volumeLevel(clip);
            if (lvl) { lvl.setTimeVarying(false); lvl.setValue(args.touched[k].base, true); n++; }
          }
        }
      }
      return ok({ restored: n });
    } catch (e) { return fail(e); }
  }

  function motionScale(clip) {
    var i, j;
    for (i = 0; i < clip.components.numItems; i++) {
      var c = clip.components[i];
      if (c.matchName === 'AE.ADBE Motion' || c.displayName === 'Motion') {
        for (j = 0; j < c.properties.numItems; j++) if (c.properties[j].displayName === 'Scale') return c.properties[j];
        return c.properties.numItems > 1 ? c.properties[1] : null; // Position, Scale, …
      }
    }
    return null;
  }

  /**
   * Reframe (F-FMT-03): clone the active sequence into a new one with another frame size and rescale every
   * video clip to fill (crop) or fit (letterbox) the new frame. Original sequence untouched. UNVERIFIED in Premiere.
   * args: { width, height, mode: 'fill'|'fit', name? }
   */
  function reframeSequence(json) {
    try {
      var args = JSON.parse(json);
      var seq = activeSeq();
      var s0 = seq.getSettings();
      var w0 = s0.videoFrameWidth, h0 = s0.videoFrameHeight;
      var known = {}, q;
      for (q = 0; q < app.project.sequences.numSequences; q++) known[app.project.sequences[q].sequenceID] = true;
      seq.clone();
      var copy = null;
      for (q = 0; q < app.project.sequences.numSequences; q++) if (!known[app.project.sequences[q].sequenceID]) { copy = app.project.sequences[q]; break; }
      if (!copy) throw new Error('Could not clone the sequence.');
      copy.name = args.name || (seq.name + ' - ' + args.width + 'x' + args.height);
      var s = copy.getSettings();
      s.videoFrameWidth = args.width; s.videoFrameHeight = args.height;
      copy.setSettings(s);
      var sx = args.width / w0, sy = args.height / h0;
      var f = args.mode === 'fit' ? Math.min(sx, sy) : Math.max(sx, sy);
      var n = 0, skipped = 0, t, k;
      for (t = 0; t < copy.videoTracks.numTracks; t++) {
        var clips = copy.videoTracks[t].clips;
        for (k = 0; k < clips.numItems; k++) {
          var sc = motionScale(clips[k]);
          if (!sc) { skipped++; continue; }
          if (sc.isTimeVarying()) { skipped++; continue; } // keyed scale: leave for the editor
          sc.setValue(sc.getValue() * f, true);
          n++;
        }
      }
      app.project.openSequence(copy.sequenceID);
      return ok({ sequence: copy.name, width: args.width, height: args.height, factor: Math.round(f * 1000) / 1000, clips: n, skipped: skipped, original: seq.name });
    } catch (e) { return fail(e); }
  }

  /** Spike S2: report which QE DOM features exist on this Premiere build. Changes nothing. */
  function qeProbe() {
    try {
      app.enableQE();
      var out = { qe: typeof qe !== 'undefined' };
      if (out.qe) {
        var s = qe.project.getActiveSequence();
        out.activeSequence = !!s;
        if (s) {
          var tr = s.getVideoTrackAt(0);
          out.razor = typeof tr.razor === 'function';
          var item = tr.getItemAt(0);
          out.setSpeed = !!(item && typeof item.setSpeed === 'function');
        }
      }
      return ok(out);
    } catch (e) { return fail(e); }
  }

  return { ping: ping, getSelectedClipInfo: getSelectedClipInfo, addMarkers: addMarkers, buildFromRanges: buildFromRanges, importCaptions: importCaptions, exportFrame: exportFrame, tidyProject: tidyProject, untidyProject: untidyProject, duckTrack: duckTrack, unduckTrack: unduckTrack, reframeSequence: reframeSequence, qeProbe: qeProbe, TICKS: TICKS };
}());
