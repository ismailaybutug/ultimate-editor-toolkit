/*
 * Ultimate Editor Toolkit - Premiere Pro host library (ExtendScript, ES3).
 * Non-destructive by design: cuts build a NEW sequence; the original is never changed (TD-004).
 * STATUS: UNVERIFIED in Premiere Pro until TEST_REPORT.md says otherwise.
 */
/* global app, qe, ProjectItemType */
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

  return { ping: ping, getSelectedClipInfo: getSelectedClipInfo, addMarkers: addMarkers, buildFromRanges: buildFromRanges, qeProbe: qeProbe, TICKS: TICKS };
}());
