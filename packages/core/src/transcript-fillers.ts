/**
 * Filler-word and stutter detection on word-level transcripts. Pure functions, no I/O.
 *
 * Note: Whisper tends to leave out "ııı / um" sounds. The Engine asks for verbatim output (an initial prompt full of
 * fillers) when it transcribes for this tool, which helps but does not guarantee every filler is written down.
 */
import type { Word } from './transcript.js';
import { normalizeRanges, type Range } from './time.js';

export type FillerKind = 'sound' | 'discourse' | 'repeat';
export interface Filler { index: number; text: string; start: number; end: number; kind: FillerKind }

/** Hesitation sounds. Safe to cut by default. Matched after lower-casing and collapsing repeated letters. */
const SOUND: Record<string, RegExp> = {
  tr: /^(e|ı|ıh|eh|ah|ım|em|hı|hm|hmm|mm|m|ö|öh)$/,
  en: /^(um|umm|uh|uhm|uh-huh|er|erm|ah|eh|hm|hmm|mm|m)$/,
};
/** Words that are often filler but also real words: offered, never cut unless asked. */
const DISCOURSE: Record<string, string[]> = {
  tr: ['yani', 'hani', 'işte', 'şey', 'falan', 'filan', 'aslında', 'açıkçası', 'yani işte', 'nasıl desem', 'bi şey'],
  en: ['like', 'so', 'basically', 'actually', 'literally', 'you know', 'i mean', 'kind of', 'sort of', 'right'],
};

/** Lower-case (Turkish-aware), strip punctuation, collapse letters repeated 3+ times ("eeee" → "e", "hmmm" → "hmm"). */
export function normalizeWord(t: string, lang = 'tr'): string {
  const lower = lang === 'tr' ? t.toLocaleLowerCase('tr-TR') : t.toLowerCase();
  return lower
    .replace(/[^\p{L}\p{N}'-]+/gu, '')
    .replace(/(\p{L})\1{2,}/gu, '$1$1')
    .replace(/^(\p{L})\1$/u, '$1'); // "ee" → "e", "ıı" → "ı"
}

export interface FillerOptions {
  language: string;
  /** Kinds to report. Default: all. */
  kinds?: FillerKind[];
  /** Two equal words closer than this (seconds) count as a stutter; the earlier copy is reported. */
  repeatGap?: number;
}

export function findFillers(words: Word[], o: FillerOptions): Filler[] {
  const lang = o.language in SOUND ? o.language : 'en';
  const kinds = new Set(o.kinds ?? ['sound', 'discourse', 'repeat']);
  const gap = o.repeatGap ?? 0.6;
  const norm = words.map(w => normalizeWord(w.text, lang));
  const out: Filler[] = [];
  const taken = new Set<number>();
  // Two-word discourse fillers first ("you know", "nasıl desem").
  for (let i = 0; i < words.length; i++) {
    if (taken.has(i)) continue;
    const one = norm[i]!, two = i + 1 < words.length ? `${one} ${norm[i + 1]}` : '';
    if (!one) continue;
    if (kinds.has('sound') && SOUND[lang]!.test(one)) {
      out.push({ index: i, text: words[i]!.text, start: words[i]!.start, end: words[i]!.end, kind: 'sound' }); taken.add(i); continue;
    }
    if (kinds.has('discourse')) {
      if (two && DISCOURSE[lang]!.includes(two)) {
        out.push({ index: i, text: `${words[i]!.text} ${words[i + 1]!.text}`, start: words[i]!.start, end: words[i + 1]!.end, kind: 'discourse' });
        taken.add(i); taken.add(i + 1); i++; continue;
      }
      if (DISCOURSE[lang]!.includes(one)) {
        out.push({ index: i, text: words[i]!.text, start: words[i]!.start, end: words[i]!.end, kind: 'discourse' }); taken.add(i); continue;
      }
    }
    if (kinds.has('repeat') && i + 1 < words.length && one === norm[i + 1] && one.length > 0 && words[i + 1]!.start - words[i]!.end <= gap) {
      out.push({ index: i, text: words[i]!.text, start: words[i]!.start, end: words[i]!.end, kind: 'repeat' }); taken.add(i);
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * Ranges to cut for the given fillers. Each cut grows into the silence around the filler by up to `pad` seconds
 * but never into the neighbouring words, so real speech is not clipped.
 */
export function fillerCutRanges(words: Word[], fillers: Filler[], pad = 0.08): Range[] {
  const cuts: Range[] = [];
  for (const f of fillers) {
    const firstIdx = f.index;
    const lastIdx = words.findIndex((w, k) => k >= firstIdx && Math.abs(w.end - f.end) < 1e-6);
    const prev = words[firstIdx - 1], next = words[(lastIdx >= 0 ? lastIdx : firstIdx) + 1];
    const start = Math.max(f.start - pad, prev ? prev.end : 0);
    const end = Math.min(f.end + pad, next ? next.start : f.end + pad);
    if (end > start) cuts.push({ start, end });
  }
  return normalizeRanges(cuts);
}
