# EXISTING_PROJECT_AUDIT.md — Motion Studio / Creative Universe 2.0

Audit date: 2026-11-10. Auditor: orchestrator (Phase 0).

## Sources actually inspected

| Source | Where | What it is |
|---|---|---|
| "Creative Universe roadmap and status" | İso's Claude Docs artifact `https://claude.ai/artifact/4wz6St9NVYiJ4V8z92Drw9` (rev 35, 2026-10-29/30) | Status table of Creative Universe 2.0 and the "Universal Creative Studio" brief |
| "Video Editor Creative Universe: final report" | Claude Docs artifact `https://claude.ai/artifact/BFnkoRQzMxYpHFM8CqDJGG` (2026-10-29) | Report of v1 (style library), 15 acceptance tests |
| "Video Editor Creative Universe" | Published artifact `https://claude.ai/artifact/1V4SuBQtTXdQgHVfrLr7a1` | Built single-file site (1.2 MB, minified React 18). Only the header was skimmed; minified code was not audited. |

**Not reachable:** the source code. The reports say it lives in another Claude project's files under
`creative-universe/source/` (plus `creative-universe-site.zip`, `acceptance-results.json`,
`creative-universe-premiere-test.zip`) and was committed only to a local git repo with no GitHub remote.
On 2026-11-10 İso said: "yoksa bu motion işini kendin hallet" (if it's not there, handle the motion work yourself).
**Decision:** do not wait for the source; design our motion system from scratch. If İso later uploads
`creative-universe/source`, a code-level audit is TODO T0-05 (optional).

## What the prototype is

A **browser-only web app** (React 18 + Vite, TypeScript, Playwright tests, ffmpeg/ffprobe/Python checks). No server,
no AI service, no Adobe integration. It has three layers:

1. **v1 style library** — 179 style studies, 141 procedural canvas renderers (art history, design movements,
   digital, cinematic looks), Typography Lab (101 Google Fonts), Color Lab (palettes + contrast table), Texture Lab,
   Motion Lab (25 presets), 26 transitions, 22 layouts, Style Mixer, Idea Generator (rules, labelled "not AI"),
   Upload Workspace. EN/TR UI. 15 acceptance tests pass (`npm run test:accept`).
2. **Creative Universe 2.0 Phase 1 "Motion Studio"** — browser typography/motion editor: canvas with aspect presets,
   safe areas, guides; editable text (font, size, weight, colour, tracking, leading, outline, shadow, box); layer list;
   entrance/exit animation by char/word/line (32 presets); keyframes for x, y, scale, rotation, opacity, blur,
   letter spacing, line draw; easing incl. custom bezier; timeline; PNG/PNG-sequence/MP4/WebM/GIF export; IndexedDB
   projects. **The "13 tests" = `npm run test:studio` steps 1–13, all pass.** Step 14 (import into Premiere Pro
   26.5.2) passed on 2026-10-29.
3. **"Universal Creative Studio" Phases 1–2** — After-Effects-like workspace in the browser: compositions, media
   bin, video/audio/image/SVG layers, 11 effects, 13 layer transitions, track mattes, precompose, user presets,
   Simple/Advanced modes, autosave + ZIP project, rule-based assistant (EN/TR), checks (contrast, safe area, missing
   entrance, effect load). Tests: `test:workspace` (8 steps), `test:phase2` (15/15). Gaps: drawn masks, MP4 AAC audio
   (browser-dependent), graph editor, MOGRT (impossible from a browser — documented by that project).

## Assessment against our product

| Area | Verdict | Reason |
|---|---|---|
| Rendering engine (browser canvas) | **Do not reuse as the product core** | Our brief requires native, editable Premiere/AE output. A browser renderer produces flattened media, which the brief calls a failure for the Motion Generator. |
| Data model ideas: layers, keyframes, easing incl. custom bezier, presets that write real keyframes, one editor API with undo ("command layer") | **Reuse the design** | Maps directly to our MotionSpec + tool registry + journal (ARCHITECTURE.md §4, §6). |
| Text animation by char/word/line, 32 presets | **Reuse as reference set** | Becomes AE text-animator recipes (FEATURE_INVENTORY F-MG-04). |
| Checks (contrast, safe area, Turkish glyph warning, missing entrance) | **Reuse the idea** | Same as Style Studio readability checks (F-AI-15). |
| Procedural style renderers / textures | **Optional reuse** for panel previews and background generators, since CEP/UXP panels run Chromium. Needs the source. |
| Lessons learned (keep) | **Adopt** | (1) Export MP4 in BT.709 limited range, not full range. (2) PNG sequences import at 25 fps in Premiere unless interpreted → always import at an explicit frame rate via script. (3) Alpha WebM is unreliable in Premiere → use ProRes 4444 or PNG sequence for alpha. (4) "Not saved" honesty and error isolation per panel. (5) Every export verified after it's made. |
| Test approach (Playwright + ffprobe + scripted acceptance) | **Adopt** | Same style for our Engine and panel UI tests; host tests are added on top. |

## Conclusion

The prototype is a capable browser motion editor and style library, but it does not touch Premiere or After
Effects except by importing exported media files. **Nothing in it can be the foundation of the Adobe integration.**
Its value for us is: proven UX patterns, the keyframe/easing/preset data model, the check list, and the lessons above.
The audit is therefore complete at the documentation level and closed as "design reuse, no code reuse" unless İso
supplies the source.
