/**
 * Transcript tools beyond plain captions. Pure functions, no I/O.
 * - Corrections list (F-SUB-05): fix words Whisper keeps mishearing (brand names, people).
 * - SRT import (F-SUB-04): use an existing .srt with our styles.
 * - Key-word emphasis (F-SUB-02): which words get the highlight colour in "stacked" looks.
 * - Retakes (F-AI-04): a sentence said again soon after → keep the last take.
 * - Chapters (F-FMT-05): topic changes from the words alone (text tiling), YouTube chapter list.
 */
import type { Caption, Word } from './transcript.js';
import { normalizeWord } from './transcript-fillers.js';
import type { Range } from './time.js';

// ---------------- Corrections ----------------
export interface Correction { from: string; to: string }

/** "yanlış => doğru" or "yanlış = doğru" per line; blank lines and # comments ignored. */
export function parseCorrections(text: string): Correction[] {
  return text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    .map(l => l.split(/\s*(?:=>|→|=)\s*/))
    .filter(p => p.length === 2 && p[0] && p[1])
    .map(([from, to]) => ({ from: from!, to: to! }));
}

const key = (t: string, lang: string) => normalizeWord(t, lang);

/**
 * Replace mis-heard words. `from` may be several words ("open ay" → "OpenAI"); matching ignores case and
 * punctuation; punctuation attached to the last replaced word is kept. Timing spans the replaced words.
 */
export function applyCorrections(words: Word[], list: Correction[], lang = 'tr'): { words: Word[]; changed: number } {
  const rules = list.map(c => ({ from: c.from.split(/\s+/).map(t => key(t, lang)).filter(Boolean), to: c.to }))
    .filter(r => r.from.length).sort((a, b) => b.from.length - a.from.length);
  const out: Word[] = [];
  let changed = 0;
  for (let i = 0; i < words.length;) {
    const rule = rules.find(r => r.from.every((f, k) => i + k < words.length && key(words[i + k]!.text, lang) === f));
    if (!rule) { out.push(words[i]!); i++; continue; }
    const last = words[i + rule.from.length - 1]!;
    const trail = /[.,!?;:…"')\]]+$/.exec(last.text)?.[0] ?? '';
    out.push({ text: rule.to + trail, start: words[i]!.start, end: last.end, p: 1 });
    changed++;
    i += rule.from.length;
  }
  return { words: out, changed };
}

/** Correct spellings, given to Whisper as its initial prompt so it prefers them. */
export function correctionsPrompt(list: Correction[]): string {
  return [...new Set(list.map(c => c.to))].join(', ');
}

// ---------------- SRT import ----------------
function parseTime(t: string): number {
  const m = /(\d+):(\d{2}):(\d{2})[,.](\d{1,3})/.exec(t);
  if (!m) throw new Error(`Bad SRT time "${t}"`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]!.padEnd(3, '0')) / 1000;
}

/**
 * Parse SRT (or simple WebVTT) into captions. SRT has no word times, so words are spread over the cue by their
 * length; good enough for highlight/karaoke looks, exact for plain looks.
 */
export function parseSrt(text: string): Caption[] {
  const blocks = text.replace(/^﻿/, '').replace(/\r/g, '').replace(/^WEBVTT[^\n]*\n/, '').split(/\n{2,}/);
  const out: Caption[] = [];
  for (const b of blocks) {
    const lines = b.split('\n').filter(l => l.trim());
    const ti = lines.findIndex(l => l.includes('-->'));
    if (ti < 0) continue;
    const [a, z] = lines[ti]!.split('-->');
    const start = parseTime(a!.trim()), end = parseTime(z!.trim());
    const body = lines.slice(ti + 1).join(' ').replace(/<[^>]+>/g, '').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
    if (!body || end <= start) continue;
    const toks = body.split(' ');
    const total = toks.reduce((s, t) => s + t.length + 1, 0);
    let t = start;
    const words = toks.map(tok => { const d = ((tok.length + 1) / total) * (end - start); const w = { text: tok, start: t, end: t + d, p: 1 }; t += d; return w; });
    out.push({ index: out.length + 1, start, end, text: body, words });
  }
  return out;
}

