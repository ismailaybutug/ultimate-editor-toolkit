/**
 * Presets (F-PROD-05 library, T2-07/T2-09). A preset is a named set of tool settings.
 * Stored as JSON files; `schema` carries the version so old files can be migrated.
 */
import { z } from 'zod';

export const PRESET_SCHEMA = 'uet.preset/1';

export const PresetSchema = z.object({
  schema: z.literal(PRESET_SCHEMA),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  name: z.string().min(1).max(80),
  app: z.enum(['PPRO', 'AEFT', 'any']),
  tool: z.string().min(1).max(80), // catalog card id or tool view id, e.g. 'silence' or 'v-silence'
  folder: z.string().max(80).regex(/^[^/\\.][^/\\]*$/).optional(), // one level of user folders
  params: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  tags: z.array(z.string().max(30)).max(20).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Preset = z.infer<typeof PresetSchema>;

export const PACK_SCHEMA = 'uet.pack/1';
export const PackSchema = z.object({ schema: z.literal(PACK_SCHEMA), exportedAt: z.string(), presets: z.array(z.unknown()) });

/** Upgrade any older/looser preset object to the current schema (throws if not a preset). */
export function migratePreset(raw: unknown): Preset {
  const o: any = typeof raw === 'object' && raw ? { ...raw } : {};
  // v0 (pre-schema drafts): {name, tool, values}
  if (!o.schema && o.values && !o.params) { o.params = o.values; delete o.values; }
  if (!o.schema) o.schema = PRESET_SCHEMA;
  const now = new Date().toISOString();
  o.createdAt ??= now; o.updatedAt ??= o.createdAt;
  o.app ??= 'any';
  o.id ??= slugify(o.name ?? 'preset');
  return PresetSchema.parse(o);
}

export function slugify(name: string): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u' };
  const s = name.toLocaleLowerCase('tr').replace(/[çğıiöşü]/g, c => map[c] ?? c)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return s || 'preset';
}

/** Unique id among existing ones: name, name-2, name-3 … */
export function uniqueId(base: string, taken: Set<string>): string {
  let id = slugify(base), n = 2;
  while (taken.has(id)) id = `${slugify(base).slice(0, 44)}-${n++}`;
  return id;
}
