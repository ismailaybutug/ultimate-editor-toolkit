# AGENT_HANDOFF.md

## How work is run
- One orchestrator session (lead model) plans, reviews and integrates. Specialised roles below are *roles*, run
  sequentially by the orchestrator unless İso approves sub-agents (they cost extra tokens; see COST_OPTIMIZATION.md).
- Phase 0–1 (2026-11-10): done by a single orchestrator session; **no sub-agents were used**.
- Shared-file rule: only the orchestrator edits the 13 root docs; role tasks write to their package folders and
  report results to the orchestrator, who updates docs. One task = one branch = one PR.

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
| 2026-11-10 | Phase 2 first build (core, engine, AE/PPRO libs, panel) | orchestrator (sequential, no sub-agents) | code done, H tests pending | branch phase-2-foundation |

## Outstanding
See TODO.md (Phase 2 spikes S1–S5 are the next assignments).
