// Entry point: `node dist/engine.mjs` starts the Engine and prints its port.
import { createRegistry, startServer, VERSION } from './index.js';

const reg = createRegistry();
const handle = await startServer(reg, { port: process.env.UET_PORT ? Number(process.env.UET_PORT) : 0 });
console.log(`UET Engine ${VERSION} listening on 127.0.0.1:${handle.port} (discovery: ~/.uet/engine.json)`);
