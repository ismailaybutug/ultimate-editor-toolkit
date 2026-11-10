// Build the CEP extension folder: dist/com.uet.toolkit/
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, readdirSync } from 'node:fs';

const out = 'dist/com.uet.toolkit';
rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/jsx`, { recursive: true });
const alias = { '@uet/core': './packages/core/src/index.ts', '@uet/engine': './packages/engine/src/index.ts' };

// Panel UI (browser context)
await build({ entryPoints: ['apps/panel/src/main.ts'], bundle: true, format: 'iife', target: 'chrome88', outfile: `${out}/panel.js`, alias, logLevel: 'warning' });
// Engine as a CommonJS module loaded by the panel's Node context (CEP Node may be older: target node16)
await build({ entryPoints: ['packages/engine/src/index.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node16', outfile: `${out}/engine.cjs`, alias, logLevel: 'warning' });
// Stand-alone engine for running outside Adobe apps: node dist/engine.mjs
await build({ entryPoints: ['packages/engine/src/main.ts'], bundle: true, platform: 'node', format: 'esm', target: 'node20', outfile: 'dist/engine.mjs', alias, logLevel: 'warning',
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" } });

await build({ entryPoints: ['packages/mcp/src/main.ts'], bundle: true, platform: 'node', format: 'esm', target: 'node20', outfile: `${out}/mcp.mjs`, alias, logLevel: 'warning',
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" } });
cpSync('apps/panel/index.html', `${out}/index.html`);
cpSync('apps/panel/CSXS', `${out}/CSXS`, { recursive: true });
// Every .jsx in the host packages ships (module workers add their own uet-<module>.jsx files there).
for (const d of ['packages/host-ae/jsx', 'packages/host-ppro/jsx']) {
  for (const f of readdirSync(d).filter(f => f.endsWith('.jsx'))) cpSync(`${d}/${f}`, `${out}/jsx/${f}`);
}
console.log(`built ${out}`);
