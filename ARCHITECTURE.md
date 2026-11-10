# ARCHITECTURE.md — Ultimate Editor Toolkit (UET)

Status: **Phase 1 proposal, awaiting İso's approval.** Nothing below is implemented yet.
Research date for all Adobe facts: 2026-11-10 (sources in TECHNICAL_DECISIONS.md).

## 1. Constraints that shape everything

1. **Premiere Pro and After Effects do not share an integration method** (verified):
   - Premiere: UXP plugins are GA (since 25.6, Dec 2025) with Hybrid (C++) plugins; CEP + ExtendScript still work.
     Adobe plans CEP "disabled by default" in Dec 2028 and removed from Dec 2029. ExtendScript has no removal date.
     Known UXP gaps today: no razor/split API, Time Remapping not scriptable (ES or UXP, Premiere 26.3),
     MOGRT parameter enumeration "coming", QE DOM not in UXP.
   - After Effects: UXP plugins in **public beta "by November 2026"** (Adobe blog 2026-09-24) — immature.
     CEP + ExtendScript is the production path for AE panels today; ExtendScript covers comps, layers,
     shape/text layers, text animators, keyframes with temporal ease, expressions, cameras, 3D, masks, effects,
     render queue. C++ AEGP/effect SDK for native effects.
2. İso's machine: MacBook Air (Apple Silicon), Premiere Pro 2026 (26.5.2 used on 2026-10-29). AE version unknown.
3. Cloud agents cannot run Adobe apps. Real-app tests run on İso's Mac (manual checklist, or driven through the
   existing local Premiere MCP bridge when Premiere is open).
4. Cost: AI only where deterministic code can't do the job (COST_OPTIMIZATION.md).

## 2. System overview

```
┌──────────────── Premiere Pro ────────────────┐   ┌──────────────── After Effects ───────────────┐
│ UET Panel (CEP v1 → UXP later)               │   │ UET Panel (CEP v1 → AE UXP when GA)          │
│  React UI (shared @uet/ui)                    │   │  React UI (shared @uet/ui)                    │
│  Host adapter: @uet/host-ppro                │   │  Host adapter: @uet/host-ae                  │
│   ├─ ExtendScript lib (incl. QE DOM)         │   │   └─ ExtendScript lib (ES3, transpiled TS)   │
│   └─ UXP premierepro impl (feature-flagged)  │   │                                              │
└──────────────┬───────────────────────────────┘   └──────────────┬───────────────────────────────┘
               │ localhost WebSocket (token auth, JSON-RPC)       │
               └─────────────────────┬─────────────────────────────┘
                     ┌───────────────▼────────────────┐
                     │ UET Engine (local process)      │  Node 22 + native binaries, per-OS builds
                     │  • Tool registry + job queue    │
                     │  • Media analysis: ffmpeg,      │
                     │    whisper.cpp, VAD, beats,     │
                     │    scene detect, loudness,      │
                     │    tracking (ONNX/OpenCV)       │
                     │  • Library: presets, styles,    │
                     │    SFX, LUTs, user assets (DB)  │
                     │  • Motion compiler (MotionSpec  │
                     │    → AE ops / MOGRT params)     │
                     │  • AI gateway (optional, BYO    │
                     │    key) + response cache        │
                     │  • MCP server (for Claude       │
                     │    Desktop & other MCP clients) │
                     │  • Journal / backups / updater  │
                     └─────────────────────────────────┘
```

Why a separate Engine process instead of doing everything in the panel:
- CEP has Node, UXP Premiere does not run arbitrary binaries without a Hybrid C++ plugin. Putting ffmpeg/whisper/ML
  in one Engine means the same code serves CEP, UXP, both apps and the MCP server.
- Long jobs (transcription, separation) don't freeze the host UI; crash isolation.
- Cross-app sharing (one Style Card library for Premiere and AE) for free.
- Windows port = rebuild Engine binaries + test host scripts; panels are cross-platform.

## 3. Repository layout (monorepo, pnpm workspaces, TypeScript)

