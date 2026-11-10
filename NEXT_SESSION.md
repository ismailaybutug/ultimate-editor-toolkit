# NEXT_SESSION.md — read this first

You are continuing the Ultimate Editor Toolkit (Adobe Premiere Pro + After Effects plugin ecosystem).
Talk to İso in **Turkish**, briefly. Write repo docs in English.

1. Read: PROJECT_MASTER.md → PROJECT_STATUS.md → this file → ARCHITECTURE.md → TODO.md.
2. Phase 0–1 are approved. Phase 2 is in progress on branch `phase-2-foundation` (PR to main).
3. Run `pnpm install && pnpm check` first. It must pass (typecheck, ES3 check, 28 tests, build).
4. If İso has sent results of `tests/host/PHASE2_MAC_TEST_TR.md`: record them in TEST_REPORT.md (with app
   versions), fix failures, rebuild the zip (`pnpm build`, then package `dist/com.uet.toolkit` + `tools/install-mac.sh`
   + the test guide as `uet-panel-dev-<version>.zip`), and ask İso to re-test only what changed.
5. Otherwise continue Phase 2 in this order: S5 MCP spike (stand-alone `dist/engine.mjs` + MCP stdio server) →
   whisper.cpp in Engine + benchmark on Apple Silicon → S3 Premiere UXP spike → Preset/StyleCard/Journal models →
   UI shell (command palette, review dialog) → GitHub Actions CI.
6. Never mark a host feature done without an H result in TEST_REPORT.md.

Code map: `packages/core/src` (pure logic), `packages/engine/src` (Node: ffmpeg, analysis, RPC server),
`packages/host-ae/jsx/uet-ae.jsx`, `packages/host-ppro/jsx/uet-ppro.jsx` (ES3), `apps/panel` (CEP manifest,
HTML, `src/main.ts`), `tools/` (build, ES3 check, Mac installer), `tests/` (Vitest + `host/` manual guides).
