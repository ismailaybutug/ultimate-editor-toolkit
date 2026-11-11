// Transitions module (F-TR-01) — owned by the "Build transition engine" thread. See AGENT_HANDOFF.md.
import { z } from 'zod';
import type { PanelModule, PanelContext } from './types';
import {
  TRANSITIONS, FAMILY_LABEL, TransitionPresetSchema, buildTransition, compileForAe, compileForPpro,
  type Host, type TransitionPreset,
} from '../../../../packages/core/src/transitions/index';

const DIR_LABEL: Record<string, string> = { left: 'Sola', right: 'Sağa', up: 'Yukarı', down: 'Aşağı', cw: 'Saat yönü', ccw: 'Saat tersi' };

function view(app: 'PPRO' | 'AEFT'): string {
  const host: Host = app === 'AEFT' ? 'ae' : 'ppro';
  const p = app === 'AEFT' ? 'trA' : 'trP';
  const first = TRANSITIONS.find(t => t.hosts.includes(host))!;
  const groups = Object.keys(FAMILY_LABEL).map(fam => {
    const items = TRANSITIONS.filter(t => t.family === fam && t.hosts.includes(host));
    if (!items.length) return '';
    return `<optgroup label="${FAMILY_LABEL[fam as keyof typeof FAMILY_LABEL].tr}">${items.map(t => `<option value="${t.id}">${t.name.tr}</option>`).join('')}</optgroup>`;
  }).join('');
  const where = app === 'AEFT'
    ? 'İki katmanı seç (geçiş ikincisinin başladığı yere konur) ya da zaman çizgisini kesime getir. Geçiş, düzenlenebilir ayar katmanları olarak eklenir; tek Cmd+Z ile geri alınır.'
    : 'Oynatma kafasını iki klip arasındaki kesime getir. Efektler iki klibe anahtar karelerle eklenir (Premiere her efekti ayrı geri alma adımı sayar).';
  return `
  <section class="view" id="v-${p}" data-app="${app}">
    <p class="note">${where}</p>
    <div class="box2">
      <label>Geçiş <select id="${p}Id">${groups}</select></label>
      <label>Süre (sn) <input id="${p}Dur" type="number" step="0.05" min="0.1" max="3" value="${first.defaultDuration}"></label>
      <label>Güç (%) <input id="${p}Str" type="number" value="100" min="50" max="200" step="10"></label>
      <label id="${p}DirL" style="display:none">Yön <select id="${p}Dir"></select></label>
      <label id="${p}ColL" style="display:none">Renk <input id="${p}Col" type="color" value="#ffffff"></label>
      <label id="${p}SeedL" style="display:none">Desen no <input id="${p}Seed" type="number" value="7" min="0" step="1"></label>
    </div>
    <p class="note" id="${p}Desc">${first.desc.tr}</p>
    <button class="btn" id="${p}Apply">Kesime uygula</button>
    <button class="btn secondary" id="${p}Check">Kesimi kontrol et</button>
    ${app === 'AEFT' ? `<button class="btn secondary" id="${p}Remove">Kesimdeki geçişi kaldır</button>` : ''}
  </section>`;
}

/** Find the cut, compile the preset for this host and apply it. Shared by the button and the MCP tool. */
async function applyPreset(ctx: PanelContext, host: Host, preset: TransitionPreset, keyTime?: 'source' | 'clip') {
  const ns = 'transitions' as any;
  const info = await ctx.callHost<any>(ns, 'cutInfo');
  if (!info.ok) throw new Error(info.error);
  const frame = { fps: info.data.fps, width: info.data.width, height: info.data.height };
  const plan = buildTransition(preset, host, frame);
  const compiled = host === 'ae' ? compileForAe(plan, frame) : compileForPpro(plan, frame);
  const r = await ctx.callHost<any>(ns, 'apply', { plan: compiled, cut: info.data.cut, ...(keyTime ? { keyTime } : {}) });
  if (!r.ok) throw new Error(r.error);
  return { transition: plan.name, ...r.data };
}

