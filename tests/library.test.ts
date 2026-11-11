import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migratePreset, slugify } from '@uet/core';
import { createRegistry } from '@uet/engine';

let dir = '';
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'uet-lib-')); process.env.UET_LIBRARY_DIR = dir; });

describe('preset model', () => {
  it('slugifies Turkish names and migrates v0 presets', () => {
    expect(slugify('Hızlı Şık Geçiş!')).toBe('hizli-sik-gecis');
    const p = migratePreset({ name: 'Eski', tool: 'v-silence', values: { minSilence: 0.4 } });
    expect(p).toMatchObject({ schema: 'uet.preset/1', id: 'eski', app: 'any', params: { minSilence: 0.4 } });
  });
  it('rejects folder names that escape the library', () => {
    expect(() => migratePreset({ name: 'x', tool: 't', params: {}, folder: '../etc' })).toThrow();
  });
});

describe('library tools (engine)', () => {
  it('saves, lists by tool/app, updates in place and keeps ids unique', async () => {
    const reg = createRegistry();
    const a: any = await reg.call('library.save', { name: 'Podcast sıkı', app: 'PPRO', tool: 'v-silence', params: { minSilence: 0.3, padding: 0.08 } });
    const b: any = await reg.call('library.save', { name: 'Podcast sıkı', app: 'PPRO', tool: 'v-silence', params: { minSilence: 0.5 } });
    expect(a.id).toBe('podcast-siki');
    expect(b.id).toBe('podcast-siki-2');
    await reg.call('library.save', { name: 'AE pop', app: 'AEFT', tool: 'v-recipes', params: { recipe: 'pop-in' }, folder: 'Reels' });
    const ppro: any = await reg.call('library.list', { app: 'PPRO', tool: 'v-silence' });
    expect(ppro.presets.map((p: any) => p.id)).toEqual(['podcast-siki', 'podcast-siki-2']);
    const upd: any = await reg.call('library.save', { id: 'podcast-siki', name: 'Podcast sıkı', app: 'PPRO', tool: 'v-silence', params: { minSilence: 0.25 } });
    expect(upd.createdAt).toBe(a.createdAt);
    expect(upd.params.minSilence).toBe(0.25);
    expect(existsSync(join(dir, 'Reels', 'ae-pop.json'))).toBe(true);
  });
  it('deletes into trash, exports and re-imports without overwriting', async () => {
    const reg = createRegistry();
    await reg.call('library.save', { name: 'Bir', tool: 't', params: { x: 1 } });
    await reg.call('library.save', { name: 'İki', tool: 't', params: { x: 2 } });
    const ex: any = await reg.call('library.export', { path: join(dir, 'pack.uetpack') });
    expect(ex.count).toBe(2);
    const del: any = await reg.call('library.delete', { id: 'bir' });
    expect(readdirSync(join(dir, '.trash')).length).toBe(1);
    expect(del.trashed).toContain('.trash');
    const im: any = await reg.call('library.import', { path: join(dir, 'pack.uetpack') });
    expect(im.imported.sort()).toEqual(['bir', 'iki-2']);
    const all: any = await reg.call('library.list', {});
    expect(all.presets.length).toBe(3);
  });
  it('reports broken files instead of failing the whole list', async () => {
    writeFileSync(join(dir, 'broken.json'), '{ nope');
    const r: any = await createRegistry().call('library.list', {});
    expect(r.errors.length).toBe(1);
  });
});
