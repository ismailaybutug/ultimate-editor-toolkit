import { Bezier, bezierAt, EASINGS } from './easing.js';

export interface RampOptions {
  /** Clip time range to ramp (seconds of source footage). */
  sourceStart: number;
  sourceEnd: number;
  /** Speed in the middle of the ramp, as a factor (0.1 = 10%, 4 = 400%). */
  targetSpeed: number;
  /** Fraction of the output spent ramping in and out (0..0.5). */
  rampFraction: number;
  shape: 'in' | 'out' | 'both';
  ease?: keyof typeof EASINGS;
  /** Keyframes per second written to Time Remap. */
  samplesPerSecond?: number;
}

/**
 * Build Time Remap keyframes for an AE speed ramp.
 * Speed goes 1x -> target -> 1x (shape 'both'). We integrate the speed curve to
 * get source time as a function of output time, and return [outputTime, sourceTime] pairs.
 * Keyframes are real and editable in AE (FEATURE_INVENTORY F-SP-02).
 */
export function buildRampKeyframes(o: RampOptions): Array<[number, number]> {
  if (!(o.targetSpeed > 0)) throw new Error('targetSpeed must be > 0');
  const ease: Bezier = EASINGS[o.ease ?? 'easeInOut'] ?? EASINGS.easeInOut!;
  const sps = o.samplesPerSecond ?? 12;
  const rf = Math.min(0.5, Math.max(0.01, o.rampFraction));
  // w(p): 0 = normal speed, 1 = target speed; p = progress through the output 0..1.
  // 'in' = normal -> target, 'out' = target -> normal, 'both' = normal -> target -> normal.
  const speedAt = (p: number): number => {
    let w: number;
    if (o.shape === 'in') w = p < rf ? bezierAt(ease, p / rf) : 1;
    else if (o.shape === 'out') w = p > 1 - rf ? bezierAt(ease, (1 - p) / rf) : 1;
    else w = p < rf ? bezierAt(ease, p / rf) : p > 1 - rf ? bezierAt(ease, (1 - p) / rf) : 1;
    return 1 + (o.targetSpeed - 1) * w;
  };
  // Mean speed over output progress -> output duration.
  const N = 2000;
  let mean = 0;
  for (let i = 0; i < N; i++) mean += speedAt((i + 0.5) / N);
  mean /= N;
  const srcDur = o.sourceEnd - o.sourceStart;
  const outDur = srcDur / mean;
  const steps = Math.max(2, Math.ceil(outDur * sps));
  const result: Array<[number, number]> = [[0, o.sourceStart]];
  let src = o.sourceStart;
  const sub = 50;
  for (let s = 1; s <= steps; s++) {
    for (let j = 0; j < sub; j++) {
      const p = ((s - 1) * sub + j + 0.5) / (steps * sub);
      src += (speedAt(p) * outDur) / (steps * sub);
    }
    result.push([(s / steps) * outDur, Math.min(src, o.sourceEnd)]);
  }
  result[result.length - 1]![1] = o.sourceEnd;
  return result;
}
