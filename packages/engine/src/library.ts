/**
 * Preset library on disk: ~/.uet/library/<folder?>/<id>.json. Deletes move files to ~/.uet/library/.trash
 * (restorable), never rm. Import/export uses one .uetpack JSON file.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { z } from 'zod';
import { migratePreset, uniqueId, PresetSchema, PACK_SCHEMA, PackSchema, type Preset, type ToolRegistry } from '@uet/core';

export function libraryDir(): string { return process.env.UET_LIBRARY_DIR ?? join(homedir(), '.uet', 'library'); }
const TRASH = '.trash';

function fileFor(p: Pick<Preset, 'id' | 'folder'>): string { return join(libraryDir(), p.folder ?? '', `${p.id}.json`); }

export function listPresets(filter: { app?: string; tool?: string; folder?: string } = {}): { presets: Preset[]; errors: string[] } {
  const root = libraryDir(), presets: Preset[] = [], errors: string[] = [];
  if (!existsSync(root)) return { presets, errors };
  const dirs = [''].concat(readdirSync(root).filter(d => d !== TRASH && !d.startsWith('.') && statSync(join(root, d)).isDirectory()));
  for (const d of dirs) {
    for (const f of readdirSync(join(root, d)).filter(f => f.endsWith('.json'))) {
      try { presets.push(migratePreset(JSON.parse(readFileSync(join(root, d, f), 'utf8')))); }
      catch (e) { errors.push(`${join(d, f)}: ${(e as Error).message.slice(0, 120)}`); }
    }
  }
  const out = presets.filter(p =>
    (!filter.app || p.app === filter.app || p.app === 'any') && (!filter.tool || p.tool === filter.tool) && (filter.folder === undefined || (p.folder ?? '') === filter.folder));
  out.sort((a, b) => a.name.localeCompare(b.name, 'tr') || a.id.localeCompare(b.id));
  return { presets: out, errors };
}

export function savePreset(input: Omit<Preset, 'schema' | 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Preset {
  const all = listPresets().presets;
  const existing = input.id ? all.find(p => p.id === input.id) : undefined;
  const now = new Date().toISOString();
  const p = PresetSchema.parse({
    schema: 'uet.preset/1', ...input,
    id: existing?.id ?? uniqueId(input.name, new Set(all.map(x => x.id))),
    createdAt: existing?.createdAt ?? now, updatedAt: now,
  });
  if (existing && (existing.folder ?? '') !== (p.folder ?? '')) moveToTrash(existing); // folder changed
  const f = fileFor(p);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify(p, null, 2) + '\n', 'utf8');
  return p;
}

function moveToTrash(p: Preset): string {
  const t = join(libraryDir(), TRASH);
  mkdirSync(t, { recursive: true });
  const dest = join(t, `${p.id}-${Date.now()}.json`);
  renameSync(fileFor(p), dest);
  return dest;
}

export function deletePreset(id: string): { trashed: string } {
  const p = listPresets().presets.find(x => x.id === id);
  if (!p) throw new Error(`Preset not found: ${id}`);
  return { trashed: moveToTrash(p) };
}

export function exportPresets(ids: string[] | 'all', path: string): { path: string; count: number } {
  const all = listPresets().presets;
  const sel = ids === 'all' ? all : all.filter(p => ids.includes(p.id));
  writeFileSync(path, JSON.stringify({ schema: PACK_SCHEMA, exportedAt: new Date().toISOString(), presets: sel }, null, 2) + '\n', 'utf8');
  return { path, count: sel.length };
}

/** Import a .uetpack (or a single preset .json). Name clashes get a new id; nothing is overwritten. */
export function importPresets(path: string): { imported: string[]; errors: string[] } {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const list: unknown[] = raw?.schema === PACK_SCHEMA ? PackSchema.parse(raw).presets : [raw];
  const imported: string[] = [], errors: string[] = [];
  for (const item of list) {
    try {
      const p = migratePreset(item);
      const saved = savePreset({ name: p.name, app: p.app, tool: p.tool, folder: p.folder, params: p.params, tags: p.tags });
      imported.push(saved.id);
    } catch (e) { errors.push((e as Error).message.slice(0, 160)); }
  }
  return { imported, errors };
}

export function registerLibraryTools(reg: ToolRegistry) {
  const Params = z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]));
  reg.register({
    id: 'library.list', app: 'engine', destructive: false, title: { en: 'List saved presets', tr: 'Presetleri listele' },
    params: z.object({ app: z.string().optional(), tool: z.string().optional(), folder: z.string().optional() }),
    run: async p => listPresets(p),
  });
  reg.register({
    id: 'library.save', app: 'engine', destructive: false, title: { en: 'Save a preset (tool settings)', tr: 'Preset kaydet' },
    params: z.object({ id: z.string().optional(), name: z.string().min(1).max(80), app: z.enum(['PPRO', 'AEFT', 'any']).default('any'), tool: z.string().min(1), folder: z.string().optional(), params: Params, tags: z.array(z.string()).default([]) }),
    run: async p => savePreset(p),
  });
  reg.register({
    id: 'library.delete', app: 'engine', destructive: true, title: { en: 'Delete a preset (moved to trash)', tr: 'Preset sil' },
    params: z.object({ id: z.string() }),
    run: async p => deletePreset(p.id),
  });
  reg.register({
    id: 'library.export', app: 'engine', destructive: false, title: { en: 'Export presets to a .uetpack file', tr: 'Presetleri dışa aktar' },
    params: z.object({ ids: z.union([z.array(z.string()), z.literal('all')]).default('all'), path: z.string().min(1) }),
    run: async p => exportPresets(p.ids, p.path),
  });
  reg.register({
    id: 'library.import', app: 'engine', destructive: false, title: { en: 'Import presets from a .uetpack or preset .json', tr: 'Preset içe aktar' },
    params: z.object({ path: z.string().min(1) }),
    run: async p => importPresets(p.path),
  });
}
