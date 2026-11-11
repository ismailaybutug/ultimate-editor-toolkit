/**
 * Music ducking plan (F-AU-03). Pure: speech ranges (timeline seconds) → gain keyframes.
 * Gains are in dB relative to the music clip's own level (0 = unchanged).
 */
import type { Range } from './time.js';
import { normalizeRanges } from './time.js';

export interface DuckOptions { duckDb: number; attack: number; release: number; mergeGap: number; minSpeech: number }
export const DEFAULT_DUCK: DuckOptions = { duckDb: -12, attack: 0.25, release: 0.5, mergeGap: 0.8, minSpeech: 0.3 };
export interface GainKey { t: number; db: number }

export function planDucking(speech: Range[], opts: Partial<DuckOptions> = {}): GainKey[] {
  const o = { ...DEFAULT_DUCK, ...opts };
  // merge speech separated by short pauses so the music does not pump between words
  const merged: Range[] = [];
  for (const r of normalizeRanges(speech)) {
    const last = merged[merged.length - 1];
    if (last && r.start - last.end <= o.mergeGap) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  const keys: GainKey[] = [];
  for (const r of merged.filter(r => r.end - r.start >= o.minSpeech)) {
    const a = Math.max(0, r.start - o.attack);
    keys.push({ t: a, db: 0 }, { t: r.start, db: o.duckDb }, { t: r.end, db: o.duckDb }, { t: r.end + o.release, db: 0 });
  }
  // drop keys that would go backwards when ranges are closer than attack+release
  const out: GainKey[] = [];
  for (const k of keys) {
    const prev = out[out.length - 1];
    if (prev && k.t <= prev.t + 1e-3) { if (k.db < prev.db) prev.db = k.db; continue; }
    out.push({ t: Math.round(k.t * 1000) / 1000, db: k.db });
  }
  return out;
}

/** Premiere stores clip Volume "Level" as linear amplitude where 0 dB = 10^(-15/20) ≈ 0.1778. Unverified in-app. */
export function premiereLevelFromDb(db: number): number { return Math.pow(10, (db - 15) / 20); }
export function dbFromPremiereLevel(v: number): number { return 20 * Math.log10(Math.max(v, 1e-9)) + 15; }
