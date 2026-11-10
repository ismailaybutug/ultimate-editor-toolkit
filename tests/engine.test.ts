import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import WebSocket from 'ws';
import { detectSilence, measureLoudness, createRegistry, startServer, loudnessGain } from '@uet/engine';

const DIR = 'tests/fixtures/generated';
const TALK = `${DIR}/talk.wav`;

// Synthetic "speech": 1 s tone, 1 s near-silence, 1 s tone, 0.2 s gap, 1 s tone, 1.5 s near-silence. Total 5.7 s.
beforeAll(() => {
  mkdirSync(DIR, { recursive: true });
  if (existsSync(TALK)) return;
  const tone = 'sine=frequency=220:duration=1:sample_rate=48000';
  const quiet = (d: number) => `anoisesrc=color=white:amplitude=0.001:duration=${d}:sample_rate=48000`;
  execFileSync('ffmpeg', ['-v', 'error', '-y',
    '-f', 'lavfi', '-i', tone, '-f', 'lavfi', '-i', quiet(1), '-f', 'lavfi', '-i', tone,
    '-f', 'lavfi', '-i', quiet(0.2), '-f', 'lavfi', '-i', tone, '-f', 'lavfi', '-i', quiet(1.5),
    '-filter_complex', '[0][1][2][3][4][5]concat=n=6:v=0:a=1,volume=0.5[a]', '-map', '[a]', '-ac', '1', TALK]);
});

describe('engine analysis (real ffmpeg)', () => {
  it('finds the silences with automatic threshold', async () => {
    const a = await detectSilence(TALK, { minSilence: 0.5 });
    expect(a.duration).toBeCloseTo(5.7, 1);
    expect(a.silences.length).toBe(2);
    expect(a.silences[0]!.start).toBeCloseTo(1, 1);
    expect(a.silences[0]!.end).toBeCloseTo(2, 1);
    expect(a.silences[1]!.start).toBeCloseTo(4.2, 1);
    expect(a.silences[1]!.end).toBeCloseTo(5.7, 1);
  });
  it('plans a cut through the tool registry', async () => {
    const reg = createRegistry();
    const r: any = await reg.call('audio.planSilenceCut', { file: TALK, padding: 0.1, fps: 30 });
    expect(r.keep.length).toBe(2);
    expect(r.removedSeconds).toBeGreaterThan(2);
    expect(r.removedSeconds).toBeLessThan(2.6);
  });
  it('measures loudness', async () => {
    const m = await measureLoudness(TALK);
    expect(m.integratedLufs).toBeLessThan(-5);
    expect(m.integratedLufs).toBeGreaterThan(-30);
    expect(loudnessGain({ integratedLufs: -20, truePeakDb: -3 }, -14)).toBe(2); // limited by -1 dBTP ceiling
    expect(loudnessGain({ integratedLufs: -20, truePeakDb: -10 }, -14)).toBe(6);
  });
});

describe('engine server', () => {
  it('answers JSON-RPC and rejects bad tokens', async () => {
    const h = await startServer(createRegistry(), { writeDiscovery: false, token: 'secret' });
    const call = (token: string, msg: object) => new Promise<any>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${h.port}/?token=${token}`);
      ws.on('open', () => ws.send(JSON.stringify(msg)));
      ws.on('message', d => { resolve(JSON.parse(d.toString())); ws.close(); });
      ws.on('close', code => resolve({ closed: code }));
    });
    const pong = await call('secret', { jsonrpc: '2.0', id: 1, method: 'engine.ping', params: {} });
    expect(pong.result.ok).toBe(true);
    const list = await call('secret', { jsonrpc: '2.0', id: 2, method: 'tools.list' });
    expect(list.result.map((t: any) => t.id)).toContain('audio.planSilenceCut');
    const err = await call('secret', { jsonrpc: '2.0', id: 3, method: 'nope' });
    expect(err.error.message).toMatch(/unknown tool/);
    const denied = await call('wrong', { jsonrpc: '2.0', id: 4, method: 'engine.ping' });
    expect(denied.closed).toBe(4401);
    await h.close();
  });
});
