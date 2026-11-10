import { z } from 'zod';
import { EASINGS } from '../easing.js';

/**
 * Text animation presets (F-MG-04). Each preset becomes ONE native After Effects Text Animator with one
 * Range Selector on the text layer, so the result stays fully editable in AE (no baked frames, no plug-in).
 *
 * `props` hold the "hidden" state of a character/word/line (e.g. opacity 0, 40 px lower).
 * - mode 'cascade': Range Selector shape Ramp Up (in) / Ramp Down (out), Offset animated, so units blend in
 *   one after another with an overlap of `spread` percent of the text.
 * - mode 'wipe': square selector with smoothness 0, Start (in) / End (out) animated: crisp unit-by-unit
 *   (typewriter style).
 */
export const TextPresetSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  /** Turkish UI label. */
  tr: z.string(),
  kind: z.enum(['in', 'out']),
  duration: z.number().positive(),
  basedOn: z.enum(['chars', 'charsNoSpaces', 'words', 'lines']),
  mode: z.enum(['cascade', 'wipe']),
  /** cascade only: overlap width in percent of the text (1..100). Larger = softer, more simultaneous. */
  spread: z.number().min(1).max(100).default(50),
  ease: z.string().refine(e => e in EASINGS, 'unknown easing').default('easeOut'),
  randomize: z.boolean().default(false),
  props: z.object({
    opacity: z.number().min(0).max(100).optional(),
    /** pixels, relative to where the unit normally sits */
    position: z.tuple([z.number(), z.number()]).optional(),
    /** percent, uniform */
    scale: z.number().min(0).optional(),
    /** degrees */
    rotation: z.number().optional(),
    tracking: z.number().optional(),
    /** pixels */
    blur: z.number().min(0).optional(),
  }).refine(p => Object.keys(p).length > 0, 'preset needs at least one property'),
  schemaVersion: z.literal(1).default(1),
});
export type TextPreset = z.infer<typeof TextPresetSchema>;

/** AE enum values used by the host script (Range Selector > Advanced). */
export const AE_TEXT = {
  basedOn: { chars: 1, charsNoSpaces: 2, words: 3, lines: 4 },
  shape: { square: 1, rampUp: 2, rampDown: 3 },
  units: { percent: 1 },
} as const;

const P = (p: Omit<TextPreset, 'schemaVersion' | 'spread' | 'ease' | 'randomize'> & Partial<Pick<TextPreset, 'spread' | 'ease' | 'randomize'>>): TextPreset =>
  TextPresetSchema.parse(p);

