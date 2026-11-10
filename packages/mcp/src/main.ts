/**
 * MCP server (stdio) that exposes the running UET Engine's tools to an MCP client such as Claude Desktop.
 * The Engine runs inside the Adobe panel and writes ~/.uet/engine.json; this process forwards
 * tools/list and tools/call to it. No AI cost for us: the user's own AI app does the reasoning (TD-006).
 * Minimal implementation of MCP over stdio (newline-delimited JSON-RPC 2.0).
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import WebSocket from 'ws';

const PROTOCOL = '2025-06-18';

function engineRpc(method: string, params?: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    let info: { port: number; token: string };
    try { info = JSON.parse(readFileSync(join(homedir(), '.uet', 'engine.json'), 'utf8')); }
    catch { reject(new Error('UET Engine is not running. Open the Ultimate Editor Toolkit panel in Premiere Pro or After Effects.')); return; }
    const ws = new WebSocket(`ws://127.0.0.1:${info.port}/?token=${info.token}`);
    const timer = setTimeout(() => { ws.terminate(); reject(new Error('Engine timeout')); }, 120000);
    ws.on('open', () => ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })));
    ws.on('message', d => { clearTimeout(timer); const m = JSON.parse(d.toString()); ws.close(); m.error ? reject(new Error(m.error.message)) : resolve(m.result); });
    ws.on('error', e => { clearTimeout(timer); reject(new Error(`Cannot reach UET Engine (${e.message}). Is the panel open?`)); });
  });
}

const toMcpName = (id: string) => id.replace(/\./g, '_');

async function handle(msg: any): Promise<any> {
  switch (msg.method) {
    case 'initialize':
      return { protocolVersion: PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: 'ultimate-editor-toolkit', version: '0.1.0' } };
    case 'ping':
      return {};
    case 'tools/list': {
      let tools: any[] = [];
      try { tools = await engineRpc('tools.list'); } catch { /* engine not running: list nothing, calls will explain */ }
      return {
        tools: tools.map(t => ({
          name: toMcpName(t.id),
          description: `${t.title.en}${t.destructive ? ' (changes the project; creates new items, never deletes the original)' : ''} [${t.app}]`,
          inputSchema: t.inputSchema ?? { type: 'object' },
        })),
      };
    }
    case 'tools/call': {
      const tools: any[] = await engineRpc('tools.list');
      const t = tools.find(x => toMcpName(x.id) === msg.params?.name);
      if (!t) return { isError: true, content: [{ type: 'text', text: `Unknown tool ${msg.params?.name}` }] };
      try {
        const result = await engineRpc(t.id, msg.params?.arguments ?? {});
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: (e as Error).message }] };
      }
    }
    default:
      throw Object.assign(new Error(`Method not found: ${msg.method}`), { code: -32601 });
  }
}

const rl = createInterface({ input: process.stdin });
rl.on('line', async line => {
  if (!line.trim()) return;
  let msg: any;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.id === undefined) return; // notification (e.g. notifications/initialized)
  try {
    const result = await handle(msg);
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }) + '\n');
  } catch (e: any) {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: e.code ?? -32603, message: e.message } }) + '\n');
  }
});