// ---------------- Key-word emphasis ----------------
const STOP: Record<string, Set<string>> = {
  tr: new Set('ve veya ile ama fakat çünkü ki de da bu şu o bir iki için gibi kadar daha çok en mi mı mu mü ne neden nasıl ben sen biz siz onlar bunu şunu onu bana sana var yok olarak olan oldu olur ise eğer hem yani şey işte hani her hiç böyle şöyle sonra önce artık zaten bile diye değil'.split(' ')),
  en: new Set('the a an and or but so because of to in on at for with from by is are was were be been it this that these those i you we they he she my your our their me us them not no yes do does did have has had will would can could just like very really then than there here what why how when who which as if about into out up down'.split(' ')),
};
export const isStopword = (w: string, lang = 'tr') => (STOP[lang] ?? STOP.en!).has(key(w, lang));

/**
 * Indices of words to emphasise: user key words first, then numbers, then the longest content word of each
 * caption (at most `perCaption`).
 */
export function pickEmphasis(captions: Caption[], o: { language?: string; keywords?: string[]; perCaption?: number } = {}): Set<string> {
  const lang = o.language ?? 'tr';
  const kw = new Set((o.keywords ?? []).map(k => key(k, lang)));
  const out = new Set<string>();
  captions.forEach((c, ci) => {
    const picked: number[] = [];
    c.words.forEach((w, wi) => { if (kw.has(key(w.text, lang)) || /\d/.test(w.text)) picked.push(wi); });
    if (!picked.length) {
      let best = -1, len = 0;
      c.words.forEach((w, wi) => { const k = key(w.text, lang); if (!isStopword(w.text, lang) && k.length > len && k.length >= 4) { best = wi; len = k.length; } });
      if (best >= 0) picked.push(best);
    }
    picked.slice(0, o.perCaption ?? 1).forEach(wi => out.add(`${ci}:${wi}`));
  });
  return out;
}

// ---------------- Retakes ----------------
export interface Sentence { start: number; end: number; first: number; last: number; text: string; tokens: string[] }

/** Split words into sentences at end punctuation or pauses longer than `gap`. */
export function sentences(words: Word[], lang = 'tr', gap = 0.8): Sentence[] {
  const out: Sentence[] = [];
  let first = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!, next = words[i + 1];
    if (!next || /[.!?…]$/.test(w.text) || next.start - w.end > gap) {
      const ws = words.slice(first, i + 1);
      out.push({ start: ws[0]!.start, end: w.end, first, last: i, text: ws.map(x => x.text).join(' '), tokens: ws.map(x => key(x.text, lang)).filter(Boolean) });
      first = i + 1;
    }
  }
  return out;
}

function lcs(a: string[], b: string[]): number {
  const dp = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) { const tmp = dp[j]; dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]); prev = tmp; }
  }
  return dp[b.length];
}

export interface Retake { start: number; end: number; text: string; keptText: string; similarity: number }

/**
 * A sentence is a retake when one of the next `lookahead` sentences starts the same way and repeats most of it
 * (abandoned starts count too). The cut runs from the retake's start to the start of the kept take.
 */
export function findRetakes(words: Word[], o: { language?: string; minSimilarity?: number; lookahead?: number; maxGap?: number } = {}): Retake[] {
  const ss = sentences(words, o.language ?? 'tr');
  const minSim = o.minSimilarity ?? 0.7, look = o.lookahead ?? 2, maxGap = o.maxGap ?? 20;
  const out: Retake[] = [];
  for (let i = 0; i < ss.length; i++) {
    const a = ss[i]!;
    if (a.tokens.length < 3) continue;
    for (let j = i + 1; j <= Math.min(ss.length - 1, i + look); j++) {
      const b = ss[j]!;
      if (b.start - a.end > maxGap) break;
      const sameStart = a.tokens.slice(0, 2).join(' ') === b.tokens.slice(0, 2).join(' ');
      const sim = lcs(a.tokens, b.tokens) / a.tokens.length;
      if (sameStart && sim >= minSim) {
        out.push({ start: a.start, end: b.start, text: a.text, keptText: b.text, similarity: Math.round(sim * 100) / 100 });
        break;
      }
    }
  }
  // Merge chains (take 1, take 2, take 3 → cut 1..3 start).
  return out.reduce<Retake[]>((acc, r) => {
    const last = acc[acc.length - 1];
    if (last && r.start <= last.end + 1e-6) { last.end = Math.max(last.end, r.end); last.keptText = r.keptText; } else acc.push({ ...r });
    return acc;
  }, []);
}

