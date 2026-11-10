// Easing curves as cubic bezier control points (x1, y1, x2, y2), CSS-style.
export type Bezier = readonly [number, number, number, number];

export const EASINGS: Record<string, Bezier> = {
  linear: [0, 0, 1, 1],
  easeIn: [0.42, 0, 1, 1],
  easeOut: [0, 0, 0.58, 1],
  easeInOut: [0.42, 0, 0.58, 1],
  expoOut: [0.16, 1, 0.3, 1],
  expoIn: [0.7, 0, 0.84, 0],
  expoInOut: [0.87, 0, 0.13, 1],
  backOut: [0.34, 1.56, 0.64, 1],
  smooth: [0.33, 0, 0.67, 1],
};

/** Evaluate a cubic bezier easing at progress x in [0,1] (Newton + bisection). */
export function bezierAt(b: Bezier, x: number): number {
  const [x1, y1, x2, y2] = b;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  let t = x;
  for (let i = 0; i < 8; i++) {
    const err = sx(t) - x;
    if (Math.abs(err) < 1e-6) break;
    const d = dx(t);
    if (Math.abs(d) < 1e-6) break;
    t -= err / d;
  }
  if (t < 0 || t > 1 || Math.abs(sx(t) - x) > 1e-4) {
    let lo = 0, hi = 1; t = x;
    for (let i = 0; i < 40; i++) { if (sx(t) < x) lo = t; else hi = t; t = (lo + hi) / 2; }
  }
  return ((ay * t + by) * t + cy) * t;
}

/**
 * Convert a bezier easing between two keyframes into After Effects temporal ease.
 * AE uses speed (units/second) + influence (%) per keyframe side.
 * For a 1-D property going from v0 to v1 over `duration` seconds.
 */
export function bezierToAeEase(b: Bezier, v0: number, v1: number, duration: number) {
  const [x1, y1, x2, y2] = b;
  const avg = duration > 0 ? (v1 - v0) / duration : 0;
  const outSpeed = x1 > 0 ? (y1 / x1) * avg : 0;
  const inSpeed = 1 - x2 > 0 ? ((1 - y2) / (1 - x2)) * avg : 0;
  const clamp = (v: number) => Math.min(100, Math.max(0.1, v * 100));
  return {
    out: { speed: outSpeed, influence: clamp(x1) },
    in: { speed: inSpeed, influence: clamp(1 - x2) },
  };
}
