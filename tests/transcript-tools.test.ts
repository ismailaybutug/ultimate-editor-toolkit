import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  findFillers, fillerCutRanges, normalizeWord, buildCaptions, toAss, toVtt, toCaptionJson, getCaptionStyle, splitLines, type Word,
} from '@uet/core';
import { download, startSetup, setupState, MODELS } from '../packages/engine/src/stt-setup';
import { renderOverlay } from '../packages/engine/src/stt-tools';

const w = (text: string, start: number, end: number): Word => ({ text, start, end, p: 0.9 });

describe('filler words', () => {
  it('normalizes Turkish and stretched sounds', () => {
    expect(normalizeWord('Eeee,', 'tr')).toBe('e');
    expect(normalizeWord('Iııı...', 'tr')).toBe('ı');
    expect(normalizeWord('İŞTE', 'tr')).toBe('işte');
    expect(normalizeWord('Hmmmm', 'en')).toBe('hmm');
  });
  it('finds sounds, discourse fillers and stutters', () => {
    const words = [w('Eee,', 0, 0.4), w('bugün', 0.6, 0.9), w('yani', 1.0, 1.2), w('ben', 1.3, 1.4), w('ben', 1.5, 1.6), w('geldim.', 1.7, 2.0), w('Iıı', 2.3, 2.6), w('tamam', 2.8, 3.1)];
    const all = findFillers(words, { language: 'tr' });
    expect(all.map(f => [f.text, f.kind])).toEqual([['Eee,', 'sound'], ['yani', 'discourse'], ['ben', 'repeat'], ['Iıı', 'sound']]);
    const safe = findFillers(words, { language: 'tr', kinds: ['sound'] });
    expect(safe.length).toBe(2);
    // "o" (Turkish pronoun) and normal words are never fillers.
    expect(findFillers([w('o', 0, 0.2), w('geldi', 0.3, 0.6)], { language: 'tr' })).toEqual([]);
  });
  it('handles English two-word fillers', () => {
    const f = findFillers([w('So', 0, 0.2), w('you', 0.3, 0.4), w('know,', 0.4, 0.6), w('um', 0.8, 1.0), w('yes', 1.2, 1.4)], { language: 'en' });
    expect(f.map(x => x.text)).toEqual(['So', 'you know,', 'um']);
  });
  it('cuts grow into silence but never into neighbouring words', () => {
    const words = [w('bugün', 0, 0.5), w('eee', 0.55, 0.9), w('geldim', 1.2, 1.6)];
    const cut = fillerCutRanges(words, findFillers(words, { language: 'tr' }), 0.1);
    expect(cut).toEqual([{ start: 0.5, end: 1.0 }]);
  });
});

describe('caption styles and exporters', () => {
  const words = [w('merhaba', 0, 0.4), w('arkadaşlar', 0.45, 1.0), w('bugün', 1.1, 1.4), w('yeni', 1.5, 1.7), w('bir', 1.75, 1.9), w('şey', 1.95, 2.2), w('deniyoruz.', 2.3, 3.0)];
  it('maxWords makes short-form captions', () => {
    const caps = buildCaptions(words, { maxWords: 3 });
    expect(caps.map(c => c.words.length)).toEqual([3, 3, 1]);
  });
  it('splits lines evenly', () => {
    expect(splitLines(['bir', 'iki', 'üç', 'dört', 'beş', 'altı'], 12, 2)).toEqual([3, 3]);
    expect(splitLines(['kısa'], 12, 2)).toEqual([1]);
  });
  it('ASS has the style, Turkish upper-case and one event per word for highlight', () => {
    const style = getCaptionStyle('highlight');
    const caps = buildCaptions(words, { maxWords: style.maxWords, maxChars: style.maxLineChars * style.maxLines });
    const ass = toAss(caps, style, { width: 1080, height: 1920 });
    expect(ass).toContain('PlayResX: 1080');
    expect(ass).toContain('Style: UET,Arial Black,');
    expect(ass).toContain('ARKADAŞLAR');
    expect(ass).toContain('BUGÜN');
    expect(ass.split('\n').filter(l => l.startsWith('Dialogue:')).length).toBe(words.length);
    expect(ass).toMatch(/\\c&H000AD6FF&?/i);
  });
  it('karaoke uses \\kf sweeps that add up to the caption', () => {
    const caps = buildCaptions(words.slice(0, 2));
    const ass = toAss(caps, getCaptionStyle('karaoke'));
    const ks = [...ass.matchAll(/\\kf(\d+)/g)].map(m => Number(m[1]));
    expect(ks.reduce((a, b) => a + b, 0)).toBe(100);
  });
  it('VTT and JSON', () => {
    const caps = buildCaptions(words);
    expect(toVtt(caps, true)).toMatch(/^WEBVTT\n\n1\n00:00:00.000 --> /);
    expect(toVtt(caps, true)).toContain('<00:00:00.450>arkadaşlar');
    const j = toCaptionJson(caps, getCaptionStyle('reels-pop'));
    expect(j.format).toBe('uet.captions/1');
    expect(j.captions[0]!.text).toBe('MERHABA ARKADAŞLAR BUGÜN YENİ BİR ŞEY');
    expect(j.captions[0]!.words[3]!.text).toBe('YENİ');
  });
  it('rejects unknown styles', () => {
    expect(() => getCaptionStyle('nope')).toThrow(/Known/);
  });
});

