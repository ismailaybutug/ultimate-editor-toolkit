# TEST_REPORT.md

## Test levels
U = unit (no Adobe) · G = golden script snapshots · H = real app (Premiere/AE on İso's Mac).
A feature is "verified" only with H results recorded here, including app versions and OS.

## Environments
| Machine | OS | Premiere | After Effects | Notes |
|---|---|---|---|---|
| İso's MacBook Air (Apple Silicon) | macOS (UI language tr-TR) | 2026 (26.5.2 seen 2026-10-29) | 2026 | Local Premiere MCP bridge present; Node v24; ffmpeg 6.0 in ~/.local/bin; no Homebrew |

## Results

### 2026-11-10 — Phase 2 first build (branch phase-2-foundation), Linux container
| Suite | Level | Result |
|---|---|---|
| `tests/core.test.ts` (ranges, silence planning, easing, recipes, ramps, registry) | U | 15/15 pass |
| `tests/engine.test.ts` (silence detection + loudness with real ffmpeg 7 on a synthetic 5.7 s file, JSON-RPC server, token rejection) | U | 4/4 pass |
| `tests/host-ae-mock.test.ts` (real `uet-ae.jsx` on a mock AE DOM: all 5 recipes, values, undo grouping, errors, speed ramp) | G | 5/5 pass — found and fixed a real bug (array check that fails across script contexts) |
| `tests/host-ppro-mock.test.ts` (real `uet-ppro.jsx` on a mock Premiere DOM: clip info, markers, rebuild from ranges) | G | 4/4 pass |
| `tests/mcp.test.ts` (scripted MCP client → `mcp.mjs` → Engine: initialize, tools/list with JSON schemas, tools/call, validation error) | U | 1/1 pass |
| `tests/transcript.test.ts` (whisper `-ojf` JSON → words, captions, SRT, timeline mapping; Engine `audio.transcribe` with a fake `whisper-cli` test double; missing-model error) | U/G | 6/6 pass |
| `tests/rhythm.test.ts` (showinfo parsing, segments, every-Nth; real ffmpeg: 120 BPM click track → BPM + beat accuracy; 3-shot synthetic video → 2 cuts) | U | 4/4 pass — first run found a 56 ms beat offset (analysis window latency), fixed |
| `tests/host-ppro-tools.test.ts` (Project Tidy preview/move/undo, Frame Export naming on a mock DOM) | G | 3/3 pass |
| `tests/ae-motion.test.ts` (AE motion module on a mock AE DOM; from PR #2) | U/G | 26/26 pass (suite total 65) |
| `tests/transitions*.test.ts` (transition engine core + both host libs on mock DOMs; from PR #3) | U/G | pass (suite total 99) |
| `tests/ducking.test.ts` (planDucking merge/ramps/monotonic keys, Premiere level units, duckTrack/unduckTrack on mock DOM) | U/G | 5/5 pass (suite total 104) |
| AE titles/callouts tests (PR #5) | U/G | pass (suite total 117) |
| Subtitle engine tests (PR #4: fillers, styles/exporters, installer vs local HTTP server, ffmpeg+libass overlay alpha) + macOS CI `e2e` (clean runner installs whisper via the Engine and transcribes Turkish `say` speech) | U/G + CI | pass (suite total 132) |
| `tests/library.test.ts` (preset slug/migration/folder safety; save/list/update/unique ids/trash/export/import/broken files) | U | 5/5 pass (suite total 137) |
| ES3 syntax check of both `.jsx` files | G | pass |
| Panel loads in headless Chromium, no JS errors | G | pass |
| H-B1 Premiere 2026: panel 0.1.2 installs (Remote Control ran install-mac.sh with İso's approval), opens via Window > Extensions, and works (İso, 2026-11-10 11:45 UTC: "çalışıyor"; exact button tested not reported, assumed ping) | H | **pass (partial, İso's word only)** |
| H-UI Premiere 2026: panel 0.1.4 (card UI v2) installed by İso via install-mac.sh, opens and renders (İso 2026-11-10 11:53 UTC: "çalışıyor") | H | **pass (İso's word)** |
| H-PPRO-API 2026-11-11, Premiere 26.5.2 build 5 on İso's Mac, via the local Premiere MCP bridge (`execute_extendscript`), read-only, real client project open (nothing changed): installed `uet-ppro.jsx` (0.1.6) loads; `UET.ppro.ping()` → ok (version 26.5.2, build 5); `qeProbe()` → `{qe:true, activeSequence:true, razor:true, setSpeed:true}`; `getSelectedClipInfo()` → ok (media path, sourceIn/Out, timelineStart, fps 29.97) | H | **pass** (S2 partial: QE razor/setSpeed exist; not invoked) |
| H-PPRO-VOL same session: first A1 clip has component `Volume` (matchName `Internal Volume Mono`), properties `[0]` (Bypass, empty name), `[1]` `Level`; Level value at 0 dB = `0.17782793939114` | H | **confirms** ducking assumptions (`premiereLevelFromDb(0)=0.1778`, Level = properties[1], English param names on this install). Keyframe time base still unverified |
| All other Premiere / After Effects tests (silence, markers, rebuild, loudness, AE recipes, speed ramp, MCP, subtitles) | H | not run yet: unverified |

## Known bugs
None (no code).

## Inherited facts from the prototype (Creative Universe, 2026-10-29, not our code)
- Premiere 26.5.2 interprets imported PNG sequences at 25 fps by default → our importers must set frame rate explicitly.
- Full-range MP4 (yuvj420p) shows crushed blacks in editors → use BT.709 limited range.
