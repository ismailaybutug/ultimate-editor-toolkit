// Panel UI for Premiere Pro and After Effects (CEP). Kept dependency-free for the Phase 2 spike.
import { BUILTIN_RECIPES, retimeRecipe, buildRampKeyframes, segmentsFromCuts } from '@uet/core';
import { z } from 'zod';
import { CATALOG, CATEGORIES, STATUS_LABEL, type CatalogItem, type App } from './catalog';

declare global {
  interface Window {
    __adobe_cep__?: { evalScript(script: string, cb: (r: string) => void): void; getHostEnvironment(): string; getSystemPath(t: string): string };
    require?: (m: string) => any;
  }
}

type HostResult<T = any> = { ok: true; data: T } | { ok: false; error: string; line?: number };

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const logEl = $('log');
let toastTimer: any;
function log(msg: string, kind: 'ok' | 'err' | '' = '') {
  const line = document.createElement('div');
  if (kind) line.className = kind + 'c';
  line.textContent = `${new Date().toLocaleTimeString()}  ${msg}`;
  logEl.prepend(line);
  $('status').textContent = msg.length > 70 ? msg.slice(0, 70) + '…' : msg;
  const t = $('toast');
  t.textContent = msg; t.className = `show ${kind ? kind + 'c' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, kind === 'err' ? 9000 : 5000);
}

const cep = window.__adobe_cep__;
const hostApp: 'PPRO' | 'AEFT' | 'BROWSER' = cep ? JSON.parse(cep.getHostEnvironment()).appName : 'BROWSER';
// Browser preview (no Adobe): ?app=AEFT shows the After Effects catalog.
const previewApp = new URLSearchParams(location.search).get('app') === 'AEFT' ? 'AEFT' : 'PPRO';

function extensionPath(): string {
  if (!cep) return '.';
  let p = decodeURIComponent(cep.getSystemPath('extension'));
  p = p.replace(/^file:\/\/\/?/, navigator.platform.startsWith('Win') ? '' : '/');
  return p;
}

function evalHost<T>(script: string): Promise<HostResult<T>> {
  return new Promise(resolve => {
    if (!cep) { resolve({ ok: false, error: 'Not running inside Adobe app' }); return; }
    cep.evalScript(script, raw => {
      try { resolve(JSON.parse(raw)); }
      catch { resolve({ ok: false, error: `Host returned: ${raw}` }); }
    });
  });
}

/** Call UET.<ns>.<fn>(JSON) in the host. Arguments are passed as a quoted JSON string. */
function callHost<T>(ns: 'ae' | 'ppro', fn: string, args?: unknown): Promise<HostResult<T>> {
  const arg = args === undefined ? '' : JSON.stringify(JSON.stringify(args));
  return evalHost<T>(`UET.${ns}.${fn}(${arg})`);
}

async function loadHostLibrary() {
  const file = hostApp === 'AEFT' ? 'uet-ae.jsx' : 'uet-ppro.jsx';
  const path = `${extensionPath()}/jsx/${file}`.replace(/\\/g, '/');
  await new Promise<void>(r => cep?.evalScript(`$.evalFile(${JSON.stringify(path)})`, () => r()));
}

// ---------- Engine (runs inside the panel's Node context) ----------
let engine: { call(id: string, params: unknown): Promise<any> } | null = null;
async function startEngine() {
  const el = $('engine');
  try {
    if (!window.require) throw new Error('Node.js is not enabled in this panel');
    const mod = window.require(`${extensionPath()}/engine.cjs`);
    const reg = mod.createRegistry();
    registerHostTools(reg);
    engine = { call: (id, p) => reg.call(id, p) };
    const info = await engine.call('engine.ping', {});
    try { await mod.startServer(reg, {}); } catch { /* another engine may already listen; direct calls still work */ }
    el.innerHTML = `<i></i>motor ${info.version}`;
    el.className = 'pill okc';
    el.title = 'Yerel motor çalışıyor';
  } catch (e) {
    el.innerHTML = '<i></i>motor kapalı';
    el.className = 'pill errc';
    log(`Motor başlatılamadı: ${(e as Error).message}`, 'err');
  }
}

// ---------- Shell: cards, categories, search, tool views ----------
const PREVIEW: Record<string, string> = {
  wave: '<div class="bars">' + [6,14,22,18,9,0,0,0,12,26,20,8,0,0,16,24,10].map((h, i) => h ? `<span style="height:${h}px;animation-delay:${i * 0.07}s"></span>` : '<span class="gap"></span>').join('') + '</div>',
  meter: '<div class="meter"></div>',
  captions: '<div class="cap">Merhaba <em>arkadaşlar</em></div>',
  pop: '<div class="box"></div>',
  ramp: '<svg class="curve" viewBox="0 0 100 40" preserveAspectRatio="none"><path d="M0 34 C 25 34, 30 6, 50 6 S 75 34, 100 34"/></svg>',
  title: '<div class="title"><i></i><i></i></div>',
  transition: '<div class="wipe"></div>',
  grid: '<div class="cells">' + '<i></i>'.repeat(8) + '</div>',
  spark: '<div class="spark">' + [[18,30],[40,14],[62,34],[80,18],[50,26]].map(([x, y], i) => `<i style="left:${x}%;top:${y}px;animation-delay:${i * 0.4}s"></i>`).join('') + '</div>',
  dev: '<div class="code">ping → ok</div>',
};
const FAV_KEY = 'uet.favs';
const favs = new Set<string>(JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]'));
let activeCat = 'all';

function shellApp(): App { return hostApp === 'BROWSER' ? previewApp : hostApp === 'AEFT' ? 'AEFT' : 'PPRO'; }
function catColor(app: App, cat: string) { return CATEGORIES[app].find(c => c.id === cat)?.color ?? '#9aa4b2'; }

function cardHtml(it: CatalogItem): string {
  const c = catColor(it.app, it.cat);
  const fav = favs.has(it.app + it.id);
  return `<button class="card ${it.status}" data-id="${it.id}" style="--c:${c};--cg:${c}38" ${it.status === 'soon' ? 'title="Henüz yok, planlandı (' + (it.feature ?? '') + ')"' : ''}>
    <div class="pv">${PREVIEW[it.preview] ?? ''}<span class="badge ${it.status}">${STATUS_LABEL[it.status]}</span>
    ${it.status !== 'soon' ? `<span class="star ${fav ? 'on' : ''}" data-fav="${it.id}">★</span>` : ''}</div>
    <div class="meta"><b>${it.title}</b><p>${it.desc}</p></div></button>`;
}

function renderHome() {
  const app = shellApp();
  const q = $<HTMLInputElement>('q').value.trim().toLocaleLowerCase('tr');
  const items = CATALOG.filter(it => it.app === app)
    .filter(it => activeCat === 'all' || (activeCat === 'fav' ? favs.has(it.app + it.id) : it.cat === activeCat))
    .filter(it => !q || `${it.title} ${it.desc} ${it.keys ?? ''}`.toLocaleLowerCase('tr').includes(q));
  const order = { beta: 0, dev: 2, soon: 1 } as const;
  let html = '';
  for (const cat of CATEGORIES[app]) {
    const list = items.filter(i => i.cat === cat.id).sort((a, b) => order[a.status] - order[b.status]);
    if (!list.length) continue;
    html += `<div class="group" style="--c:${cat.color}">${cat.label}</div><div class="grid">${list.map(cardHtml).join('')}</div>`;
  }
  const home = $('home');
  home.innerHTML = html || '<div class="empty">Sonuç yok. Başka bir kelime dene.</div>';
  home.querySelectorAll<HTMLElement>('[data-fav]').forEach(s => s.onclick = e => {
    e.stopPropagation();
    const k = app + s.dataset.fav; favs.has(k) ? favs.delete(k) : favs.add(k);
    localStorage.setItem(FAV_KEY, JSON.stringify([...favs])); renderHome();
  });
  home.querySelectorAll<HTMLElement>('.card').forEach(c => c.onclick = () => {
    const it = CATALOG.find(x => x.app === app && x.id === c.dataset.id);
    if (it?.view) openView(it);
  });
}

function openView(it: CatalogItem) {
  $('home').style.display = 'none';
  $('chips').style.display = 'none';
  document.querySelectorAll<HTMLElement>('.view').forEach(v => v.classList.remove('on'));
  const v = $(it.view!);
  if (!v.querySelector('.vhead')) {
    const h = document.createElement('div');
    h.className = 'vhead';
    h.innerHTML = `<button class="back" title="Geri">←</button><b>${it.title}</b><span class="badge ${it.status}">${STATUS_LABEL[it.status]}</span>`;
    (h.querySelector('.back') as HTMLElement).onclick = closeView;
    v.prepend(h);
  }
  v.classList.add('on');
  $('main').scrollTop = 0;
}

function closeView() {
  document.querySelectorAll<HTMLElement>('.view').forEach(v => v.classList.remove('on'));
  $('home').style.display = '';
  $('chips').style.display = '';
}

function setupShell() {
  const app = shellApp();
  $('hostName').textContent = app === 'AEFT' ? 'After Effects' : 'Premiere Pro';
  document.querySelectorAll<HTMLElement>('.view').forEach(v => { if (v.dataset.app !== app) v.remove(); });
  const chips = $('chips');
  const all = [{ id: 'all', label: 'Tümü', color: '#eceef3' }, { id: 'fav', label: '★ Favoriler', color: '#ffd166' }, ...CATEGORIES[app]];
  chips.innerHTML = all.map(c => `<button class="chip ${c.id === activeCat ? 'on' : ''}" data-cat="${c.id}" style="--c:${c.color}">${c.label}</button>`).join('');
  chips.querySelectorAll<HTMLElement>('.chip').forEach(b => b.onclick = () => {
    activeCat = b.dataset.cat!;
    chips.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === b));
    renderHome();
  });
  const q = $<HTMLInputElement>('q');
  q.oninput = () => { closeView(); renderHome(); };
  q.onkeydown = e => {
    if (e.key === 'Enter') { const first = document.querySelector<HTMLElement>('.card.beta, .card.dev'); first?.click(); }
    if (e.key === 'Escape') { q.value = ''; renderHome(); }
  };
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); q.focus(); q.select(); }
    if (e.key === 'Escape' && document.activeElement !== q) closeView();
  });
  $('logToggle').onclick = () => $('log').classList.toggle('open');
  renderHome();
}

function busy<T>(btn: HTMLButtonElement, fn: () => Promise<T>) {
  return async () => {
    btn.disabled = true;
    try { await fn(); } catch (e) { log((e as Error).message, 'err'); } finally { btn.disabled = false; }
  };
}

function report(r: HostResult, okMsg: (d: any) => string) {
  if (r.ok) log(okMsg(r.data), 'ok'); else log(`Hata: ${r.error}${r.line ? ` (satır ${r.line})` : ''}`, 'err');
}

// ---------- Premiere ----------
let lastPlan: { keep: { start: number; end: number }[]; cut: { start: number; end: number }[] } | null = null;

// ---------- Shared actions (used by buttons AND by MCP tools) ----------
async function cutSilences(p: { minSilence: number; padding: number; thresholdDb?: number; mode: 'analyze' | 'markers' | 'newSequence' }) {
  if (!engine) throw new Error('Engine not running');
  const info = await callHost<any>('ppro', 'getSelectedClipInfo');
  if (!info.ok) throw new Error(info.error);
  const plan = await engine.call('audio.planSilenceCut', { file: info.data.mediaPath, minSilence: p.minSilence, padding: p.padding, thresholdDb: p.thresholdDb, fps: info.data.sequenceFps });
  lastPlan = plan;
  const summary = { clip: info.data.name, noiseFloorDb: plan.noiseFloorDb, thresholdDb: plan.thresholdDb, cuts: plan.cut.length, removedSeconds: plan.removedSeconds };
  if (p.mode === 'markers') {
    const r = await callHost<any>('ppro', 'addMarkers', { ranges: plan.cut, name: 'UET sessizlik', useSelection: true });
    if (!r.ok) throw new Error(r.error);
    return { ...summary, markers: r.data.markers };
  }
  if (p.mode === 'newSequence') {
    const r = await callHost<any>('ppro', 'buildFromRanges', { keep: plan.keep });
    if (!r.ok) throw new Error(r.error);
    return { ...summary, newSequence: r.data.sequence, originalUnchanged: r.data.original };
  }
  return summary;
}

async function makeSubtitles(p: { language: string; maxChars: number; addToSequence: boolean }) {
  if (!engine || !window.require) throw new Error('Engine not running');
  const info = await callHost<any>('ppro', 'getSelectedClipInfo');
  if (!info.ok) throw new Error(info.error);
  const os = window.require('os'), path = window.require('path'), fs = window.require('fs');
  const dir = path.join(os.homedir(), '.uet', 'subtitles');
  fs.mkdirSync(dir, { recursive: true });
  const safe = String(info.data.name).replace(/[^\w.-]+/g, '_').slice(0, 60);
  const srtPath = path.join(dir, `${safe}-${Date.now()}.srt`);
  const d = info.data;
  const r = await engine.call('audio.transcribe', {
    file: d.mediaPath, language: p.language, maxChars: p.maxChars, srtPath,
    timeline: { sourceIn: d.sourceIn, sourceOut: d.sourceOut, timelineStart: d.timelineStart },
  });
  const out = { clip: d.name, language: r.language, model: r.model, captions: r.captions.length, srtPath, timing: r.timing, addedToSequence: false };
  if (p.addToSequence) {
    const h = await callHost<any>('ppro', 'importCaptions', { srtPath });
    if (!h.ok) throw new Error(`SRT hazır (${srtPath}) ama sekansa eklenemedi: ${h.error}`);
    out.addedToSequence = true;
  }
  return out;
}

async function detectScenesAction(p: { threshold: number; mode: 'analyze' | 'markers' | 'newSequence' }) {
  if (!engine) throw new Error('Engine not running');
  const info = await callHost<any>('ppro', 'getSelectedClipInfo');
  if (!info.ok) throw new Error(info.error);
  const d = info.data;
  const r = await engine.call('video.detectScenes', { file: d.mediaPath, threshold: p.threshold });
  const cuts: number[] = r.scenes.filter((t: number) => t > d.sourceIn && t < d.sourceOut);
  const out: any = { clip: d.name, scenes: cuts.length };
  if (p.mode === 'markers' && cuts.length) {
    const m = await callHost<any>('ppro', 'addMarkers', { ranges: cuts.map(t => ({ start: t, end: t })), name: 'UET sahne', useSelection: true, colorIndex: 4 });
    if (!m.ok) throw new Error(m.error);
    out.markers = m.data.markers;
  }
  if (p.mode === 'newSequence' && cuts.length) {
    const keep = segmentsFromCuts(cuts, d.sourceIn, d.sourceOut);
    const b = await callHost<any>('ppro', 'buildFromRanges', { keep, name: `${d.sequence} - UET sahneler` });
    if (!b.ok) throw new Error(b.error);
    out.newSequence = b.data.sequence;
  }
  return out;
}

async function beatMarkersAction(p: { every: number }) {
  if (!engine) throw new Error('Engine not running');
  const info = await callHost<any>('ppro', 'getSelectedClipInfo');
  if (!info.ok) throw new Error(info.error);
  const d = info.data;
  const r = await engine.call('audio.detectBeats', { file: d.mediaPath, every: p.every });
  const beats: number[] = r.beats.filter((t: number) => t >= d.sourceIn && t < d.sourceOut);
  const m = await callHost<any>('ppro', 'addMarkers', { ranges: beats.map(t => ({ start: t, end: t })), name: 'UET vuruş', useSelection: true, colorIndex: 2 });
  if (!m.ok) throw new Error(m.error);
  return { clip: d.name, bpm: r.bpm, confidence: r.confidence, markers: m.data.markers };
}

async function applyRecipeById(p: { recipeId: string; duration?: number; stagger: number }) {
  const base = BUILTIN_RECIPES.find(x => x.id === p.recipeId);
  if (!base) throw new Error(`Unknown recipe ${p.recipeId}`);
  const recipe = retimeRecipe(base, p.duration ?? base.duration);
  const r = await callHost<any>('ae', 'applyRecipe', { recipe, stagger: p.stagger });
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

/** Tools that act on the open Adobe app. Registered into the in-panel Engine so MCP clients can use them. */
function registerHostTools(reg: any) {
  if (hostApp === 'PPRO') {
    reg.register({
      id: 'ppro.cutSilences', app: 'ppro', destructive: true,
      title: { en: 'Find silences in the selected clip; optionally add markers or build a new cut sequence (original untouched)', tr: 'Sessizlikleri kes' },
      params: z.object({ mode: z.enum(['analyze', 'markers', 'newSequence']).default('analyze'), minSilence: z.number().min(0.1).default(0.5), padding: z.number().min(0).max(1).default(0.12), thresholdDb: z.number().max(0).optional() }),
      run: cutSilences,
    });
    reg.register({
      id: 'ppro.detectScenes', app: 'ppro', destructive: true,
      title: { en: 'Find shot changes in the selected clip; add markers or build a new sequence split at each cut (original untouched)', tr: 'Sahne bulucu' },
      params: z.object({ threshold: z.number().min(0.05).max(0.9).default(0.3), mode: z.enum(['analyze', 'markers', 'newSequence']).default('markers') }),
      run: detectScenesAction,
    });
    reg.register({
      id: 'ppro.beatMarkers', app: 'ppro', destructive: true,
      title: { en: 'Detect tempo of the selected music clip and add sequence markers on beats', tr: 'Vuruş marker' },
      params: z.object({ every: z.number().int().min(1).max(16).default(4) }),
      run: beatMarkersAction,
    });
    reg.register({
      id: 'ppro.makeSubtitles', app: 'ppro', destructive: true,
      title: { en: 'Transcribe the selected clip locally (whisper.cpp), write an SRT and optionally add it as a caption track', tr: 'Altyazı oluştur' },
      params: z.object({ language: z.string().default('auto'), maxChars: z.number().int().min(10).max(80).default(42), addToSequence: z.boolean().default(true) }),
      run: makeSubtitles,
    });
  } else if (hostApp === 'AEFT') {
    reg.register({
      id: 'ae.applyRecipe', app: 'ae', destructive: true,
      title: { en: `Animate the selected layers. Recipes: ${BUILTIN_RECIPES.map(r => r.id).join(', ')}`, tr: 'Animasyon uygula' },
      params: z.object({ recipeId: z.enum(BUILTIN_RECIPES.map(r => r.id) as [string, ...string[]]), duration: z.number().positive().optional(), stagger: z.number().min(0).default(0.08) }),
      run: applyRecipeById,
    });
  }
}

function setupPremiere() {
  const analyze = $<HTMLButtonElement>('analyze');
  analyze.onclick = busy(analyze, async () => {
    const th = $<HTMLInputElement>('threshold').value;
    const r = await cutSilences({ mode: 'analyze', minSilence: Number($<HTMLInputElement>('minSilence').value), padding: Number($<HTMLInputElement>('padding').value), thresholdDb: th === '' ? undefined : Number(th) });
    log(`${r.clip}: gürültü tabanı ${r.noiseFloorDb} dB, eşik ${r.thresholdDb} dB. ${r.cuts} kesim, ${r.removedSeconds} sn çıkarılacak.`, 'ok');
    $<HTMLButtonElement>('markers').disabled = false;
    $<HTMLButtonElement>('rebuild').disabled = false;
  });
  const markers = $<HTMLButtonElement>('markers');
  markers.onclick = busy(markers, async () => {
    if (!lastPlan) return;
    report(await callHost('ppro', 'addMarkers', { ranges: lastPlan.cut, name: 'UET sessizlik', useSelection: true }), d => `${d.markers} marker eklendi.`);
  });
  const rebuild = $<HTMLButtonElement>('rebuild');
  rebuild.onclick = busy(rebuild, async () => {
    if (!lastPlan) return;
    report(await callHost('ppro', 'buildFromRanges', { keep: lastPlan.keep }), d => `Yeni sekans: "${d.sequence}" (${d.clips} parça, ${d.duration.toFixed(1)} sn). Orijinal "${d.original}" değişmedi.`);
  });
  const loud = $<HTMLButtonElement>('loudness');
  loud.onclick = busy(loud, async () => {
    if (!engine) throw new Error('Motor çalışmıyor.');
    const info = await callHost<any>('ppro', 'getSelectedClipInfo');
    if (!info.ok) { report(info, () => ''); return; }
    const r = await engine.call('audio.measureLoudness', { file: info.data.mediaPath, targetLufs: Number($<HTMLSelectElement>('lufs').value) });
    log(`${info.data.name}: ${r.integratedLufs} LUFS, tepe ${r.truePeakDb} dBTP. Hedef için kazanç: ${r.gainDb > 0 ? '+' : ''}${r.gainDb} dB.`, 'ok');
  });
  const sc = $<HTMLButtonElement>('scenesBtn');
  sc.onclick = busy(sc, async () => {
    log('Sahneler aranıyor...');
    const r = await detectScenesAction({ threshold: Number($<HTMLSelectElement>('sceneTh').value), mode: $<HTMLSelectElement>('sceneMode').value as any });
    log(`${r.clip}: ${r.scenes} sahne değişimi bulundu.${r.markers ? ` ${r.markers} marker eklendi.` : ''}${r.newSequence ? ` Yeni sekans: "${r.newSequence}".` : ''}`, 'ok');
  });
  const bt = $<HTMLButtonElement>('beatsBtn');
  bt.onclick = busy(bt, async () => {
    log('Vuruşlar aranıyor...');
    const r = await beatMarkersAction({ every: Number($<HTMLSelectElement>('beatEvery').value) });
    log(`${r.clip}: ${r.bpm} BPM. ${r.markers} vuruş marker'ı eklendi.`, 'ok');
  });
  const subs = $<HTMLButtonElement>('subs');
  subs.onclick = busy(subs, async () => {
    log('Konuşma yazıya dökülüyor (yerel, birkaç dakika sürebilir)...');
    const r = await makeSubtitles({ language: $<HTMLSelectElement>('subLang').value, maxChars: Number($<HTMLInputElement>('subChars').value), addToSequence: $<HTMLInputElement>('subAdd').checked });
    log(`${r.clip}: ${r.captions} altyazı satırı (dil ${r.language}, model ${r.model}, ${r.timing.elapsedSeconds} sn / ${r.timing.audioSeconds} sn ses). ${r.addedToSequence ? 'Sekansa eklendi.' : ''} SRT: ${r.srtPath}`, 'ok');
  });
  $('pping').onclick = async () => report(await callHost('ppro', 'ping'), d => `Premiere ${d.version} (build ${d.build}), sekans: ${d.sequence ?? 'yok'}`);
  $('qe').onclick = async () => report(await callHost('ppro', 'qeProbe'), d => `QE: ${JSON.stringify(d)}`);
}