function fmtTime(s: number) { const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`; }

export const transitionsModule: PanelModule = {
  id: 'transitions',
  catalog: [
    { id: 'transitions', app: 'PPRO', cat: 'gfx', title: 'Geçişler', desc: 'Zoom, whip, dönüş, glitch, ışık, flaş, daire, film yanığı; güç ve süre ayarlı', status: 'beta', preview: 'transition', view: 'v-trP', keys: 'geçiş transition zoom whip spin dönüş glitch ışık flaş daire film blur', feature: 'F-TR-01' },
    { id: 'transitions-ae', app: 'AEFT', cat: 'gfx', title: 'Geçişler', desc: 'Kamera, glitch, ışık, şekil, film; düzenlenebilir katmanlar', status: 'beta', preview: 'transition', view: 'v-trA', keys: 'geçiş transition zoom whip spin dönüş glitch flaş ışık daire film blur', feature: 'F-TR-01' },
  ],
  viewsHtml: view('PPRO') + view('AEFT'),
  jsx: [],
  async setup(ctx) {
    if (ctx.hostApp === 'BROWSER') return;
    const app = ctx.hostApp;
    const host: Host = app === 'AEFT' ? 'ae' : 'ppro';
    const p = app === 'AEFT' ? 'trA' : 'trP';
    await ctx.loadJsx(host === 'ae' ? 'jsx/uet-transitions-ae.jsx' : 'jsx/uet-transitions-ppro.jsx');
    const sel = ctx.$<HTMLSelectElement>(`${p}Id`);
    const dir = ctx.$<HTMLSelectElement>(`${p}Dir`);
    const refresh = () => {
      const def = TRANSITIONS.find(t => t.id === sel.value)!;
      ctx.$<HTMLInputElement>(`${p}Dur`).value = String(def.defaultDuration);
      dir.innerHTML = (def.directions ?? []).map(d => `<option value="${d}">${DIR_LABEL[d]}</option>`).join('');
      ctx.$(`${p}DirL`).style.display = def.directions ? '' : 'none';
      ctx.$(`${p}ColL`).style.display = def.usesColor ? '' : 'none';
      if (def.defaultColor) ctx.$<HTMLInputElement>(`${p}Col`).value = def.defaultColor;
      ctx.$(`${p}SeedL`).style.display = def.id === 'glitch' ? '' : 'none';
      ctx.$(`${p}Desc`).textContent = def.desc.tr;
    };
    sel.onchange = refresh;
    refresh();
    const preset = (): TransitionPreset => {
      const def = TRANSITIONS.find(t => t.id === sel.value)!;
      return TransitionPresetSchema.parse({
        transition: def.id,
        duration: Number(ctx.$<HTMLInputElement>(`${p}Dur`).value) || def.defaultDuration,
        strength: Math.min(2, Math.max(0.5, Number(ctx.$<HTMLInputElement>(`${p}Str`).value) / 100 || 1)),
        ...(def.directions ? { direction: dir.value } : {}),
        ...(def.usesColor ? { color: ctx.$<HTMLInputElement>(`${p}Col`).value } : {}),
        ...(def.id === 'glitch' ? { seed: Math.max(0, Math.round(Number(ctx.$<HTMLInputElement>(`${p}Seed`).value) || 0)) } : {}),
      });
    };
    const apply = ctx.$<HTMLButtonElement>(`${p}Apply`);
    apply.onclick = ctx.busy(apply, async () => {
      const r = await applyPreset(ctx, host, preset());
      const where = host === 'ae' ? `${r.layers.length} katman` : `${r.applied.length} klip`;
      ctx.log(`${r.transition} geçişi ${fmtTime(r.cut)} kesimine eklendi (${where})${r.replaced ? ', eskisi değiştirildi' : ''}${r.skipped?.length ? '. Kesimin bir yanında klip yok' : ''}.`, 'ok');
    });
    const check = ctx.$<HTMLButtonElement>(`${p}Check`);
    check.onclick = ctx.busy(check, async () => {
      const r = await ctx.callHost<any>('transitions' as any, 'cutInfo');
      if (!r.ok) throw new Error(r.error);
      const d = r.data;
      ctx.log(host === 'ae'
        ? `Kesim ${fmtTime(d.cut)} (${d.how === 'selection' ? 'seçili katmanlardan' : 'zaman çizgisinden'}), ${d.fps} fps${d.existing ? `, burada ${d.existing} UET geçiş katmanı var` : ''}.`
        : `Kesim ${fmtTime(d.cut)}, iz V${d.track + 1}: ${d.outClip ?? '(klip yok)'} → ${d.inClip ?? '(klip yok)'}, ${d.fps.toFixed(3)} fps.`, 'ok');
    });
    if (host === 'ae') {
      const rm = ctx.$<HTMLButtonElement>(`${p}Remove`);
      rm.onclick = ctx.busy(rm, async () => {
        const r = await ctx.callHost<any>('transitions' as any, 'remove');
        if (!r.ok) throw new Error(r.error);
        ctx.log(r.data.removed ? `${r.data.removed} geçiş katmanı kaldırıldı.` : 'Bu kesimde UET geçişi yok.', r.data.removed ? 'ok' : '');
      });
    }
  },
  registerTools(reg, ctx) {
    reg.register({
      id: 'transitions.list', app: 'engine', destructive: false,
      title: { en: 'List available transitions with their options', tr: 'Geçiş listesi' },
      params: z.object({}),
      run: async () => TRANSITIONS.map(t => ({ id: t.id, family: t.family, name: t.name, hosts: t.hosts, directions: t.directions ?? null, usesColor: !!t.usesColor, defaultDuration: t.defaultDuration })),
    });
    if (ctx.hostApp === 'BROWSER') return;
    const host: Host = ctx.hostApp === 'AEFT' ? 'ae' : 'ppro';
    reg.register({
      id: `${host}.applyTransition`, app: host, destructive: true,
      title: {
        en: host === 'ae'
          ? 'Add a transition at the cut (2 selected layers, or the current time) as editable adjustment layers; replaces an earlier UET transition there'
          : 'Add a transition at the cut under the playhead as keyframed effects on the two clips',
        tr: 'Geçiş uygula',
      },
      params: TransitionPresetSchema.extend({ keyTime: z.enum(['source', 'clip']).optional().describe('Premiere only, for testing the keyframe time base') }),
      run: async (p: TransitionPreset & { keyTime?: 'source' | 'clip' }) => applyPreset(ctx, host, p, host === 'ppro' ? p.keyTime : undefined),
    });
  },
};
