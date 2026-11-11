// Time helpers. Premiere uses "ticks": 254016000000 per second.
export const TICKS_PER_SECOND = 254016000000;

export function secondsToTicks(seconds: number): string {
  // Ticks exceed 2^53 quickly, so return as a string built with BigInt.
  return (BigInt(Math.round(seconds * 1e6)) * BigInt(TICKS_PER_SECOND) / 1000000n).toString();
}

export function snapToFrame(seconds: number, fps: number): number {
  return Math.round(seconds * fps) / fps;
}

export interface Range {
  start: number; // seconds
  end: number;   // seconds
}

/** Merge overlapping/touching ranges and drop empty ones. */
export function normalizeRanges(ranges: Range[]): Range[] {
  const sorted = ranges.filter(r => r.end > r.start).sort((a, b) => a.start - b.start);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/** Complement of `cut` ranges inside [0, duration]. */
export function invertRanges(cut: Range[], duration: number): Range[] {
  const keep: Range[] = [];
  let cursor = 0;
  for (const r of normalizeRanges(cut)) {
    const s = Math.max(0, r.start), e = Math.min(duration, r.end);
    if (s > cursor) keep.push({ start: cursor, end: s });
    cursor = Math.max(cursor, e);
  }
  if (cursor < duration) keep.push({ start: cursor, end: duration });
  return keep;
}