// ---------- After Effects ----------
function setupAfterEffects() {
  const sel = $<HTMLSelectElement>('recipe');
  for (const r of BUILTIN_RECIPES) {
    const o = document.createElement('option');
    o.value = r.id; o.textContent = r.name;
    sel.appendChild(o);
  }
  sel.onchange = () => { const r = BUILTIN_RECIPES.find(x => x.id === sel.value); if (r) $<HTMLInputElement>('recipeDur').value = String(r.duration); };
  const apply = $<HTMLButtonElement>('applyRecipe');
  apply.onclick = busy(apply, async () => {
    const base = BUILTIN_RECIPES.find(x => x.id === sel.value)!;
    const recipe = retimeRecipe(base, Number($<HTMLInputElement>('recipeDur').value) || base.duration);
    report(await callHost('ae', 'applyRecipe', { recipe, stagger: Number($<HTMLInputElement>('stagger').value) || 0 }), d => `"${base.name}" uygulandı: ${d.layers.join(', ')}`);
  });
  const ramp = $<HTMLButtonElement>('applyRamp');
  ramp.onclick = busy(ramp, async () => {
    const info = await evalHost<any>(`(function(){var c=app.project.activeItem;var l=c&&c.selectedLayers&&c.selectedLayers[0];if(!l)return JSON.stringify({ok:false,error:'Bir video katmanı seç.'});return JSON.stringify({ok:true,data:{inP:l.inPoint,outP:l.outPoint,start:l.startTime}});})()`);
    if (!info.ok) { report(info, () => ''); return; }
    // Source time currently shown on the layer (no remap yet): inPoint-startTime .. outPoint-startTime
    const keys = buildRampKeyframes({
      sourceStart: info.data.inP - info.data.start,
      sourceEnd: info.data.outP - info.data.start,
      targetSpeed: Number($<HTMLInputElement>('rampSpeed').value) / 100,
      rampFraction: Number($<HTMLInputElement>('rampFrac').value) / 100,
      shape: $<HTMLSelectElement>('rampShape').value as 'in' | 'out' | 'both',
      ease: $<HTMLSelectElement>('rampEase').value as 'easeInOut',
    });
    report(await callHost('ae', 'speedRamp', { keys }), d => `Rampa: ${d.keys} anahtar kare, yeni süre ${d.outputDuration.toFixed(2)} sn.`);
  });
  $('aping').onclick = async () => report(await callHost('ae', 'ping'), d => `After Effects ${d.version}`);
  $('testTitle').onclick = async () => {
    const r = await callHost('ae', 'createTestTitle', { text: 'Ultimate Editor Toolkit' });
    report(r, d => `"${d.comp}" oluşturuldu. Şimdi Animasyon sekmesinden bir giriş uygula.`);
  };
}

async function init() {
  setupShell();
  if (hostApp === 'BROWSER') { $('status').textContent = 'Tarayıcı önizlemesi: Adobe bağlantısı yok.'; return; }
  await loadHostLibrary();
  if (hostApp === 'PPRO') setupPremiere(); else setupAfterEffects();
  await startEngine();
}
init();
