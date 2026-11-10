# PROJECT_MASTER.md — Ultimate Editor Toolkit (UET)

Owner: İso (GitHub `ismailaybutug` / `iaybutug42-glitch`). Original brief: 2026-11-10, project "ultimate".
This file is the condensed, permanent version of that brief. If anything here conflicts with a newer explicit
instruction from İso, İso wins — record the change in CHANGELOG.md.

## Vision
A professional plugin ecosystem for **Adobe Premiere Pro and After Effects** that includes every identifiable
UmutcanFX feature (<https://umutcancelikis.com/umutcanfx>) and goes substantially beyond it. UmutcanFX is the
baseline, not the ceiling. Not a preset gallery, not a chatbot: a production toolkit that saves editors time,
automates repetitive work and creates editable motion graphics inside the real Adobe apps.

## Non-negotiable requirements
1. Every UmutcanFX feature accounted for (see FEATURE_INVENTORY.md); improve wherever possible.
2. Works inside Premiere Pro and After Effects; unified, professional UX.
3. Powerful automation; AI Motion Generator that produces **native, editable AE compositions** (not flattened video).
4. Users create, save, combine, import/export and reuse their own presets and tools.
5. Performance-optimised; macOS first, Windows designed in.
6. Modular, maintainable, expandable; real professional workflows.
7. Minimise AI/API cost: deterministic local code and native Adobe features first.
8. Respect licensing: original or properly licensed assets only; never copy UmutcanFX assets, names or visuals.

## Quality rules (brief §13)
No fake functionality, decorative buttons, empty galleries, duplicated low-quality presets, undocumented
dependencies, untested compatibility claims, destructive changes without safeguards, unnecessary AI calls, or
abandoned modules presented as complete. Anything not tested in the real Adobe app is labelled **unverified**.
Fewer excellent tools beat hundreds of weak presets.

## Process rules
- Phases 0–7 (MASTER_ROADMAP.md). Each phase: objectives, deliverables, acceptance criteria, tests, docs, checkpoint,
  handoff. **İso approves each checkpoint before major implementation continues.**
- The repository and its docs are the only source of truth. Any model must be able to continue from the repo
  alone (AGENT_HANDOFF.md, NEXT_SESSION.md).
- Chat reports to İso: short, in **Turkish**. Repo docs: English (unless İso asks otherwise).
- Multi-agent roles (architect, Premiere dev, AE dev, motion engineer, AI engineer, UI/UX, QA, performance) are
  defined in AGENT_HANDOFF.md. If sub-agents are not available or not approved, work runs sequentially and the docs
  say so. Never claim an agent did work it didn't do.

## Key product pillars
1. **Edit automation** (Premiere): silence/filler/retake cutting, subtitles, podcast, reframe, scene detect, beat edit.
2. **Motion & typography** (AE + MOGRT for Premiere): parametric titles, graphics, text animators, callouts,
   carousels, backgrounds, transitions, speed ramps.
3. **Audio**: Sound Lab (silence, separation, ducking, loudness, beats), SFX library.
4. **Look**: LUTs, glow, shakes, tracking-based effects.
5. **Presets & Style Cards** shared across both apps.
6. **AI layer**: MCP server for the user's own AI app; optional in-panel AI with user key; **AI Motion Generator**.
