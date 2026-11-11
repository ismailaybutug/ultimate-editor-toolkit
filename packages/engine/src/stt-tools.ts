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
  CAPTION_STYLES, findFillers, fillerCutRanges, planSilenceCut, normalizeRanges, type Correction, parseCorrections, applyCorrections,
  correctionsPrompt, parseSrt, pickEmphasis, findRetakes, suggestChapters, youtubeChapters,
} from '@uet/core';
import { existsSync, readFileSync } from 'node:fs';
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

// ---- Corrections list (F-SUB-05): ~/.uet/corrections.txt, "yanlış => doğru" per line ----
export const correctionsFile = () => join(uetHome(), 'corrections.txt');
export function loadCorrections(): Correction[] {
  try { return existsSync(correctionsFile()) ? parseCorrections(readFileSync(correctionsFile(), 'utf8')) : []; } catch { return []; }
}

/** Transcribe with the corrections list: correct spellings go into Whisper's prompt and are applied afterwards. */
export async function correctedWords(file: string, o: { language?: string; model?: string; verbatim?: boolean; translate?: boolean }) {
  const list = loadCorrections();
  const t = await transcribe(file, { language: o.language, model: o.model, verbatim: o.verbatim, translate: o.translate, prompt: o.translate ? undefined : correctionsPrompt(list) || undefined });
  const raw = t.segments.flatMap(s => s.words);
  const lang = o.translate ? 'en' : (o.language && o.language !== 'auto' ? o.language : t.language ?? 'en');
  const { words, changed } = applyCorrections(raw, list, lang);
  return { t, words, corrected: changed, lang };
}

async function captionsFor(p: { file: string; language: string; model?: string; maxChars: number; maxDuration: number; maxWords: number; translate?: boolean; timeline?: z.infer<typeof timelineSchema> }) {
  const { t, words, corrected, lang } = await correctedWords(p.file, { language: p.language, model: p.model, translate: p.translate });
  let captions = buildCaptions(words, { maxChars: p.maxChars, maxDuration: p.maxDuration, maxWords: p.maxWords });
  if (p.timeline) captions = mapToTimeline(captions, p.timeline);
  return { t, words, captions, corrected, lang };
}

function ffmpegIn(cwd: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    p.stdout.on('data', (d: Buffer) => { for (const m of d.toString().matchAll(/^\s*\S{2,3}\s+(\w+)\s+\S+->\S+/gm)) FILTERS_OUT.add(m[1]!); });
    p.stderr.on('data', d => { err = (err + d).slice(-8000); });
    p.on('error', reject);
    p.on('close', code => resolve({ code: code ?? -1, stderr: err }));
  });
}

/**
 * Render captions into a transparent video (QuickTime Animation, or ProRes 4444) with ffmpeg + libass.
 * The clip covers [from, to) in the captions' time base.
 */
let libass: boolean | null = null;
/** Can this ffmpeg draw ASS subtitles (built with libass)? Cached. */
export async function ffmpegHasLibass(): Promise<boolean> {
  if (libass === null) {
    const r = await ffmpegIn(tmpdir(), ['-hide_banner', '-filters']).catch(() => ({ code: -1, stderr: '' }));
    libass = r.code === 0 ? FILTERS_OUT.has('ass') : false;
  }
  return libass;
}
const FILTERS_OUT = new Set<string>();

