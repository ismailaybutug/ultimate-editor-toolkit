# PROJECT_STATUS.md

Last updated: 2026-11-10.

## Current stage
**Phase 2 (Core foundation) in progress.** Phase 0–1 approved by İso on 2026-11-10 ("planı onaylıyorum").
First working code is on branch `phase-2-foundation`. **Nothing has been tested in Premiere Pro or After Effects
yet → every host feature below is UNVERIFIED.**

## Built in Phase 2 so far (U/G-tested only, see TEST_REPORT.md)
| Area | What exists | Status |
|---|---|---|
| Monorepo | pnpm + TypeScript, `pnpm check` (typecheck, ES3 check, tests, build) | Done |
| `@uet/core` | time/ranges, silence cut planning (padding, min keep, protected words, frame snap), bezier easing + AE ease conversion, Recipe schema + 5 built-in recipes, speed-ramp curve → Time Remap keys, Tool registry | Unit-tested |
| `@uet/engine` | ffmpeg wrapper with Mac path discovery, RMS silence detection with automatic noise floor, EBU R128 loudness + gain, JSON-RPC WebSocket server (token, discovery file `~/.uet/engine.json`) | Tested with real ffmpeg on Linux |
| AE host lib `uet-ae.jsx` | applyRecipe (stagger, one undo group), speedRamp (Time Remap), createTestTitle, ping | Mock-DOM tested; **unverified in AE** |
| Premiere host lib `uet-ppro.jsx` | getSelectedClipInfo, addMarkers, buildFromRanges (non-destructive new sequence), qeProbe, ping | Mock-DOM tested; **unverified in Premiere** |
| CEP panel | One panel for both apps, Turkish UI, engine runs inside the panel's Node | Loads in Chromium; **unverified in Adobe apps** |
| MCP server `packages/mcp` | stdio MCP server forwarding to the Engine; Claude Desktop can call `ppro_cutSilences`, `ae_applyRecipe`, analysis tools | End-to-end tested with a scripted MCP client; **unverified with Claude Desktop + Adobe** |
| Local subtitles (`audio.transcribe`, `ppro.makeSubtitles`) | whisper.cpp CLI → words → captions → SRT → Premiere caption track | Parser/captions/SRT unit-tested; Engine pipeline tested with a fake `whisper-cli`; **real whisper.cpp + Premiere caption import unverified** (whisper binary could not be built in the cloud sandbox, HF model downloads blocked) |
| Dev build | `uet-panel-dev-0.1.3.zip` + `install-mac.sh` + Turkish test guide | Waiting for İso's Mac test |

## Blockers / waiting on İso
1. Run the Mac test (`tests/host/PHASE2_MAC_TEST_TR.md`) and send results + Premiere/AE versions.
2. ffmpeg must be installed on the Mac (`brew install ffmpeg`) for audio analysis.

## Next actions
1. Record İso's H-test results; fix what fails.
2. Apple Silicon whisper benchmark (from İso's D1 result), S3 Premiere UXP spike.
3. Then the Phase 2 checkpoint (MASTER_ROADMAP.md).

## Environment facts
- İso's Mac: Apple Silicon MacBook Air; `/Applications/Adobe Premiere Pro 2026` (26.5.2 seen 2026-10-29); AE version unknown.
- A local Premiere MCP bridge (`~/.premiere-mcp-bridge`, ~283 tools incl. `execute_extendscript`) is installed and
  could automate Premiere checks when Premiere is open. Origin: not ours.
- Repo: `ismailaybutug/ultimate-editor-toolkit` (push works since 2026-11-10).
