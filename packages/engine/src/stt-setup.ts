/**
 * One-click install of the local speech engine on a Mac without Homebrew or Xcode:
 *  1. whisper-cli (arm64, Metal) from this repo's GitHub Release, built by .github/workflows/whisper-macos.yml
 *  2. a ggml Whisper model from Hugging Face
 * Both go to ~/.uet (no admin rights), are SHA-256 checked, and are written by Node (so macOS does not quarantine them).
 * Uses node:https only, because the panel's embedded Node (CEP) may be too old for fetch().
 */
import https from 'node:https';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, chmodSync, statSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { createGunzip } from 'node:zlib';
import { spawn } from 'node:child_process';

export function uetHome(): string { return process.env.UET_HOME ?? join(homedir(), '.uet'); }
export function binDir(): string { return join(uetHome(), 'bin'); }
export function modelDir(): string { return process.env.UET_MODEL_DIR ?? join(uetHome(), 'models'); }

const REPO = 'ismailaybutug/ultimate-editor-toolkit';
export const WHISPER_BUILD = {
  tag: 'whisper-cli-v1.8.7-1',
  asset: 'whisper-cli-macos-arm64.gz',
  /** SHA-256 of the gzip file (from the workflow log of the run that published the release). */
  sha256: '27dccd422305532bd412d9800695728b044a4720d7a99018bc2c57d50c2d54c4',
};
export const whisperBuildUrl = () => process.env.UET_WHISPER_URL ?? `https://github.com/${REPO}/releases/download/${WHISPER_BUILD.tag}/${WHISPER_BUILD.asset}`;

export interface ModelInfo { id: string; file: string; sizeMb: number; label: { tr: string; en: string }; sha256: string }
/** sha256 '' = take it from Hugging Face's x-linked-etag header (the LFS object hash). */
export const MODELS: ModelInfo[] = [
  { id: 'large-v3-turbo-q5_0', file: 'ggml-large-v3-turbo-q5_0.bin', sizeMb: 547, label: { tr: 'En iyi (önerilen)', en: 'Best (recommended)' }, sha256: '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2' },
  { id: 'small', file: 'ggml-small.bin', sizeMb: 466, label: { tr: 'Orta', en: 'Medium' }, sha256: '' },
  { id: 'base', file: 'ggml-base.bin', sizeMb: 142, label: { tr: 'Hızlı, daha az doğru', en: 'Fast, less accurate' }, sha256: '' },
];
export const modelUrl = (m: ModelInfo) => `${process.env.UET_MODEL_BASE_URL ?? 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main'}/${m.file}`;

export type SetupPhase = 'idle' | 'binary' | 'model' | 'checking' | 'done' | 'error';
export interface SetupState { phase: SetupPhase; model: string | null; receivedMb: number; totalMb: number; percent: number; error: string | null; startedAt: number | null }
let state: SetupState = { phase: 'idle', model: null, receivedMb: 0, totalMb: 0, percent: 0, error: null, startedAt: null };
let running: Promise<SetupState> | null = null;
export function setupState(): SetupState { return { ...state }; }

const MB = 1024 * 1024;
const r1 = (x: number) => Math.round(x * 10) / 10;

