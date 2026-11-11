/*
 * Ultimate Editor Toolkit - Premiere Pro helpers for the subtitle module (ExtendScript, ES3).
 * Loaded after uet-ppro.jsx; adds functions to UET.ppro so the panel can call them with callHost('ppro', ...).
 * STATUS: UNVERIFIED in Premiere Pro until TEST_REPORT.md says otherwise.
 */
/* global app, ProjectItemType */
var UET = UET || {};
UET.ppro = UET.ppro || {};

(function (ns) {
  function ok(data) { return JSON.stringify({ ok: true, data: data }); }
  function fail(e) { return JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e), line: e && e.line }); }

  function activeSeq() {
    var s = app.project.activeSequence;
    if (!s) throw new Error('Açık sekans yok.');
    return s;
  }

  /** Frame size and rate of the active sequence (for rendering a matching caption overlay). */
  ns.subsSequenceInfo = function () {
    try {
      var s = activeSeq();
      var st = s.getSettings();
      return ok({ name: s.name, width: st.videoFrameWidth, height: st.videoFrameHeight, fps: 1 / st.videoFrameRate.seconds });
    } catch (e) { return fail(e); }
  };

  function findByPath(bin, path) {
    var i, it, f;
    for (i = 0; i < bin.children.numItems; i++) {
      it = bin.children[i];
      if (it.type === ProjectItemType.BIN) { f = findByPath(it, path); if (f) return f; }
      else { try { if (it.getMediaPath() === path) return it; } catch (e1) { /* not media */ } }
    }
    return null;
  }

  function trackIsFree(track, start, end) {
    var k, c;
    for (k = 0; k < track.clips.numItems; k++) {
      c = track.clips[k];
      if (c.start.seconds < end - 0.001 && c.end.seconds > start + 0.001) return false;
    }
    return true;
  }

  /**
   * Import a rendered caption overlay (.mov with alpha) and place it at `time` on the highest video track that is
   * free for its whole length. Never moves or overwrites existing clips.
   * args: { path, time, duration }
   */
  ns.subsPlaceOverlay = function (json) {
    try {
      var a = JSON.parse(json);
      var seq = activeSeq();
      var t, track = null, idx = -1;
      for (t = seq.videoTracks.numTracks - 1; t >= 0; t--) {
        if (trackIsFree(seq.videoTracks[t], a.time, a.time + a.duration)) { track = seq.videoTracks[t]; idx = t; break; }
        if (seq.videoTracks[t].clips.numItems > 0) break; // do not go below a track that is in use
      }
      if (!track) throw new Error('Üstte boş video izi yok. Sekansa bir video izi ekleyip tekrar dene.');
      app.project.importFiles([a.path], true, app.project.rootItem, false);
      var item = findByPath(app.project.rootItem, a.path);
      if (!item) throw new Error('İçe aktarılan altyazı videosu projede bulunamadı.');
      track.overwriteClip(item, a.time);
      return ok({ track: idx + 1, item: item.name });
    } catch (e) { return fail(e); }
  };
})(UET.ppro);
