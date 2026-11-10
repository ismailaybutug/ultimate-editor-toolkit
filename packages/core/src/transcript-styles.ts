/**
 * Caption styles and animation data, plus exporters (WebVTT, ASS, JSON). Pure functions, no I/O.
 *
 * - ASS (Advanced SubStation Alpha) carries the full look + animation and is rendered by ffmpeg/libass into a
 *   transparent overlay video that Premiere and After Effects can use like any clip.
 * - JSON ("uet.captions/1") is the neutral animation data other tools (After Effects text layers, MOGRTs) consume.
 */
import type { Caption, Word } from './transcript.js';

export type CaptionAnimation = 'none' | 'fade' | 'pop' | 'highlight' | 'karaoke' | 'reveal';
export interface CaptionStyle {
  id: string;
  name: { tr: string; en: string };
  font: string;
  /** Font size in pixels for a 1080 px tall frame; scaled to the real frame height. */
  size: number;
  bold: boolean;
  uppercase: boolean;
  /** CSS-like #RRGGBB colours. */
  color: string;
  highlight: string;
  outline: string;
  outlineWidth: number;
  shadow: number;
  /** Opaque box behind the text instead of an outline. */
  box: string | null;
  /** Text anchor as a fraction of the frame (0..1); text is centred horizontally on x and sits on y. */
  x: number;
  y: number;
  maxLineChars: number;
  maxLines: number;
  /** Short-form "few words at a time" captions. 0 = no limit. */
  maxWords: number;
  animation: CaptionAnimation;
}

const base: Omit<CaptionStyle, 'id' | 'name'> = {
  font: 'Arial', size: 64, bold: true, uppercase: false, color: '#FFFFFF', highlight: '#FFD60A', outline: '#000000',
  outlineWidth: 4, shadow: 0, box: null, x: 0.5, y: 0.86, maxLineChars: 32, maxLines: 2, maxWords: 0, animation: 'none',
};

export const CAPTION_STYLES: CaptionStyle[] = [
  { ...base, id: 'clean', name: { tr: 'Sade', en: 'Clean' } },
  { ...base, id: 'boxed', name: { tr: 'Kutulu', en: 'Boxed' }, bold: false, size: 52, outlineWidth: 0, box: '#000000', animation: 'fade' },
  { ...base, id: 'reels-pop', name: { tr: 'Reels Pop', en: 'Reels Pop' }, font: 'Arial Black', size: 92, uppercase: true, outlineWidth: 7, shadow: 3,
    y: 0.7, maxLineChars: 16, maxWords: 3, animation: 'pop' },
  { ...base, id: 'highlight', name: { tr: 'Kelime Vurgusu', en: 'Word Highlight' }, font: 'Arial Black', size: 84, uppercase: true, outlineWidth: 6,
    y: 0.72, maxLineChars: 18, maxWords: 4, animation: 'highlight' },
  { ...base, id: 'karaoke', name: { tr: 'Karaoke', en: 'Karaoke' }, size: 70, outlineWidth: 5, highlight: '#00E5FF', animation: 'karaoke' },
  { ...base, id: 'reveal', name: { tr: 'Kelime Kelime', en: 'Word by Word' }, size: 76, outlineWidth: 5, y: 0.75, maxLineChars: 22, maxWords: 5, animation: 'reveal' },
];

export function getCaptionStyle(id: string, overrides: Partial<CaptionStyle> = {}): CaptionStyle {
  const s = CAPTION_STYLES.find(x => x.id === id);
  if (!s) throw new Error(`Unknown caption style "${id}". Known: ${CAPTION_STYLES.map(x => x.id).join(', ')}`);
  return { ...s, ...overrides };
}

const upper = (t: string, s: CaptionStyle) => (s.uppercase ? t.toLocaleUpperCase('tr-TR') : t);

/** Split a caption's words into at most `maxLines` lines of roughly equal length. Returns word counts per line. */
export function splitLines(words: string[], maxLineChars: number, maxLines: number): number[] {
  const total = words.join(' ').length;
  const lines = Math.min(maxLines, Math.max(1, Math.ceil(total / maxLineChars)), words.length);
  if (lines <= 1) return [words.length];
  const target = total / lines;
  const out: number[] = [];
  let count = 0, len = 0;
  for (let i = 0; i < words.length; i++) {
    const add = (len ? 1 : 0) + words[i]!.length;
    const remainingLines = lines - out.length;
    if (count > 0 && remainingLines > 1 && len + add / 2 > target && words.length - i >= remainingLines - 1) {
      out.push(count); count = 0; len = 0;
    }
    count++; len += (len ? 1 : 0) + words[i]!.length;
  }
  out.push(count);
  return out;
}

