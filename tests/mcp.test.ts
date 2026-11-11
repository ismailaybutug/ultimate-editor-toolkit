// End-to-end: MCP client (stdio) -> mcp.mjs -> Engine WebSocket -> tool. Uses a temp HOME for the discovery file.
import { describe, it, expect } from 'vitest';
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { createRegistry, startServer } from '@uet/engine';

describe('MCP server', () => {
  it('lists engine tools with JSON schemas and calls one', async () => {
    const home = mkdtempSync(join(tmpdir(), 'uet-'));
    const oldHome = process.env.HOME;
    process.env.HOME = home;
    const h = await startServer(createRegistry(), {});
    process.env.HOME = oldHome;
    const out = join(home, 'mcp.mjs');
    await build({ entryPoints: ['packages/mcp/src/main.ts'], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent',
      banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" } });
    const p = spawn(process.execPath, [out], { env: { ...process.env, HOME: home } });
    const lines = createInterface({ input: p.stdout });
    const pending = new Map<number, (v: any) => void>();
    lines.on('line', l => { const m = JSON.parse(l); pending.get(m.id)?.(m); });
    const rpc = (id: number, method: string, params?: unknown) => new Promise<any>(r => { pending.set(id, r); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });

    const init = await rpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
    expect(init.result.serverInfo.name).toBe('ultimate-editor-toolkit');
    p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const list = await rpc(2, 'tools/list');
    const names = list.result.tools.map((t: any) => t.name);
    expect(names).toContain('audio_planSilenceCut');
    const sc = list.result.tools.find((t: any) => t.name === 'audio_planSilenceCut');
    expect(sc.inputSchema.properties.file.type).toBe('string');
    const call = await rpc(3, 'tools/call', { name: 'engine_ping', arguments: {} });
    expect(JSON.parse(call.result.content[0].text).ok).toBe(true);
    const bad = await rpc(4, 'tools/call', { name: 'audio_planSilenceCut', arguments: {} });
    expect(bad.result.isError).toBe(true);
    p.kill();
    await h.close();
  });
});
