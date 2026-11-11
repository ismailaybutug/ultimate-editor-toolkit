/**
 * Subtitle module (Premiere): local speech engine setup, styled subtitles, filler-word cleanup.
 * Engine tools: stt.status, stt.install, subtitles.make, transcript.findFillers (packages/engine/src/stt-tools.ts).
 * Host helpers: jsx/uet-ppro-subtitles.jsx (+ getSelectedClipInfo, importCaptions, addMarkers, buildFromRanges from uet-ppro.jsx).
 * STATUS: UNVERIFIED in Premiere until TEST_REPORT.md has an H result.
 */
import { z } from 'zod';
import { CAPTION_STYLES, youtubeChapters } from '@uet/core';
import type { PanelContext, PanelModule } from './types';

const styleOptions = CAPTION_STYLES.map(s => `<option value="${s.id}">${s.name.tr}</option>`).join('');
const langOptions = '<option value="tr">Türkçe</option><option value="en">İngilizce</option><option value="auto">Otomatik</option>';

const viewsHtml = `
<section class="view" id="v-subtitles" data-app="PPRO">
  <div class="box2" id="sttSetup" style="display:none">
    <p class="note" id="sttMsg">Altyazı motoru bu Mac'te henüz kurulu değil. Bir kez kurulur, ücretsizdir ve internet olmadan çalışır.</p>
    <label>Kalite <select id="sttModel"><option value="large-v3-turbo-q5_0">En iyi · 550 MB</option><option value="small">Orta · 470 MB</option><option value="base">Hızlı · 140 MB</option></select></label>
    <progress id="sttProg" max="100" value="0" style="width:100%;display:none"></progress>
    <button class="btn" id="sttInstall">Motoru kur</button>
  </div>
  <div class="box2">
    <p class="note">Seçili klibi Mac'inde yazıya döker (whisper.cpp, ücretsiz, internet gerekmez).</p>
    <label>Dil <select id="subLang2">${langOptions}</select></label>
    <label>Stil <select id="subStyle">${styleOptions}</select></label>
    <label>Altyazı izi (SRT) ekle <input id="subTrack" type="checkbox" checked></label>
    <label>Stilli altyazı videosu ekle <input id="subOverlay" type="checkbox"></label>
    <label>İngilizce altyazı (çeviri) <input id="subTranslate" type="checkbox"></label>
    <label>Vurgulanacak kelimeler <input id="subKeywords" type="text" placeholder="ör. indirim, yeni" style="width:130px"></label>
    <p class="note">Stilli video: seçtiğin stil ve animasyonla şeffaf bir klip üretir ve en üst boş video izine koyar.</p>
    <progress id="subProg" max="100" value="0" style="width:100%;display:none"></progress>
  </div>
  <button class="btn" id="subMake">Altyazı oluştur</button>
  <button class="btn secondary" id="subFromSrt">Hazır SRT dosyasını bu stille videoya çevir</button>
  <div class="box2" style="margin-top:8px">
    <p class="note">Düzeltme listesi: hep yanlış yazılan kelimeler. Her satıra <b>yanlış =&gt; doğru</b> yaz (ör. ümitcan =&gt; Umutcan).</p>
    <textarea id="subCorr" rows="4" style="width:100%;box-sizing:border-box;background:var(--bg2);color:var(--text);border:1px solid var(--line);border-radius:7px"></textarea>
    <button class="btn secondary" id="subCorrSave">Listeyi kaydet</button>
  </div>
</section>
<section class="view" id="v-chapters" data-app="PPRO">
  <div class="box2">
    <p class="note">Seçili klipte konunun değiştiği yerleri bulur, sekansa marker koyar ve YouTube açıklamasına yapıştırılacak bölüm listesini hazırlar. Yapay zekâ kullanmaz.</p>
    <label>Dil <select id="chLang">${langOptions}</select></label>
    <label>En kısa bölüm (sn) <input id="chMin" type="number" step="10" value="60"></label>
    <progress id="chProg" max="100" value="0" style="width:100%;display:none"></progress>
  </div>
  <button class="btn" id="chFind">Bölümleri bul ve marker koy</button>
  <textarea id="chOut" rows="6" readonly style="width:100%;box-sizing:border-box;margin-top:8px;background:var(--bg2);color:var(--text);border:1px solid var(--line);border-radius:7px"></textarea>
</section>
<section class="view" id="v-fillers" data-app="PPRO">
  <div class="box2">
    <p class="note">Seçili klipte "eee, ııı, hmm" seslerini ve takılmaları (ben ben) bulur. Orijinal sekansa dokunmaz.</p>
    <label>Dil <select id="filLang">${langOptions}</select></label>
    <label>"yani, hani, işte" de say <input id="filDiscourse" type="checkbox"></label>
    <label>Tekrarlanan kelimeler <input id="filRepeat" type="checkbox" checked></label>
    <label>Tekrar çekimler (sonuncuyu tut) <input id="filRetake" type="checkbox" checked></label>
    <progress id="filProg" max="100" value="0" style="width:100%;display:none"></progress>
  </div>
  <button class="btn" id="filFind">Bul ve marker koy</button>
  <button class="btn secondary" id="filCut" disabled>Temizlenmiş yeni sekans kur</button>
</section>`;

