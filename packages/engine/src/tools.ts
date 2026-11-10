import { z } from 'zod';
import { writeFileSync } from 'node:fs';
import { ToolRegistry, planSilenceCut, buildCaptions, toSrt, mapToTimeline } from '@uet/core';
import { detectSilence, measureLoudness, loudnessGain } from './analysis.js';
import { transcribe, findWhisper, findModel, modelDir } from './whisper.js';

export const VERSION = '0.1.4';

export function createRegistry(): ToolRegistry {
  const reg = new ToolRegistry();
  reg.register({
    id: 'engine.ping', app: 'engine', destructive: false,
    title: { en: 'Ping', tr: 'Bağlantı testi' },
    params: z.object({}),
    run: async () => ({ ok: true, version: VERSION, platform: process.platform, arch: process.arch }),
  });
  reg.register({
    id: 'audio.planSilenceCut', app: 'engine', destructive: false,
    title: { en: 'Find silences', tr: 'Sessizlikleri bul' },
    params: z.object({
      file: z.string().min(1),
      thresholdDb: z.number().max(0).optional(),
      minSilence: z.number().min(0.05).default(0.5),
      padding: z.number().min(0).max(1).default(0.12),
      minKeep: z.number().min(0).default(0.25),
      fps: z.number().positive().default(30),
    }),
    run: async p => {
      const a = await detectSilence(p.file, { thresholdDb: p.thresholdDb, minSilence: Math.min(0.3, p.minSilence) });
      const plan = planSilenceCut(a.silences, a.duration, { minSilence: p.minSilence, padding: p.padding, minKeep: p.minKeep, fps: p.fps });
      const removed = plan.cut.reduce((s, r) => s + (r.end - r.start), 0);
      return { ...a, ...plan, removedSeconds: Math.round(removed * 100) / 100 };
    },
  });
  reg.register({
    id: 'audio.measureLoudness', app: 'engine', destructive: false,
    title: { en: 'Measure loudness', tr: 'Ses yüksekliğini ölç' },
    params: z.object({ file: z.string().min(1), targetLufs: z.number().default(-14) }),
    run: async p => {
      const m = await measureLoudness(p.file);
      return { ...m, targetLufs: p.targetLufs, gainDb: loudnessGain(m, p.targetLufs) };
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
      srtPath: z.string().optional().describe('Write an .srt file here'),
      includeWords: z.boolean().default(false),
      timeline: z.object({ sourceIn: z.number(), sourceOut: z.number(), timelineStart: z.number() }).optional()
        .describe('Keep only the used part of the media and move captions to timeline time'),
    }),
    run: async p => {
      const t = await transcribe(p.file, { language: p.language, model: p.model });
      const words = t.segments.flatMap(s => s.words);
      let captions = buildCaptions(words, { maxChars: p.maxChars, maxDuration: p.maxDuration });
      if (p.timeline) captions = mapToTimeline(captions, p.timeline);
      const srt = toSrt(captions);
      if (p.srtPath) writeFileSync(p.srtPath, srt, 'utf8');
      return {
        language: t.language, model: t.model, timing: t.timing, wordCount: words.length,
        text: t.segments.map(s => s.text).join(' '),
        captions: captions.map(c => ({ start: c.start, end: c.end, text: c.text, ...(p.includeWords ? { words: c.words } : {}) })),
        srtPath: p.srtPath ?? null,
      };
    },
  });
  reg.register({
    id: 'engine.status', app: 'engine', destructive: false,
    title: { en: 'Engine status', tr: 'Motor durumu' },
    params: z.object({}),
    run: async () => ({ version: VERSION, whisper: findWhisper(), whisperModel: findModel(), modelDir: modelDir() }),
  });
  return reg;
}
