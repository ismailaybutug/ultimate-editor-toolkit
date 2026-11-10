import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: { alias: { '@uet/core': new URL('./packages/core/src/index.ts', import.meta.url).pathname, '@uet/engine': new URL('./packages/engine/src/index.ts', import.meta.url).pathname } },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 30000 },
});
