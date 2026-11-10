/**
 * Transcript model + caption building. Pure functions, no I/O.
 * Input format: whisper.cpp `whisper-cli -ojf` JSON (offsets in milliseconds, tokens with per-token offsets).
 */
export interface Word { text: string; start: number; end: number; p: number }
export interface Segment { start: number; end: number; text: string; words: Word[] }
export interface Caption { index: number; start: number; end: number; text: string; words: Word[] }

interface WTok { text: string; offsets?: { from: number; to: number }; p?: number }
interface WSeg { offsets: { from: number; to: number }; text: string; tokens?: WTok[] }
export interface WhisperJson { result?: { language?: string }; transcription: WSeg[] }

/** Special tokens look like [_BEG_], [_TT_150], <|endoftext|>. */
function isSpecial(t: string): boolean { return /^\s*(\[_[A-Z]+_?\d*\]|<\|.*\|>)\s*$/.test(t); }

export function parseWhisperJson(json: WhisperJson): { language: string | null; segments: Segment[] } {
  const segments: Segment[] = [];
  for (const s of json.transcription ?? []) {
    const start = s.offsets.from / 1000, end = s.offsets.to / 1000;
    const words: Word[] = [];
    let cur: { text: string; start: number; end: number; ps: number[] } | null = null;
    const flush = () => {
      if (cur && cur.text.trim()) {
        const p = cur.ps.length ? cur.ps.reduce((a, b) => a + b, 0) / cur.ps.length : 1;
        words.push({ text: cur.text.trim(), start: cur.start, end: Math.max(cur.end, cur.start), p: Math.round(p * 1000) / 1000 });
      }
      cur = null;
    };
    for (const t of s.tokens ?? []) {
      if (isSpecial(t.text)) continue;
      const t0 = t.offsets ? t.offsets.from / 1000 : start;
      const t1 = t.offsets ? t.offsets.to / 1000 : end;
      // A new word starts at a leading space; punctuation-only tokens stay attached to the previous word.
      const startsWord = /^\s/.test(t.text) && !/^\s*[.,!?;:…"')\]]+\s*$/.test(t.text);
      if (!cur || startsWord) { flush(); cur = { text: '', start: t0, end: t1, ps: [] }; }
      cur!.text += t.text;
      cur!.end = t1;
      if (typeof t.p === 'number') cur!.ps.push(t.p);
    }
    flush();
    // Clamp word times into the segment (token timestamps can drift slightly).
    for (const w of words) { w.start = Math.min(Math.max(w.start, start), end); w.end = Math.min(Math.max(w.end, w.start), end); }
    segments.push({ start, end, text: s.text.trim(), words });
  }
  return { language: json.result?.language ?? null, segments };
}

export interface CaptionOptions { maxChars: number; maxDuration: number; maxGap: number; minDuration: number }
export const DEFAULT_CAPTIONS: CaptionOptions = { maxChars: 42, maxDuration: 5, maxGap: 0.6, minDuration: 0.7 };

/** Group words into caption lines: break on length, duration, pauses and sentence ends. */
export function buildCaptions(words: Word[], opts: Partial<CaptionOptions> = {}): Caption[] {
  const o = { ...DEFAULT_CAPTIONS, ...opts };
  const out: Caption[] = [];
  let cur: Word[] = [];
  const push = () => {
    if (!cur.length) return;
    out.push({ index: out.length + 1, start: cur[0]!.start, end: cur[cur.length - 1]!.end, text: cur.map(w => w.text).join(' '), words: cur });
    cur = [];
  };
  for (const w of words) {
    if (cur.length) {
      const first = cur[0]!, last = cur[cur.length - 1]!;
      const len = cur.map(x => x.text).join(' ').length + 1 + w.text.length;
      if (len > o.maxChars || w.end - first.start > o.maxDuration || w.start - last.end > o.maxGap || /[.!?…]$/.test(last.text)) push();
    }
    cur.push(w);
  }
  push();
  // Give very short captions some reading time without overlapping the next one.
  for (let i = 0; i < out.length; i++) {
    const c = out[i]!, next = out[i + 1];
    if (c.end - c.start < o.minDuration) c.end = Math.min(c.start + o.minDuration, next ? next.start : Infinity);
  }
  return out;
}

/** Keep captions inside [sourceIn, sourceOut] of the media and shift them to timeline time. */
export function mapToTimeline(caps: Caption[], m: { sourceIn: number; sourceOut: number; timelineStart: number }): Caption[] {
  const off = m.timelineStart - m.sourceIn;
  return caps
    .filter(c => c.end > m.sourceIn && c.start < m.sourceOut)
    .map((c, i) => ({
      ...c, index: i + 1,
      start: Math.max(c.start, m.sourceIn) + off,
      end: Math.min(c.end, m.sourceOut) + off,
      words: c.words.map(w => ({ ...w, start: w.start + off, end: w.end + off })),
    }));
}

function srtTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, r = ms % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

export function toSrt(captions: Caption[]): string {
  return captions.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n');
}
