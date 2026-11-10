// Panel UI for Premiere Pro and After Effects (CEP). Kept dependency-free for the Phase 2 spike.
import { BUILTIN_RECIPES, retimeRecipe, buildRampKeyframes } from '@uet/core';

declare global {
  interface Window {
    __adobe_cep__?: { evalScript(script: string, cb: (r: string) => void): void; getHostEnvironment(): string; getSystemPath(t: string): string };
    require?: (m: string) => any;
  }
}

type HostResult<T = any> = { ok: true; data: T } | { ok: false; error: string; line?: number };

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const logEl = $('log');
function log(msg: string, kind: 'ok' | 'err' | '' = '') {
  const line = document.createElement('div');
  if (kind) line.className = kind + 'c';
  line.textContent = `${new Date().toLocaleTimeString()}  ${msg}`;
  logEl.prepend(line);
}

const cep = window.__adobe_cep__;
const hostApp: 'PPRO' | 'AEFT' | 'BROWSER' = cep ? JSON.parse(cep.getHostEnvironment()).appName : 'BROWSER';

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
    engine = { call: (id, p) => reg.call(id, p) };
    const info = await engine.call('engine.ping', {});
    try { await mod.startServer(reg, {}); } catch { /* another engine may already listen; direct calls still work */ }
    el.textContent = `motor: hazır (${info.version})`;
    el.className = 'okc';
  } catch (e) {
    el.textContent = 'motor: kapalı';
    el.className = 'errc';
    log(`Motor başlatılamadı: ${(e as Error).message}`, 'err');
  }
}

// ---------- Tabs ----------
function setupTabs() {
  const sections = Array.from(document.querySelectorAll<HTMLElement>('section'))
    .filter(s => hostApp === 'BROWSER' || s.dataset.app === hostApp);
  document.querySelectorAll<HTMLElement>('section').forEach(s => { if (!sections.includes(s)) s.remove(); });
  const nav = $('tabs');
  sections.forEach((s, i) => {
    const b = document.createElement('button');
    b.textContent = s.dataset.tab ?? '?';
    b.onclick = () => { sections.forEach(x => x.classList.remove('on')); nav.querySelectorAll('button').forEach(x => x.classList.remove('on')); s.classList.add('on'); b.classList.add('on'); };
    nav.appendChild(b);
    if (i === 0) b.click();
  });
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
function setupPremiere() {
  const analyze = $<HTMLButtonElement>('analyze');
  analyze.onclick = busy(analyze, async () => {
    if (!engine) throw new Error('Motor çalışmıyor.');
    const info = await callHost<any>('ppro', 'getSelectedClipInfo');
    if (!info.ok) { report(info, () => ''); return; }
    log(`Analiz ediliyor: ${info.data.name}`);
    const th = $<HTMLInputElement>('threshold').value;
    const res = await engine.call('audio.planSilenceCut', {
      file: info.data.mediaPath,
      minSilence: Number($<HTMLInputElement>('minSilence').value),
      padding: Number($<HTMLInputElement>('padding').value),
      thresholdDb: th === '' ? undefined : Number(th),
      fps: info.data.sequenceFps,
    });
    lastPlan = res;
    log(`Gürültü tabanı ${res.noiseFloorDb} dB, eşik ${res.thresholdDb} dB. ${res.cut.length} kesim, ${res.removedSeconds} sn çıkarılacak.`, 'ok');
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
  setupTabs();
  if (hostApp === 'BROWSER') { log('Tarayıcı modunda: Adobe bağlantısı yok.'); return; }
  await loadHostLibrary();
  if (hostApp === 'PPRO') setupPremiere(); else setupAfterEffects();
  await startEngine();
}
init();