interface Got { sha256: string; bytes: number; linkedEtag: string | null }
/** GET with redirects; streams into `dest` (optionally gunzipped). Returns the SHA-256 of the bytes as downloaded. */
export function download(url: string, dest: string, opt: { gunzip?: boolean; onProgress?: (got: number, total: number) => void } = {}, hops = 0, linkedEtag: string | null = null): Promise<Got> {
  return new Promise((resolve, reject) => {
    if (hops > 8) { reject(new Error('too many redirects')); return; }
    const req = (url.startsWith('http:') ? http : https).get(url, { headers: { 'User-Agent': 'uet-engine' } }, res => {
      const etag = (res.headers['x-linked-etag'] as string | undefined)?.replace(/"/g, '') ?? linkedEtag;
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(download(new URL(res.headers.location, url).toString(), dest, opt, hops + 1, etag));
        return;
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode} for ${url}`)); return; }
      const total = Number(res.headers['content-length'] ?? 0);
      const hash = createHash('sha256');
      let got = 0;
      mkdirSync(dirname(dest), { recursive: true });
      const out = createWriteStream(dest);
      res.on('data', (c: Buffer) => { hash.update(c); got += c.length; opt.onProgress?.(got, total); });
      let failed = false;
      const fail = (e: Error) => { failed = true; out.destroy(); reject(e); };
      res.on('error', fail);
      out.on('error', fail);
      // 'close' (not 'finish'): the file descriptor must be closed before the file is renamed or executed.
      out.on('close', () => { if (!failed) resolve({ sha256: hash.digest('hex'), bytes: got, linkedEtag: etag }); });
      if (opt.gunzip) { const g = createGunzip(); g.on('error', fail); res.pipe(g).pipe(out); } else res.pipe(out);
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('network timeout')));
  });
}

function fetchText(url: string): Promise<string> {
  const tmp = join(uetHome(), 'tmp', `t-${Date.now()}.txt`);
  return download(url, tmp).then(() => { const t = readFileSync(tmp, 'utf8'); rmSync(tmp, { force: true }); return t; });
}

function exec(cmd: string, args: string[]): Promise<{ code: number; out: string }> {
  return new Promise(resolve => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { out += d; });
    p.on('error', e => resolve({ code: -1, out: String(e) }));
    p.on('close', code => resolve({ code: code ?? -1, out }));
  });
}

export const installedWhisper = () => join(binDir(), 'whisper-cli');

async function installBinary(): Promise<void> {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    if (!process.env.UET_WHISPER_URL) throw new Error(`Hazır motor yalnızca Apple Silicon Mac için var (bu makine: ${process.platform}/${process.arch}).`);
  }
  const dest = installedWhisper(), part = `${dest}.part`;
  state = { ...state, phase: 'binary', receivedMb: 0, totalMb: 0, percent: 0 };
  const url = whisperBuildUrl();
  const got = await download(url, part, { gunzip: true, onProgress: (g, t) => { state.receivedMb = r1(g / MB); state.totalMb = r1(t / MB); state.percent = t ? Math.round((g / t) * 100) : 0; } });
  // A custom URL (tests, mirrors) brings its own hash in UET_WHISPER_SHA256.
  let want = process.env.UET_WHISPER_URL ? (process.env.UET_WHISPER_SHA256 ?? '') : WHISPER_BUILD.sha256;
  if (!want && !process.env.UET_WHISPER_URL) {
    const sums = await fetchText(url.replace(/[^/]+$/, 'SHA256SUMS'));
    want = sums.split('\n').map(l => l.trim().split(/\s+/)).find(p => p[1] === WHISPER_BUILD.asset)?.[0] ?? '';
  }
  if (want && got.sha256 !== want) { rmSync(part, { force: true }); throw new Error(`whisper-cli indirmesi bozuk (SHA-256 uyuşmuyor).`); }
  chmodSync(part, 0o755);
  renameSync(part, dest);
  if (process.platform === 'darwin') await exec('/usr/bin/xattr', ['-d', 'com.apple.quarantine', dest]); // no-op when not set
  state.phase = 'checking';
  const t = await exec(dest, ['--help']);
  if (!/usage/i.test(t.out)) throw new Error(`whisper-cli çalışmadı (${t.code}): ${t.out.slice(0, 300)}`);
}

async function installModel(m: ModelInfo): Promise<void> {
  const dest = join(modelDir(), m.file), part = `${dest}.part`;
  state = { ...state, phase: 'model', receivedMb: 0, totalMb: m.sizeMb, percent: 0 };
  try {
    const free = (await import('node:fs')).statfsSync?.(uetHome());
    if (free && free.bavail * free.bsize < (m.sizeMb + 200) * MB) throw new Error(`Diskte yer yok: ${m.sizeMb + 200} MB gerekli.`);
  } catch (e) { if ((e as Error).message.startsWith('Diskte')) throw e; }
  const got = await download(modelUrl(m), part, { onProgress: (g, t) => { state.receivedMb = r1(g / MB); state.totalMb = r1((t || m.sizeMb * MB) / MB); state.percent = t ? Math.round((g / t) * 100) : 0; } });
  const want = m.sha256 || got.linkedEtag || '';
  if (want && /^[0-9a-f]{64}$/.test(want) && got.sha256 !== want) { rmSync(part, { force: true }); throw new Error(`Model indirmesi bozuk (SHA-256 uyuşmuyor).`); }
  if (got.bytes < 20 * MB) { rmSync(part, { force: true }); throw new Error(`Model dosyası eksik indi (${r1(got.bytes / MB)} MB).`); }
  renameSync(part, dest);
}

/** Start (or join) the install. Resolves when done; poll setupState() for progress. */
export function startSetup(o: { model?: string; force?: boolean } = {}): Promise<SetupState> {
  if (running) return running;
  const m = MODELS.find(x => x.id === (o.model ?? MODELS[0]!.id));
  if (!m) return Promise.reject(new Error(`Bilinmeyen model ${o.model}. Seçenekler: ${MODELS.map(x => x.id).join(', ')}`));
  state = { phase: 'idle', model: m.id, receivedMb: 0, totalMb: 0, percent: 0, error: null, startedAt: Date.now() };
  running = (async () => {
    try {
      if (o.force || !existsSync(installedWhisper())) await installBinary();
      if (o.force || !existsSync(join(modelDir(), m.file))) await installModel(m);
      state = { ...state, phase: 'done', percent: 100 };
    } catch (e) {
      state = { ...state, phase: 'error', error: e instanceof Error ? e.message : String(e) };
    } finally {
      running = null;
    }
    return { ...state };
  })();
  return running;
}

export function installedModels(): { id: string; file: string; sizeMb: number }[] {
  return MODELS.filter(m => existsSync(join(modelDir(), m.file)))
    .map(m => ({ id: m.id, file: m.file, sizeMb: Math.round(statSync(join(modelDir(), m.file)).size / MB) }));
}
