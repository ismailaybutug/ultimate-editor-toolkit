import { describe, it, expect } from 'vitest';
import { invertRanges, normalizeRanges, planSilenceCut, parseSilencedetect, bezierAt, EASINGS, BUILTIN_RECIPES, parseRecipe, retimeRecipe, buildRampKeyframes, secondsToTicks, ToolRegistry } from '@uet/core';
import { z } from 'zod';

describe('ranges', () => {
  it('normalizes and inverts', () => {
    expect(normalizeRanges([{ start: 2, end: 3 }, { start: 0, end: 1 }, { start: 0.5, end: 1.5 }])).toEqual([{ start: 0, end: 1.5 }, { start: 2, end: 3 }]);
    expect(invertRanges([{ start: 1, end: 2 }], 5)).toEqual([{ start: 0, end: 1 }, { start: 2, end: 5 }]);
    expect(invertRanges([], 3)).toEqual([{ start: 0, end: 3 }]);
  });
  it('ticks', () => { expect(secondsToTicks(1)).toBe('254016000000'); });
});

describe('planSilenceCut', () => {
  const sil = [{ start: 1, end: 2 }, { start: 3, end: 3.2 }, { start: 4.5, end: 6 }];
  it('applies padding, min silence and keeps the end', () => {
    const p = planSilenceCut(sil, 6, { padding: 0.1, minSilence: 0.5, minKeep: 0.1, fps: 100 });
    expect(p.cut).toEqual([{ start: 1.1, end: 1.9 }, { start: 4.6, end: 6 }]);
    expect(p.keep).toEqual([{ start: 0, end: 1.1 }, { start: 1.9, end: 4.6 }]);
  });
  it('never cuts protected words', () => {
    const p = planSilenceCut([{ start: 1, end: 3 }], 4, { padding: 0, minSilence: 0.5, minKeep: 0, fps: 100 }, [{ start: 1.8, end: 2.2 }]);
    expect(p.keep).toEqual([{ start: 0, end: 1 }, { start: 1.8, end: 2.2 }, { start: 3, end: 4 }]);
  });
  it('drops tiny kept fragments', () => {
    const p = planSilenceCut([{ start: 1, end: 2 }, { start: 2.1, end: 3 }], 4, { padding: 0, minSilence: 0.5, minKeep: 0.25, fps: 100 });
    expect(p.keep).toEqual([{ start: 0, end: 1 }, { start: 3, end: 4 }]);
  });
  it('snaps to frames', () => {
    const p = planSilenceCut([{ start: 1.013, end: 2 }], 3, { padding: 0, minSilence: 0.5, minKeep: 0, fps: 30 });
    expect(p.keep[0]!.end * 30).toBeCloseTo(Math.round(p.keep[0]!.end * 30), 6);
  });
  it('parses ffmpeg silencedetect', () => {
    const txt = '[silencedetect @ 0x1] silence_start: 1.002\n[silencedetect @ 0x1] silence_end: 2.01 | silence_duration: 1\n[silencedetect @ 0x1] silence_start: 5.5';
    expect(parseSilencedetect(txt, 6)).toEqual([{ start: 1.002, end: 2.01 }, { start: 5.5, end: 6 }]);
  });
});

describe('easing', () => {
  it('endpoints and monotonic', () => {
    for (const [name, b] of Object.entries(EASINGS)) {
      expect(bezierAt(b, 0)).toBe(0);
      expect(bezierAt(b, 1)).toBe(1);
      if (name !== 'backOut') {
        let prev = -1;
        for (let x = 0; x <= 1; x += 0.05) { const y = bezierAt(b, x); expect(y).toBeGreaterThanOrEqual(prev - 1e-9); prev = y; }
      }
    }
    expect(bezierAt(EASINGS.linear!, 0.3)).toBeCloseTo(0.3, 4);
    expect(bezierAt(EASINGS.backOut!, 0.6)).toBeGreaterThan(1); // overshoot
  });
});

describe('recipes', () => {
  it('builtins are valid and retime keeps shape', () => {
    for (const r of BUILTIN_RECIPES) expect(parseRecipe(r)).toBeTruthy();
    const r = retimeRecipe(BUILTIN_RECIPES[0]!, 1.2);
    expect(r.duration).toBe(1.2);
    expect(r.tracks[0]!.keyframes.at(-1)!.t).toBeCloseTo(1.2);
  });
  it('rejects unknown easing', () => {
    expect(() => parseRecipe({ ...BUILTIN_RECIPES[0]!, tracks: [{ property: 'opacity', mode: 'factor', keyframes: [{ t: 0, v: 0, ease: 'nope' }, { t: 1, v: 1 }] }] })).toThrow();
  });
});

describe('speed ramp', () => {
  it('speed 1 is identity', () => {
    const k = buildRampKeyframes({ sourceStart: 2, sourceEnd: 6, targetSpeed: 1, rampFraction: 0.3, shape: 'both' });
    expect(k[0]).toEqual([0, 2]);
    expect(k.at(-1)![0]).toBeCloseTo(4, 3);
    for (const [t, s] of k) expect(s).toBeCloseTo(2 + t, 2);
  });
  it('fast ramp shortens output, source is monotonic and ends exactly', () => {
    const k = buildRampKeyframes({ sourceStart: 0, sourceEnd: 10, targetSpeed: 4, rampFraction: 0.25, shape: 'both' });
    expect(k.at(-1)![1]).toBe(10);
    expect(k.at(-1)![0]).toBeLessThan(10);
    expect(k.at(-1)![0]).toBeGreaterThan(2.5);
    for (let i = 1; i < k.length; i++) expect(k[i]![1]).toBeGreaterThanOrEqual(k[i - 1]![1]);
  });
  it('slow ramp lengthens output', () => {
    const k = buildRampKeyframes({ sourceStart: 0, sourceEnd: 2, targetSpeed: 0.25, rampFraction: 0.2, shape: 'both' });
    expect(k.at(-1)![0]).toBeGreaterThan(4);
  });
  it('rejects zero speed', () => {
    expect(() => buildRampKeyframes({ sourceStart: 0, sourceEnd: 1, targetSpeed: 0, rampFraction: 0.2, shape: 'in' })).toThrow();
  });
});

describe('ToolRegistry', () => {
  it('validates params', async () => {
    const reg = new ToolRegistry();
    reg.register({ id: 'x', app: 'engine', destructive: false, title: { en: 'x', tr: 'x' }, params: z.object({ n: z.number() }), run: async p => p.n * 2 });
    expect(await reg.call('x', { n: 2 })).toBe(4);
    await expect(reg.call('x', { n: 'a' })).rejects.toThrow();
    await expect(reg.call('nope', {})).rejects.toThrow(/unknown tool/);
  });
});
