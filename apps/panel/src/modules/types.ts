/**
 * Panel module contract. Each feature module (owned by one worker thread) lives in its own file in
 * apps/panel/src/modules/ and is listed once in modules/index.ts, so modules never edit main.ts,
 * index.html or catalog.ts. See AGENT_HANDOFF.md "Module ownership".
 */
import type { CatalogItem } from '../catalog';

export interface HostResult<T = any> { ok: boolean; data?: T; error?: string; line?: number }
export interface PanelContext {
  hostApp: 'PPRO' | 'AEFT' | 'BROWSER';
  /** Call a function in the host ExtendScript library: callHost('ae', 'applyRecipe', {...}). */
  callHost<T = any>(ns: 'ae' | 'ppro', fn: string, args?: unknown): Promise<HostResult<T>>;
  /** Load an extra .jsx from the extension folder (e.g. 'jsx/uet-transitions.jsx'). */
  loadJsx(relPath: string): Promise<void>;
  /** Call an Engine tool (Node side). Null until the engine started. */
  engine(): { call(id: string, params: unknown): Promise<any> } | null;
  log(msg: string, kind?: 'ok' | 'err' | ''): void;
  /** Wrap a button handler: disables while running, logs errors. */
  busy(btn: HTMLButtonElement, fn: () => Promise<unknown>): () => Promise<void>;
  $<T extends HTMLElement = HTMLElement>(id: string): T;
}

export interface PanelModule {
  id: string;
  /** Cards. A card with `view: 'v-xyz'` opens the <section id="v-xyz"> from viewsHtml. */
  catalog: CatalogItem[];
  /** HTML of the module's tool views: <section class="view" id="v-..." data-app="PPRO|AEFT">…</section> */
  viewsHtml?: string;
  /** Extra .jsx files (relative to the extension root) to load into the host before setup. */
  jsx?: string[];
  /** Wire buttons (runs once after views are in the DOM, only inside Adobe). */
  setup?(ctx: PanelContext): void | Promise<void>;
  /** Register MCP/Engine tools (ids like 'ae.textAnimate'); zod schemas from 'zod'. */
  registerTools?(reg: any, ctx: PanelContext): void;
}
