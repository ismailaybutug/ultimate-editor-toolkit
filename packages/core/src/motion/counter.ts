import { z } from 'zod';

/**
 * Animated number counter (part of F-MG-06 callouts). A text layer whose Source Text is driven by an
 * expression reading a keyframed Slider Control, so start/end values and timing stay editable.
 */
export const CounterSchema = z.object({
  from: z.number().default(0),
  to: z.number().default(1000),
  duration: z.number().positive().default(2),
  decimals: z.number().int().min(0).max(4).default(0),
  /** thousands separator, e.g. "." (Turkish), "," (English) or "" */
  thousands: z.string().max(1).default('.'),
  /** decimal mark */
  decimal: z.string().max(1).default(','),
  prefix: z.string().max(20).default(''),
  suffix: z.string().max(20).default(''),
  ease: z.enum(['linear', 'easeOut', 'expoOut', 'easeInOut']).default('expoOut'),
  fontSize: z.number().positive().default(140),
});
export type CounterParams = z.infer<typeof CounterSchema>;
export const COUNTER_EFFECT = 'UET Counter';

/** Same formatting as the AE expression, for previews and tests. */
export function formatCounter(v: number, p: Pick<CounterParams, 'decimals' | 'thousands' | 'decimal' | 'prefix' | 'suffix'>): string {
  const neg = v < 0;
  const fixed = Math.abs(v).toFixed(p.decimals);
  const [int, frac] = fixed.split('.');
  const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, p.thousands);
  return p.prefix + (neg ? '-' : '') + grouped + (frac ? p.decimal + frac : '') + p.suffix;
}

/** Source Text expression (AE expression engine, JavaScript). */
export function counterExpression(p: Pick<CounterParams, 'decimals' | 'thousands' | 'decimal' | 'prefix' | 'suffix'>): string {
  const q = (s: string) => JSON.stringify(s);
  return [
    '// UET counter',
    `var v = effect("${COUNTER_EFFECT}")(1).value;`,
    `var neg = v < 0; var s = Math.abs(v).toFixed(${p.decimals}); var parts = s.split(".");`,
    `var i = parts[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g, ${q(p.thousands)});`,
    `${q(p.prefix)} + (neg ? "-" : "") + i + (parts.length > 1 ? ${q(p.decimal)} + parts[1] : "") + ${q(p.suffix)};`,
  ].join('\n');
}
