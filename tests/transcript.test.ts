import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { parseWhisperJson, buildCaptions, toSrt } from '@uet/core';
import { createRegistry } from '@uet/engine';

const sample = JSON.parse(readFileSync('tests/fixtures/whisper-ojf-sample.json', 'utf8'));

describe('transcript (core)', () => {
  it('groups whisper tokens into words and drops special tokens', () => {
    const t = parseWhisperJson(sample);
    expect(t.language).toBe('tr');
    const words = t.segments.flatMap(s => s.words);
    expect(words.map(w => w.text)).toEqual(['Merhaba', 'arkadaşlar,', 'bugün', 'yeni', 'bir', 'eklenti', 'deniyoruz.']);
    expect(words[0]).toMatchObject({ start: 0, end: 0.6 });
    expect(words[1]!.end).toBeCloseTo(1.45);
    expect(words[0]!.p).toBeCloseTo(0.85);
  });
  it('breaks captions on pauses, sentence ends and length', () => {
    const words = parseWhisperJson(sample).segments.flatMap(s => s.words);
    const caps = buildCaptions(words);
    expect(caps.map(c => c.text)).toEqual(['Merhaba arkadaşlar, bugün', 'yeni bir eklenti deniyoruz.']);
    const narrow = buildCaptions(words, { maxChars: 12 });
    expect(narrow.every(c => c.text.length <= 12 || c.words.length === 1)).toBe(true);
  });
  it('writes valid SRT', () => {
    const srt = toSrt(buildCaptions(parseWhisperJson(sample).segments.flatMap(s => s.words)));
    expect(srt).toBe('1\n00:00:00,000 --> 00:00:02,400\nMerhaba arkadaşlar, bugün\n\n2\n00:00:03,500 --> 00:00:05,000\nyeni bir eklenti deniyoruz.\n');
  });
});

describe('audio.transcribe (engine, fake whisper-cli)', () => {
  const dir = resolve('tests/fixtures/generated/stt');
  beforeAll(() => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/ggml-base.bin`, 'fake model');
    if (!existsSync(`${dir}/clip.wav`)) {
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=5', `${dir}/clip.wav`]);
    }
    process.env.UET_WHISPER = resolve('tests/fixtures/fake-whisper-cli.mjs');
    process.env.UET_MODEL_DIR = dir;
  });
  afterAll(() => { delete process.env.UET_WHISPER; delete process.env.UET_MODEL_DIR; });

  it('runs the pipeline, returns captions and writes SRT', async () => {
    const reg = createRegistry();
    const r: any = await reg.call('audio.transcribe', { file: `${dir}/clip.wav`, language: 'tr', srtPath: `${dir}/out.srt` });
    expect(r.language).toBe('tr');
    expect(r.model).toBe('ggml-base.bin');
    expect(r.wordCount).toBe(7);
    expect(r.captions.length).toBe(2);
    expect(r.timing.audioSeconds).toBeCloseTo(5, 1);
    expect(readFileSync(`${dir}/out.srt`, 'utf8')).toContain('yeni bir eklenti deniyoruz.');
  });
  it('explains how to install whisper when the model is missing', async () => {
    rmSync(`${dir}/ggml-base.bin`);
    const reg = createRegistry();
    await expect(reg.call('audio.transcribe', { file: `${dir}/clip.wav` })).rejects.toThrow(/brew install whisper-cpp/);
  });
});

describe('mapToTimeline', () => {
  it('keeps the used part and shifts to timeline time', async () => {
    const { mapToTimeline } = await import('@uet/core');
    const caps = buildCaptions(parseWhisperJson(sample).segments.flatMap(s => s.words));
    const m = mapToTimeline(caps, { sourceIn: 3, sourceOut: 10, timelineStart: 20 });
    expect(m.length).toBe(1);
    expect(m[0]!.start).toBeCloseTo(20.5);
    expect(m[0]!.index).toBe(1);
  });
});