let lastFillers: { keep: { start: number; end: number }[]; cut: { start: number; end: number }[] } | null = null;

function engineOf(ctx: PanelContext) {
  const e = ctx.engine();
  if (!e) throw new Error('Motor çalışmıyor.');
  return e;
}

/** Show transcription progress from stt.status while `work` runs. */
async function withProgress<T>(ctx: PanelContext, barId: string, work: Promise<T>): Promise<T> {
  const bar = ctx.$<HTMLProgressElement>(barId);
  bar.style.display = ''; bar.value = 0;
  const timer = setInterval(async () => {
    try { const s = await ctx.engine()?.call('stt.status', {}); if (s?.job) bar.value = s.job.percent; } catch { /* ignore */ }
  }, 1000);
  try { return await work; } finally { clearInterval(timer); bar.style.display = 'none'; }
}

async function ensureReady(ctx: PanelContext): Promise<void> {
  const s = await engineOf(ctx).call('stt.status', {});
  if (!s.ready) throw new Error('Önce altyazı motorunu kur (yukarıdaki "Motoru kur" düğmesi).');
}

export async function makeStyledSubtitles(ctx: PanelContext, p: { language: string; style: string; track: boolean; overlay: boolean; translate?: boolean; keywords?: string[] }) {
  const e = engineOf(ctx);
  await ensureReady(ctx);
  const info = await ctx.callHost<any>('ppro', 'getSelectedClipInfo');
  if (!info.ok) throw new Error(info.error);
  const d = info.data;
  const seq = await ctx.callHost<any>('ppro', 'subsSequenceInfo');
  if (!seq.ok) throw new Error(seq.error);
  const timeline = { sourceIn: d.sourceIn, sourceOut: d.sourceOut, timelineStart: d.timelineStart };
  const r = await withProgress(ctx, 'subProg', e.call('subtitles.make', {
    file: d.mediaPath, language: p.language, style: p.style, formats: ['srt', 'json'], overlay: p.overlay,
    width: seq.data.width, height: seq.data.height, fps: seq.data.fps, timeline, translate: !!p.translate, keywords: p.keywords ?? [],
  }));
  const out = { clip: d.name, captions: r.captions, corrected: r.corrected, language: r.language, timing: r.timing, cached: r.cached, srt: r.files.srt, track: false, overlay: null as null | number };
  if (p.track && r.captions > 0) {
    const h = await ctx.callHost<any>('ppro', 'importCaptions', { srtPath: r.files.srt });
    if (!h.ok) throw new Error(`SRT hazır (${r.files.srt}) ama sekansa eklenemedi: ${h.error}`);
    out.track = true;
  }
  if (r.overlay) {
    const h = await ctx.callHost<any>('ppro', 'subsPlaceOverlay', { path: r.overlay.path, time: r.overlay.timelineStart, duration: r.overlay.duration });
    if (!h.ok) throw new Error(`Stilli altyazı videosu hazır (${r.overlay.path}) ama sekansa konamadı: ${h.error}`);
    out.overlay = h.data.track;
  }
  return out;
}