export async function renderOverlay(captions: Caption[], styleId: string, o: { width: number; height: number; fps: number; from: number; to: number; out: string; codec: 'qtrle' | 'prores'; emphasis?: Set<string> }) {
  const style = getCaptionStyle(styleId);
  if (!(await ffmpegHasLibass())) throw new Error('Bu ffmpeg sürümü stilli altyazı çizemiyor (libass yok). Altyazı izi (SRT) yine de çalışır.');
  const shifted = captions.map(c => ({ ...c, start: c.start - o.from, end: c.end - o.from, words: c.words.map(w => ({ ...w, start: w.start - o.from, end: w.end - o.from })) }));
  const dir = mkdtempSync(join(tmpdir(), 'uet-ovl-'));
  try {
    writeFileSync(join(dir, 'subs.ass'), toAss(shifted, style, { width: o.width, height: o.height, emphasis: o.emphasis }), 'utf8');
    const dur = Math.max(0.1, o.to - o.from);
    const codec = o.codec === 'prores'
      ? ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-vendor', 'apl0']
      : ['-c:v', 'qtrle', '-pix_fmt', 'argb'];
    const src = `color=c=black@0.0:s=${o.width}x${o.height}:r=${o.fps}:d=${dur.toFixed(3)},format=rgba`;
    const go = (filter: string) => ffmpegIn(dir, ['-v', 'error', '-y', '-f', 'lavfi', '-i', src, '-vf', filter, ...codec, '-an', 'out.mov']);
    // ffmpeg 4.4-7 need alpha=1 to draw into the alpha channel; builds without that option get the plain filter.
    let r = await go('format=rgba,ass=subs.ass:alpha=1');
    if (r.code !== 0 && /No option name|Option 'alpha' not found|alpha.*not found/i.test(r.stderr)) r = await go('format=rgba,ass=subs.ass');
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
      translate: z.boolean().default(false).describe('Subtitles in English, whatever language is spoken (Whisper translate, local)'),
      srtIn: z.string().optional().describe('Use this existing .srt/.vtt (timeline times) instead of transcribing `file`'),
      keywords: z.array(z.string()).default([]).describe('Words to emphasise in the stacked / keyword looks'),
    }),
    run: async p => {
      const style = getCaptionStyle(p.style);
      let captions: Caption[], t: { language: string | null; model: string; timing: unknown; cached: boolean } | null = null, corrected = 0, lang = p.language;
      if (p.srtIn) {
        captions = parseSrt(readFileSync(p.srtIn, 'utf8'));
        if (!captions.length) throw new Error('SRT dosyasında altyazı bulunamadı.');
      } else {
        const r = await captionsFor({ ...p, maxChars: style.maxLineChars * style.maxLines, maxDuration: 5, maxWords: style.maxWords });
        captions = r.captions; t = r.t; corrected = r.corrected; lang = r.lang;
      }
      const emphasis = pickEmphasis(captions, { language: lang === 'auto' ? 'tr' : lang, keywords: p.keywords });
      const files: Record<string, string> = {};
      for (const f of p.formats) {
        const path = outPath(p.file, f, p.outDir);
        const body = f === 'srt' ? toSrt(captions) : f === 'vtt' ? toVtt(captions, style.animation !== 'none')
          : f === 'ass' ? toAss(captions, style, { width: p.width, height: p.height, emphasis }) : JSON.stringify(toCaptionJson(captions, style), null, 1);
        writeFileSync(path, body, 'utf8');
        files[f] = path;
      }
      let overlay = null;
      if (p.overlay) {
        if (!captions.length) throw new Error('Konuşma bulunamadı; altyazı yok.');
        const from = p.timeline && !p.srtIn ? p.timeline.timelineStart : 0;
        const to = p.timeline && !p.srtIn ? p.timeline.timelineStart + (p.timeline.sourceOut - p.timeline.sourceIn) : Math.max(...captions.map(c => c.end));
        overlay = await renderOverlay(captions, p.style, { width: p.width, height: p.height, fps: p.fps, from, to, out: outPath(p.file, 'mov', p.outDir), codec: p.overlayCodec, emphasis });
        overlay = { ...overlay, timelineStart: from };
      }
      return { language: t?.language ?? null, model: t?.model ?? null, timing: t?.timing ?? null, cached: t?.cached ?? false, corrected, source: p.srtIn ? 'srt' : 'speech', captions: captions.length, style: p.style, files, overlay };
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
      retakes: z.boolean().default(false).describe('Also cut earlier takes of a sentence that is said again (keeps the last take)'),
    }),
    run: async p => {
      const { t, words, lang } = await correctedWords(p.file, { language: p.language === 'auto' ? undefined : p.language, model: p.model, verbatim: true });
      const fillers = findFillers(words, { language: lang, kinds: p.kinds });
      const retakes = p.retakes ? findRetakes(words, { language: lang }) : [];
      const cut = normalizeRanges([...fillerCutRanges(words, fillers, p.padding), ...retakes.map(r => ({ start: r.start, end: r.end }))]);
      const duration = await probeDuration(p.file);
      const plan = planSilenceCut(cut, duration, { minSilence: 0, padding: 0, minKeep: 0.1, fps: p.fps });
      const removed = cut.reduce((s, r) => s + r.end - r.start, 0);
      return {
        language: lang, model: t.model, cached: t.cached, wordCount: words.length, duration,
        fillers, retakes, counts: { retake: retakes.length, sound: fillers.filter(f => f.kind === 'sound').length, discourse: fillers.filter(f => f.kind === 'discourse').length, repeat: fillers.filter(f => f.kind === 'repeat').length },
        cut, keep: plan.keep, removedSeconds: Math.round(removed * 100) / 100,
      };
    },
  });
  reg.register({
    id: 'subtitles.corrections', app: 'engine', destructive: false,
    title: { en: 'Read or replace the corrections list (words Whisper mishears), one "wrong => right" per line', tr: 'Düzeltme listesi' },
    params: z.object({ text: z.string().optional().describe('New list; omit to only read') }),
    run: async p => {
      if (p.text !== undefined) { mkdirSync(uetHome(), { recursive: true }); writeFileSync(correctionsFile(), p.text, 'utf8'); }
      const text = existsSync(correctionsFile()) ? readFileSync(correctionsFile(), 'utf8') : '';
      return { text, rules: parseCorrections(text) };
    },
  });
  reg.register({
    id: 'transcript.chapters', app: 'engine', destructive: false,
    title: { en: 'Suggest chapters from what is said (local, no AI): times + titles and a YouTube chapter list', tr: 'Bölüm öner' },
    params: z.object({
      file: z.string().min(1), language: z.string().default('tr'), model: z.string().optional(),
      minLength: z.number().min(10).default(60), maxChapters: z.number().int().min(2).max(30).default(12),
      timeline: timelineSchema.optional(),
    }),
    run: async p => {
      const { t, words, lang } = await correctedWords(p.file, { language: p.language === 'auto' ? undefined : p.language, model: p.model });
      let used = words;
      if (p.timeline) {
        const tl = p.timeline;
        used = words.filter(w => w.end > tl.sourceIn && w.start < tl.sourceOut).map(w => ({ ...w, start: w.start - tl.sourceIn, end: w.end - tl.sourceIn }));
      }
      const chapters = suggestChapters(used, { language: lang, minLength: p.minLength, maxChapters: p.maxChapters });
      const offset = p.timeline ? p.timeline.timelineStart : 0;
      return { language: lang, model: t.model, cached: t.cached, chapters: chapters.map(c => ({ ...c, time: c.start + offset })), youtube: youtubeChapters(chapters), enoughForYoutube: chapters.length >= 3 };
    },
  });
}
