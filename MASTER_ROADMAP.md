# MASTER_ROADMAP.md

Durations are estimates for one AI developer working with İso testing on his Mac; they will be re-estimated at
each checkpoint. "H tests" = tests in the real Adobe app (see ARCHITECTURE.md §9).

## Phase 0 — Research & audit  ✅ (pending İso's approval)
- Deliverables: FEATURE_INVENTORY.md, EXISTING_PROJECT_AUDIT.md, Adobe research (TECHNICAL_DECISIONS.md sources).
- Acceptance: every baseline feature has evidence + plan; prototype audited; Adobe constraints verified from
  official/primary sources.
- Open follow-ups: T0-04 watch UmutcanFX demo videos/blog for missing features.

## Phase 1 — Architecture  ✅ (pending İso's approval)
- Deliverables: ARCHITECTURE.md, TECHNICAL_DECISIONS.md, COST_OPTIMIZATION.md, roadmap, handoff docs.
- Acceptance: İso approves TD-001…TD-013 (or changes them) and the Phase 2 scope below.

## Phase 2 — Core foundation (est. 3–4 weeks)
Objectives: prove every risky integration with real code before scaling features.
1. **Spikes (week 1)**, each a tiny working demo + H test on İso's Mac:
   - S1 CEP panel in AE: run a compiled TS→ES3 script, create comp + text layer + eased keyframes in one undo group.
   - S2 CEP panel in Premiere: read sequence, add markers, build new sequence from ranges, QE razor and QE setSpeed
     on Premiere 26.5.x (verify still working).
   - S3 UXP panel in Premiere: same ops via `premierepro`; compare.
   - S4 Engine: launched from panel, WebSocket handshake, ffmpeg + whisper.cpp on Apple Silicon, timing benchmark.
   - S5 MCP: Claude Desktop calls one Engine tool that changes the timeline.
2. Monorepo scaffold, CI (lint, typecheck, unit, golden), packaging to signed ZXP + mac installer (unsigned dev
   build first).
3. Core models (Tool, Recipe, Preset, StyleCard, MotionSpec, Journal) with schemas and migrations.
4. Shared UI shell: command palette, tabs, themes, TR/EN, job progress, review/approve dialog, revert.
5. Library/preset system v1: save/load/import/export, user folders.
- Exit criteria / checkpoint: S1–S5 pass H tests; one end-to-end tool in each app works in production shape:
  **Premiere: Silence Cutter (markers + rebuild)**; **AE: Layer Animation recipes (in/emphasis/out) + Speed Ramp**.
  TEST_REPORT.md lists results with app versions.

## Phase 3 — Complete baseline toolkit (est. 8–12 weeks, in priority waves)
- Wave A (high value, low risk): subtitles (local STT, styles, karaoke, SRT), loudness, ducking, beat markers,
  scene detect, frame export, safe zones, quick search, project tidy, LUTs, glow v1, shakes, audio FX, SFX library.
- Wave B: titles & graphics generators (+MOGRT export), text presets, callouts, 3D carousel, backgrounds,
  transitions (+builder), reframe, multiscreen, Style Cards + Style Studio, auto edit to beats, timestamps.
- Wave C (hard): rough cut (fillers/retakes), podcast auto-switch, tracking (blur/attach/stabilise), dialogue
  separation, voiceover/TTS, shorts extraction, cover + platform export, Premiere speed ramps (best available path),. (URL downloader cancelled, TD-012.)
- Acceptance: every FEATURE_INVENTORY baseline item is Done (H-tested) or explicitly "Limited" with reason + İso
  sign-off. Checkpoint per wave.

## Phase 4 — Advanced toolkit (est. 6–8 weeks)
Motion engine generators: maps (offline geodata), charts/data viz, diagrams, documentary kit, arrows/indicators,
camera rigs, text-on-path, animated masks; transition builder 2.0 (motion-matched); multicam assistant; audio sync;
AE utilities (anchor/align/layer management); punch-ins on emphasis words.

## Phase 5 — AI Motion Generator (est. 6–8 weeks)
ScenePlan schema, generator catalogue, LLM planner with structured output, compiler to native AE layers, rig
controllers, preview strip, save as Motion Recipe; MCP + in-panel entry points; cost meter and caching.
Acceptance: 20 reference prompts (incl. İso's Istanbul→Berlin map) produce editable comps that pass a rubric
(layer naming, editability, timing, look) in H tests; median cost per generation documented.

## Phase 6 — Optimisation & expansion
Performance budgets, UXP migration of Premiere ops where Adobe closed gaps, AE UXP evaluation, Windows build,
C++ GPU glow, licensing/updater, onboarding.

## Phase 7 — Final QA
Real-world projects on macOS + Windows, multiple Premiere/AE versions, regression suite, crash/undo safety audit,
documentation, release candidate.
