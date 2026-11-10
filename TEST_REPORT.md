# TEST_REPORT.md

## Test levels
U = unit (no Adobe) · G = golden script snapshots · H = real app (Premiere/AE on İso's Mac).
A feature is "verified" only with H results recorded here, including app versions and OS.

## Environments
| Machine | OS | Premiere | After Effects | Notes |
|---|---|---|---|---|
| İso's MacBook Air (Apple Silicon) | macOS (version TBD) | 2026 (26.5.2 seen 2026-10-29) | 2026 | Local Premiere MCP bridge present; Node v24; ffmpeg 6.0 in ~/.local/bin; no Homebrew |

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
| ES3 syntax check of both `.jsx` files | G | pass |
| Panel loads in headless Chromium, no JS errors | G | pass |
| H-B1 Premiere 2026: panel 0.1.2 installs (Remote Control ran install-mac.sh with İso's approval), opens via Window > Extensions, and works (İso, 2026-11-10 11:45 UTC: "çalışıyor"; exact button tested not reported, assumed ping) | H | **pass (partial, İso's word only)** |
| All other Premiere / After Effects tests (silence, markers, rebuild, loudness, AE recipes, speed ramp, MCP, subtitles) | H | not run yet: unverified |

## Known bugs
None (no code).

## Inherited facts from the prototype (Creative Universe, 2026-10-29, not our code)
- Premiere 26.5.2 interprets imported PNG sequences at 25 fps by default → our importers must set frame rate explicitly.
- Full-range MP4 (yuvj420p) shows crushed blacks in editors → use BT.709 limited range.
