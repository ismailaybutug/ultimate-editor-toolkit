import { spawn } from 'node:child_process';

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

// Adobe apps start panels with a minimal PATH, so look in the usual install places too.
function findBinary(name: string, envVar: string): string {
  const fromEnv = process.env[envVar];
  if (fromEnv) return fromEnv;
  const candidates = process.platform === 'win32'
    ? [`C:\\ffmpeg\\bin\\${name}.exe`]
    : [`/opt/homebrew/bin/${name}`, `/usr/local/bin/${name}`, `${homedir()}/.local/bin/${name}`, `/usr/bin/${name}`];
  return candidates.find(c => existsSync(c)) ?? name;
}

export const FFMPEG = findBinary('ffmpeg', 'UET_FFMPEG');
export const FFPROBE = findBinary('ffprobe', 'UET_FFPROBE');

export function run(cmd: string, args: string[]): Promise<{ stdout: Buffer; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    let err = '';
    p.stdout.on('data', d => out.push(d));
    p.stderr.on('data', d => { err += d.toString(); });
    p.on('error', reject);
    p.on('close', code => resolve({ stdout: Buffer.concat(out), stderr: err, code: code ?? -1 }));
  });
}

export async function probeDuration(file: string): Promise<number> {
  const r = await run(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  const d = Number(r.stdout.toString().trim());
  if (!Number.isFinite(d)) throw new Error(`ffprobe could not read duration of ${file}: ${r.stderr.slice(0, 300)}`);
  return d;
}

/** Decode the first audio stream to mono 16 kHz signed 16-bit PCM. */
export async function decodePcm(file: string, sampleRate = 16000): Promise<Int16Array> {
  const r = await run(FFMPEG, ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(sampleRate), '-f', 's16le', '-']);
  if (r.code !== 0) throw new Error(`ffmpeg decode failed: ${r.stderr.slice(0, 300)}`);
  const b = r.stdout;
  return new Int16Array(b.buffer, b.byteOffset, Math.floor(b.byteLength / 2));
}