/** Styled overlay from an existing .srt/.vtt (timeline times), placed at the start of the sequence. */
export async function styleSrtFile(ctx: PanelContext, p: { srtPath: string; style: string; keywords?: string[] }) {
  const e = engineOf(ctx);
  const seq = await ctx.callHost<any>('ppro', 'subsSequenceInfo');
  if (!seq.ok) throw new Error(seq.error);
  const r = await e.call('subtitles.make', { file: p.srtPath, srtIn: p.srtPath, style: p.style, formats: ['json'], overlay: true,
    width: seq.data.width, height: seq.data.height, fps: seq.data.fps, keywords: p.keywords ?? [] });
  const h = await ctx.callHost<any>('ppro', 'subsPlaceOverlay', { path: r.overlay.path, time: 0, duration: r.overlay.duration });
  if (!h.ok) throw new Error(`Stilli altyazı videosu hazır (${r.overlay.path}) ama sekansa konamadı: ${h.error}`);
  return { captions: r.captions, track: h.data.track, path: r.overlay.path };
}

export async function chaptersAction(ctx: PanelContext, p: { language: string; minLength: number; markers: boolean }) {
  const e = engineOf(ctx);
  await ensureReady(ctx);
  const info = await ctx.callHost<any>('ppro', 'getSelectedClipInfo');
  if (!info.ok) throw new Error(info.error);
  const d = info.data;
  const r = await withProgress(ctx, 'chProg', e.call('transcript.chapters', { file: d.mediaPath, language: p.language, minLength: p.minLength,
    timeline: { sourceIn: d.sourceIn, sourceOut: d.sourceOut, timelineStart: d.timelineStart } }));
  let markers = 0;
  if (p.markers && r.chapters.length) {
    // addMarkers takes media times of the selected clip and moves them to the timeline itself.
    const m = await ctx.callHost<any>('ppro', 'addMarkers', { ranges: r.chapters.map((c: any) => ({ start: c.start + d.sourceIn, end: c.start + d.sourceIn })), name: 'UET bölüm', useSelection: true, colorIndex: 5 });
    if (!m.ok) throw new Error(m.error);
    markers = m.data.markers;
  }
  const youtube = youtubeChapters(r.chapters.map((c: any) => ({ ...c, start: Math.round(c.time) })));
  return { clip: d.name, chapters: r.chapters.length, markers, youtube, enoughForYoutube: r.enoughForYoutube };
}