/** Original built-in presets. Names are descriptive, not copied from any product. */
export const BUILTIN_TEXT_PRESETS: TextPreset[] = [
  P({ id: 'char-rise', name: 'Characters rise', tr: 'Harf harf yüksel', kind: 'in', duration: 1.0, basedOn: 'charsNoSpaces', mode: 'cascade', spread: 40, ease: 'expoOut', props: { opacity: 0, position: [0, 45] } }),
  P({ id: 'word-rise', name: 'Words rise', tr: 'Kelime kelime yüksel', kind: 'in', duration: 0.9, basedOn: 'words', mode: 'cascade', spread: 50, ease: 'expoOut', props: { opacity: 0, position: [0, 35] } }),
  P({ id: 'typewriter', name: 'Typewriter', tr: 'Daktilo', kind: 'in', duration: 1.2, basedOn: 'chars', mode: 'wipe', ease: 'linear', props: { opacity: 0 } }),
  P({ id: 'char-pop', name: 'Character pop', tr: 'Harf harf büyü', kind: 'in', duration: 0.8, basedOn: 'charsNoSpaces', mode: 'cascade', spread: 35, ease: 'expoOut', props: { opacity: 0, scale: 0 } }),
  P({ id: 'blur-in', name: 'Blur in', tr: 'Bulanıktan netleş', kind: 'in', duration: 1.0, basedOn: 'charsNoSpaces', mode: 'cascade', spread: 60, ease: 'easeOut', props: { opacity: 0, blur: 25 } }),
  P({ id: 'tracking-in', name: 'Tracking in', tr: 'Açılan harf aralığı', kind: 'in', duration: 1.1, basedOn: 'chars', mode: 'cascade', spread: 100, ease: 'expoOut', props: { opacity: 0, tracking: 30 } }),
  P({ id: 'tumble-in', name: 'Tumble in', tr: 'Dönerek düş', kind: 'in', duration: 1.0, basedOn: 'charsNoSpaces', mode: 'cascade', spread: 40, ease: 'expoOut', props: { opacity: 0, position: [0, -50], rotation: -35 } }),
  P({ id: 'random-fade', name: 'Random fade', tr: 'Rastgele belir', kind: 'in', duration: 1.0, basedOn: 'charsNoSpaces', mode: 'cascade', spread: 30, ease: 'easeOut', randomize: true, props: { opacity: 0 } }),
  P({ id: 'line-slide', name: 'Lines slide', tr: 'Satır satır kay', kind: 'in', duration: 0.9, basedOn: 'lines', mode: 'cascade', spread: 60, ease: 'expoOut', props: { opacity: 0, position: [-90, 0] } }),
  P({ id: 'char-sink-out', name: 'Characters sink (out)', tr: 'Harf harf in (çıkış)', kind: 'out', duration: 0.8, basedOn: 'charsNoSpaces', mode: 'cascade', spread: 40, ease: 'expoIn', props: { opacity: 0, position: [0, 40] } }),
  P({ id: 'word-blur-out', name: 'Words blur (out)', tr: 'Kelime kelime bulanıklaş (çıkış)', kind: 'out', duration: 0.8, basedOn: 'words', mode: 'cascade', spread: 50, ease: 'easeIn', props: { opacity: 0, blur: 25 } }),
  P({ id: 'backspace-out', name: 'Backspace (out)', tr: 'Silinerek çık', kind: 'out', duration: 0.8, basedOn: 'chars', mode: 'wipe', ease: 'linear', props: { opacity: 0 } }),
];

export interface SelectorKey { t: number; v: number; ease: string }
export interface TextAnimatorPlan {
  shape: number; basedOn: number; units: number; randomize: boolean; smoothness: number | null;
  /** fixed selector values */
  start: number; end: number; offset: number;
  /** which selector property is keyframed and its keys (t relative to animation start) */
  animate: 'start' | 'end' | 'offset';
  keys: SelectorKey[];
}

/**
 * Turn a preset into the exact Range Selector settings the host script writes.
 * Pure function, unit-tested; the host script must not contain its own copy of this logic.
 */
export function planTextAnimator(p: TextPreset, duration = p.duration): TextAnimatorPlan {
  const basedOn = AE_TEXT.basedOn[p.basedOn];
  const k = (a: number, b: number): SelectorKey[] => [{ t: 0, v: a, ease: 'linear' }, { t: duration, v: b, ease: p.ease }];
  if (p.mode === 'wipe') {
    // square selector: in = Start 0→100 (units before Start are revealed); out = End 0→100 (units hidden from the left)
    return p.kind === 'in'
      ? { shape: AE_TEXT.shape.square, basedOn, units: 1, randomize: p.randomize, smoothness: 0, start: 0, end: 100, offset: 0, animate: 'start', keys: k(0, 100) }
      : { shape: AE_TEXT.shape.square, basedOn, units: 1, randomize: p.randomize, smoothness: 0, start: 0, end: 0, offset: 0, animate: 'end', keys: k(0, 100) };
  }
  // cascade: range [offset, offset+spread]. Ramp Up selects everything after the range fully, Ramp Down everything before it.
  // Offset -spread → 100 moves the ramp across the text from left to right.
  const s = p.spread;
  return {
    shape: p.kind === 'in' ? AE_TEXT.shape.rampUp : AE_TEXT.shape.rampDown,
    basedOn, units: 1, randomize: p.randomize, smoothness: null,
    start: 0, end: s, offset: -s, animate: 'offset', keys: k(-s, 100),
  };
}
