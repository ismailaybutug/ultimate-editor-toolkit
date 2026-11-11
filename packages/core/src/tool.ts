import { z } from 'zod';

/** Every action (button, voice, MCP, AI) goes through a Tool (ARCHITECTURE.md §4). */
export interface ToolDef<P extends z.ZodTypeAny = z.ZodTypeAny, R = unknown> {
  id: string;
  app: 'ae' | 'ppro' | 'both' | 'engine';
  title: { en: string; tr: string };
  params: P;
  /** true when the tool changes the user's project. Such tools get a backup/undo step. */
  destructive: boolean;
  run(params: z.infer<P>): Promise<R>;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDef>();
  register(t: ToolDef): void {
    if (this.tools.has(t.id)) throw new Error(`duplicate tool ${t.id}`);
    this.tools.set(t.id, t);
  }
  list(): ToolDef[] { return [...this.tools.values()]; }
  async call(id: string, raw: unknown): Promise<unknown> {
    const t = this.tools.get(id);
    if (!t) throw new Error(`unknown tool ${id}`);
    const params = t.params.parse(raw ?? {});
    return t.run(params);
  }
}
