import { RecipeSchema, type Recipe } from '../recipe.js';
import { BUILTIN_RECIPES } from '../recipes.js';

/**
 * More layer animations (F-MG-03), same Recipe format as core/recipes.ts, applied by the existing host
 * function UET.ae.applyRecipe (values are relative to the layer's current position/scale/rotation/opacity,
 * so every recipe works on any layer). Original, descriptive names. `tr` = Turkish label.
 */
type K = { t: number; v: number | number[]; ease?: string };
const kf = (...ks: K[]) => ks.map(k => ({ t: k.t, v: k.v, ease: k.ease ?? 'linear' }));
const R = (id: string, name: string, tr: string, kind: Recipe['kind'], duration: number, tracks: Recipe['tracks']): Recipe & { tr: string } =>
  ({ ...RecipeSchema.parse({ id, name, kind, duration, tracks, schemaVersion: 1 }), tr });
const op = (...ks: K[]) => ({ property: 'opacity' as const, mode: 'factor' as const, keyframes: kf(...ks) });
const pos = (...ks: K[]) => ({ property: 'position' as const, mode: 'offset' as const, keyframes: kf(...ks) });
const sc = (...ks: K[]) => ({ property: 'scale' as const, mode: 'factor' as const, keyframes: kf(...ks) });
const rot = (...ks: K[]) => ({ property: 'rotation' as const, mode: 'offset' as const, keyframes: kf(...ks) });

