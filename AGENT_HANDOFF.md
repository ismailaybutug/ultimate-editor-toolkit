# AGENT_HANDOFF.md

## How work is run
- One orchestrator session (lead model) plans, reviews and integrates. Specialised roles below are *roles*, run
  sequentially by the orchestrator unless İso approves sub-agents (they cost extra tokens; see COST_OPTIMIZATION.md).
- Phase 0–1 (2026-11-10): done by a single orchestrator session; **no sub-agents were used**.
- From 2026-11-10 (İso's request) work runs in parallel threads; see "Module ownership".
- Shared-file rule: only the orchestrator edits the 13 root docs; role tasks write to their package folders and
  report results to the orchestrator, who updates docs. One task = one branch = one PR.

## Module ownership (parallel threads, İso asked 2026-11-10: "farklı farklı ajanlara işleri bölüştür")
Four threads work in parallel. Each sibling works on its own branch off `phase-2-foundation`, opens its own PR into
`phase-2-foundation`, and messages the integrator for any change to a shared file and when its PR is ready.

| Thread | Owns (may edit freely) | Branch |
|---|---|---|
| **Integrator** ("Build Adobe editor toolkit") | Panel shell (`apps/panel/index.html`, `src/main.ts`, `src/catalog.ts`), `packages/core` shared models, `packages/engine` server/registry/ffmpeg, `packages/mcp`, `tools/`, root docs, Premiere tools Silence Cutter / Scene Detect / Beat Markers / Loudness, builds + installs on İso's Mac, asking İso to test | `phase-2-foundation` |
| "Build After Effects animation tools" | AE animation + typography: `packages/host-ae/jsx/uet-ae-*.jsx` (new files), `packages/core/src/motion/**`, `apps/panel/src/modules/ae-*.ts`, `tests/ae-*.test.ts` | own branch |
| "Build local subtitle engine" | Transcription/subtitles: `packages/engine/src/whisper.ts`, `packages/core/src/transcript.ts`, subtitle styling, filler words, whisper setup without Homebrew, `apps/panel/src/modules/subtitles*.ts`, `tests/transcript*.test.ts`. Tells the integrator what to install on İso's Mac. | own branch |
| "Build transition engine" | Transitions (F-TR-*): `packages/core/src/transitions/**`, `packages/host-*/jsx/uet-transitions*.jsx`, `apps/panel/src/modules/transitions*.ts`, `tests/transitions*.test.ts` | own branch |

How a module plugs into the panel without touching shared files (since 0.1.5):
- Create `apps/panel/src/modules/<name>.ts` exporting a `PanelModule` (`modules/types.ts`): `catalog` cards,
  `viewsHtml` (its `<section class="view" id="v-...">`), optional `jsx` files to load, `setup(ctx)` to wire buttons,
  `registerTools(reg, ctx)` for MCP tools. A module card with the same `app`+`id` as a "Yakında" card in
  `catalog.ts` replaces it.
- Add ONE import + ONE entry in `apps/panel/src/modules/index.ts` (the only shared line; trivial merges).
- Host code: new `.jsx` files in `packages/host-ae/jsx/` or `packages/host-ppro/jsx/` ship automatically
  (`tools/build.mjs` copies all) and are ES3-checked (`pnpm lint:jsx`). Use a namespace like `UET.transitions`.
- Engine tools: add a file in `packages/engine/src/` exporting `registerXTools(reg)`; ask the integrator to call
  it from `createRegistry()` (shared file).
- Shared files (`main.ts`, `index.html`, `catalog.ts`, `core/src/index.ts`, `engine/src/tools.ts`, root docs,
  `package.json`): message the integrator with the exact change. Root docs: send a short summary; the integrator
  writes TEST_REPORT / PROJECT_STATUS / CHANGELOG entries.
- Never install anything on İso's Mac or ask İso to test directly; the integrator batches installs and test asks.
- İso (2026-11-11): ask him to install/test only at bigger milestones, not per build. Keep building; test on a throwaway project, never on his open client project.
- Rules from CLAUDE.md apply: Turkish to İso, no fake functionality, nothing "done" without an H test.

## Roles
| Role | Owns | Typical model tier |
|---|---|---|
| Software Architect | ARCHITECTURE, TECHNICAL_DECISIONS, core, repo/CI | Fable/Opus |
| Premiere Pro Developer | host-ppro, panel-ppro, Edit/Audio tools | Opus/Sonnet |
| After Effects Developer | host-ae, panel-ae, compiler targets | Opus/Sonnet |
| Motion Graphics Engineer | motion package, recipes, generators, presets quality | Opus/Sonnet |
| AI Systems Engineer | ai, mcp, ScenePlan, routing, cost meter | Opus |
| UI/UX Developer | ui package, panel UX, i18n | Sonnet |
| QA Engineer | tests/, TEST_REPORT, H-test checklists | Sonnet |
| Performance Engineer | engine analyzers, budgets, packaging | Opus/Sonnet |

## Task brief template (use for every assignment)
```
Task ID / role:
Goal (one sentence):
Context files to read (max 5):
Deliverables (files/paths):
Acceptance criteria (testable):
Required tests (U/G/H):
Out of scope:
```

## Assignment log
| Date | Task | Role | Status | Result |
|---|---|---|---|---|
| 2026-11-10 | Phase 0–1 research + docs | orchestrator | done, approved | 14 docs |
| 2026-11-10 | Split into 4 parallel threads (integrator, AE animation, subtitles, transitions) | coordinator | active | see Module ownership |
| 2026-11-10 | Phase 2 first build (core, engine, AE/PPRO libs, panel) | orchestrator (sequential, no sub-agents) | code done, H tests pending | branch phase-2-foundation |

## Outstanding
See TODO.md (Phase 2 spikes S1–S5 are the next assignments).
