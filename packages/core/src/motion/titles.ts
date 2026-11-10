import { z } from 'zod';

/**
 * Parametric titles (F-MG-01). A title is a small set of real AE layers (text + shape) laid out for the
 * comp's aspect ratio. "/" in the text splits it into fields (e.g. "Ayşe Yılmaz / Yönetmen").
 * Layout is computed here; the host script only creates the layers it is given.
 */
export const TitleSchema = z.object({
  style: z.enum(['lowerThird', 'headline', 'kicker', 'boxed']).default('lowerThird'),
  text: z.string().min(1).max(300),
  /** hex colours */
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#FF5A36'),
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#FFFFFF'),
  /** seconds the title stays on screen (from the playhead) */
  duration: z.number().min(0.5).max(60).default(4),
  /** text animation preset ids from BUILTIN_TEXT_PRESETS */
  animIn: z.string().default('word-rise'),
  animOut: z.string().default('char-sink-out'),
  /** fraction of the comp size (1 = default); the user can scale everything */
  size: z.number().min(0.3).max(3).default(1),
});
export type TitleParams = z.infer<typeof TitleSchema>;

export type Aspect = 'landscape' | 'vertical' | 'square';
export function aspectOf(w: number, h: number): Aspect {
  const r = w / h;
  return r > 1.2 ? 'landscape' : r < 0.85 ? 'vertical' : 'square';
}

export interface TitleText { kind: 'text'; name: string; text: string; fontSize: number; x: number; y: number; justify: 'left' | 'center'; color: string; bold: boolean }
/** Bar = accent rectangle grown from its left edge (x,y = left middle). Box = background fitted to a text layer. */
export interface TitleBar { kind: 'bar'; name: string; x: number; y: number; width: number; height: number; color: string; growFrom: 'left' | 'center' }
export interface TitleBox { kind: 'box'; name: string; fitTo: string; padX: number; padY: number; color: string; roundness: number }
export type TitleElement = TitleText | TitleBar | TitleBox;
export interface TitleLayout { aspect: Aspect; elements: TitleElement[] }

export function splitFields(text: string): string[] {
  return text.split('/').map(s => s.trim()).filter(Boolean);
}

/**
 * Elements in comp pixels, back to front. Safe margins: 7% of width (landscape) and, for vertical video,
 * lower thirds sit at 68% height so platform buttons and captions don't cover them.
 */
export function layoutTitle(p: TitleParams, compW: number, compH: number, tag = ''): TitleLayout {
  const nm = (base: string) => (tag ? `${base} ${tag}` : base);
  const aspect = aspectOf(compW, compH);
  const [main = '', sub = '', ...rest] = splitFields(p.text);
  const subText = [sub, ...rest].filter(Boolean).join(' · ');
  const unit = Math.min(compW, compH) * p.size;
  const margin = Math.round(compW * (aspect === 'landscape' ? 0.07 : 0.08));
  const r = (v: number) => Math.round(v);
  const els: TitleElement[] = [];
  const T = (name: string, text: string, fs: number, x: number, y: number, justify: TitleText['justify'], color = p.textColor, bold = true): TitleText =>
    ({ kind: 'text', name, text, fontSize: r(fs), x: r(x), y: r(y), justify, color, bold });

  if (p.style === 'lowerThird') {
    const fs = unit * (aspect === 'vertical' ? 0.075 : 0.065);
    const baseY = aspect === 'vertical' ? compH * 0.68 : compH - margin * 1.6;
    const barX = margin, textX = margin + unit * 0.035;
    // vertical bar spanning the title cap height (and the subtitle when there is one)
    els.push({ kind: 'bar', name: nm('UET Title Bar'), x: r(barX), y: r(subText ? baseY + fs * 0.05 : baseY - fs * 0.36), width: r(unit * 0.012), height: r(fs * (subText ? 1.9 : 1.0)), color: p.accent, growFrom: 'center' });
    els.push(T(nm('UET Title'), main, fs, textX, baseY, 'left'));
    if (subText) els.push(T(nm('UET Subtitle'), subText, fs * 0.55, textX, baseY + fs * 0.85, 'left', p.textColor, false));
  } else if (p.style === 'headline') {
    const fs = unit * (aspect === 'landscape' ? 0.11 : 0.12);
    const cy = compH * (aspect === 'vertical' ? 0.42 : 0.5);
    els.push(T(nm('UET Title'), main, fs, compW / 2, cy, 'center'));
    els.push({ kind: 'bar', name: nm('UET Title Bar'), x: r(compW / 2 - unit * 0.12), y: r(cy + fs * 0.45), width: r(unit * 0.24), height: r(unit * 0.012), color: p.accent, growFrom: 'center' });
    if (subText) els.push(T(nm('UET Subtitle'), subText, fs * 0.38, compW / 2, cy + fs * 1.05, 'center', p.textColor, false));
  } else if (p.style === 'kicker') {
    const fs = unit * (aspect === 'landscape' ? 0.1 : 0.11);
    const x = margin, cy = compH * (aspect === 'vertical' ? 0.4 : 0.5);
    // kicker = small accent label above the title; with one field the title has no kicker
    if (subText) {
      els.push(T(nm('UET Kicker'), main.toLocaleUpperCase('tr'), fs * 0.32, x, cy - fs * 0.95, 'left', p.accent, true));
      els.push(T(nm('UET Title'), subText, fs, x, cy, 'left'));
    } else els.push(T(nm('UET Title'), main, fs, x, cy, 'left'));
    els.push({ kind: 'bar', name: nm('UET Title Bar'), x: r(x), y: r(cy + fs * 0.4), width: r(unit * 0.18), height: r(unit * 0.01), color: p.accent, growFrom: 'left' });
  } else {
    const fs = unit * (aspect === 'landscape' ? 0.08 : 0.09);
    const cy = compH * (aspect === 'vertical' ? 0.42 : 0.5);
    els.push({ kind: 'box', name: nm('UET Title Box'), fitTo: nm('UET Title'), padX: r(fs * 0.45), padY: r(fs * 0.28), color: p.accent, roundness: r(fs * 0.12) });
    els.push(T(nm('UET Title'), main, fs, compW / 2, cy, 'center'));
    if (subText) els.push(T(nm('UET Subtitle'), subText, fs * 0.45, compW / 2, cy + fs * 1.15, 'center', p.textColor, false));
  }
  return { aspect, elements: els };
}

/** '#RRGGBB' → AE colour [r,g,b] 0..1 */
export function hexToAe(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map(v => Math.round(v * 1000) / 1000) as [number, number, number];
}

/** Expressions that fit a box shape to a text layer every frame (text edits keep the box right). */
export function boxExpressions(fitTo: string, padX: number, padY: number) {
  const r = `var L = thisComp.layer(${JSON.stringify(fitTo)}); var r = L.sourceRectAtTime(time, false);`;
  return {
    size: `// UET box\n${r}\n[r.width + ${padX * 2}, r.height + ${padY * 2}];`,
    position: `// UET box\n${r}\n[r.left + r.width / 2, r.top + r.height / 2];`,
    /** box layer Position = the text layer's origin in comp space (works when the text is parented) */
    layerPosition: `// UET box\nthisComp.layer(${JSON.stringify(fitTo)}).toComp([0, 0]);`,
  };
}
