import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ToolRegistry } from '@uet/core';

/**
 * JSON-RPC 2.0 over WebSocket on 127.0.0.1 (ARCHITECTURE.md §6).
 * The port and a random token are written to ~/.uet/engine.json; clients must send the token.
 */
export interface EngineHandle { port: number; token: string; close(): Promise<void> }

export function startServer(reg: ToolRegistry, opts: { port?: number; token?: string; writeDiscovery?: boolean } = {}): Promise<EngineHandle> {
  const token = opts.token ?? randomBytes(24).toString('hex');
  const wss = new WebSocketServer({ host: '127.0.0.1', port: opts.port ?? 0 });
  wss.on('connection', (ws: WebSocket, req) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.searchParams.get('token') !== token) { ws.close(4401, 'bad token'); return; }
    ws.on('message', async data => {
      let msg: { id?: unknown; method?: string; params?: unknown };
      try { msg = JSON.parse(data.toString()); } catch { ws.send(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } })); return; }
      const id = msg.id ?? null;
      try {
        if (msg.method === 'tools.list') {
          const list = reg.list().map(t => ({ id: t.id, app: t.app, title: t.title, destructive: t.destructive }));
          ws.send(JSON.stringify({ jsonrpc: '2.0', id, result: list }));
          return;
        }
        const result = await reg.call(String(msg.method), msg.params);
        ws.send(JSON.stringify({ jsonrpc: '2.0', id, result }));
      } catch (e) {
        ws.send(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message: e instanceof Error ? e.message : String(e) } }));
      }
    });
  });
  return new Promise(resolve => {
    wss.on('listening', () => {
      const addr = wss.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      if (opts.writeDiscovery !== false) {
        const dir = join(homedir(), '.uet');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'engine.json'), JSON.stringify({ port, token, pid: process.pid }), { mode: 0o600 });
      }
      resolve({ port, token, close: () => new Promise(r => wss.close(() => r())) });
    });
  });
}
