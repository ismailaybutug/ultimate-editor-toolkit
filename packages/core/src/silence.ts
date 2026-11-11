import { Range, invertRanges, normalizeRanges, snapToFrame } from './time.js';

export interface SilenceOptions {
  /** Silences shorter than this are kept (seconds). */
  minSilence: number;
  /** Audio kept before and after each spoken part (seconds). */
  padding: number;
  /** Kept parts shorter than this are merged into the cut (seconds). */
  minKeep: number;
  /** Snap results to this frame rate. */
  fps: number;
}

export const DEFAULT_SILENCE_OPTIONS: SilenceOptions = { minSilence: 0.5, padding: 0.12, minKeep: 0.25, fps: 30 };

/**
 * Turn detected silences into the ranges to KEEP.
 * Padding shrinks each silence on both sides so words are not clipped ("word guard").
 * `protectedRanges` (e.g. word timestamps) are never cut.
 */
export function planSilenceCut(
  silences: Range[],
  duration: number,
  opts: Partial<SilenceOptions> = {},
  protectedRanges: Range[] = [],
): { keep: Range[]; cut: Range[] } {
  const o = { ...DEFAULT_SILENCE_OPTIONS, ...opts };
  let cut = normalizeRanges(silences)
    .filter(s => s.end - s.start >= o.minSilence)
    .map(s => ({
      start: s.start <= 0 ? 0 : s.start + o.padding,
      end: s.end >= duration ? duration : s.end - o.padding,
    }))
    .filter(s => s.end > s.start);

  // Never cut inside protected ranges: split cuts around them.
  for (const p of normalizeRanges(protectedRanges)) {
    cut = cut.flatMap(c => {
      if (p.end <= c.start || p.start >= c.end) return [c];
      const parts: Range[] = [];
      if (p.start > c.start) parts.push({ start: c.start, end: p.start });
      if (p.end < c.end) parts.push({ start: p.end, end: c.end });
      return parts;
    });
  }

  let keep = invertRanges(cut, duration);
  // Drop tiny kept fragments (clicks, breaths) by turning them into cuts.
  keep = keep.filter(k => k.end - k.start >= o.minKeep);
  keep = keep
    .map(k => ({ start: snapToFrame(k.start, o.fps), end: snapToFrame(k.end, o.fps) }))
    .filter(k => k.end > k.start);
  keep = normalizeRanges(keep);
  return { keep, cut: invertRanges(keep, duration) };
}

/** Parse ffmpeg `silencedetect` stderr output into ranges. */
export function parseSilencedetect(stderr: string, duration: number): Range[] {
  const out: Range[] = [];
  let start: number | null = null;
  for (const line of stderr.split(/\r?\n/)) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (s) { start = Math.max(0, Number(s[1])); continue; }
    const e = /silence_end:\s*([\d.]+)/.exec(line);
    if (e && start !== null) { out.push({ start, end: Number(e[1]) }); start = null; }
  }
  if (start !== null) out.push({ start, end: duration }); // silence runs to the end
  return out;
}
