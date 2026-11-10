import type { Range } from '@uet/core';
import { decodePcm, probeDuration, run, FFMPEG } from './ffmpeg.js';

export interface SilenceAnalysis {
  duration: number;
  noiseFloorDb: number;
  thresholdDb: number;
  silences: Range[];
  windowSec: number;
}

/** RMS level in dBFS for consecutive windows. */
export function rmsWindows(pcm: Int16Array, sampleRate: number, windowSec: number): Float64Array {
  const n = Math.max(1, Math.round(sampleRate * windowSec));
  const count = Math.ceil(pcm.length / n);
  const out = new Float64Array(count);
  for (let w = 0; w < count; w++) {
    let sum = 0;
    const end = Math.min(pcm.length, (w + 1) * n);
    for (let i = w * n; i < end; i++) { const s = pcm[i]! / 32768; sum += s * s; }
    const rms = Math.sqrt(sum / Math.max(1, end - w * n));
    out[w] = rms > 0 ? 20 * Math.log10(rms) : -120;
  }
  return out;
}

export function percentile(values: ArrayLike<number>, p: number): number {
  const a = Array.from(values).sort((x, y) => x - y);
  if (a.length === 0) return -120;
  return a[Math.min(a.length - 1, Math.max(0, Math.floor(p * (a.length - 1))))]!;
}

/**
 * Detect silences. Threshold = measured room noise + margin, clamped to a sane range,
 * unless the user gives an explicit threshold (FEATURE_INVENTORY F-AU-01).
 */
export function detectSilenceFromPcm(
  pcm: Int16Array,
  sampleRate: number,
  opts: { thresholdDb?: number; marginDb?: number; windowSec?: number; minSilence?: number } = {},
): Omit<SilenceAnalysis, 'duration'> {
  const windowSec = opts.windowSec ?? 0.02;
  const levels = rmsWindows(pcm, sampleRate, windowSec);
  const noiseFloorDb = percentile(levels, 0.1);
  const thresholdDb = opts.thresholdDb ?? Math.min(-25, Math.max(-60, noiseFloorDb + (opts.marginDb ?? 10)));
  const minSilence = opts.minSilence ?? 0.3;
  const silences: Range[] = [];
  let start: number | null = null;
  for (let i = 0; i <= levels.length; i++) {
    const quiet = i < levels.length && levels[i]! < thresholdDb;
    if (quiet && start === null) start = i;
    if (!quiet && start !== null) {
      const s = start * windowSec, e = Math.min(i * windowSec, pcm.length / sampleRate);
      if (e - s >= minSilence) silences.push({ start: round3(s), end: round3(e) });
      start = null;
    }
  }
  return { noiseFloorDb: round1(noiseFloorDb), thresholdDb: round1(thresholdDb), silences, windowSec };
}

export async function detectSilence(file: string, opts: Parameters<typeof detectSilenceFromPcm>[2] = {}): Promise<SilenceAnalysis> {
  const sr = 16000;
  const [duration, pcm] = await Promise.all([probeDuration(file), decodePcm(file, sr)]);
  return { duration, ...detectSilenceFromPcm(pcm, sr, opts) };
}

/** Integrated loudness (LUFS) and true peak via ffmpeg ebur128 (FEATURE_INVENTORY F-AU-04). */
export async function measureLoudness(file: string): Promise<{ integratedLufs: number; truePeakDb: number; lra: number }> {
  const r = await run(FFMPEG, ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const summary = r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
  const num = (re: RegExp) => { const m = re.exec(summary); return m ? Number(m[1]) : NaN; };
  const integratedLufs = num(/I:\s*(-?[\d.]+)\s*LUFS/);
  if (!Number.isFinite(integratedLufs)) throw new Error('loudness measurement failed: ' + r.stderr.slice(-300));
  return { integratedLufs, truePeakDb: num(/Peak:\s*(-?[\d.]+)\s*dBFS/), lra: num(/LRA:\s*(-?[\d.]+)\s*LU/) };
}

/** Gain in dB needed to hit a target, limited so true peak stays under the ceiling. */
export function loudnessGain(measured: { integratedLufs: number; truePeakDb: number }, targetLufs: number, ceilingDb = -1): number {
  const wanted = targetLufs - measured.integratedLufs;
  const headroom = ceilingDb - measured.truePeakDb;
  return round1(Math.min(wanted, headroom));
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const round3 = (x: number) => Math.round(x * 1000) / 1000;
