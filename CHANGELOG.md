# CHANGELOG.md

## 2026-11-10 (Phase 2 start, branch phase-2-foundation)
- İso approved Phase 0–1. Docs pushed to `main`.
- Added monorepo (pnpm, TypeScript, Vitest, esbuild), `@uet/core`, `@uet/engine`, AE and Premiere ExtendScript
  libraries, one CEP panel for both apps (Turkish UI), Mac installer and Turkish H-test guide.
- Added MCP stdio server (`mcp.mjs`) so Claude Desktop can drive the panel tools (silence cut, AE recipes).
- Added preset library v1: save/apply/delete settings on every tool, folders, trash, .uetpack import/export (also as MCP tools).
- Added GitHub Actions CI.
- Real Premiere 26.5.2 read-only API test passed via the MCP bridge (ping, QE razor/setSpeed present, clip info, Volume Level units).
- Merged subtitle engine v2 (PR #4): one-click whisper install without Homebrew, caption styles, overlay video, filler word cleaner. Old built-in subtitle view removed (module replaces it).
- Merged AE Titles and Callouts/Arrows (PR #5).
- Added Music Ducking for Premiere (volume keyframes under speech, with undo).
- Merged transition engine v1 (PR #3): 9 transitions for AE, 6 for Premiere.
- Merged AE motion tools (PR #2): 12 text animations, shake, counter, 3D carousel, layout utilities.
- Added Frame Export (PNG at playhead) and Project Tidy (bins by type, with undo) for Premiere.
- Added Scene Detect (markers or split sequence) and Beat Markers (BPM + markers) for Premiere.
- New panel shell: dark theme, tool cards with live CSS previews, category chips, search (⌘K), favourites, status bar + toast; planned tools shown as "Yakında".
- Engine also looks for ffmpeg/whisper in ~/.local/bin (found on İso's Mac).
- Added local transcription (whisper.cpp) with caption grouping, SRT export and a Premiere "Altyazı" tab that adds a caption track (unverified in Premiere).
- 35 automated tests pass; nothing tested in Adobe apps yet.

## 2026-11-10
- Created the project documentation set (Phase 0–1): PROJECT_MASTER, PROJECT_STATUS, MASTER_ROADMAP,
  FEATURE_INVENTORY, ARCHITECTURE, TECHNICAL_DECISIONS, TODO, COMPLETED, TEST_REPORT, AGENT_HANDOFF, NEXT_SESSION,
  COST_OPTIMIZATION, CHANGELOG, plus EXISTING_PROJECT_AUDIT.
- Audited the Creative Universe / Motion Studio prototype from İso's Claude artifacts (source not available);
  İso directed: design the motion system ourselves.
- İso cancelled the video downloader feature (TD-012).
- No product code yet.