// ---------------- Chapters ----------------
export interface Chapter { start: number; title: string; keywords: string[] }

function tf(tokens: string[], lang: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens) if (t.length > 2 && !STOP[lang]?.has(t)) { const s = t.slice(0, 6); m.set(s, (m.get(s) ?? 0) + 1); } // crude stem: first 6 letters (Turkish suffixes)
  return m;
}
function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0, na = 0, nb = 0;
  for (const [k, v] of a) { na += v * v; const w = b.get(k); if (w) dot += v * w; }
  for (const v of b.values()) nb += v * v;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * Text-tiling chapters: compare the words before and after each sentence boundary (windows of `window` seconds);
 * the deepest similarity valleys become chapter starts, at least `minLength` seconds apart.
 */
export function suggestChapters(words: Word[], o: { language?: string; minLength?: number; window?: number; maxChapters?: number } = {}): Chapter[] {
  const lang = o.language ?? 'tr';
  const minLen = o.minLength ?? 60, win = o.window ?? 45, maxN = o.maxChapters ?? 12;
  const ss = sentences(words, lang, 1.2);
  if (!ss.length) return [];
  const end = ss[ss.length - 1]!.end;
  const tokensIn = (from: number, to: number) => ss.filter(s => s.start >= from && s.end <= to).flatMap(s => s.tokens);
  const cands = ss.slice(1).map(s => {
    const sim = cosine(tf(tokensIn(s.start - win, s.start), lang), tf(tokensIn(s.start, s.start + win), lang));
    return { t: s.start, sim };
  }).filter(c => c.t >= minLen && end - c.t >= minLen);
  // Depth score: how much lower than the neighbours' peaks.
  const scored = cands.map((c, i) => {
    const left = Math.max(c.sim, ...cands.slice(Math.max(0, i - 3), i).map(x => x.sim));
    const right = Math.max(c.sim, ...cands.slice(i + 1, i + 4).map(x => x.sim));
    return { ...c, depth: left - c.sim + right - c.sim };
  }).sort((a, b) => b.depth - a.depth || a.sim - b.sim);
  const starts: number[] = [0];
  for (const c of scored) {
    if (starts.length >= maxN) break;
    if (c.depth <= 0.05) break;
    if (starts.every(s => Math.abs(s - c.t) >= minLen)) starts.push(c.t);
  }
  starts.sort((a, b) => a - b);
  return starts.map((s, i) => {
    const to = starts[i + 1] ?? end + 1;
    const counts = tf(ss.filter(x => x.start >= s && x.start < to).flatMap(x => x.tokens), lang);
    // Show the most frequent full word of the top stems.
    const full = new Map<string, string>();
    for (const x of ss.filter(q => q.start >= s && q.start < to)) for (const t of x.tokens) if (!full.has(t.slice(0, 6))) full.set(t.slice(0, 6), t);
    const keywords = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => full.get(k) ?? k);
    const title = i === 0 ? (lang === 'tr' ? 'Giriş' : 'Intro') : keywords.map((k, n) => (n === 0 ? k.charAt(0).toLocaleUpperCase(lang === 'tr' ? 'tr-TR' : 'en') + k.slice(1) : k)).join(', ');
    return { start: Math.round(s), title, keywords };
  });
}

/** "00:00 Giriş" lines for a YouTube description (YouTube needs ≥3 chapters, first at 0:00, each ≥10 s). */
export function youtubeChapters(ch: Chapter[]): string {
  const f = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60;
    return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m).padStart(2, '0')) + `:${String(x).padStart(2, '0')}`;
  };
  return ch.map(c => `${f(c.start)} ${c.title}`).join('\n');
}