const hasLibass = (() => { try { return /\bass\b/.test(execFileSync('ffmpeg', ['-hide_banner', '-filters']).toString()); } catch { return false; } })();

describe.skipIf(!hasLibass)('overlay render (real ffmpeg + libass)', () => {
  it('renders a transparent clip whose text pixels are opaque', async () => {
    const dir = resolve('tests/fixtures/generated/overlay');
    mkdirSync(dir, { recursive: true });
    const caps = buildCaptions([w('MERHABA', 0.0, 0.5), w('DÜNYA', 0.6, 1.0)]);
    const out = `${dir}/o.mov`;
    const r = await renderOverlay(caps, 'reels-pop', { width: 320, height: 180, fps: 10, from: 0, to: 1.2, out, codec: 'qtrle' });
    expect(r.bytes).toBeGreaterThan(1000);
    // Alpha of frame at 0.7 s: some pixels opaque (text), most transparent.
    const alpha = execFileSync('ffmpeg', ['-v', 'error', '-ss', '0.7', '-i', out, '-frames:v', '1', '-vf', 'format=rgba,alphaextract', '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
    const opaque = alpha.filter(a => a > 200).length;
    expect(opaque).toBeGreaterThan(200);
    expect(opaque).toBeLessThan(alpha.length / 2);
  }, 30000);
});

describe('speech engine installer (local HTTP server)', () => {
  let server: Server; let base = '';
  const home = resolve('tests/fixtures/generated/uethome');
  const fakeBin = '#!/bin/sh\necho "usage: whisper-cli [options] file0.wav"\n';
  const model = Buffer.alloc(21 * 1024 * 1024, 7);
  const modelSha = createHash('sha256').update(model).digest('hex');
  beforeAll(async () => {
    rmSync(home, { recursive: true, force: true });
    server = createServer((req, res) => {
      if (req.url === '/bin.gz') { res.end(gzipSync(fakeBin)); return; }
      if (req.url === '/redirect/ggml-base.bin') { res.writeHead(302, { location: '/files/ggml-base.bin', 'x-linked-etag': `"${modelSha}"` }); res.end(); return; }
      if (req.url === '/files/ggml-base.bin') { res.writeHead(200, { 'content-length': model.length }); res.end(model); return; }
      if (req.url === '/bad/ggml-base.bin') { res.writeHead(302, { location: '/files/ggml-base.bin', 'x-linked-etag': `"${'0'.repeat(64)}"` }); res.end(); return; }
      res.writeHead(404); res.end();
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const a = server.address(); base = `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}`;
    process.env.UET_HOME = home;
    process.env.UET_WHISPER_URL = `${base}/bin.gz`;
  });
  afterAll(() => { server.close(); delete process.env.UET_HOME; delete process.env.UET_WHISPER_URL; delete process.env.UET_MODEL_BASE_URL; });

  it('download() follows redirects and hashes the bytes', async () => {
    const got = await download(`${base}/redirect/ggml-base.bin`, `${home}/x.bin`);
    expect(got.sha256).toBe(modelSha);
    expect(got.linkedEtag).toBe(modelSha);
  });
  it('rejects a model whose hash does not match', async () => {
    process.env.UET_MODEL_BASE_URL = `${base}/bad`;
    const s = await startSetup({ model: 'base' });
    expect(s.phase).toBe('error');
    expect(s.error).toMatch(/SHA-256/);
    expect(existsSync(`${home}/models/ggml-base.bin`)).toBe(false);
  });
  it('installs binary + model into ~/.uet and reports done', async () => {
    process.env.UET_MODEL_BASE_URL = `${base}/redirect`;
    const s = await startSetup({ model: 'base', force: true });
    expect(s.error).toBeNull();
    expect(s.phase).toBe('done');
    expect(readFileSync(`${home}/bin/whisper-cli`, 'utf8')).toBe(fakeBin);
    expect(statSync(`${home}/bin/whisper-cli`).mode & 0o111).toBeTruthy();
    expect(statSync(`${home}/models/ggml-base.bin`).size).toBe(model.length);
    expect(setupState().percent).toBe(100);
    expect(MODELS[0]!.id).toBe('large-v3-turbo-q5_0');
  });
});

