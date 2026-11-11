/**
 * After Effects motion + typography module (owner: "Build After Effects animation tools" thread).
 * Layer animations, text animation presets, shake, number counter, 3D carousel, anchor/align/distribute/sequence,
 * titles, callouts, glow, animated backgrounds, map routes.
 * Host code: packages/host-ae/jsx/uet-ae-motion.jsx, uet-ae-layout.jsx, uet-ae-gfx.jsx, uet-ae-fx.jsx. Logic: packages/core/src/motion.
 * Every tool is UNVERIFIED in After Effects until TEST_REPORT.md has an H result.
 */
import { z } from 'zod';
import type { PanelModule, PanelContext, HostResult } from './types';
import type { CatalogItem } from '../catalog';
import { retimeRecipe } from '../../../../packages/core/src/recipe';
import {
  BUILTIN_TEXT_PRESETS, planTextAnimator, type TextPreset,
  SHAKE_PRESETS, ShakeSchema, shakeExpression, type ShakeParams,
  CounterSchema, counterExpression, formatCounter, type CounterParams,
  CarouselSchema, autoRadius, carouselSlots, spinKeys, type CarouselParams,
  TitleSchema, layoutTitle, hexToAe, boxExpressions, type TitleParams,
  CalloutSchema, calloutGeometry, followExpression, type CalloutParams,
  ALL_LAYER_RECIPES, GlowSchema, GLOW_PRESETS, glowPlan, type GlowParams,
  BackgroundSchema, PALETTES, SIZES, planBackground, type BackgroundParams,
  RouteSchema, routePath, travellerExpressions, type RouteParams,
} from '../../../../packages/core/src/motion/index';

const A = (cat: string, id: string, title: string, desc: string, preview: CatalogItem['preview'], extra: Partial<CatalogItem> = {}): CatalogItem =>
  ({ id, app: 'AEFT', cat, title, desc, status: 'beta', preview, ...extra });

const opts = (pairs: Array<[string, string]>, sel?: string) => pairs.map(([v, l]) => `<option value="${v}"${v === sel ? ' selected' : ''}>${l}</option>`).join('');

// shared CSS styles only number inputs and selects; give text inputs the same look without touching index.html
const TXT = 'style="background:var(--bg2);color:var(--text);border:1px solid var(--line);border-radius:7px;padding:5px 7px;width:130px"';

