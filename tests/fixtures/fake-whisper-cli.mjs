#!/usr/bin/env node
// Test double for whisper-cli: checks the arguments the Engine passes and writes the fixture JSON to <-of>.json.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const a = process.argv.slice(2);
const get = f => a[a.indexOf(f) + 1];
for (const f of ['-m', '-f', '-l', '-of']) if (!a.includes(f)) { console.error('missing ' + f); process.exit(2); }
if (!a.includes('-ojf')) { console.error('missing -ojf'); process.exit(2); }
if (!existsSync(get('-f')) || !existsSync(get('-m'))) { console.error('input not found'); process.exit(3); }
const fx = new URL('./whisper-ojf-sample.json', import.meta.url);
writeFileSync(get('-of') + '.json', readFileSync(fx));
