import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir, homedir, cpus } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { parseWhisperJson, type WhisperJson, type Segment } from '@uet/core';
import { FFMPEG, run } from './ffmpeg.js';
import { binDir, modelDir, uetHome, MODELS } from './stt-setup.js';

export { modelDir } from './stt-setup.js';

/**
 * Local speech-to-text with whisper.cpp's `whisper-cli`. Zero API cost.
 * The Engine installs its own copy into ~/.uet/bin (stt-setup.ts); Homebrew installs are found too.
 */
export const INSTALL_HINT_TR =
  'Altyazı motoru kurulu değil. Panelde Altyazı aracını açıp "Motoru kur" düğmesine bas (bir kez, yaklaşık 550 MB indirir).';

export function findWhisper(): string | null {
  const env = process.env.UET_WHISPER;
  if (env) return env;
  const names = ['whisper-cli', 'whisper-cpp'];
  const dirs = [binDir(), '/opt/homebrew/bin', '/usr/local/bin', join(homedir(), '.local', 'bin'), '/usr/bin'];
  for (const d of dirs) for (const n of names) if (existsSync(`${d}/${n}`)) return `${d}/${n}`;
  return null;
}

/** Best model first: turbo is fast on Apple Silicon and good for Turkish; smaller ones are fallbacks. */
export const MODEL_PREFERENCE = [
  'ggml-large-v3-turbo-q5_0.bin', 'ggml-large-v3-turbo.bin', 'ggml-medium.bin', 'ggml-small.bin', 'ggml-base.bin', 'ggml-tiny.bin',
];

export function findModel(name?: string): string | null {
  if (process.env.UET_WHISPER_MODEL) return process.env.UET_WHISPER_MODEL;
  const dir = modelDir();
  const known = name ? MODELS.find(m => m.id === name)?.file : undefined;
  const list = name ? [known ?? (name.endsWith('.bin') ? name : `ggml-${name}.bin`)] : MODEL_PREFERENCE;
  for (const f of list) if (existsSync(join(dir, f))) return join(dir, f);
  return null;
}

/**
 * Whisper leaves out hesitation sounds unless the initial prompt shows them. Used when the transcript is for
 * filler-word removal ("verbatim").
 */
export const VERBATIM_PROMPT: Record<string, string> = {
  tr: 'Eee, şey, ııı... Yani, hani, hmm. Ee işte.',
  en: 'Umm, uh, so, like... you know, hmm. Uh, I mean.',
};

export interface TranscribeOptions { language?: string; model?: string; threads?: number; translate?: boolean; verbatim?: boolean; noCache?: boolean }
export interface TranscribeResult {
  language: string | null; segments: Segment[]; model: string; cached: boolean; gpu: boolean;
  timing: { audioSeconds: number; elapsedSeconds: number; realtimeFactor: number };
}

/** Progress of the transcription that is running now (for the panel to poll). */
export interface SttJob { file: string; percent: number; startedAt: number }
let job: SttJob | null = null;
export function currentJob(): SttJob | null { return job ? { ...job } : null; }

function cacheKey(file: string, model: string, o: TranscribeOptions): string {
  const st = statSync(file);
  return createHash('sha1').update(JSON.stringify([file, st.size, st.mtimeMs, model, o.language ?? 'auto', !!o.translate, !!o.verbatim, 2])).digest('hex');
}

function runWhisper(bin: string, args: string[], onPercent: (p: number) => void): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d: Buffer) => {
      const s = d.toString();
      err = (err + s).slice(-20000);
      const m = /progress\s*=\s*(\d+)%/g;
      let x: RegExpExecArray | null, last = -1;
      while ((x = m.exec(s))) last = Number(x[1]);
      if (last >= 0) onPercent(last);
    });
    p.on('error', reject);
    p.on('close', code => resolve({ code: code ?? -1, stderr: err }));
  });
}

export async function transcribe(file: string, o: TranscribeOptions = {}): Promise<TranscribeResult> {
  const bin = findWhisper();
  const model = findModel(o.model);
  if (!bin || !model) throw new Error(INSTALL_HINT_TR);
  if (!existsSync(file)) throw new Error(`Medya bulunamadı: ${file}`);
  const modelName = model.split('/').pop()!;
  const cacheDir = join(uetHome(), 'cache', 'transcripts');
  const key = cacheKey(file, modelName, o);
  const cacheFile = join(cacheDir, `${key}.json`);
  if (!o.noCache && existsSync(cacheFile)) {
    try { return { ...(JSON.parse(readFileSync(cacheFile, 'utf8')) as TranscribeResult), cached: true }; } catch { /* re-run */ }
  }
  if (job) throw new Error('Başka bir yazıya dökme işi sürüyor; bitmesini bekle.');
  job = { file, percent: 0, startedAt: Date.now() };
  const dir = mkdtempSync(join(tmpdir(), 'uet-stt-'));
  try {
    const wav = join(dir, 'audio.wav');
    const dec = await run(FFMPEG, ['-v', 'error', '-y', '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav]);
    if (dec.code !== 0) throw new Error(`ffmpeg decode failed: ${dec.stderr.slice(0, 300)}`);
    const audioSeconds = (readFileSync(wav).byteLength - 44) / 32000;
    const base = join(dir, 'out');
    const lang = o.language ?? 'auto';
    const args = ['-m', model, '-f', wav, '-l', lang, '-ojf', '-of', base, '-np', '-pp',
      '-t', String(o.threads ?? Math.max(1, Math.min(8, cpus().length - 1)))];
    if (o.translate) args.push('-tr');
    if (o.verbatim) args.push('--prompt', VERBATIM_PROMPT[lang] ?? VERBATIM_PROMPT.en!);
    const t0 = Date.now();
    let gpu = true;
    let r = await runWhisper(bin, args, p => { if (job) job.percent = p; });
    if (r.code !== 0 || !existsSync(`${base}.json`)) {
      // Metal can fail on some machines/VMs: retry once on the CPU.
      gpu = false;
      r = await runWhisper(bin, [...args, '-ng'], p => { if (job) job.percent = p; });
    }
    const elapsedSeconds = (Date.now() - t0) / 1000;
    if (r.code !== 0 || !existsSync(`${base}.json`)) throw new Error(`whisper-cli failed (${r.code}): ${r.stderr.slice(-400)}`);
    const json = JSON.parse(readFileSync(`${base}.json`, 'utf8')) as WhisperJson;
    const parsed = parseWhisperJson(json);
    const result: TranscribeResult = {
      ...parsed, model: modelName, cached: false, gpu,
      timing: { audioSeconds: round(audioSeconds), elapsedSeconds: round(elapsedSeconds), realtimeFactor: round(elapsedSeconds / Math.max(audioSeconds, 0.001)) },
    };
    try { mkdirSync(cacheDir, { recursive: true }); writeFileSync(cacheFile, JSON.stringify(result)); } catch { /* cache is optional */ }
    return result;
  } finally {
    job = null;
    rmSync(dir, { recursive: true, force: true });
  }
}

const round = (x: number) => Math.round(x * 100) / 100;