const VIEWS = `
  <section class="view" id="v-ae-recipes" data-app="AEFT">
    <div class="box2">
      <p class="note">Seçili katmanlara uygular; değerler katmanın şu anki konumuna göre hesaplanır. Giriş katmanın başında, çıkış sonunda, vurgu oynatma kafasında başlar. Tek Cmd+Z ile geri alınır.</p>
      <label>Tür <select id="aeRecKind">${opts([['in', 'Giriş'], ['emphasis', 'Vurgu'], ['out', 'Çıkış']])}</select></label>
      <label>Animasyon <select id="aeRecId">${opts(ALL_LAYER_RECIPES.filter(r => r.kind === 'in').map(r => [r.id, r.tr]))}</select></label>
      <label>Süre (sn) <input id="aeRecDur" type="number" step="0.05" value="${ALL_LAYER_RECIPES.find(r => r.kind === 'in')!.duration}"></label>
      <label>Katmanlar arası kademe (sn) <input id="aeRecStagger" type="number" step="0.02" value="0.08"></label>
    </div>
    <button class="btn" id="aeRecApply">Uygula</button>
  </section>
  <section class="view" id="v-ae-glow" data-app="AEFT">
    <div class="box2">
      <p class="note">After Effects'in kendi Glow efektini ayarlı katmanlar halinde ekler (eklenti gerekmez). Effect Controls'ta "UET Glow" adıyla düzenlenir; tekrar uygulamak eskisinin yerine geçer.</p>
      <label>Stil <select id="aeGlowPreset">${opts(Object.entries(GLOW_PRESETS).map(([k, v]) => [k, v.tr]))}</select></label>
      <label>Boyut <input id="aeGlowSize" type="number" step="0.1" value="1"></label>
      <label>Güç <input id="aeGlowStrength" type="number" step="0.1" value="1"></label>
      <label>Neon rengi <input id="aeGlowColor" type="color" value="#38bdf8"></label>
    </div>
    <button class="btn" id="aeGlowApply">Glow ekle</button>
    <button class="btn secondary" id="aeGlowRemove">Glow'u kaldır</button>
  </section>
  <section class="view" id="v-ae-bg" data-app="AEFT">
    <div class="box2">
      <p class="note">Kusursuz döngü yapan hareketli bir arka plan kompozisyonu kurar. Açık bir kompozisyon varsa en alta eklenir ve tüm süre boyunca döner.</p>
      <label>Tür <select id="aeBgType">${opts([['mesh', 'Akan renk geçişi'], ['blobs', 'Yüzen ışık topları']])}</select></label>
      <label>Renkler <select id="aeBgPalette">${opts(Object.entries(PALETTES).map(([k, v]) => [k, v.tr]), 'aurora')}</select></label>
      <label>Boyut <select id="aeBgSize">${opts([['match', 'Açık kompozisyonla aynı'], ...Object.entries(SIZES).map(([k, v]) => [k, v.tr] as [string, string])])}</select></label>
      <label>Döngü süresi (sn) <input id="aeBgLoop" type="number" step="1" value="10"></label>
      <label>Hareket miktarı (0–1) <input id="aeBgMotion" type="number" step="0.1" value="0.5"></label>
      <label>Film greni <input id="aeBgGrain" type="checkbox" checked></label>
      <label>Açık kompozisyona ekle <input id="aeBgPlace" type="checkbox" checked></label>
    </div>
    <button class="btn" id="aeBgApply">Arka plan oluştur</button>
  </section>
  <section class="view" id="v-ae-route" data-app="AEFT">
    <div class="box2">
      <p class="note">Harita görselini kompozisyona koy, şehirlerin üstüne null ya da işaret katmanları yerleştir. Bu katmanları rota sırasıyla seç. Rota oynatma kafasında çizilmeye başlar; işaret çizgiyi takip eder.</p>
      <label>Kavis (0–0.6) <input id="aeRtCurve" type="number" step="0.05" value="0.25"></label>
      <label>Çizim süresi (sn) <input id="aeRtDur" type="number" step="0.1" value="3"></label>
      <label>Renk <input id="aeRtColor" type="color" value="#ffd166"></label>
      <label>Kalınlık (px) <input id="aeRtStroke" type="number" step="1" value="6"></label>
      <label>Kesikli çizgi <input id="aeRtDash" type="checkbox" checked></label>
      <label>Şehir noktaları <input id="aeRtPins" type="checkbox" checked></label>
      <label>Hareket eden ok <input id="aeRtTrav" type="checkbox" checked></label>
    </div>
    <button class="btn" id="aeRtApply">Rotayı çiz</button>
  </section>
  <section class="view" id="v-ae-text" data-app="AEFT">
    <div class="box2">
      <p class="note">Seçili metin katmanlarına AE'nin kendi Text Animator'ını ekler; sonra Timeline'da düzenleyebilirsin. Tek Cmd+Z ile geri alınır.</p>
      <label>Animasyon <select id="aeTextPreset">${opts(BUILTIN_TEXT_PRESETS.map(p => [p.id, p.tr]))}</select></label>
      <label>Süre (sn) <input id="aeTextDur" type="number" step="0.05" value="${BUILTIN_TEXT_PRESETS[0]!.duration}"></label>
      <label>Katmanlar arası kademe (sn) <input id="aeTextStagger" type="number" step="0.05" value="0"></label>
      <label>Başlangıç <select id="aeTextAt">${opts([['layer', 'Katmanın başı / sonu'], ['playhead', 'Oynatma kafası']])}</select></label>
      <label>Önceki UET metin animasyonunu sil <input id="aeTextReplace" type="checkbox" checked></label>
    </div>
    <button class="btn" id="aeTextApply">Uygula</button>
    <button class="btn secondary" id="aeTextRemove">UET metin animasyonlarını kaldır</button>
  </section>
  <section class="view" id="v-ae-shake" data-app="AEFT">
    <div class="box2">
      <p class="note">Seçili katmanlara düzenlenebilir sarsıntı ekler (Effect Controls'ta "UET Shake" ayarları). Sönümlü sarsıntı oynatma kafasında başlar.</p>
      <label>Hazır ayar <select id="aeShakePreset">${opts(Object.entries(SHAKE_PRESETS).map(([k, v]) => [k, v.tr]), 'impact')}</select></label>
      <label>Şiddet (px) <input id="aeShakeAmt" type="number" step="1"></label>
      <label>Hız (titreşim/sn) <input id="aeShakeFreq" type="number" step="0.5"></label>
      <label>Dönme (derece) <input id="aeShakeRot" type="number" step="0.1"></label>
      <label>Sönme süresi (sn, 0 = sürekli) <input id="aeShakeDecay" type="number" step="0.05"></label>
      <label>Hareket bulanıklığı <input id="aeShakeBlur" type="checkbox" checked></label>
    </div>
    <button class="btn" id="aeShakeApply">Sarsıntı ekle</button>
    <button class="btn secondary" id="aeShakeRemove">Sarsıntıyı kaldır</button>
  </section>
  <section class="view" id="v-ae-counter" data-app="AEFT">
    <div class="box2">
      <p class="note">Sayan bir sayı oluşturur (tek metin katmanı seçiliyse ona uygular). Oynatma kafasında başlar; değerler "UET Counter" ayarından değiştirilebilir.</p>
      <label>Başlangıç <input id="aeCntFrom" type="number" value="0"></label>
      <label>Bitiş <input id="aeCntTo" type="number" value="1000"></label>
      <label>Süre (sn) <input id="aeCntDur" type="number" step="0.1" value="2"></label>
      <label>Ondalık basamak <input id="aeCntDec" type="number" min="0" max="4" value="0"></label>
      <label>Ön ek <input id="aeCntPre" type="text" ${TXT} value="" placeholder="₺"></label>
      <label>Son ek <input id="aeCntSuf" type="text" ${TXT} value="" placeholder="%"></label>
      <label>Biçim <select id="aeCntFmt">${opts([['tr', '1.234,5 (Türkçe)'], ['en', '1,234.5 (İngilizce)'], ['none', '1234.5']])}</select></label>
      <label>Hareket <select id="aeCntEase">${opts([['expoOut', 'Hızlı başla, yavaş bitir'], ['easeInOut', 'Yumuşak'], ['linear', 'Sabit hız']])}</select></label>
      <p class="note" id="aeCntPreview"></p>
    </div>
    <button class="btn" id="aeCntApply">Sayaç oluştur</button>
  </section>
  <section class="view" id="v-ae-carousel" data-app="AEFT">
    <div class="box2">
      <p class="note">En az 2 katman seç (sıra = seçim sırası). Katmanlar 3D olur, "UET Carousel" adlı null'a bağlanır. Dönüş oynatma kafasında başlar.</p>
      <label>Yerleşim <select id="aeCarLayout">${opts([['ring', 'Halka'], ['arc', 'Yay'], ['helix', 'Sarmal']])}</select></label>
      <label>Dönüş <select id="aeCarSpin">${opts([['steps', 'Tek tek öne getir'], ['continuous', 'Sürekli dön'], ['none', 'Dönmesin']])}</select></label>
      <label>Yarıçap (px, 0 = otomatik) <input id="aeCarRadius" type="number" step="10" value="0"></label>
      <label>Eğim (derece) <input id="aeCarTilt" type="number" step="1" value="-8"></label>
      <label>Geçiş / tur süresi (sn) <input id="aeCarSpeed" type="number" step="0.1" value="0.8"></label>
      <label>Her öğede bekleme (sn) <input id="aeCarHold" type="number" step="0.1" value="1"></label>
    </div>
    <button class="btn" id="aeCarApply">Karusel kur</button>
  </section>
  <section class="view" id="v-ae-titles" data-app="AEFT">
    <div class="box2">
      <p class="note">Oynatma kafasında düzenlenebilir bir başlık kurar. "/" ile alanları ayır: "Ayşe Yılmaz / Yönetmen". Yerleşim kompozisyonun yatay, dikey veya kare olmasına göre ayarlanır. Hepsini "(move me)" null'ı ile taşıyabilirsin.</p>
      <label>Metin <input id="aeTitleText" type="text" ${TXT} value="Ayşe Yılmaz / Yönetmen"></label>
      <label>Stil <select id="aeTitleStyle">${opts([['lowerThird', 'Alt bant (isim / unvan)'], ['headline', 'Manşet (ortada)'], ['kicker', 'Üst etiketli başlık'], ['boxed', 'Kutulu başlık']])}</select></label>
      <label>Vurgu rengi <input id="aeTitleAccent" type="color" value="#ff5a36"></label>
      <label>Yazı rengi <input id="aeTitleColor" type="color" value="#ffffff"></label>
      <label>Ekranda kalma (sn) <input id="aeTitleDur" type="number" step="0.5" value="4"></label>
      <label>Boyut <input id="aeTitleSize" type="number" step="0.1" value="1"></label>
      <label>Giriş <select id="aeTitleIn">${opts(BUILTIN_TEXT_PRESETS.filter(p => p.kind === 'in').map(p => [p.id, p.tr]), 'word-rise')}</select></label>
      <label>Çıkış <select id="aeTitleOut">${opts([['', 'Yok'], ...BUILTIN_TEXT_PRESETS.filter(p => p.kind === 'out').map(p => [p.id, p.tr] as [string, string])], 'char-sink-out')}</select></label>
    </div>
    <button class="btn" id="aeTitleApply">Başlık oluştur</button>
  </section>
  <section class="view" id="v-ae-callout" data-app="AEFT">
    <div class="box2">
      <p class="note">Bir katman seçersen işaretçi o katmana bağlanır ve onunla birlikte hareket eder. Seçim yoksa ekranın ortasına konur. Çizgi oynatma kafasında çizilmeye başlar.</p>
      <label>Tür <select id="aeCoStyle">${opts([['pointer', 'Nokta + çizgi + etiket'], ['arrow', 'Ok']])}</select></label>
      <label>Etiket <input id="aeCoLabel" type="text" ${TXT} value="Burası"></label>
      <label>Yön <select id="aeCoDir">${opts([['ne', 'Sağ üst'], ['nw', 'Sol üst'], ['se', 'Sağ alt'], ['sw', 'Sol alt']])}</select></label>
      <label>Uzunluk (px) <input id="aeCoLen" type="number" step="10" value="220"></label>
      <label>Kalınlık (px) <input id="aeCoStroke" type="number" step="1" value="5"></label>
      <label>Yazı boyutu <input id="aeCoFont" type="number" step="2" value="56"></label>
      <label>Renk <input id="aeCoColor" type="color" value="#ffffff"></label>
      <label>Katmanı takip et <input id="aeCoFollow" type="checkbox" checked></label>
    </div>
    <button class="btn" id="aeCoApply">Callout ekle</button>
  </section>
  <section class="view" id="v-ae-layout" data-app="AEFT">
    <div class="box2">
      <p class="note">Seçili katmanlar için. Anchor noktası katmanı yerinden oynatmadan taşınır. Hizalama oynatma kafasındaki görünüşe göre yapılır; parent'lı katmanlar atlanır.</p>
      <label>Anchor noktası</label>
      <div class="box2" id="aeAnchorGrid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px">
        ${['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br'].map(p => `<button class="btn secondary" data-anchor="${p}">${({ tl: '↖', t: '↑', tr: '↗', l: '←', c: '•', r: '→', bl: '↙', b: '↓', br: '↘' } as Record<string, string>)[p]}</button>`).join('')}
      </div>
      <label>Hizala <select id="aeAlignTo">${opts([['comp', 'Kompozisyona göre'], ['selection', 'Seçime göre']])}</select></label>
      <div class="box2" style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px">
        ${[['left', 'Sol'], ['hcenter', 'Yatay orta'], ['right', 'Sağ'], ['top', 'Üst'], ['vcenter', 'Dikey orta'], ['bottom', 'Alt']].map(([e, l]) => `<button class="btn secondary" data-align="${e}">${l}</button>`).join('')}
      </div>
      <div class="box2" style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
        <button class="btn secondary" id="aeDistH">Yatay eşit dağıt</button>
        <button class="btn secondary" id="aeDistV">Dikey eşit dağıt</button>
      </div>
      <label>Ardışık diz, ara (sn, eksi = bindir) <input id="aeSeqGap" type="number" step="0.1" value="0"></label>
    </div>
    <button class="btn" id="aeSeq">Katmanları art arda diz</button>
  </section>`;

