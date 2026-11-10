// Real end-to-end check on a clean macOS runner (no Homebrew whisper): install the speech engine through the
// Engine's own installer, then transcribe Turkish speech made with macOS `say`, render a styled overlay and look
// for filler words. Run by .github/workflows/whisper-macos.yml. Prints a JSON report.
const { execFileSync } = require('node:child_process');
const { existsSync, statSync, mkdirSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { join } = require('node:path');
const eng = require('../../dist/com.uet.toolkit/engine.cjs');

const work = process.env.RUNNER_TEMP || '/tmp';
const model = process.env.E2E_MODEL || 'large-v3-turbo-q5_0';
const log = (k, v) => console.log(`\n=== ${k}\n${typeof v === 'string' ? v : JSON.stringify(v, null, 1)}`);

(async () => {
  const reg = eng.createRegistry();
  let t0 = Date.now();
  const inst = await reg.call('stt.install', { model, wait: true });
  log('install', { ...inst, seconds: (Date.now() - t0) / 1000 });
  const st = await reg.call('stt.status', {});
  log('status', st);
  if (!st.ready) throw new Error('engine not ready after install');
  const mfile = st.model;
  log('model sha256', createHash('sha256').update(require('node:fs').readFileSync(mfile)).digest('hex') + '  ' + mfile);

  // Turkish speech (falls back to the default voice when no Turkish voice is installed).
  const voices = execFileSync('say', ['-v', '?']).toString();
  const tv = (voices.split('\n').find(l => /tr_TR/.test(l)) || '').split(/\s{2,}/)[0].trim();
  log('turkish voice', tv || '(none, default voice)');
  const text = 'Merhaba arkadaşlar. Bugün yeni bir eklenti deniyoruz. Altyazılar bilgisayarın içinde, ücretsiz olarak hazırlanıyor.';
  const aiff = join(work, 'speech.aiff'), mp4 = join(work, 'speech.mp4');
  execFileSync('say', [...(tv ? ['-v', tv] : []), '-o', aiff, text]);
  execFileSync(eng.FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=gray:s=640x360:r=25', '-i', aiff, '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', mp4]);

  t0 = Date.now();
  const tr = await reg.call('audio.transcribe', { file: mp4, language: 'tr', includeWords: false });
  log('transcribe', { ...tr, wall: (Date.now() - t0) / 1000 });
  if (!tr.wordCount) throw new Error('no words transcribed');
  const again = await reg.call('audio.transcribe', { file: mp4, language: 'tr' });
  log('cache hit', again.cached);

  const out = join(work, 'subs');
  mkdirSync(out, { recursive: true });
  const hasAss = await eng.ffmpegHasLibass();
  log('ffmpeg has libass', hasAss);
  const sm = await reg.call('subtitles.make', { file: mp4, language: 'tr', style: 'highlight', formats: ['srt', 'vtt', 'ass', 'json'], overlay: hasAss, width: 1080, height: 1920, fps: 30, outDir: out });
  log('subtitles.make', sm);
  if (hasAss && (!sm.overlay || !existsSync(sm.overlay.path) || statSync(sm.overlay.path).size < 1000)) throw new Error('overlay missing');
  if (hasAss) {
  const alpha = execFileSync(eng.FFMPEG, ['-v', 'error', '-ss', '0.5', '-i', sm.overlay.path, '-frames:v', '1', '-vf', 'format=rgba,alphaextract', '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
  const opaque = alpha.filter(a => a > 200).length;
  log('overlay alpha', { opaquePixels: opaque, total: alpha.length });
  if (opaque === 0 || opaque > alpha.length / 2) throw new Error('overlay is not transparent with visible text');
  }
  log('srt', require('node:fs').readFileSync(sm.files.srt, 'utf8'));

  const fillerText = 'Eee, bugün şey, ııı, yeni bir eklenti deniyoruz. Hmm, ben ben çok beğendim.';
  const faiff = join(work, 'fill.aiff');
  execFileSync('say', [...(tv ? ['-v', tv] : []), '-o', faiff, fillerText]);
  const ff = await reg.call('transcript.findFillers', { file: faiff, language: 'tr', kinds: ['sound', 'discourse', 'repeat'] });
  log('findFillers', { counts: ff.counts, fillers: ff.fillers.map(f => `${f.kind}:${f.text}@${f.start.toFixed(2)}`), removedSeconds: ff.removedSeconds });
  console.log('\nE2E OK');
})().catch(e => { console.error('E2E FAILED:', e); process.exit(1); });
