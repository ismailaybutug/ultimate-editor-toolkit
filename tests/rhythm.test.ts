import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { parseSceneTimes, segmentsFromCuts, everyNth } from '@uet/core';
import { createRegistry } from '@uet/engine';

const DIR = 'tests/fixtures/generated';
const CLICK = `${DIR}/click120.wav`;
const SCENES = `${DIR}/scenes.mp4`;

beforeAll(() => {
  mkdirSync(DIR, { recursive: true });
  if (!existsSync(CLICK)) {
    // 120 BPM: a 30 ms decaying 1 kHz click every 0.5 s, first click at 0.25 s, over quiet noise; 10 s.
    const expr = "if(lt(mod(t-0.25+10,0.5),0.03)*gte(t,0.25),0.8*sin(2*PI*1000*t)*exp(-mod(t-0.25+10,0.5)*80),0)+0.003*(random(0)-0.5)";
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `aevalsrc='${expr}':s=44100:d=10`, '-ac', '1', CLICK]);
  }
  if (!existsSync(SCENES)) {
    // three 1.5 s shots with very different content
    execFileSync('ffmpeg', ['-v', 'error', '-y',
      '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=25:duration=1.5',
      '-f', 'lavfi', '-i', 'color=c=red:size=320x180:rate=25:duration=1.5',
      '-f', 'lavfi', '-i', 'mandelbrot=size=320x180:rate=25',
      '-filter_complex', '[2]trim=duration=1.5,setpts=PTS-STARTPTS[m];[0][1][m]concat=n=3:v=1:a=0[v]', '-map', '[v]', '-pix_fmt', 'yuv420p', SCENES]);
  }
});

describe('rhythm helpers (core)', () => {
  it('parses showinfo and enforces min gap', () => {
    const s = '[Parsed_showinfo_2 @ 0x1] n:0 pts:37 pts_time:1.48 duration\n[Parsed_showinfo_2 @ 0x1] n:1 pts:38 pts_time:1.52 x\n[Parsed_showinfo_2 @ 0x1] n:2 pts:75 pts_time:3 x';
    expect(parseSceneTimes(s, 0.5)).toEqual([1.48, 3]);
  });
  it('builds segments and picks every Nth', () => {
    expect(segmentsFromCuts([1, 2, 9], 0.5, 3)).toEqual([{ start: 0.5, end: 1 }, { start: 1, end: 2 }, { start: 2, end: 3 }]);
    expect(everyNth([0, 1, 2, 3, 4, 5, 6, 7, 8], 4, 1)).toEqual([1, 5]);
  });
});

describe('engine (real ffmpeg)', () => {
  it('finds 120 BPM and beats on the clicks', async () => {
    const r: any = await createRegistry().call('audio.detectBeats', { file: CLICK });
    expect(r.bpm).toBeGreaterThan(117);
    expect(r.bpm).toBeLessThan(123);
    expect(r.totalBeats).toBeGreaterThanOrEqual(17);
    // every detected beat lies within 40 ms of a click (0.25 + k*0.5)
    for (const b of r.beats) {
      const d = Math.abs(((b - 0.25) % 0.5 + 0.5) % 0.5);
      expect(Math.min(d, 0.5 - d)).toBeLessThan(0.04);
    }
  });
  it('finds the two shot changes', async () => {
    const r: any = await createRegistry().call('video.detectScenes', { file: SCENES });
    expect(r.scenes.length).toBe(2);
    expect(r.scenes[0]).toBeCloseTo(1.5, 1);
    expect(r.scenes[1]).toBeCloseTo(3, 1);
  });
});
