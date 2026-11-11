import { describe, it, expect } from 'vitest';
import {
  parseCorrections, applyCorrections, correctionsPrompt, parseSrt, toSrt, pickEmphasis, buildCaptions, toAss, getCaptionStyle,
  findRetakes, sentences, suggestChapters, youtubeChapters, type Word,
} from '@uet/core';

const w = (text: string, start: number, end: number): Word => ({ text, start, end, p: 0.9 });
const seq = (text: string, t0 = 0, step = 0.4): Word[] => text.split(' ').map((x, i) => w(x, t0 + i * step, t0 + i * step + step * 0.8));

describe('corrections list', () => {
  it('parses lines and replaces single and multi-word mistakes, keeping punctuation', () => {
    const list = parseCorrections('# brand names\nopen ay => OpenAI\nümitcan = Umutcan\n\nbad line');
    expect(list).toEqual([{ from: 'open ay', to: 'OpenAI' }, { from: 'ümitcan', to: 'Umutcan' }]);
    const r = applyCorrections([w('Bugün', 0, 0.3), w('Open', 0.4, 0.6), w('ay,', 0.6, 0.8), w('Ümitcan.', 1, 1.4)], list);
    expect(r.words.map(x => x.text)).toEqual(['Bugün', 'OpenAI,', 'Umutcan.']);
    expect(r.words[1]).toMatchObject({ start: 0.4, end: 0.8 });
    expect(r.changed).toBe(2);
    expect(correctionsPrompt(list)).toBe('OpenAI, Umutcan');
  });
});

describe('SRT import', () => {
  it('round-trips our SRT and spreads words inside each cue', () => {
    const caps = buildCaptions(seq('merhaba arkadaşlar bugün yeni bir şey deniyoruz.'));
    const back = parseSrt(toSrt(caps));
    expect(back.map(c => c.text)).toEqual(caps.map(c => c.text));
    expect(back[0]!.start).toBeCloseTo(caps[0]!.start, 2);
    const ws = back[0]!.words;
    expect(ws[0]!.start).toBeCloseTo(back[0]!.start, 3);
    expect(ws[ws.length - 1]!.end).toBeCloseTo(back[0]!.end, 3);
  });
  it('reads WebVTT and strips tags', () => {
    const c = parseSrt('WEBVTT\n\n00:00:01.000 --> 00:00:02.500\n<b>Selam</b> dünya\n');
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ start: 1, end: 2.5, text: 'Selam dünya' });
  });
});

