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
| Panel UI shell v2 | Card catalog, categories, search, favourites (headless Chromium screenshots, no JS errors) | **unverified in Adobe (CEP Chromium 88 rendering)** |
| Scene Detect (`video.detectScenes`, `ppro.detectScenes`) | ffmpeg scene score → markers or new sequence split at cuts | Synthetic 3-shot video test passes; **unverified in Premiere** |
| Beat Markers (`audio.detectBeats`, `ppro.beatMarkers`) | Own onset/tempo tracker (no extra install) → BPM + markers every N beats | Synthetic 120 BPM click track: BPM ±3, beats within 40 ms; **not yet tested on real music or in Premiere** |
| Frame Export + Project Tidy (`ppro.exportFrame`, `ppro.tidyProject`/`untidyProject`) | QE exportFramePNG at playhead; root items → typed bins with undo | Mock-DOM tests pass; **unverified in Premiere** (QE exportFramePNG and moveBin behaviour) |
| AE motion module (PR #2, AE thread): text animator presets (F-MG-04), shake (F-MG-08), counter (part of F-MG-06), 3D carousel (F-MG-05), layout utilities | `apps/panel/src/modules/ae-motion.ts`, `uet-ae-motion.jsx`, `uet-ae-layout.jsx`, `core/src/motion` | U/G tests pass (26 in `tests/ae-motion.test.ts`); **unverified in After Effects** (guide: `tests/host/AE_MOTION_TEST_TR.md`) |
| Transition engine v1 (PR #3, transitions thread): 9 transitions (zoom in/out, whip ×4, spin, glitch, wave, light burst, flash, blur), F-TR-01 | AE: all 9 as tagged adjustment/solid layers, one undo group; Premiere: 6 of 9 as keyed effects on the two clips at the cut | U/G tests pass; **unverified in both apps** (guide `tests/host/TRANSITIONS_TEST_TR.md`; unknowns: AE effect match names, Premiere keyframe time base, non-English effect names) |
| Music Ducking (`ppro.duckMusic`/`unduckMusic`), F-AU-03 | Speech from the selected dialogue clip (silence map inverted) → `planDucking` → Volume Level keyframes on the music track; skips clips with existing keys; undo | U + mock-DOM tests pass; **unverified in Premiere** (keyframe time base, Level units 0 dB = 0.1778) |
| AE Titles (F-MG-01) + Callouts/Arrows (F-MG-06) (PR #5, AE thread) | `uet-ae-gfx.jsx` in the ae-motion module; MCP `ae.title`, `ae.callout` | U/G tests pass; **unverified in AE** (guide sections F–G); in dev build 0.1.8 |
| Subtitle engine v2 (PR #4, subtitle thread): in-panel whisper install (own Apple Silicon build from repo release, SHA-256 checked; model from Hugging Face), 6 caption styles, ASS/VTT/JSON export, styled overlay video, Filler Word Cleaner (F-SUB-01/02/03, F-AI-04 part) | `modules/subtitles.ts`, `engine/src/stt-*.ts`, `uet-ppro-subtitles.jsx` | U/G tests pass; macOS CI installed the engine on a clean Mac and transcribed Turkish speech; **unverified in Premiere** (caption import, overlay placement, filler markers/new sequence). Overlay needs ffmpeg with libass |
| Preset library v1 (T2-07/T2-09, F-PROD-05 base) | `core/src/preset.ts` (schema `uet.preset/1` + migration), `engine/src/library.ts` (~/.uet/library, folders, trash instead of delete, .uetpack import/export), MCP `library.*`; panel preset bar on every tool view (save/apply/delete current settings) | U tests pass; **unverified in Adobe** |
| Reframe / Dikey Format (`ppro.reframe`), F-FMT-03 v1 | Clone active sequence → setSettings frame size → rescale Motion Scale of unkeyed clips (fill/fit); original untouched | Mock-DOM tests pass; **unverified in Premiere** (`setSettings` on a clone, Scale units). Smart subject-following reframe = later |
| Transitions v2 (PR #6): 11 transitions in 7 families, all in both AE and Premiere (new: Circle, Film Burn; Premiere Zoom Out, Spin, Flash) | transitions module | U/G pass; **unverified in both apps**; Premiere keyframe time base open |
| CI | `.github/workflows/ci.yml`: typecheck, ES3 check, tests (real ffmpeg), build, uploads the extension folder as an artifact | first run on push |
| Dev build | `uet-panel-dev-0.1.9.zip` + `install-mac.sh` + Turkish test guide | Waiting for İso's Mac test |

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