export const EXTRA_RECIPES: Array<Recipe & { tr: string }> = [
  // ---- in ----
  R('fade-in', 'Fade (in)', 'Belir', 'in', 0.5, [op({ t: 0, v: 0 }, { t: 0.5, v: 1, ease: 'easeOut' })]),
  R('zoom-in', 'Zoom in (in)', 'Yakından gel', 'in', 0.7, [sc({ t: 0, v: [1.4, 1.4] }, { t: 0.7, v: [1, 1], ease: 'expoOut' }), op({ t: 0, v: 0 }, { t: 0.35, v: 1, ease: 'easeOut' })]),
  R('grow-in', 'Grow (in)', 'Büyüyerek gel', 'in', 0.6, [sc({ t: 0, v: [0.6, 0.6] }, { t: 0.6, v: [1, 1], ease: 'expoOut' }), op({ t: 0, v: 0 }, { t: 0.3, v: 1, ease: 'easeOut' })]),
  R('drop-in', 'Drop (in)', 'Yukarıdan düş', 'in', 0.7, [pos({ t: 0, v: [0, -260] }, { t: 0.7, v: [0, 0], ease: 'backOut' }), op({ t: 0, v: 0 }, { t: 0.2, v: 1, ease: 'easeOut' })]),
  R('rise-in', 'Rise (in)', 'Aşağıdan yüksel', 'in', 0.7, [pos({ t: 0, v: [0, 220] }, { t: 0.7, v: [0, 0], ease: 'expoOut' }), op({ t: 0, v: 0 }, { t: 0.35, v: 1, ease: 'easeOut' })]),
  R('slide-right-in', 'Slide from left (in)', 'Soldan kay', 'in', 0.7, [pos({ t: 0, v: [-300, 0] }, { t: 0.7, v: [0, 0], ease: 'expoOut' }), op({ t: 0, v: 0 }, { t: 0.35, v: 1, ease: 'easeOut' })]),
  R('whip-in', 'Whip (in)', 'Hızla savrul', 'in', 0.45, [pos({ t: 0, v: [900, 0] }, { t: 0.45, v: [0, 0], ease: 'expoOut' })]),
  R('spin-in', 'Spin (in)', 'Dönerek gel', 'in', 0.8, [rot({ t: 0, v: -180 }, { t: 0.8, v: 0, ease: 'expoOut' }), sc({ t: 0, v: [0, 0] }, { t: 0.8, v: [1, 1], ease: 'expoOut' })]),
  R('swing-in', 'Swing (in)', 'Sallanarak gel', 'in', 0.9, [rot({ t: 0, v: -25 }, { t: 0.45, v: 8, ease: 'easeOut' }, { t: 0.9, v: 0, ease: 'easeInOut' }), op({ t: 0, v: 0 }, { t: 0.25, v: 1, ease: 'easeOut' })]),
  R('stretch-in', 'Stretch (in)', 'Yana açıl', 'in', 0.6, [sc({ t: 0, v: [0, 1] }, { t: 0.6, v: [1, 1], ease: 'expoOut' })]),
  R('rubber-in', 'Rubber (in)', 'Lastik gibi gel', 'in', 0.9, [sc({ t: 0, v: [0, 0] }, { t: 0.35, v: [1.15, 0.9], ease: 'easeOut' }, { t: 0.6, v: [0.95, 1.05], ease: 'easeInOut' }, { t: 0.9, v: [1, 1], ease: 'easeInOut' })]),
  // ---- emphasis ----
  R('shake-x', 'Shake (emphasis)', 'Sağa sola salla', 'emphasis', 0.5, [pos({ t: 0, v: [0, 0] }, { t: 0.1, v: [-18, 0], ease: 'easeOut' }, { t: 0.2, v: [16, 0], ease: 'easeInOut' }, { t: 0.3, v: [-10, 0], ease: 'easeInOut' }, { t: 0.4, v: [6, 0], ease: 'easeInOut' }, { t: 0.5, v: [0, 0], ease: 'easeInOut' })]),
  R('wobble', 'Wobble (emphasis)', 'Yalpala', 'emphasis', 0.7, [rot({ t: 0, v: 0 }, { t: 0.15, v: -8, ease: 'easeOut' }, { t: 0.35, v: 6, ease: 'easeInOut' }, { t: 0.55, v: -3, ease: 'easeInOut' }, { t: 0.7, v: 0, ease: 'easeInOut' })]),
  R('bounce', 'Bounce (emphasis)', 'Zıpla', 'emphasis', 0.7, [pos({ t: 0, v: [0, 0] }, { t: 0.2, v: [0, -60], ease: 'easeOut' }, { t: 0.4, v: [0, 0], ease: 'easeIn' }, { t: 0.55, v: [0, -18], ease: 'easeOut' }, { t: 0.7, v: [0, 0], ease: 'easeIn' })]),
  R('heartbeat', 'Heartbeat (emphasis)', 'Kalp atışı', 'emphasis', 0.8, [sc({ t: 0, v: [1, 1] }, { t: 0.12, v: [1.12, 1.12], ease: 'easeOut' }, { t: 0.25, v: [1, 1], ease: 'easeIn' }, { t: 0.37, v: [1.1, 1.1], ease: 'easeOut' }, { t: 0.8, v: [1, 1], ease: 'easeInOut' })]),
  R('jelly', 'Jelly (emphasis)', 'Jöle', 'emphasis', 0.8, [sc({ t: 0, v: [1, 1] }, { t: 0.2, v: [1.2, 0.85], ease: 'easeOut' }, { t: 0.4, v: [0.9, 1.1], ease: 'easeInOut' }, { t: 0.6, v: [1.05, 0.97], ease: 'easeInOut' }, { t: 0.8, v: [1, 1], ease: 'easeInOut' })]),
  R('flash', 'Flash (emphasis)', 'Yanıp sön', 'emphasis', 0.6, [op({ t: 0, v: 1 }, { t: 0.15, v: 0.15, ease: 'easeOut' }, { t: 0.3, v: 1, ease: 'easeIn' }, { t: 0.45, v: 0.15, ease: 'easeOut' }, { t: 0.6, v: 1, ease: 'easeIn' })]),
  R('tada', 'Tada (emphasis)', 'Ta-da', 'emphasis', 0.9, [sc({ t: 0, v: [1, 1] }, { t: 0.15, v: [0.92, 0.92], ease: 'easeOut' }, { t: 0.35, v: [1.12, 1.12], ease: 'easeOut' }, { t: 0.9, v: [1, 1], ease: 'easeInOut' }), rot({ t: 0, v: 0 }, { t: 0.35, v: -4, ease: 'easeOut' }, { t: 0.5, v: 4, ease: 'easeInOut' }, { t: 0.65, v: -3, ease: 'easeInOut' }, { t: 0.9, v: 0, ease: 'easeInOut' })]),
  R('nudge-up', 'Nudge (emphasis)', 'Hafif kalk', 'emphasis', 0.5, [pos({ t: 0, v: [0, 0] }, { t: 0.2, v: [0, -25], ease: 'expoOut' }, { t: 0.5, v: [0, 0], ease: 'easeInOut' })]),
  R('spin-360', 'Full spin (emphasis)', 'Tam tur dön', 'emphasis', 0.8, [rot({ t: 0, v: 0 }, { t: 0.8, v: 360, ease: 'expoInOut' })]),
  // ---- out ----
  R('fade-out', 'Fade (out)', 'Kaybol', 'out', 0.5, [op({ t: 0, v: 1 }, { t: 0.5, v: 0, ease: 'easeIn' })]),
  R('zoom-out', 'Zoom out (out)', 'Uzaklaşarak git', 'out', 0.6, [sc({ t: 0, v: [1, 1] }, { t: 0.6, v: [0.5, 0.5], ease: 'expoIn' }), op({ t: 0.25, v: 1 }, { t: 0.6, v: 0, ease: 'easeIn' })]),
  R('blow-out', 'Blow up (out)', 'Büyüyüp kaybol', 'out', 0.6, [sc({ t: 0, v: [1, 1] }, { t: 0.6, v: [1.6, 1.6], ease: 'expoIn' }), op({ t: 0.2, v: 1 }, { t: 0.6, v: 0, ease: 'easeIn' })]),
  R('pop-out', 'Pop (out)', 'Patlayarak git', 'out', 0.45, [sc({ t: 0, v: [1, 1] }, { t: 0.15, v: [1.12, 1.12], ease: 'easeOut' }, { t: 0.45, v: [0, 0], ease: 'expoIn' })]),
  R('slide-left-out', 'Slide left (out)', 'Sola kay', 'out', 0.6, [pos({ t: 0, v: [0, 0] }, { t: 0.6, v: [-300, 0], ease: 'expoIn' }), op({ t: 0.3, v: 1 }, { t: 0.6, v: 0, ease: 'easeIn' })]),
  R('slide-right-out', 'Slide right (out)', 'Sağa kay', 'out', 0.6, [pos({ t: 0, v: [0, 0] }, { t: 0.6, v: [300, 0], ease: 'expoIn' }), op({ t: 0.3, v: 1 }, { t: 0.6, v: 0, ease: 'easeIn' })]),
  R('sink-out', 'Sink (out)', 'Aşağı düş', 'out', 0.6, [pos({ t: 0, v: [0, 0] }, { t: 0.6, v: [0, 260], ease: 'expoIn' }), op({ t: 0.3, v: 1 }, { t: 0.6, v: 0, ease: 'easeIn' })]),
  R('whip-out', 'Whip (out)', 'Hızla savrul (çıkış)', 'out', 0.4, [pos({ t: 0, v: [0, 0] }, { t: 0.4, v: [-900, 0], ease: 'expoIn' })]),
  R('spin-out', 'Spin (out)', 'Dönerek git', 'out', 0.7, [rot({ t: 0, v: 0 }, { t: 0.7, v: 180, ease: 'expoIn' }), sc({ t: 0, v: [1, 1] }, { t: 0.7, v: [0, 0], ease: 'expoIn' })]),
  R('squash-out', 'Squash (out)', 'Ezilerek git', 'out', 0.5, [sc({ t: 0, v: [1, 1] }, { t: 0.5, v: [1, 0], ease: 'expoIn' })]),
];

const BUILTIN_TR: Record<string, string> = {
  'fade-up-in': 'Yukarı belir', 'pop-in': 'Pop', 'slide-left-in': 'Sağdan kay', pulse: 'Nabız', 'fade-down-out': 'Aşağı kaybol',
};

/** All layer animations shown in the panel: the 5 originals + the extra library, with Turkish labels. */
export const ALL_LAYER_RECIPES: Array<Recipe & { tr: string }> = [
  ...BUILTIN_RECIPES.map(r => ({ ...r, tr: BUILTIN_TR[r.id] ?? r.name })),
  ...EXTRA_RECIPES,
];
