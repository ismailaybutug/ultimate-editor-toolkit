# Transition engine (F-TR-01)

Owner: thread "Build transition engine" (see AGENT_HANDOFF.md, Module ownership).
Status: unit + mock-DOM tested; **UNVERIFIED in After Effects and Premiere Pro** (H test: `tests/host/TRANSITIONS_TEST_TR.md`).

## Pipeline
```
TransitionPreset (JSON: transition id, duration, strength 0.5–2, direction, colour, seed)
  → buildTransition(preset, host)        library.ts   parametric builders, our own designs
  → TransitionPlan (host-neutral)         plan.ts      two halves: 'out' (−dOut..0) and 'in' (0..dIn), abstract effects
  → compileForAe / compileForPpro(plan, {fps,width,height})   compile.ts   units, frame rounding, eases
  → UET.transitions.apply(json)           host-ae/jsx/uet-transitions-ae.jsx, host-ppro/jsx/uet-transitions-ppro.jsx
```
- **After Effects:** one adjustment layer (or colour solid for Flash) per half, placed above the selected shots, native
  effects with real bezier keyframes (eases precomputed in TS). One undo group. Layers are tagged in the layer comment
  `uet-transition:<id>:<side>`; applying at the same cut replaces, `remove` deletes.
- **Premiere Pro:** scripts cannot create adjustment layers, so the effects go on the two clips that meet at the cut
  (QE `addVideoEffect`), with one linear key per frame (frame-exact easing; Premiere scripts cannot set bezier
  handles). Values return to neutral outside the transition. No undo group in Premiere ExtendScript.
- Effect identifiers live in `effects.ts` (AE match names, Premiere English display names + parameter index fallback).

## Transitions (v2, 11 in 7 families; all in both apps)
| id | family | After Effects | Premiere |
|---|---|---|---|
| zoom-in | camera | Transform scale + shutter blur; incoming via Motion Tile mirror | incoming starts zoomed and settles |
| zoom-out | camera | Motion Tile mirror + Transform scale | Transform scale (min 40 %) + 4 Mirror effects whose lines follow the frame edge |
| whip | camera | Offset (wrap-around) + Directional Blur; left/right/up/down | same |
| spin | camera | Motion Tile + Transform rotation; cw/ccw | rotation + per-frame "cover" scale (|cos r| + max(w/h,h/w)·|sin r|), never black corners |
| glitch | glitch | seeded hold-key jitter: Offset + Directional Blur + Brightness | same |
| wave | distort | Wave Warp + light Gaussian Blur | same |
| light-burst | light | Brightness & Contrast + Glow | Brightness & Contrast + Gaussian Blur |
| flash | light | colour solid, Add blend, opacity | frame-filling Circle effect, opacity |
| circle | shape | colour solid with circle mask, scale 0→100→0 | Circle effect radius 0→cover→0 |
| film-burn | film | warm solid, feathered circle mask, Add blend, position sweep + opacity | feathered Circle effect, centre sweep + opacity (normal blend) |
| blur | blur | Gaussian Blur, repeat edge pixels | same |

## Open questions for the H test
1. AE: every effect/property match name in `effects.ts` exists (errors name the missing one).
2. Premiere: effect keyframe time base — `source` (clip in-point + offset, default) or `clip`; `apply` takes `keyTime`.
3. Premiere: effect point parameters (Offset "Shift Center To") normalised 0..1 or pixels.
4. Premiere in a non-English UI: effect names (`probe()` and the error message list the available names). 2026-11-11:
   İso's Premiere 26.5.2 returns English display names (read-only bridge check by the integrator).
5. Mirror "Reflection Angle" sides (0 = keep left, 90 = keep top assumed), Circle parameter names and
   `setColorValue`, AE mask/Shape API on solids.

## Next
Transition Builder UI (edit a plan's tracks and save as preset), motion-matched whip direction
(Phase 4), Premiere "replace" (find and remove our components).