// ---------------- WebVTT ----------------
function vttTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}.${p(ms % 1000, 3)}`;
}

/** WebVTT; with `wordTimes` each word gets an inline timestamp (karaoke-style players highlight it). */
export function toVtt(captions: Caption[], wordTimes = false): string {
  const cues = captions.map((c, i) => {
    const text = wordTimes && c.words.length
      ? c.words.map((w, k) => (k === 0 ? w.text : `<${vttTime(w.start)}>${w.text}`)).join(' ')
      : c.text;
    return `${i + 1}\n${vttTime(c.start)} --> ${vttTime(c.end)}\n${text}\n`;
  });
  return `WEBVTT\n\n${cues.join('\n')}`;
}

// ---------------- ASS ----------------
function assColor(hex: string, alpha = 0): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Bad colour ${hex}`);
  const [r, g, b] = [m[1]!.slice(0, 2), m[1]!.slice(2, 4), m[1]!.slice(4, 6)];
  return `&H${alpha.toString(16).padStart(2, '0')}${b}${g}${r}`.toUpperCase();
}
function assTime(sec: number): string {
  const cs = Math.max(0, Math.round(sec * 100));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${Math.floor(cs / 360000)}:${p(Math.floor(cs / 6000) % 60)}:${p(Math.floor(cs / 100) % 60)}.${p(cs % 100)}`;
}
const assEscape = (t: string) => t.replace(/\\/g, '⧵').replace(/[{}]/g, m => (m === '{' ? '(' : ')'));

export interface AssOptions { width: number; height: number }

/** ASS script that reproduces the style and animation. Times are as given (use timeline times for overlays). */
export function toAss(captions: Caption[], style: CaptionStyle, o: AssOptions = { width: 1920, height: 1080 }): string {
  const scale = o.height / 1080;
  const size = Math.round(style.size * scale);
  const outline = style.box ? Math.round(10 * scale) : Math.round(style.outlineWidth * scale);
  const posX = Math.round(style.x * o.width), posY = Math.round(style.y * o.height);
  const hl = assColor(style.highlight), base = assColor(style.color);
  const header = [
    '[Script Info]', '; Generated by Ultimate Editor Toolkit', 'ScriptType: v4.00+', `PlayResX: ${o.width}`, `PlayResY: ${o.height}`,
    'WrapStyle: 2', 'ScaledBorderAndShadow: yes', '', '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // Karaoke (\kf) sweeps from SecondaryColour to PrimaryColour, so the highlight is Primary there.
    `Style: UET,${style.font},${size},${style.animation === 'karaoke' ? hl : base},${style.animation === 'karaoke' ? base : hl},` +
      `${style.box ? assColor(style.box, 0x30) : assColor(style.outline)},${assColor(style.box ?? '#000000', 0x60)},${style.bold ? -1 : 0},0,0,0,100,100,0,0,` +
      `${style.box ? 3 : 1},${outline},${Math.round(style.shadow * scale)},2,20,20,20,1`,
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const events: string[] = [];
  const ev = (start: number, end: number, text: string) => {
    if (end - start >= 0.01) events.push(`Dialogue: 0,${assTime(start)},${assTime(end)},UET,,0,0,0,,{\\an2\\pos(${posX},${posY})}${text}`);
  };
  for (const c of captions) {
    const words = c.words.length ? c.words : [{ text: c.text, start: c.start, end: c.end, p: 1 } as Word];
    const texts = words.map(w => assEscape(upper(w.text, style)));
    const counts = splitLines(texts, style.maxLineChars, style.maxLines);
    const lineEnds = new Set<number>(); // index of the last word of each line except the last
    counts.reduce((acc, n, li) => { if (li < counts.length - 1) lineEnds.add(acc + n - 1); return acc + n; }, 0);
    const join = (parts: string[]) => parts.map((p, k) => p + (k === parts.length - 1 ? '' : lineEnds.has(k) ? '\\N' : ' ')).join('');
    switch (style.animation) {
      case 'none': ev(c.start, c.end, join(texts)); break;
      case 'fade': ev(c.start, c.end, `{\\fad(120,120)}${join(texts)}`); break;
      case 'pop': ev(c.start, c.end, `{\\fscx70\\fscy70\\t(0,90,\\fscx108\\fscy108)\\t(90,160,\\fscx100\\fscy100)}${join(texts)}`); break;
      case 'karaoke': {
        // \kf durations in centiseconds; gaps before a word are added to that word's sweep.
        let t = c.start;
        const parts = words.map((w, k) => { const d = Math.max(1, Math.round((w.end - t) * 100)); t = w.end; return `{\\kf${d}}${texts[k]}`; });
        ev(c.start, c.end, join(parts));
        break;
      }
      case 'highlight':
      case 'reveal':
        words.forEach((w, k) => {
          const end = k + 1 < words.length ? words[k + 1]!.start : c.end;
          const start = k === 0 ? c.start : w.start;
          const parts = texts.map((t, j) => {
            if (style.animation === 'reveal') return j <= k ? t : `{\\alpha&HFF&}${t}{\\alpha&H00&}`;
            return j === k ? `{\\c${hl}\\fscx110\\fscy110}${t}{\\c${base}\\fscx100\\fscy100}` : t;
          });
          const intro = style.animation === 'reveal' ? '' : k === 0 ? '{\\fscx85\\fscy85\\t(0,80,\\fscx100\\fscy100)}' : '';
          ev(start, end, intro + join(parts));
        });
        break;
    }
  }
  return [...header, ...events].join('\n') + '\n';
}

// ---------------- JSON animation data ----------------
export interface CaptionJson {
  format: 'uet.captions/1';
  style: CaptionStyle;
  captions: { start: number; end: number; text: string; lines: number[]; words: { text: string; start: number; end: number }[] }[];
}

export function toCaptionJson(captions: Caption[], style: CaptionStyle): CaptionJson {
  return {
    format: 'uet.captions/1', style,
    captions: captions.map(c => {
      const words = c.words.map(w => ({ text: upper(w.text, style), start: w.start, end: w.end }));
      return { start: c.start, end: c.end, text: upper(c.text, style), lines: splitLines(words.map(w => w.text), style.maxLineChars, style.maxLines), words };
    }),
  };
}