```
/                      13 project docs (PROJECT_MASTER.md … CHANGELOG.md) + EXISTING_PROJECT_AUDIT.md
/packages/core         Pure TS: data models (Preset, StyleCard, MotionSpec, Recipe), timing/tick math, easing,
                       layout engine, validation (zod). No host or Node APIs. 100% unit-testable.
/packages/ui           React components + design tokens (themes, TR/EN i18n)
/packages/host-ae      AE adapter: ExtendScript library written in TS, transpiled to ES3 (.jsx), + typed RPC
/packages/host-ppro    Premiere adapter: ExtendScript lib (+QE) and UXP implementation behind one interface
/packages/engine       Engine service: RPC server, jobs, analyzers, library DB (SQLite), updater
/packages/motion       MotionSpec compiler + generators (titles, callouts, maps, charts, transitions)
/packages/ai           Prompt templates, schema-constrained calls, model router, cache, cost meter
/packages/mcp          MCP server exposing the tool registry
/apps/panel-ae         CEP extension (manifest, build) for AE
/apps/panel-ppro       CEP extension for Premiere (+ /apps/panel-ppro-uxp later)
/assets                Our own presets, LUT sources, SFX manifests (binaries via Git LFS or release artifacts)
/tests                 unit/, golden/ (generated ExtendScript snapshots), host/ (manual + bridge-driven checklists),
                       fixtures/ (short media with ground truth)
/tools                 build, package (ZXP sign, .pkg/.exe installers, notarize), asset render scripts
```

Starter template candidate: Bolt CEP / Bolt UXP (hyperbrew, Vite + TS + React) — to be validated in the Phase 2
spike, not assumed.

## 4. Core data model (in @uet/core)

- **Tool** — `{id, app: 'ae'|'ppro'|'both', params: zod schema, run(ctx, params) → Result, dryRun?, inverse?}`.
  Every UI button, voice command, MCP tool and AI action calls a Tool. No hidden code paths.
- **Recipe** — reusable animation/effect: list of `{target selector, property path, keyframes[{t, value, ease}],
  effects[{matchName, params}]}`. Used by layer animations, text presets, transitions, shakes, ramps.
- **Preset** — user-facing wrapper: Recipe(s) + metadata (name, tags, preview, version, author, licence).
  File: `.uetpreset` (JSON, zip if it carries assets). Import/export, versioned schema with migrations.
- **StyleCard** — brand/style bundle shared by both apps (fonts, palette, subtitle look, title family, transition
  family, SFX set, LUT, safe-zone profile).
- **MotionSpec** — declarative scene description produced by AI or by generators: comps, layers (text, shape, solid,
  null, camera, light, footage, map, chart), properties, keyframes, easing, expressions, parenting, markers.
  The Motion compiler turns MotionSpec into an ordered list of host ops, executed in one undo group.
- **Journal entry** — `{opId, tool, params, before-snapshot ref, created items, timestamp}` for revert and replay.

## 5. Host adapters

Common interface (`HostAdapter`): `getContext()`, `getSelection()`, `addMarkers()`, `insertClip()`,
`buildSequenceFromRanges()`, `applyEffect()`, `setKeyframes()`, `importFile()`, `exportFrame()`, `beginOp/endOp`, …
Each method declares which apps/versions support it; the UI hides tools whose capabilities are missing
(no decorative buttons — brief §13).

- **AE (ExtendScript):** single `app.beginUndoGroup` per Tool → one Cmd+Z undoes a whole generation. Batching:
  ops are compiled into one script string per Tool to minimise CEP↔host round trips (each `evalScript` is slow).
- **Premiere:** v1 uses CEP + ExtendScript because it covers the needed gaps today (QE razor, QE setSpeed,
  MOGRT params). UXP implementation is developed in parallel behind the same interface for operations where UXP is
  equal or better (transactions with compound undo, modern async API), with a per-op switch. Full UXP migration
  before Dec 2028 (CEP default-off) as Adobe closes gaps. See TD-002.
- **Destructive operations** (silence cut, rough cut, auto edit, podcast): default to *building a new sequence from
  kept ranges* (non-destructive, avoids missing razor API), plus backup clone (F-AI-03).

## 6. Engine

- Transport: WebSocket JSON-RPC on 127.0.0.1, random port written to a per-user file, bearer token; panels discover
  it. MCP: stdio entry point for Claude Desktop + streamable HTTP on localhost.
