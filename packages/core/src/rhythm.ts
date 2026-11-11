/**
 * Beat tracking + scene helpers. Pure functions on numeric arrays (no I/O).
 * Beat tracker: log-energy onset envelope → tempo by autocorrelation (60–200 BPM, prefers 90–150)
 * → beat phase by comb scoring → each beat snapped to the nearest onset peak.
 */
export interface BeatResult { bpm: number; beats: number[]; confidence: number }

/** Onset strength per hop: half-wave rectified rise of log energy. */
export function onsetEnvelope(pcm: Int16Array | Float32Array, sampleRate: number, hop = 256, win = 1024): { env: Float64Array; hopSec: number; offsetSec: number } {
  const n = Math.max(0, Math.floor((pcm.length - win) / hop) + 1);
  const scale = pcm instanceof Int16Array ? 1 / 32768 : 1;
  const energy = new Float64Array(n);
  for (let f = 0; f < n; f++) {
    let s = 0;
    const o = f * hop;
    for (let i = 0; i < win; i++) { const v = pcm[o + i]! * scale; s += v * v; }
    energy[f] = Math.log10(1e-10 + s / win);
  }
  const env = new Float64Array(n);
  for (let f = 1; f < n; f++) env[f] = Math.max(0, energy[f]! - energy[f - 1]!);
  // remove slow trend: subtract local mean (~0.5 s)
  const k = Math.max(1, Math.round((0.5 * sampleRate) / hop));
  const out = new Float64Array(n);
  let acc = 0;
  for (let f = 0; f < n; f++) {
    acc += env[f]!; if (f - k >= 0) acc -= env[f - k]!;
    out[f] = Math.max(0, env[f]! - acc / Math.min(f + 1, k));
  }
  // frame f's rise comes from the samples entering at its end: [f*hop+win-hop, f*hop+win]
  return { env: out, hopSec: hop / sampleRate, offsetSec: (win - hop / 2) / sampleRate };
}

export function estimateTempo(env: Float64Array, hopSec: number, minBpm = 60, maxBpm = 200): { bpm: number; lag: number; confidence: number } {
  const minLag = Math.max(1, Math.floor(60 / maxBpm / hopSec));
  const maxLag = Math.min(env.length - 1, Math.ceil(60 / minBpm / hopSec));
  let best = -Infinity, bestLag = minLag, total = 0, count = 0;
  const mean = env.reduce((a, b) => a + b, 0) / Math.max(1, env.length);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = lag; i < env.length; i++) s += (env[i]! - mean) * (env[i - lag]! - mean);
    s /= env.length - lag;
    // gentle preference around 120 BPM (log-Gaussian), avoids half/double tempo picks
    const bpm = 60 / (lag * hopSec);
    const w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 1.0, 2));
    const score = s * w;
    total += Math.max(0, score); count++;
    if (score > best) { best = score; bestLag = lag; }
  }
  // parabolic refinement for fractional lag
  const at = (l: number) => { let s = 0; for (let i = l; i < env.length; i++) s += (env[i]! - mean) * (env[i - l]! - mean); return s / (env.length - l); };
  let lag = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    const a = at(bestLag - 1), b = at(bestLag), c = at(bestLag + 1);
    const d = a - 2 * b + c;
    if (d < 0) lag = bestLag + 0.5 * (a - c) / d;
  }
  const confidence = count && total > 0 ? Math.min(1, best / (total / count) / 10) : 0;
  return { bpm: Math.round((60 / (lag * hopSec)) * 10) / 10, lag, confidence: Math.round(confidence * 100) / 100 };
}

export function trackBeats(env: Float64Array, hopSec: number, opts: { minBpm?: number; maxBpm?: number; offsetSec?: number } = {}): BeatResult {
  if (env.length < 8) return { bpm: 0, beats: [], confidence: 0 };
  const { bpm, lag, confidence } = estimateTempo(env, hopSec, opts.minBpm, opts.maxBpm);
  // best phase: maximise onset energy on the grid
  let bestPhase = 0, bestScore = -Infinity;
  for (let ph = 0; ph < lag; ph += 0.5) {
    let s = 0;
    for (let t = ph; t < env.length; t += lag) s += env[Math.round(t)] ?? 0;
    if (s > bestScore) { bestScore = s; bestPhase = ph; }
  }
  const beats: number[] = [];
  const radius = Math.max(1, Math.round(lag * 0.12));
  for (let t = bestPhase; t < env.length; t += lag) {
    const c = Math.round(t);
    let bi = c, bv = env[c] ?? 0;
    for (let i = Math.max(0, c - radius); i <= Math.min(env.length - 1, c + radius); i++) if (env[i]! > bv) { bv = env[i]!; bi = i; }
    beats.push(Math.round((bi * hopSec + (opts.offsetSec ?? 0)) * 1000) / 1000);
  }
  return { bpm, beats, confidence };
}

/** Keep every Nth beat starting from `offset` (e.g. every bar in 4/4 = every 4th). */
export function everyNth(beats: number[], n: number, offset = 0): number[] {
  return beats.filter((_, i) => i >= offset && (i - offset) % n === 0);
}

/** Parse ffmpeg showinfo output → frame times; drop cuts closer than minGap seconds. */
export function parseSceneTimes(stderr: string, minGap = 0.5): number[] {
  const times: number[] = [];
  const re = /showinfo.*?pts_time:\s*([\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stderr))) {
    const t = Number(m[1]);
    if (!times.length || t - times[times.length - 1]! >= minGap) times.push(Math.round(t * 1000) / 1000);
  }
  return times;
}

/** Turn cut points into consecutive segments covering [start, end]. */
export function segmentsFromCuts(cuts: number[], start: number, end: number): { start: number; end: number }[] {
  const pts = [start, ...cuts.filter(t => t > start + 1e-3 && t < end - 1e-3), end];
  const out: { start: number; end: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) out.push({ start: pts[i]!, end: pts[i + 1]! });
  return out;
}
