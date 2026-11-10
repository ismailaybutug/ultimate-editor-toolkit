import { z } from 'zod';
import { ToolRegistry, planSilenceCut, everyNth } from '@uet/core';
import { detectSilence, measureLoudness, loudnessGain, detectScenes, detectBeats } from './analysis.js';
import { findWhisper, findModel, modelDir } from './whisper.js';
import { registerSubtitleTools } from './stt-tools.js';

export const VERSION = '0.1.8';

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
    id: 'video.detectScenes', app: 'engine', destructive: false,
    title: { en: 'Find shot changes', tr: 'Sahne değişimlerini bul' },
    params: z.object({ file: z.string().min(1), threshold: z.number().min(0.05).max(0.9).default(0.3), minGap: z.number().min(0).default(0.5) }),
    run: async p => detectScenes(p.file, { threshold: p.threshold, minGap: p.minGap }),
  });
  reg.register({
    id: 'audio.detectBeats', app: 'engine', destructive: false,
    title: { en: 'Find music beats and BPM', tr: 'Vuruşları ve BPM bul' },
    params: z.object({ file: z.string().min(1), every: z.number().int().min(1).max(16).default(1), offset: z.number().int().min(0).default(0) }),
    run: async p => {
      const r = await detectBeats(p.file);
      return { ...r, beats: everyNth(r.beats, p.every, p.offset), totalBeats: r.beats.length };
    },
  });
  reg.register({
    id: 'engine.status', app: 'engine', destructive: false,
    title: { en: 'Engine status', tr: 'Motor durumu' },
    params: z.object({}),
    run: async () => ({ version: VERSION, whisper: findWhisper(), whisperModel: findModel(), modelDir: modelDir() }),
  });
  registerSubtitleTools(reg);
  return reg;
}
