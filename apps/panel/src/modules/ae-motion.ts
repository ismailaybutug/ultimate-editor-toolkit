/**
 * After Effects motion + typography module (owner: "Build After Effects animation tools" thread).
 * Text animation presets, shake, number counter, 3D carousel, anchor/align/distribute/sequence.
 * Host code: packages/host-ae/jsx/uet-ae-motion.jsx + uet-ae-layout.jsx. Logic: packages/core/src/motion.
 * Every tool is UNVERIFIED in After Effects until TEST_REPORT.md has an H result.
 */
import { z } from 'zod';
import type { PanelModule, PanelContext, HostResult } from './types';
import type { CatalogItem } from '../catalog';
import {
  BUILTIN_TEXT_PRESETS, planTextAnimator, type TextPreset,
  SHAKE_PRESETS, ShakeSchema, shakeExpression, type ShakeParams,
  CounterSchema, counterExpression, formatCounter, type CounterParams,
  CarouselSchema, autoRadius, carouselSlots, spinKeys, type CarouselParams,
} from '../../../../packages/core/src/motion/index';

const A = (cat: string, id: string, title: string, desc: string, preview: CatalogItem['preview'], extra: Partial<CatalogItem> = {}): CatalogItem =>
  ({ id, app: 'AEFT', cat, title, desc, status: 'beta', preview, ...extra });

const opts = (pairs: Array<[string, string]>, sel?: string) => pairs.map(([v, l]) => `<option value="${v}"${v === sel ? ' selected' : ''}>${l}</option>`).join('');

const VIEWS = `
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
      <label>Ön ek <input id="aeCntPre" type="text" value="" placeholder="₺"></label>
      <label>Son ek <input id="aeCntSuf" type="text" value="" placeholder="%"></label>
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
    A('anim', 'textanim', 'Metin Animasyonu', `${BUILTIN_TEXT_PRESETS.length} hazır animasyon, AE Text Animator ile düzenlenebilir`, 'title', { view: 'v-ae-text', feature: 'F-MG-04', keys: 'metin yazı text harf kelime daktilo typewriter' }),
    A('anim', 'shake', 'Sarsıntı', 'Darbe, el kamerası, deprem; ayarları sonradan değişir', 'pop', { view: 'v-ae-shake', feature: 'F-MG-08', keys: 'shake sarsıntı titreme wiggle darbe' }),
    A('anim', 'carousel', '3D Karusel', 'Katmanları halka, yay veya sarmal üzerinde döndür', 'grid', { view: 'v-ae-carousel', feature: 'F-MG-05', keys: '3d carousel karusel dönen' }),
    A('gfx', 'counter', 'Sayaç', 'Sayan rakam: para, yüzde, takipçi', 'meter', { view: 'v-ae-counter', feature: 'F-MG-06', keys: 'sayaç counter rakam sayı numara' }),
    A('tools', 'layout', 'Hizala ve Anchor', 'Anchor noktası, hizalama, eşit dağıtma, art arda dizme', 'grid', { view: 'v-ae-layout', keys: 'anchor hizala align distribute dağıt sırala sequence' }),
  ],
  viewsHtml: VIEWS,
  jsx: ['jsx/uet-ae-motion.jsx', 'jsx/uet-ae-layout.jsx'],

  setup(ctx) {
    const { $, log, busy, callHost } = ctx;
    const num = (id: string) => Number($<HTMLInputElement>(id).value);

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