export async function findFillersAction(ctx: PanelContext, p: { language: string; discourse: boolean; repeat: boolean; markers: boolean; retakes?: boolean }) {
  const e = engineOf(ctx);
  await ensureReady(ctx);
  const info = await ctx.callHost<any>('ppro', 'getSelectedClipInfo');
  if (!info.ok) throw new Error(info.error);
  const d = info.data;
  const kinds = ['sound', ...(p.discourse ? ['discourse'] : []), ...(p.repeat ? ['repeat'] : [])];
  const r = await withProgress(ctx, 'filProg', e.call('transcript.findFillers', { file: d.mediaPath, language: p.language, kinds, fps: d.sequenceFps, retakes: p.retakes !== false }));
  // Only what lies inside the used part of the clip counts.
  const inside = r.fillers.filter((f: any) => f.end > d.sourceIn && f.start < d.sourceOut);
  const retakes = (r.retakes ?? []).filter((f: any) => f.end > d.sourceIn && f.start < d.sourceOut);
  lastFillers = { keep: r.keep, cut: r.cut };
  let markers = 0;
  if (p.markers && inside.length) {
    const m = await ctx.callHost<any>('ppro', 'addMarkers', { ranges: inside.map((f: any) => ({ start: f.start, end: f.end })), name: 'UET dolgu', useSelection: true, colorIndex: 3 });
    if (!m.ok) throw new Error(m.error);
    markers = m.data.markers;
  }
  if (p.markers && retakes.length) {
    const m = await ctx.callHost<any>('ppro', 'addMarkers', { ranges: retakes.map((f: any) => ({ start: f.start, end: f.end })), name: 'UET tekrar çekim', useSelection: true, colorIndex: 1 });
    if (!m.ok) throw new Error(m.error);
    markers += m.data.markers;
  }
  return { clip: d.name, found: inside.length, retakes: retakes.length, counts: r.counts, removedSeconds: r.removedSeconds, markers, words: inside.slice(0, 12).map((f: any) => f.text) };
}

const keywordsOf = (ctx: PanelContext) => ctx.$<HTMLInputElement>('subKeywords').value.split(',').map(x => x.trim()).filter(Boolean);

async function refreshSetup(ctx: PanelContext) {
  const e = ctx.engine();
  if (!e) return;
  const s = await e.call('stt.status', {});
  const box = ctx.$('sttSetup'), prog = ctx.$<HTMLProgressElement>('sttProg'), msg = ctx.$('sttMsg');
  const btn = ctx.$<HTMLButtonElement>('sttInstall');
  if (s.ready) { box.style.display = 'none'; return; }
  box.style.display = '';
  if (!s.supported) { msg.textContent = 'Hazır motor yalnızca Apple Silicon Mac için var. Bu bilgisayarda whisper.cpp elle kurulmalı.'; btn.disabled = true; return; }
  const st = s.setup;
  if (st.phase === 'binary' || st.phase === 'model' || st.phase === 'checking') {
    btn.disabled = true; prog.style.display = ''; prog.value = st.percent;
    msg.textContent = st.phase === 'model' ? `Dil modeli iniyor: ${st.receivedMb} / ${st.totalMb} MB` : st.phase === 'binary' ? 'Motor iniyor...' : 'Kontrol ediliyor...';
    setTimeout(() => refreshSetup(ctx), 1000);
  } else if (st.phase === 'error') {
    btn.disabled = false; prog.style.display = 'none'; msg.textContent = `Kurulum olmadı: ${st.error} Tekrar deneyebilirsin.`;
  } else if (st.phase === 'done') {
    box.style.display = 'none'; ctx.log('Altyazı motoru kuruldu.', 'ok');
  }
}