describe('key-word emphasis', () => {
  const caps = buildCaptions(seq('bu ürün tam 3 günde geldi ve harika'), { maxWords: 4 });
  it('prefers user key words and numbers, then the longest content word', () => {
    const e = pickEmphasis(caps, { keywords: ['harika'] });
    expect([...e]).toEqual(['0:3', '1:3']);
    const e2 = pickEmphasis(buildCaptions(seq('bugün çok güzel bir kahvaltı yaptık')));
    expect([...e2]).toEqual(['0:4']);
  });
  it('stacked look puts the key word on its own bigger line', () => {
    const style = getCaptionStyle('stacked');
    const ass = toAss(caps, style, { width: 1080, height: 1920, emphasis: pickEmphasis(caps) });
    const first = ass.split('\n').find(l => l.startsWith('Dialogue:'))!;
    expect(first).toMatch(/BU ÜRÜN TAM\\N\{\\c&H000AD6FF\\fs\d+\}3\{/);
  });
  it('keyword look colours only the key word', () => {
    const ass = toAss(caps, getCaptionStyle('keyword'), { width: 1920, height: 1080, emphasis: pickEmphasis(caps) });
    expect((ass.match(/\\c&H000AD6FF/g) ?? []).length).toBe(2);
  });
});

describe('retakes', () => {
  it('cuts earlier takes of the same sentence and keeps the last', () => {
    const words = [
      ...seq('Bugün size yeni bir eklenti', 0), // abandoned (pause after)
      ...seq('Bugün size yeni bir eklentiyi göstereceğim.', 3),
      ...seq('Önce kurulumla başlayalım.', 7),
    ];
    const r = findRetakes(words);
    expect(r).toHaveLength(1);
    expect(r[0]!.start).toBe(0);
    expect(r[0]!.end).toBe(3);
    expect(r[0]!.keptText).toContain('göstereceğim');
  });
  it('merges three takes into one cut and leaves different sentences alone', () => {
    const words = [...seq('Bu video çok önemli.', 0), ...seq('Bu video çok önemli bence.', 3), ...seq('Bu video gerçekten çok önemli.', 6), ...seq('Hadi başlayalım şimdi.', 9)];
    const r = findRetakes(words);
    expect(r).toEqual([expect.objectContaining({ start: 0, end: 6 })]);
    expect(findRetakes(seq('Kamera hazır. Işıklar açık. Ses kaydı başladı.'))).toEqual([]);
  });
  it('splits sentences on punctuation and pauses', () => {
    expect(sentences([...seq('bir iki üç', 0), ...seq('dört beş', 5)]).length).toBe(2);
  });
});

describe('chapters', () => {
  it('finds the topic change between two different subjects', () => {
    const a = 'kamera lens ışık objektif diyafram kamera lens ışık pozlama objektif.';
    const b = 'mikrofon ses kayıt mikrofon kablo ses seviye kayıt mikrofon gürültü.';
    const words: Word[] = [];
    let t = 0;
    for (let i = 0; i < 12; i++) { words.push(...seq(a, t, 1)); t += 12; }
    for (let i = 0; i < 12; i++) { words.push(...seq(b, t, 1)); t += 12; }
    const ch = suggestChapters(words, { minLength: 60 });
    expect(ch[0]).toMatchObject({ start: 0, title: 'Giriş' });
    expect(ch.length).toBe(2);
    expect(Math.abs(ch[1]!.start - 144)).toBeLessThanOrEqual(12);
    expect(ch[1]!.title.toLowerCase()).toContain('mikrofon');
    expect(youtubeChapters(ch).split('\n')[0]).toBe('00:00 Giriş');
    expect(youtubeChapters([{ start: 3725, title: 'X', keywords: [] }])).toBe('1:02:05 X');
  });
});

import { createRegistry } from '../packages/engine/src/index';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

describe('engine tools (corrections, SRT in, chapters with fake whisper)', () => {
  const dir = resolve('tests/fixtures/generated/extras');
  it('stores the corrections list and uses it on transcripts', async () => {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    process.env.UET_HOME = `${dir}/home`;
    process.env.UET_WHISPER = resolve('tests/fixtures/fake-whisper-cli.mjs');
    process.env.UET_MODEL_DIR = dir;
    writeFileSync(`${dir}/ggml-base.bin`, 'fake');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=5', `${dir}/clip.wav`]);
    try {
      const reg = createRegistry();
      const set: any = await reg.call('subtitles.corrections', { text: 'eklenti => Eklenti™\n' });
      expect(set.rules).toEqual([{ from: 'eklenti', to: 'Eklenti™' }]);
      const r: any = await reg.call('subtitles.make', { file: `${dir}/clip.wav`, language: 'tr', formats: ['srt'], outDir: dir });
      expect(r.corrected).toBe(1);
      expect(readFileSync(r.files.srt, 'utf8')).toContain('Eklenti™');
      const ch: any = await reg.call('transcript.chapters', { file: `${dir}/clip.wav`, language: 'tr' });
      expect(ch.chapters[0]).toMatchObject({ start: 0, title: 'Giriş' });
      expect(ch.enoughForYoutube).toBe(false);
      const ff: any = await reg.call('transcript.findFillers', { file: `${dir}/clip.wav`, language: 'tr', retakes: true });
      expect(ff.counts.retake).toBe(0);
      // Styled subtitles from an existing SRT, no transcription.
      writeFileSync(`${dir}/in.srt`, '1\n00:00:00,500 --> 00:00:02,000\nmerhaba 2026 dünyası\n');
      const s: any = await reg.call('subtitles.make', { file: `${dir}/in.srt`, srtIn: `${dir}/in.srt`, style: 'stacked', formats: ['ass'], outDir: dir });
      expect(s.source).toBe('srt');
      expect(readFileSync(s.files.ass, 'utf8')).toMatch(/\\fs\d+\}2026/);
    } finally {
      delete process.env.UET_HOME; delete process.env.UET_WHISPER; delete process.env.UET_MODEL_DIR;
    }
    expect(existsSync(`${dir}/home/corrections.txt`)).toBe(true);
  });
});
