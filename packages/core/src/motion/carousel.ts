import { z } from 'zod';

/**
 * 3D carousel layout math (F-MG-05). Layers are made 3D, parented to a null at the ring centre and placed on
 * a ring, arc or helix. The null spins (continuous) or steps item by item, all as normal editable keyframes.
 */
export const CarouselSchema = z.object({
  layout: z.enum(['ring', 'arc', 'helix']).default('ring'),
  /** pixels; 0 = automatic from item width */
  radius: z.number().min(0).default(0),
  /** arc layout: total angle in degrees */
  arcDegrees: z.number().min(10).max(360).default(150),
  /** helix layout: vertical distance between neighbours in pixels */
  helixStep: z.number().default(80),
  /** degrees the whole carousel is tipped towards the viewer */
  tilt: z.number().min(-60).max(60).default(-8),
  spin: z.enum(['continuous', 'steps', 'none']).default('steps'),
  /** continuous: seconds per full turn. steps: seconds per move */
  speed: z.number().positive().default(0.8),
  /** steps: seconds to rest on each item */
  hold: z.number().min(0).default(1),
  /** continuous: number of turns */
  turns: z.number().positive().default(1),
});
export type CarouselParams = z.infer<typeof CarouselSchema>;

export interface CarouselSlot { x: number; y: number; z: number; rotY: number }

/** Radius so neighbouring items of `itemWidth` px leave ~20% gap. */
export function autoRadius(count: number, itemWidth: number, p: Pick<CarouselParams, 'layout' | 'arcDegrees'>): number {
  const span = p.layout === 'arc' ? (p.arcDegrees * Math.PI) / 180 : 2 * Math.PI;
  const gaps = p.layout === 'arc' ? Math.max(1, count - 1) : count;
  return Math.max(itemWidth, (itemWidth * 1.2 * gaps) / span);
}

/** Item angle in degrees (0 = front, facing the viewer). */
export function slotAngles(count: number, p: Pick<CarouselParams, 'layout' | 'arcDegrees'>): number[] {
  if (p.layout === 'arc') {
    if (count === 1) return [0];
    const a = p.arcDegrees;
    return Array.from({ length: count }, (_, i) => -a / 2 + (a * i) / (count - 1));
  }
  return Array.from({ length: count }, (_, i) => (360 * i) / count);
}

/**
 * Positions relative to the carousel centre, in AE 3D space (x right, y down, z away from the viewer).
 * Item i faces outwards: front item (angle 0) is closest to the viewer at z = -radius.
 */
export function carouselSlots(count: number, radius: number, p: Pick<CarouselParams, 'layout' | 'arcDegrees' | 'helixStep'>): CarouselSlot[] {
  const angles = slotAngles(count, p);
  return angles.map((deg, i) => {
    const th = (deg * Math.PI) / 180;
    const y = p.layout === 'helix' ? (i - (count - 1) / 2) * p.helixStep : 0;
    return { x: round(radius * Math.sin(th)), y: round(y), z: round(-radius * Math.cos(th)), rotY: round(-deg) };
  });
}

/**
 * Y-rotation keyframes for the centre null: [timeFromStart, degrees].
 * 'steps' brings each item to the front in turn: rest `hold`, move in `speed` seconds.
 */
export function spinKeys(count: number, p: Pick<CarouselParams, 'spin' | 'speed' | 'hold' | 'turns' | 'layout' | 'arcDegrees'>): Array<[number, number]> {
  if (p.spin === 'none' || count < 2) return [];
  if (p.spin === 'continuous') {
    const deg = p.layout === 'arc' ? p.arcDegrees : 360 * p.turns;
    return [[0, 0], [round(p.speed * (p.layout === 'arc' ? 1 : p.turns)), round(deg)]];
  }
  const angles = slotAngles(count, p);
  const keys: Array<[number, number]> = [];
  let t = 0;
  // rotating the null by +angle brings the item at angle `a` to the front
  const order = p.layout === 'arc' ? angles : [...angles, 360];
  order.forEach((a, i) => {
    if (i === 0) { keys.push([0, round(a)]); t = p.hold; keys.push([round(t), round(a)]); return; }
    t += p.speed; keys.push([round(t), round(a)]);
    if (i < order.length - 1) { t += p.hold; keys.push([round(t), round(a)]); }
  });
  return keys;
}

function round(v: number): number { return Math.round(v * 1000) / 1000 + 0; } // +0 turns -0 into 0