// ---------- pure builders (also used by MCP tools and tests) ----------
export function textAnimatorArgs(p: TextPreset, o: { duration?: number; stagger?: number; atPlayhead?: boolean; replace?: boolean } = {}) {
  const duration = o.duration && o.duration > 0 ? o.duration : p.duration;
  return { name: p.name, kind: p.kind, duration, props: p.props, plan: planTextAnimator(p, duration), stagger: o.stagger ?? 0, atPlayhead: !!o.atPlayhead, replace: o.replace ?? true };
}
export function shakeArgs(s: ShakeParams, name = 'Shake') {
  return {
    name, ...s,
    expr: { position: shakeExpression('position', s.seed), rotation: shakeExpression('rotation', s.seed + 1000), x: shakeExpression('position', s.seed), y: shakeExpression('position', s.seed + 500) },
  };
}
export function counterArgs(c: CounterParams) {
  return { from: c.from, to: c.to, duration: c.duration, ease: c.ease, fontSize: c.fontSize, expression: counterExpression(c), preview: formatCounter(c.from, c) };
}
export function carouselArgs(widths: number[], c: CarouselParams) {
  const n = widths.length;
  const radius = c.radius > 0 ? c.radius : Math.round(autoRadius(n, Math.max(...widths, 1), c));
  return { radius, tilt: c.tilt, slots: carouselSlots(n, radius, c), spinKeys: spinKeys(n, c), spinEase: c.spin === 'continuous' ? 'linear' : 'easeInOut' };
}