export const subtitlesModule: PanelModule = {
  id: 'subtitles',
  catalog: [
    { id: 'subtitles', app: 'PPRO', cat: 'subs', title: 'Altyazı', desc: 'Yerel ve ücretsiz: SRT, altyazı izi, stilli animasyonlu altyazı', status: 'beta', preview: 'captions',
      view: 'v-subtitles', keys: 'altyazı caption srt whisper transkript stil reels karaoke', feature: 'F-SUB-01' },
    { id: 'karaoke', app: 'PPRO', cat: 'subs', title: 'Karaoke Altyazı', desc: 'Kelime kelime renk vurgusu (Altyazı aracında stil seç)', status: 'beta', preview: 'captions',
      view: 'v-subtitles', keys: 'karaoke kelime vurgu highlight', feature: 'F-SUB-03' },
    { id: 'roughcut', app: 'PPRO', cat: 'edit', title: 'Dolgu Kelime Temizleyici', desc: 'Eee/ııı ve takılmaları bul, marker koy ya da temiz sekans kur', status: 'beta', preview: 'wave',
      view: 'v-fillers', keys: 'filler eee ııı tekrar kaba kurgu dolgu retake', feature: 'F-AI-04' },
    { id: 'stacked', app: 'PPRO', cat: 'subs', title: 'Premium Altyazı', desc: 'Katmanlı vurgu ve anahtar kelime rengi (Altyazı aracında stil seç)', status: 'beta', preview: 'captions',
      view: 'v-subtitles', keys: 'premium katmanlı anahtar kelime vurgu stacked', feature: 'F-SUB-02' },
    { id: 'chapters', app: 'PPRO', cat: 'edit', title: 'Bölüm Bulucu', desc: 'Konuşmadan YouTube bölümleri ve marker', status: 'beta', preview: 'grid',
      view: 'v-chapters', keys: 'bölüm chapter youtube zaman damgası timestamp', feature: 'F-FMT-05' },
  ],
  viewsHtml,
  jsx: ['jsx/uet-ppro-subtitles.jsx'],
  setup(ctx) {
    if (ctx.hostApp !== 'PPRO') return;
    const wait = setInterval(() => { if (ctx.engine()) { clearInterval(wait); refreshSetup(ctx).catch(() => undefined); } }, 500);
    const inst = ctx.$<HTMLButtonElement>('sttInstall');
    inst.onclick = ctx.busy(inst, async () => {
      await engineOf(ctx).call('stt.install', { model: ctx.$<HTMLSelectElement>('sttModel').value });
      await refreshSetup(ctx);
    });
    const make = ctx.$<HTMLButtonElement>('subMake');
    make.onclick = ctx.busy(make, async () => {
      ctx.log('Yazıya dökülüyor...');
      const r = await makeStyledSubtitles(ctx, {
        language: ctx.$<HTMLSelectElement>('subLang2').value, style: ctx.$<HTMLSelectElement>('subStyle').value,
        track: ctx.$<HTMLInputElement>('subTrack').checked, overlay: ctx.$<HTMLInputElement>('subOverlay').checked,
        translate: ctx.$<HTMLInputElement>('subTranslate').checked, keywords: keywordsOf(ctx),
      });
      ctx.log(`${r.clip}: ${r.captions} altyazı satırı (${r.cached ? 'önceki sonuç kullanıldı' : `${r.timing.elapsedSeconds} sn`}).` +
        `${r.track ? ' Altyazı izi eklendi.' : ''}${r.overlay ? ` Stilli altyazı videosu V${r.overlay} izine kondu.` : ''} SRT: ${r.srt}`, 'ok');
    });
    const fromSrt = ctx.$<HTMLButtonElement>('subFromSrt');
    fromSrt.onclick = ctx.busy(fromSrt, async () => {
      const dlg = (window as any).cep?.fs?.showOpenDialog?.(false, false, 'SRT dosyası seç', '', ['srt', 'vtt']);
      const path = dlg && !dlg.err && dlg.data && dlg.data[0];
      if (!path) return;
      const r = await styleSrtFile(ctx, { srtPath: path, style: ctx.$<HTMLSelectElement>('subStyle').value, keywords: keywordsOf(ctx) });
      ctx.log(`${r.captions} altyazı satırı stilli videoya çevrildi ve V${r.track} izine kondu (sekansın başından).`, 'ok');
    });
    const corr = ctx.$<HTMLTextAreaElement>('subCorr');
    const loadCorr = setInterval(async () => {
      const e = ctx.engine(); if (!e) return; clearInterval(loadCorr);
      try { corr.value = (await e.call('subtitles.corrections', {})).text; } catch { /* ignore */ }
    }, 500);
    const corrSave = ctx.$<HTMLButtonElement>('subCorrSave');
    corrSave.onclick = ctx.busy(corrSave, async () => {
      const r = await engineOf(ctx).call('subtitles.corrections', { text: corr.value });
      ctx.log(`Düzeltme listesi kaydedildi (${r.rules.length} kural). Sonraki altyazılarda kullanılacak.`, 'ok');
    });
    const ch = ctx.$<HTMLButtonElement>('chFind');
    ch.onclick = ctx.busy(ch, async () => {
      ctx.log('Bölümler aranıyor...');
      const r = await chaptersAction(ctx, { language: ctx.$<HTMLSelectElement>('chLang').value, minLength: Number(ctx.$<HTMLInputElement>('chMin').value) || 60, markers: true });
      ctx.$<HTMLTextAreaElement>('chOut').value = r.youtube;
      ctx.log(`${r.clip}: ${r.chapters} bölüm, ${r.markers} marker.${r.enoughForYoutube ? '' : ' YouTube en az 3 bölüm ister; video kısa olabilir.'}`, 'ok');
    });
    const find = ctx.$<HTMLButtonElement>('filFind');
    find.onclick = ctx.busy(find, async () => {
      ctx.log('Dolgu kelimeler aranıyor...');
      const r = await findFillersAction(ctx, { language: ctx.$<HTMLSelectElement>('filLang').value, discourse: ctx.$<HTMLInputElement>('filDiscourse').checked, repeat: ctx.$<HTMLInputElement>('filRepeat').checked, retakes: ctx.$<HTMLInputElement>('filRetake').checked, markers: true });
      ctx.log(r.found || !r.retakes ? `${r.clip}: ${r.found} dolgu bulundu (${r.words.join(', ')}${r.found > r.words.length ? ', ...' : ''}). ${r.markers} marker eklendi, ${r.removedSeconds} sn çıkarılabilir.`
        : `${r.clip}: dolgu kelime bulunamadı.`, 'ok');
      if (r.retakes) ctx.log(`${r.retakes} tekrar çekim bulundu; sonuncular tutulacak.`, 'ok');
      ctx.$<HTMLButtonElement>('filCut').disabled = !r.found && !r.retakes;
    });
    const cut = ctx.$<HTMLButtonElement>('filCut');
    cut.onclick = ctx.busy(cut, async () => {
      if (!lastFillers) return;
      const r = await ctx.callHost<any>('ppro', 'buildFromRanges', { keep: lastFillers.keep });
      if (!r.ok) throw new Error(r.error);
      ctx.log(`Yeni sekans: "${r.data.sequence}" (${r.data.clips} parça). Orijinal "${r.data.original}" değişmedi.`, 'ok');
    });
  },
  registerTools(reg, ctx) {
    reg.register({
      id: 'ppro.subtitles', app: 'ppro', destructive: true,
      title: { en: `Subtitle the selected Premiere clip locally: caption track (SRT) and/or a styled animated overlay. Styles: ${CAPTION_STYLES.map(s => s.id).join(', ')}`, tr: 'Altyazı oluştur' },
      params: z.object({ language: z.string().default('tr'), style: z.string().default('clean'), track: z.boolean().default(true), overlay: z.boolean().default(false),
        translate: z.boolean().default(false), keywords: z.array(z.string()).default([]) }),
      run: (p: any) => makeStyledSubtitles(ctx, p),
    });
    reg.register({
      id: 'ppro.findFillers', app: 'ppro', destructive: true,
      title: { en: 'Find filler words (um/uh, eee/ııı, stutters) in the selected Premiere clip and mark them', tr: 'Dolgu kelimeleri bul' },
      params: z.object({ language: z.string().default('tr'), discourse: z.boolean().default(false), repeat: z.boolean().default(true), markers: z.boolean().default(true), retakes: z.boolean().default(true) }),
      run: (p: any) => findFillersAction(ctx, p),
    });
    reg.register({
      id: 'ppro.chapters', app: 'ppro', destructive: true,
      title: { en: 'Suggest chapters from speech in the selected Premiere clip, add chapter markers, return a YouTube chapter list', tr: 'Bölüm bul' },
      params: z.object({ language: z.string().default('tr'), minLength: z.number().min(10).default(60), markers: z.boolean().default(true) }),
      run: (p: any) => chaptersAction(ctx, p),
    });
  },
};
