/**
 * Engine tools of the subtitle workstream: local speech engine setup, transcription, caption export
 * (SRT/VTT/ASS/JSON), styled overlay rendering and filler-word detection.
 * Registered from createRegistry() via registerSubtitleTools(reg).
 */
import { z } from 'zod';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { tmpdir } from 'node:os';
import {
  type ToolRegistry, type Caption, buildCaptions, mapToTimeline, toSrt, toVtt, toAss, toCaptionJson, getCaptionStyle,
  CAPTION_STYLES, findFillers, fillerCutRanges, planSilenceCut,
} from '@uet/core';
import { transcribe, findWhisper, findModel, currentJob } from './whisper.js';
import { startSetup, setupState, installedModels, MODELS, modelDir, uetHome } from './stt-setup.js';
import { FFMPEG, probeDuration } from './ffmpeg.js';

const timelineSchema = z.object({ sourceIn: z.number(), sourceOut: z.number(), timelineStart: z.number() })
  .describe('Keep only the used part of the media and move captions to timeline time');
const styleIds = CAPTION_STYLES.map(s => s.id) as [string, ...string[]];

function outPath(media: string, ext: string, dir?: string): string {
  const d = dir ?? join(uetHome(), 'subtitles');
  mkdirSync(d, { recursive: true });
  const safe = basename(media, extname(media)).replace(/[^\w.-]+/g, '_').slice(0, 60);
  return join(d, `${safe}-${Date.now()}.${ext}`);
}

async function captionsFor(p: { file: string; language: string; model?: string; maxChars: number; maxDuration: number; maxWords: number; timeline?: z.infer<typeof timelineSchema> }) {
  const t = await transcribe(p.file, { language: p.language, model: p.model });
  const words = t.segments.flatMap(s => s.words);
  let captions = buildCaptions(words, { maxChars: p.maxChars, maxDuration: p.maxDuration, maxWords: p.maxWords });
  if (p.timeline) captions = mapToTimeline(captions, p.timeline);
  return { t, words, captions };
}

function ffmpegIn(cwd: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args, { cwd, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', d => { err = (err + d).slice(-8000); });
    p.on('error', reject);
    p.on('close', code => resolve({ code: code ?? -1, stderr: err }));
  });
}

/**
 * Render captions into a transparent video (QuickTime Animation, or ProRes 4444) with ffmpeg + libass.
 * The clip covers [from, to) in the captions' time base.
 */
