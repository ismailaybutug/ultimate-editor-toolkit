# AE host code

- `jsx/uet-ae.jsx` — base library (recipes, speed ramp, test title). Integrator-owned.
- `jsx/uet-ae-motion.jsx` — text animator presets, shake, counter, 3D carousel; defines `UET.aeKit` helpers.
- `jsx/uet-ae-layout.jsx` — anchor point, align, distribute, sequence (needs `UET.aeKit`).

The motion/layout files are owned by the "Build After Effects animation tools" thread. Pure logic is in
`packages/core/src/motion/` (not exported from `@uet/core` yet; imported by path). Panel UI + MCP tools:
`apps/panel/src/modules/ae-motion.ts`. Tests: `tests/ae-motion.test.ts` on the mock DOM `tests/ae-mockdom.ts`
(which also simulates AE's "Object is invalid" after addProperty/remove). Real-app test: `tests/host/AE_MOTION_TEST_TR.md`.

## Assumptions to confirm in real After Effects (all UNVERIFIED)
- Text match names: `ADBE Text Animator`, `ADBE Text Selector`, `ADBE Text Range Advanced` children
  (`ADBE Text Range Units`, `ADBE Text Range Type2`, `ADBE Text Range Shape`, `ADBE Text Selector Smoothness`,
  `ADBE Text Randomize Order`), property values Shape 1 square / 2 ramp up / 3 ramp down, Based On 1–4.
- Cascade = Ramp Up/Down + Offset −spread→100 reveals left to right.
- Carousel: item Y rotation = −angle and null spin +angle brings item to front assumes AE's standard right-handed
  Y rotation. If cards face inwards in the test, flip the sign of `rotY` in `core/src/motion/carousel.ts`.
- Shake: `seedRandom(seed, false)` + `wiggle(f, a)` on Position/Rotation (or X/Y Position when separated).