const presetById = (id: string) => BUILTIN_TEXT_PRESETS.find(p => p.id === id);
const animOf = (id: string) => { const p = presetById(id); if (!p) return null; const a = textAnimatorArgs(p); return { name: a.name, props: a.props, plan: a.plan, duration: a.duration }; };

export function titleArgs(t: TitleParams, compW: number, compH: number, tag: string) {
  const lay = layoutTitle(t, compW, compH, tag);
  const elements = lay.elements.map(e => ({ ...e, color: hexToAe(e.color) }));
  const box = lay.elements.find(e => e.kind === 'box');
  return {
    tag, aspect: lay.aspect, elements, duration: t.duration,
    boxExpr: box && box.kind === 'box' ? boxExpressions(box.fitTo, box.padX, box.padY) : null,
    animIn: animOf(t.animIn), animOut: animOf(t.animOut),
  };
}
export function calloutArgs(c: CalloutParams, tag: string, followLayer: string | null) {
  return {
    tag, geometry: calloutGeometry(c), color: hexToAe(c.color), stroke: c.stroke, fontSize: c.fontSize, label: c.label, duration: c.duration,
    followExpr: c.follow && followLayer ? followExpression(followLayer) : null, labelAnim: c.label ? animOf('char-rise') : null,
  };
}
const newTag = () => Date.now().toString(36).slice(-4);

async function runTitle(ctx: PanelContext, t: TitleParams) {
  const comp = await must<any>(ctx.callHost('ae', 'compInfo'));
  return must<any>(ctx.callHost('ae', 'createTitle', titleArgs(t, comp.width, comp.height, newTag())));
}
async function runCallout(ctx: PanelContext, c: CalloutParams) {
  const comp = await must<any>(ctx.callHost('ae', 'compInfo'));
  const sel: string[] = comp.selected;
  if (sel.length > 1) throw new Error('İşaret edilecek tek bir katman seç (ya da hiç seçme).');
  return must<any>(ctx.callHost('ae', 'createCallout', calloutArgs(c, newTag(), sel[0] ?? null)));
}

export function glowArgs(g: GlowParams, compHeight: number) {
  const plan = glowPlan(g, compHeight);
  const a = hexToAe(g.color);
  return { ...plan, colorA: a, colorB: a.map(v => Math.round((v + (1 - v) * 0.7) * 1000) / 1000) };
}
export function backgroundArgs(b: BackgroundParams, active: { width: number; height: number; frameRate?: number } | null, tag: string) {
  const plan = planBackground(b, active?.width, active?.height);
  return {
    name: `UET BG ${b.palette} ${plan.width}x${plan.height} ${tag}`, type: b.type, width: plan.width, height: plan.height, loop: plan.loop,
    fps: active?.frameRate ?? 30, base: hexToAe(plan.base), points: plan.points.map(p => ({ color: hexToAe(p.color), expr: p.expr })),
    grain: plan.grain, blurRadius: plan.blurRadius, placeInActive: !!active,
  };
}
export function routeArgs(r: RouteParams, points: Array<{ x: number; y: number }>, tag: string) {
  const path = routePath(points.map(p => [p.x, p.y] as [number, number]), r.curve);
  return {
    tag, path, color: hexToAe(r.color), stroke: r.stroke, dashed: r.dashed, duration: r.duration, pins: r.pins,
    traveller: r.traveller ? travellerExpressions(`UET Route ${tag}`) : null,
  };
}
async function activeComp(ctx: PanelContext): Promise<any | null> {
  const r = await ctx.callHost<any>('ae', 'compInfo');
  return r.ok ? r.data : null;
}
async function runRecipe(ctx: PanelContext, id: string, duration: number | undefined, stagger: number) {
  const base = ALL_LAYER_RECIPES.find(r => r.id === id);
  if (!base) throw new Error('Bilinmeyen animasyon: ' + id);
  const recipe = duration && duration > 0 ? retimeRecipe(base, duration) : base;
  const { tr: _tr, ...plain } = recipe as typeof base;
  return must<any>(ctx.callHost('ae', 'applyRecipe', { recipe: plain, stagger }));
}
async function runGlow(ctx: PanelContext, g: GlowParams) {
  const c = await activeComp(ctx);
  if (!c) throw new Error('Önce bir kompozisyon aç.');
  return must<any>(ctx.callHost('ae', 'applyGlow', glowArgs(g, c.height)));
}
async function runBackground(ctx: PanelContext, b: BackgroundParams) {
  return must<any>(ctx.callHost('ae', 'createBackground', backgroundArgs(b, await activeComp(ctx), newTag())));
}
async function runRoute(ctx: PanelContext, r: RouteParams) {
  const w = await must<any>(ctx.callHost('ae', 'waypoints'));
  return must<any>(ctx.callHost('ae', 'createRoute', routeArgs(r, w.points, newTag())));
}

