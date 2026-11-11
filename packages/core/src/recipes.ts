import type { Recipe } from './recipe.js';

/**
 * Built-in starter recipes. Original, minimal and parametric; users can retime,
 * edit and save their own. Values are relative to the layer's current state.
 */
export const BUILTIN_RECIPES: Recipe[] = [
  {
    id: 'fade-up-in', name: 'Fade up (in)', kind: 'in', duration: 0.6, schemaVersion: 1,
    tracks: [
      { property: 'opacity', mode: 'factor', keyframes: [{ t: 0, v: 0, ease: 'linear' }, { t: 0.6, v: 1, ease: 'expoOut' }] },
      { property: 'position', mode: 'offset', keyframes: [{ t: 0, v: [0, 40], ease: 'linear' }, { t: 0.6, v: [0, 0], ease: 'expoOut' }] },
    ],
  },
  {
    id: 'pop-in', name: 'Pop (in)', kind: 'in', duration: 0.5, schemaVersion: 1,
    tracks: [
      { property: 'scale', mode: 'factor', keyframes: [{ t: 0, v: [0, 0], ease: 'linear' }, { t: 0.5, v: [1, 1], ease: 'backOut' }] },
      { property: 'opacity', mode: 'factor', keyframes: [{ t: 0, v: 0, ease: 'linear' }, { t: 0.2, v: 1, ease: 'easeOut' }] },
    ],
  },
  {
    id: 'slide-left-in', name: 'Slide from right (in)', kind: 'in', duration: 0.7, schemaVersion: 1,
    tracks: [
      { property: 'position', mode: 'offset', keyframes: [{ t: 0, v: [300, 0], ease: 'linear' }, { t: 0.7, v: [0, 0], ease: 'expoOut' }] },
      { property: 'opacity', mode: 'factor', keyframes: [{ t: 0, v: 0, ease: 'linear' }, { t: 0.35, v: 1, ease: 'easeOut' }] },
    ],
  },
  {
    id: 'pulse', name: 'Pulse (emphasis)', kind: 'emphasis', duration: 0.6, schemaVersion: 1,
    tracks: [
      { property: 'scale', mode: 'factor', keyframes: [{ t: 0, v: [1, 1], ease: 'linear' }, { t: 0.25, v: [1.12, 1.12], ease: 'easeOut' }, { t: 0.6, v: [1, 1], ease: 'easeInOut' }] },
    ],
  },
  {
    id: 'fade-down-out', name: 'Fade down (out)', kind: 'out', duration: 0.5, schemaVersion: 1,
    tracks: [
      { property: 'opacity', mode: 'factor', keyframes: [{ t: 0, v: 1, ease: 'linear' }, { t: 0.5, v: 0, ease: 'expoIn' }] },
      { property: 'position', mode: 'offset', keyframes: [{ t: 0, v: [0, 0], ease: 'linear' }, { t: 0.5, v: [0, 30], ease: 'expoIn' }] },
    ],
  },
];