- Jobs: queue with progress events, cancellation, results cached by `hash(file mtime+size+params)`.
- Analyzers (all local, zero API cost): ffmpeg (decode, `ebur128`, `scdet`, `lut3d` previews), whisper.cpp
  (Metal), Silero/WebRTC VAD, onset/tempo detection, waveform cross-correlation sync, ONNX face/object detection,
  optional source separation model (downloaded on demand).
- Library: SQLite index of user presets, styles, SFX, LUTs, folders; files stay in user folders.
- Packaging: macOS universal/arm64 binary signed + notarized; Windows x64 later. Engine starts on demand from
  the panel (CEP: Node `child_process`; UXP: launcher/Hybrid plugin or login item — decided in Phase 2 spike).

## 7. AI Motion Generator (Phase 5, designed now)

Pipeline (each stage replaceable; LLM used only at stage 2 and optionally 4):

1. **Intent & template retrieval (local):** classify request against our generator catalogue (map, title, chart,
   callout, explainer…) with keyword/embedding search over local catalogue → pick generator(s).
2. **Plan (LLM, structured output):** model returns a compact **ScenePlan** JSON (schema-constrained): beats with
   times, which generators with which parameters, assets needed, camera moves. It does not write ExtendScript.
3. **Resolve assets (local):** geodata (Natural Earth vectors, public domain; city coordinates from GeoNames,
   CC-BY — attribution recorded), icons from our own SVG set, fonts installed on system.
4. **Compile (deterministic):** generators → MotionSpec → host ops → native, editable AE layers with named,
   organised layers, colour labels, controller null with sliders ("Rig" pattern) so users tweak timing/colours
   without touching keyframes. Optional LLM self-check of the plan against the request (cheap model).
5. **Preview:** AE RAM preview by the user; panel shows a low-res frame strip rendered via aerender/queue (optional).
6. **Save:** the ScenePlan + parameters become a reusable Preset ("Motion Recipe"), re-runnable without any LLM.

Example (İso's brief): "world map → zoom to Turkey → highlight Istanbul → flight route to Berlin with plane icon,
labels, subtle camera move" compiles to: precomp `Map` (country shape layers from projected geodata), camera or
scale/position zoom keyframes with ease, Istanbul highlight (ellipse + pulse recipe), route = shape path with
Trim Paths end keyframes, plane icon with auto-orient along path expression, labels (text + leader line callout),
camera wiggle at low amplitude via controller slider. All editable.

Limitations to state to users: photoreal 3D, particle sims and footage generation are not native → offer alternatives
(Cinema 4D Lite/Advanced 3D renderer hints, user footage, stock).

## 8. UI structure (both panels share components)

- Top: ⌘K command palette + search; Style Card switcher.
- Tabs (Premiere): **Edit** (silence, rough cut, scene detect, auto edit, podcast, reframe), **Text** (subtitles,
  titles), **Motion** (graphics, transitions), **Audio** (Sound Lab, SFX), **Look** (LUTs, glow, shakes),
  **Library**, **Assistant**.
- Tabs (AE): **Animate** (layer/text recipes, ramps, shakes), **Build** (titles, callouts, carousel, backgrounds,
  generators), **Transitions**, **Utilities** (anchor, align, tidy, guides), **Library**, **Assistant/Motion AI**.
- Every destructive tool shows a preview/review step and an undo/revert affordance. Live previews are
  pre-rendered thumbnails/loops, never live AE renders in the panel.

## 9. Testing architecture

- **U** unit (Vitest) on core/engine/motion: math, schema, analyzers on fixtures with ground truth.
- **G** golden: compiled host scripts snapshot-tested; ES3 syntax check of every generated `.jsx`.
- **H** host: checklist per feature run on İso's Mac; Premiere steps can be automated through the local
  Premiere MCP bridge (`execute_extendscript`, `list_sequences`, …) when Premiere is open; AE steps via a
  `tests/host/ae-runner.jsx` script that executes test cases and writes JSON results. Results → TEST_REPORT.md.
- Performance budgets: panel open < 1 s; tool feedback < 200 ms; Engine idle RAM < 150 MB; transcription of
  10 min audio on MacBook Air < 2 min with small/turbo model (to be measured).

## 10. Cross-platform

Panels are HTML/JS (platform-neutral). Host scripts avoid OS-specific paths (`Folder.fsName` handling). Engine
binaries per platform; CI builds macOS arm64 first, Windows x64 from Phase 6. Fonts and paths tested on both before
Phase 7.
