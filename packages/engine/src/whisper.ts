import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir, homedir, cpus } from 'node:os';
import { join } from 'node:path';
import { parseWhisperJson, type WhisperJson, type Segment } from '@uet/core';
import { FFMPEG, run } from './ffmpeg.js';

/**
 * Local speech-to-text with whisper.cpp (`brew install whisper-cpp` → `whisper-cli`). Zero API cost.
 * STATUS: parser tested against the documented -ojf JSON format; the real binary is UNVERIFIED until İso's Mac test.
 */
export const INSTALL_HINT_TR =
  'whisper.cpp bulunamadı. Terminal: brew install whisper-cpp\n' +
  'Model: mkdir -p ~/.uet/models && curl -L -o ~/.uet/models/ggml-large-v3-turbo-q5_0.bin ' +
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin';

export function findWhisper(): string | null {
  const env = process.env.UET_WHISPER;
  if (env) return env;
  const names = ['whisper-cli', 'whisper-cpp'];
  const dirs = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];
  for (const d of dirs) for (const n of names) if (existsSync(`${d}/${n}`)) return `${d}/${n}`;
  return null;
}

/** Best model first: turbo is fast on Apple Silicon and good for Turkish; smaller ones are fallbacks. */
export const MODEL_PREFERENCE = [
  'ggml-large-v3-turbo-q5_0.bin', 'ggml-large-v3-turbo.bin', 'ggml-medium.bin', 'ggml-small.bin', 'ggml-base.bin', 'ggml-tiny.bin',
];

export function modelDir(): string { return process.env.UET_MODEL_DIR ?? join(homedir(), '.uet', 'models'); }

export function findModel(name?: string): string | null {
  if (process.env.UET_WHISPER_MODEL) return process.env.UET_WHISPER_MODEL;
  const dir = modelDir();
  const list = name ? [name.endsWith('.bin') ? name : `ggml-${name}.bin`] : MODEL_PREFERENCE;
  for (const f of list) if (existsSync(join(dir, f))) return join(dir, f);
  return null;
}

export interface TranscribeOptions { language?: string; model?: string; threads?: number; translate?: boolean }
export interface TranscribeResult {
  language: string | null; segments: Segment[]; model: string;
  timing: { audioSeconds: number; elapsedSeconds: number; realtimeFactor: number };
}

export async function transcribe(file: string, o: TranscribeOptions = {}): Promise<TranscribeResult> {
  const bin = findWhisper();
  const model = findModel(o.model);
  if (!bin || !model) throw new Error(INSTALL_HINT_TR);
  const dir = mkdtempSync(join(tmpdir(), 'uet-stt-'));
  try {
    const wav = join(dir, 'audio.wav');
    const dec = await run(FFMPEG, ['-v', 'error', '-y', '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav]);
    if (dec.code !== 0) throw new Error(`ffmpeg decode failed: ${dec.stderr.slice(0, 300)}`);
    const audioSeconds = (readFileSync(wav).byteLength - 44) / 32000;
    const base = join(dir, 'out');
    const args = ['-m', model, '-f', wav, '-l', o.language ?? 'auto', '-ojf', '-of', base, '-np',
      '-t', String(o.threads ?? Math.max(1, Math.min(8, cpus().length - 1)))];
    if (o.translate) args.push('-tr');
    const t0 = Date.now();
    const r = await run(bin, args);
    const elapsedSeconds = (Date.now() - t0) / 1000;
    if (r.code !== 0 || !existsSync(`${base}.json`)) throw new Error(`whisper-cli failed (${r.code}): ${r.stderr.slice(-400)}`);
    const json = JSON.parse(readFileSync(`${base}.json`, 'utf8')) as WhisperJson;
    const parsed = parseWhisperJson(json);
    return {
      ...parsed, model: model.split('/').pop()!,
      timing: { audioSeconds: round(audioSeconds), elapsedSeconds: round(elapsedSeconds), realtimeFactor: round(elapsedSeconds / Math.max(audioSeconds, 0.001)) },
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const round = (x: number) => Math.round(x * 100) / 100;
