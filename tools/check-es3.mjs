// Fail if any host .jsx file uses syntax newer than ES3 (ExtendScript limitation).
import { parse } from 'acorn';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const files = ['packages/host-ae/jsx', 'packages/host-ppro/jsx']
  .flatMap(d => readdirSync(d).filter(f => f.endsWith('.jsx')).map(f => join(d, f)));
let bad = 0;
for (const f of files) {
  try { parse(readFileSync(f, 'utf8'), { ecmaVersion: 3, allowReserved: true }); console.log(`ES3 ok  ${f}`); }
  catch (e) { bad++; console.error(`ES3 FAIL ${f}: ${e.message}`); }
}
process.exit(bad ? 1 : 0);