export async function renderOverlay(captions: Caption[], styleId: string, o: { width: number; height: number; fps: number; from: number; to: number; out: string; codec: 'qtrle' | 'prores' }) {
  const style = getCaptionStyle(styleId);
  const shifted = captions.map(c => ({ ...c, start: c.start - o.from, end: c.end - o.from, words: c.words.map(w => ({ ...w, start: w.start - o.from, end: w.end - o.from })) }));
  const dir = mkdtempSync(join(tmpdir(), 'uet-ovl-'));
  try {
    writeFileSync(join(dir, 'subs.ass'), toAss(shifted, style, { width: o.width, height: o.height }), 'utf8');
    const dur = Math.max(0.1, o.to - o.from);
    const codec = o.codec === 'prores'
      ? ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-vendor', 'apl0']
      : ['-c:v', 'qtrle', '-pix_fmt', 'argb'];
    const r = await ffmpegIn(dir, ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=black@0.0:s=${o.width}x${o.height}:r=${o.fps}:d=${dur.toFixed(3)},format=rgba`,
      '-vf', 'format=rgba,ass=subs.ass:alpha=1', ...codec, '-an', 'out.mov']);
    if (r.code !== 0) throw new Error(/No such filter: 'ass'|Filter not found/.test(r.stderr)
      ? 'Bu ffmpeg sürümünde altyazı çizici (libass) yok.' : `ffmpeg overlay failed: ${r.stderr.slice(-400)}`);
    mkdirSync(dirname(o.out), { recursive: true });
    copyFileSync(join(dir, 'out.mov'), o.out);
    return { path: o.out, duration: dur, bytes: statSync(o.out).size };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function registerSubtitleTools(reg: ToolRegistry): void {
  reg.register({
    id: 'stt.status', app: 'engine', destructive: false,
    title: { en: 'Speech engine status (installed?, install progress, running transcription)', tr: 'Konuşma motoru durumu' },
    params: z.object({}),
    run: async () => ({
      ready: !!findWhisper() && !!findModel(),
      whisper: findWhisper(), model: findModel(), modelDir: modelDir(),
      installedModels: installedModels(), availableModels: MODELS.map(m => ({ id: m.id, sizeMb: m.sizeMb, label: m.label })),
      setup: setupState(), job: currentJob(),
      supported: process.platform === 'darwin' && process.arch === 'arm64',
    }),
  });
  reg.register({
    id: 'stt.install', app: 'engine', destructive: false,
    title: { en: 'Install the local speech engine (whisper.cpp + model, ~550 MB download, no Homebrew needed)', tr: 'Konuşma motorunu kur' },
    params: z.object({ model: z.enum(MODELS.map(m => m.id) as [string, ...string[]]).optional(), wait: z.boolean().default(false), force: z.boolean().default(false) }),
    run: async p => {
      const pr = startSetup({ model: p.model, force: p.force });
      if (p.wait) { const s = await pr; if (s.phase === 'error') throw new Error(s.error ?? 'Kurulum başarısız'); return s; }
      pr.catch(() => undefined);
      return setupState();
    },
  });
  reg.register({
    id: 'audio.transcribe', app: 'engine', destructive: false,
    title: { en: 'Transcribe (local)', tr: 'Konuşmayı yazıya dök (yerel)' },
    params: z.object({
      file: z.string().min(1),
      language: z.string().default('auto').describe('ISO code like tr or en, or auto'),
      model: z.string().optional().describe('e.g. large-v3-turbo-q5_0, small, base'),
      maxChars: z.number().int().min(10).max(80).default(42),
      maxDuration: z.number().min(1).max(10).default(5),
      maxWords: z.number().int().min(0).max(20).default(0),
      srtPath: z.string().optional().describe('Write an .srt file here'),
      includeWords: z.boolean().default(false),
      timeline: timelineSchema.optional(),
    }),
    run: async p => {
      const { t, words, captions } = await captionsFor(p);
      if (p.srtPath) writeFileSync(p.srtPath, toSrt(captions), 'utf8');
      return {
        language: t.language, model: t.model, timing: t.timing, cached: t.cached, gpu: t.gpu, wordCount: words.length,
        text: t.segments.map(s => s.text).join(' '),
        captions: captions.map(c => ({ start: c.start, end: c.end, text: c.text, ...(p.includeWords ? { words: c.words } : {}) })),
        srtPath: p.srtPath ?? null,
      };
    },
  });
  reg.register({
    id: 'subtitles.make', app: 'engine', destructive: false,
    title: { en: `Make styled subtitles for a media file: SRT/VTT/ASS/JSON files and optionally a transparent overlay video. Styles: ${styleIds.join(', ')}`, tr: 'Stilli altyazı üret' },
    params: z.object({
      file: z.string().min(1),
      language: z.string().default('auto'),
      model: z.string().optional(),
      style: z.enum(styleIds).default('clean'),
      formats: z.array(z.enum(['srt', 'vtt', 'ass', 'json'])).default(['srt']),
      overlay: z.boolean().default(false).describe('Also render a transparent .mov with the styled, animated captions'),
      overlayCodec: z.enum(['qtrle', 'prores']).default('qtrle'),
      width: z.number().int().min(16).default(1920),
      height: z.number().int().min(16).default(1080),
      fps: z.number().positive().default(30),
      timeline: timelineSchema.optional(),
      outDir: z.string().optional(),
    }),
    run: async p => {
      const style = getCaptionStyle(p.style);
      const { t, captions } = await captionsFor({ ...p, maxChars: style.maxLineChars * style.maxLines, maxDuration: 5, maxWords: style.maxWords });
      const files: Record<string, string> = {};
      for (const f of p.formats) {
        const path = outPath(p.file, f, p.outDir);
        const body = f === 'srt' ? toSrt(captions) : f === 'vtt' ? toVtt(captions, style.animation !== 'none')
          : f === 'ass' ? toAss(captions, style, { width: p.width, height: p.height }) : JSON.stringify(toCaptionJson(captions, style), null, 1);
        writeFileSync(path, body, 'utf8');
        files[f] = path;
      }
      let overlay = null;
      if (p.overlay) {
        if (!captions.length) throw new Error('Konuşma bulunamadı; altyazı yok.');
        const from = p.timeline ? p.timeline.timelineStart : 0;
        const to = p.timeline ? p.timeline.timelineStart + (p.timeline.sourceOut - p.timeline.sourceIn) : Math.max(...captions.map(c => c.end));
        overlay = await renderOverlay(captions, p.style, { width: p.width, height: p.height, fps: p.fps, from, to, out: outPath(p.file, 'mov', p.outDir), codec: p.overlayCodec });
        overlay = { ...overlay, timelineStart: from };
      }
      return { language: t.language, model: t.model, timing: t.timing, cached: t.cached, captions: captions.length, style: p.style, files, overlay };
    },
  });
  reg.register({
    id: 'transcript.findFillers', app: 'engine', destructive: false,
    title: { en: 'Find filler words (um/uh, ııı/eee, optional yani/like) and stutters; returns cut and keep ranges in media time', tr: 'Dolgu kelimeleri bul' },
    params: z.object({
      file: z.string().min(1),
      language: z.string().default('tr'),
      model: z.string().optional(),
      kinds: z.array(z.enum(['sound', 'discourse', 'repeat'])).default(['sound', 'repeat']),
      padding: z.number().min(0).max(0.3).default(0.08),
      fps: z.number().positive().default(30),
    }),
    run: async p => {
      const t = await transcribe(p.file, { language: p.language === 'auto' ? undefined : p.language, model: p.model, verbatim: true });
      const words = t.segments.flatMap(s => s.words);
      const lang = p.language === 'auto' ? (t.language ?? 'en') : p.language;
      const fillers = findFillers(words, { language: lang, kinds: p.kinds });
      const cut = fillerCutRanges(words, fillers, p.padding);
      const duration = await probeDuration(p.file);
      const plan = planSilenceCut(cut, duration, { minSilence: 0, padding: 0, minKeep: 0.1, fps: p.fps });
      const removed = cut.reduce((s, r) => s + r.end - r.start, 0);
      return {
        language: lang, model: t.model, cached: t.cached, wordCount: words.length, duration,
        fillers, counts: { sound: fillers.filter(f => f.kind === 'sound').length, discourse: fillers.filter(f => f.kind === 'discourse').length, repeat: fillers.filter(f => f.kind === 'repeat').length },
        cut, keep: plan.keep, removedSeconds: Math.round(removed * 100) / 100,
      };
    },
  });
}