const FORMATS: Record<string, { thousands: string; decimal: string }> = { tr: { thousands: '.', decimal: ',' }, en: { thousands: ',', decimal: '.' }, none: { thousands: '', decimal: '.' } };

async function must<T>(r: Promise<HostResult<T>>): Promise<T> {
  const x = await r;
  if (!x.ok) throw new Error(x.error ?? 'After Effects hata verdi');
  return x.data as T;
}
const skippedNote = (s?: string[]) => (s && s.length ? ` Atlanan: ${s.join(', ')}.` : '');

async function runCarousel(ctx: PanelContext, c: CarouselParams) {
  const sizes = await must<any>(ctx.callHost('ae', 'selectedLayerSizes'));
  const widths = (sizes.layers as Array<{ width: number }>).map(l => l.width);
  if (widths.length < 2) throw new Error('En az 2 katman seç.');
  return must<any>(ctx.callHost('ae', 'buildCarousel', carouselArgs(widths, c)));
}

export const aeMotionModule: PanelModule = {
  id: 'ae-motion',
  catalog: [
    A('anim', 'recipes', 'Katman Animasyonu', `${ALL_LAYER_RECIPES.length} giriş, vurgu ve çıkış hareketi, tek Cmd+Z`, 'pop', { view: 'v-ae-recipes', feature: 'F-MG-03', keys: 'animasyon pop fade slide zıpla salla giriş çıkış' }),
    A('anim', 'textanim', 'Metin Animasyonu', `${BUILTIN_TEXT_PRESETS.length} hazır animasyon, AE Text Animator ile düzenlenebilir`, 'title', { view: 'v-ae-text', feature: 'F-MG-04', keys: 'metin yazı text harf kelime daktilo typewriter' }),
    A('anim', 'shake', 'Sarsıntı', 'Darbe, el kamerası, deprem; ayarları sonradan değişir', 'pop', { view: 'v-ae-shake', feature: 'F-MG-08', keys: 'shake sarsıntı titreme wiggle darbe' }),
    A('anim', 'carousel', '3D Karusel', 'Katmanları halka, yay veya sarmal üzerinde döndür', 'grid', { view: 'v-ae-carousel', feature: 'F-MG-05', keys: '3d carousel karusel dönen' }),
    A('gfx', 'counter', 'Sayaç', 'Sayan rakam: para, yüzde, takipçi', 'meter', { view: 'v-ae-counter', feature: 'F-MG-06', keys: 'sayaç counter rakam sayı numara' }),
    A('gfx', 'titles', 'Başlıklar', 'Alt bant, manşet, kutulu başlık; dikey/kare/yatay uyumlu', 'title', { view: 'v-ae-titles', feature: 'F-MG-01', keys: 'başlık title alt bant lower third isim unvan' }),
    A('gfx', 'callouts', 'Callout ve Oklar', 'Katmanı takip eden işaretçi, ok ve etiket', 'pop', { view: 'v-ae-callout', feature: 'F-MG-06', keys: 'callout ok arrow işaret pointer etiket' }),
    A('gfx', 'glow', 'Glow', 'Eklentisiz parlama: yumuşak, neon, derin, bloom', 'spark', { view: 'v-ae-glow', feature: 'F-VFX-02', keys: 'glow parlama ışık neon bloom' }),
    A('gfx', 'backgrounds', 'Arka Planlar', 'Döngülü hareketli arka plan, 8 renk paleti, her boyut', 'spark', { view: 'v-ae-bg', feature: 'F-MG-07', keys: 'arka plan background gradient döngü loop' }),
    A('gfx', 'maps', 'Harita Rotası', 'Haritanda seçtiğin noktalar arasında çizilen rota', 'spark', { view: 'v-ae-route', keys: 'harita map rota route şehir uçak' }),
    A('tools', 'layout', 'Hizala ve Anchor', 'Anchor noktası, hizalama, eşit dağıtma, art arda dizme', 'grid', { view: 'v-ae-layout', keys: 'anchor hizala align distribute dağıt sırala sequence' }),
  ],
  viewsHtml: VIEWS,
  jsx: ['jsx/uet-ae-motion.jsx', 'jsx/uet-ae-layout.jsx', 'jsx/uet-ae-gfx.jsx', 'jsx/uet-ae-fx.jsx'],

  setup(ctx) {
    const { $, log, busy, callHost } = ctx;
    const num = (id: string) => Number($<HTMLInputElement>(id).value);

    // Layer animations
    const rk = $<HTMLSelectElement>('aeRecKind'), rid = $<HTMLSelectElement>('aeRecId');
    const fillRec = () => { rid.innerHTML = opts(ALL_LAYER_RECIPES.filter(r => r.kind === rk.value).map(r => [r.id, r.tr])); setDur(); };
    const setDur = () => { const r = ALL_LAYER_RECIPES.find(x => x.id === rid.value); if (r) $<HTMLInputElement>('aeRecDur').value = String(r.duration); };
    rk.onchange = fillRec; rid.onchange = setDur; fillRec();
    const rApply = $<HTMLButtonElement>('aeRecApply');
    rApply.onclick = busy(rApply, async () => {
      const d = await runRecipe(ctx, rid.value, num('aeRecDur'), num('aeRecStagger') || 0);
      log(`"${ALL_LAYER_RECIPES.find(r => r.id === rid.value)!.tr}" uygulandı: ${d.layers.join(', ')}.`, 'ok');
    });

    // Glow
    const gApply = $<HTMLButtonElement>('aeGlowApply');
    gApply.onclick = busy(gApply, async () => {
      const g = GlowSchema.parse({ preset: $<HTMLSelectElement>('aeGlowPreset').value, size: num('aeGlowSize'), strength: num('aeGlowStrength'), color: $<HTMLInputElement>('aeGlowColor').value });
      const d = await runGlow(ctx, g);
      log(`Glow eklendi (${d.passes} kat): ${d.layers.join(', ')}.${skippedNote(d.skipped)}`, 'ok');
    });
    const gRem = $<HTMLButtonElement>('aeGlowRemove');
    gRem.onclick = busy(gRem, async () => { const d = await must<any>(callHost('ae', 'removeGlow')); log(`${d.removed} glow efekti kaldırıldı.`, 'ok'); });

    // Backgrounds
    const bApply = $<HTMLButtonElement>('aeBgApply');
    bApply.onclick = busy(bApply, async () => {
      const b = BackgroundSchema.parse({ type: $<HTMLSelectElement>('aeBgType').value, palette: $<HTMLSelectElement>('aeBgPalette').value, size: $<HTMLSelectElement>('aeBgSize').value, loop: num('aeBgLoop'), motion: num('aeBgMotion'), grain: $<HTMLInputElement>('aeBgGrain').checked });
      const args = backgroundArgs(b, await activeComp(ctx), newTag());
      if (!$<HTMLInputElement>('aeBgPlace').checked) args.placeInActive = false;
      const d = await must<any>(callHost('ae', 'createBackground', args));
      log(`Arka plan "${d.comp}" oluşturuldu${d.placedIn ? `, "${d.placedIn}" kompozisyonunun en altına eklendi` : ''}.`, 'ok');
    });

    // Map route
    const rtApply = $<HTMLButtonElement>('aeRtApply');
    rtApply.onclick = busy(rtApply, async () => {
      const r = RouteSchema.parse({ curve: num('aeRtCurve'), duration: num('aeRtDur'), color: $<HTMLInputElement>('aeRtColor').value, stroke: num('aeRtStroke'), dashed: $<HTMLInputElement>('aeRtDash').checked, pins: $<HTMLInputElement>('aeRtPins').checked, traveller: $<HTMLInputElement>('aeRtTrav').checked });
      const d = await runRoute(ctx, r);
      log(`Rota çizildi: "${d.route}"${d.traveller ? ' + hareket eden ok' : ''}.${d.warnings?.length ? ' Uyarı: ' + d.warnings.join('; ') : ''}`, 'ok');
    });

    // Text
    const tsel = $<HTMLSelectElement>('aeTextPreset');
    tsel.onchange = () => { const p = BUILTIN_TEXT_PRESETS.find(x => x.id === tsel.value); if (p) $<HTMLInputElement>('aeTextDur').value = String(p.duration); };
    const tApply = $<HTMLButtonElement>('aeTextApply');
    tApply.onclick = busy(tApply, async () => {
      const p = BUILTIN_TEXT_PRESETS.find(x => x.id === tsel.value)!;
      const d = await must<any>(callHost('ae', 'applyTextAnimator', textAnimatorArgs(p, {
        duration: num('aeTextDur'), stagger: num('aeTextStagger'), atPlayhead: $<HTMLSelectElement>('aeTextAt').value === 'playhead', replace: $<HTMLInputElement>('aeTextReplace').checked,
      })));
      log(`"${p.tr}" uygulandı: ${d.layers.join(', ')}.${skippedNote(d.skipped)}${d.warnings?.length ? ' Uyarı: ' + d.warnings.join('; ') : ''}`, 'ok');
    });
    const tRem = $<HTMLButtonElement>('aeTextRemove');
    tRem.onclick = busy(tRem, async () => { const d = await must<any>(callHost('ae', 'removeTextAnimators')); log(`${d.removed} UET metin animasyonu kaldırıldı.`, 'ok'); });

    // Shake
    const ssel = $<HTMLSelectElement>('aeShakePreset');
    const fillShake = () => {
      const p = SHAKE_PRESETS[ssel.value]!.params;
      $<HTMLInputElement>('aeShakeAmt').value = String(p.amount); $<HTMLInputElement>('aeShakeFreq').value = String(p.frequency);
      $<HTMLInputElement>('aeShakeRot').value = String(p.rotation); $<HTMLInputElement>('aeShakeDecay').value = String(p.decay);
    };
    ssel.onchange = fillShake; fillShake();
    const sApply = $<HTMLButtonElement>('aeShakeApply');
    sApply.onclick = busy(sApply, async () => {
      const s = ShakeSchema.parse({ amount: num('aeShakeAmt'), frequency: num('aeShakeFreq'), rotation: num('aeShakeRot'), decay: num('aeShakeDecay'), motionBlur: $<HTMLInputElement>('aeShakeBlur').checked, seed: Math.floor(Math.random() * 9000) + 1 });
      const d = await must<any>(callHost('ae', 'addShake', shakeArgs(s)));
      log(`Sarsıntı eklendi: ${d.layers.join(', ')}.${skippedNote(d.skipped)}`, 'ok');
    });
    const sRem = $<HTMLButtonElement>('aeShakeRemove');
    sRem.onclick = busy(sRem, async () => { const d = await must<any>(callHost('ae', 'removeShake')); log(`Sarsıntı kaldırıldı (${d.removed} öğe).`, 'ok'); });

    // Counter
    const readCounter = () => CounterSchema.parse({
      from: num('aeCntFrom'), to: num('aeCntTo'), duration: num('aeCntDur'), decimals: num('aeCntDec'),
      prefix: $<HTMLInputElement>('aeCntPre').value, suffix: $<HTMLInputElement>('aeCntSuf').value,
      ...FORMATS[$<HTMLSelectElement>('aeCntFmt').value], ease: $<HTMLSelectElement>('aeCntEase').value,
    });
    const preview = () => { try { const c = readCounter(); $('aeCntPreview').textContent = `Önizleme: ${formatCounter(c.from, c)} → ${formatCounter(c.to, c)}`; } catch { /* typing */ } };
    for (const id of ['aeCntFrom', 'aeCntTo', 'aeCntDec', 'aeCntPre', 'aeCntSuf', 'aeCntFmt']) $(id).oninput = preview;
    $('aeCntFmt').onchange = preview; preview();
    const cApply = $<HTMLButtonElement>('aeCntApply');
    cApply.onclick = busy(cApply, async () => {
      const d = await must<any>(callHost('ae', 'createCounter', counterArgs(readCounter())));
      log(`Sayaç ${d.created ? 'oluşturuldu' : 'uygulandı'}: ${d.layer}.`, 'ok');
    });

    // Carousel
    const kApply = $<HTMLButtonElement>('aeCarApply');
    kApply.onclick = busy(kApply, async () => {
      const c = CarouselSchema.parse({ layout: $<HTMLSelectElement>('aeCarLayout').value, spin: $<HTMLSelectElement>('aeCarSpin').value, radius: num('aeCarRadius'), tilt: num('aeCarTilt'), speed: num('aeCarSpeed'), hold: num('aeCarHold') });
      const d = await runCarousel(ctx, c);
      log(`Karusel kuruldu: ${d.layers.length} katman, "${d.null}" null'ı ile döner.`, 'ok');
    });

    // Titles
    const tiApply = $<HTMLButtonElement>('aeTitleApply');
    tiApply.onclick = busy(tiApply, async () => {
      const t = TitleSchema.parse({
        text: $<HTMLInputElement>('aeTitleText').value, style: $<HTMLSelectElement>('aeTitleStyle').value,
        accent: $<HTMLInputElement>('aeTitleAccent').value, textColor: $<HTMLInputElement>('aeTitleColor').value,
        duration: num('aeTitleDur'), size: num('aeTitleSize'), animIn: $<HTMLSelectElement>('aeTitleIn').value, animOut: $<HTMLSelectElement>('aeTitleOut').value,
      });
      const d = await runTitle(ctx, t);
      log(`Başlık oluşturuldu (${d.layers.length} katman, ${d.start.toFixed(1)}–${d.end.toFixed(1)} sn).${d.warnings?.length ? ' Uyarı: ' + d.warnings.join('; ') : ''}`, 'ok');
    });

    // Callouts
    const coApply = $<HTMLButtonElement>('aeCoApply');
    coApply.onclick = busy(coApply, async () => {
      const c = CalloutSchema.parse({
        style: $<HTMLSelectElement>('aeCoStyle').value, label: $<HTMLInputElement>('aeCoLabel').value, direction: $<HTMLSelectElement>('aeCoDir').value,
        length: num('aeCoLen'), stroke: num('aeCoStroke'), fontSize: num('aeCoFont'), color: $<HTMLInputElement>('aeCoColor').value, follow: $<HTMLInputElement>('aeCoFollow').checked,
      });
      const d = await runCallout(ctx, c);
      log(`Callout eklendi${d.target ? ` ("${d.target}" katmanına bağlı)` : ' (ekranın ortası)'}.`, 'ok');
    });

    // Layout
    document.querySelectorAll<HTMLButtonElement>('#v-ae-layout [data-anchor]').forEach(b => {
      b.onclick = busy(b, async () => { const d = await must<any>(callHost('ae', 'setAnchor', { pos: b.dataset.anchor })); log(`Anchor taşındı: ${d.layers.join(', ') || '-'}.${skippedNote(d.skipped)}`, 'ok'); });
    });
    document.querySelectorAll<HTMLButtonElement>('#v-ae-layout [data-align]').forEach(b => {
      b.onclick = busy(b, async () => { const d = await must<any>(callHost('ae', 'alignLayers', { edge: b.dataset.align, to: $<HTMLSelectElement>('aeAlignTo').value })); log(`${d.aligned} katman hizalandı.${skippedNote(d.skipped)}`, 'ok'); });
    });
    for (const [id, axis] of [['aeDistH', 'h'], ['aeDistV', 'v']] as const) {
      const b = $<HTMLButtonElement>(id);
      b.onclick = busy(b, async () => { const d = await must<any>(callHost('ae', 'distributeLayers', { axis })); log(`${d.distributed} katman eşit dağıtıldı.`, 'ok'); });
    }
    const seq = $<HTMLButtonElement>('aeSeq');
    seq.onclick = busy(seq, async () => { const d = await must<any>(callHost('ae', 'sequenceLayers', { gap: num('aeSeqGap') })); log(`${d.layers} katman art arda dizildi.`, 'ok'); });
  },

  registerTools(reg, ctx) {
    if (ctx.hostApp !== 'AEFT') return;
    const ids = BUILTIN_TEXT_PRESETS.map(p => p.id) as [string, ...string[]];
    reg.register({
      id: 'ae.textAnimate', app: 'ae', destructive: true,
      title: { en: `Animate the selected text layers with a native Text Animator. Presets: ${ids.join(', ')}`, tr: 'Metin animasyonu' },
      params: z.object({ presetId: z.enum(ids), duration: z.number().positive().optional(), stagger: z.number().min(0).default(0), atPlayhead: z.boolean().default(false) }),
      run: async (p: any) => must(ctx.callHost('ae', 'applyTextAnimator', textAnimatorArgs(BUILTIN_TEXT_PRESETS.find(x => x.id === p.presetId)!, p))),
    });
    reg.register({
      id: 'ae.shake', app: 'ae', destructive: true,
      title: { en: `Add an editable wiggle shake to the selected layers. Presets: ${Object.keys(SHAKE_PRESETS).join(', ')}; any field overrides the preset. decay>0 = impact at the playhead`, tr: 'Sarsıntı' },
      params: z.object({ preset: z.enum(Object.keys(SHAKE_PRESETS) as [string, ...string[]]).default('impact') }).merge(ShakeSchema.partial()),
      run: async (p: any) => { const { preset, ...rest } = p; const s = ShakeSchema.parse({ ...SHAKE_PRESETS[preset]!.params, ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) }); return must(ctx.callHost('ae', 'addShake', shakeArgs(s))); },
    });
    reg.register({
      id: 'ae.counter', app: 'ae', destructive: true,
      title: { en: 'Create an animated number counter starting at the playhead (or on the single selected text layer)', tr: 'Sayaç' },
      params: CounterSchema,
      run: async (p: any) => must(ctx.callHost('ae', 'createCounter', counterArgs(p))),
    });
    reg.register({
      id: 'ae.carousel', app: 'ae', destructive: true,
      title: { en: 'Arrange the selected layers (2+) as a spinning 3D carousel parented to a null', tr: '3D karusel' },
      params: CarouselSchema,
      run: async (p: any) => runCarousel(ctx, p),
    });
    reg.register({
      id: 'ae.layerAnimate', app: 'ae', destructive: true,
      title: { en: `Animate the selected layers (relative to their current values). Animations: ${ALL_LAYER_RECIPES.map(r => r.id).join(', ')}`, tr: 'Katman animasyonu' },
      params: z.object({ id: z.enum(ALL_LAYER_RECIPES.map(r => r.id) as [string, ...string[]]), duration: z.number().positive().optional(), stagger: z.number().min(0).default(0.08) }),
      run: async (p: any) => runRecipe(ctx, p.id, p.duration, p.stagger),
    });
    reg.register({
      id: 'ae.glow', app: 'ae', destructive: true,
      title: { en: 'Add a plug-in-free glow (native Glow passes) to the selected layers. Presets: soft, neon, deep, bloom', tr: 'Glow' },
      params: GlowSchema,
      run: async (p: any) => runGlow(ctx, p),
    });
    reg.register({
      id: 'ae.background', app: 'ae', destructive: true,
      title: { en: `Create a seamlessly looping animated background comp (mesh gradient or blurred blobs). Palettes: ${Object.keys(PALETTES).join(', ')}; sizes: match, ${Object.keys(SIZES).join(', ')}`, tr: 'Arka plan' },
      params: BackgroundSchema,
      run: async (p: any) => runBackground(ctx, p),
    });
    reg.register({
      id: 'ae.mapRoute', app: 'ae', destructive: true,
      title: { en: 'Draw an animated route through the selected layers (city markers on the user\'s map, in order), with pins and a traveller arrow', tr: 'Harita rotası' },
      params: RouteSchema,
      run: async (p: any) => runRoute(ctx, p),
    });
    reg.register({
      id: 'ae.title', app: 'ae', destructive: true,
      title: { en: 'Create an editable title at the playhead. "/" splits fields (name / role). Styles: lowerThird, headline, kicker, boxed. Layout adapts to landscape/vertical/square comps', tr: 'Başlık' },
      params: TitleSchema,
      run: async (p: any) => runTitle(ctx, p),
    });
    reg.register({
      id: 'ae.callout', app: 'ae', destructive: true,
      title: { en: 'Add a callout (pointer with label, or arrow) at the playhead, attached to the single selected layer or the comp centre', tr: 'Callout' },
      params: CalloutSchema,
      run: async (p: any) => runCallout(ctx, p),
    });
    reg.register({
      id: 'ae.layout', app: 'ae', destructive: true,
      title: { en: 'Layout helpers on the selected layers: anchor (tl,t,tr,l,c,r,bl,b,br), align (left,hcenter,right,top,vcenter,bottom to comp|selection), distribute (h|v), sequence (gap seconds)', tr: 'Hizala ve anchor' },
      params: z.object({
        action: z.enum(['anchor', 'align', 'distribute', 'sequence']),
        anchor: z.enum(['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br']).default('c'),
        edge: z.enum(['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom']).default('hcenter'),
        to: z.enum(['comp', 'selection']).default('comp'),
        axis: z.enum(['h', 'v']).default('h'),
        gap: z.number().default(0),
      }),
      run: async (p: any) => {
        if (p.action === 'anchor') return must(ctx.callHost('ae', 'setAnchor', { pos: p.anchor }));
        if (p.action === 'align') return must(ctx.callHost('ae', 'alignLayers', { edge: p.edge, to: p.to }));
        if (p.action === 'distribute') return must(ctx.callHost('ae', 'distributeLayers', { axis: p.axis }));
        return must(ctx.callHost('ae', 'sequenceLayers', { gap: p.gap }));
      },
    });
  },
};
