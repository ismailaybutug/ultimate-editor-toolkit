/**
 * Native effects used by transitions, with the identifiers each host needs.
 *
 * Transitions are described with abstract effect + parameter names (host-neutral). This table maps them to
 * After Effects match names (language independent) and Premiere Pro effect names / parameter names.
 *
 * STATUS: AE match names and Premiere names are from Adobe docs/our knowledge and are UNVERIFIED in the real
 * apps until TEST_REPORT.md says otherwise. Premiere looks effects up by their display name, which differs when Premiere runs in another language.
 * Only English names are listed (no guessed translations); parameters fall back to their index, and the host
 * script reports the available effect names when none matches, so a failing name is visible, never silent.
 */

/** How an abstract value is converted to host units. */
export type ParamUnit =
  | 'raw'      // number passed as is (%, degrees, counts)
  | 'px'       // pixels at 1080 px frame height; scaled to the real frame height
  | 'point'    // [fx, fy] offset from frame centre in frame widths/heights
  | 'bool'     // 0/1 checkbox
  | 'color';   // [r, g, b] 0..1

export interface EffectParam {
  unit: ParamUnit;
  /** AE property match name (child of the effect). */
  ae?: string;
  /** Premiere parameter display names to try, then `pprIndex`. */
  ppr?: string[];
  pprIndex?: number;
}

export interface EffectDef {
  /** AE effect match name. Omitted = not available in AE. */
  ae?: string;
  /** Premiere QE effect names to try (English first). Omitted = not available in Premiere. */
  pprNames?: string[];
  /** Premiere component matchName, used to find the new component on the clip. */
  pprMatch?: string;
  params: Record<string, EffectParam>;
}

export const EFFECTS = {
  transform: {
    ae: 'ADBE Geometry2',
    pprNames: ['Transform'],
    pprMatch: 'AE.ADBE Geometry',
    params: {
      position: { unit: 'point', ae: 'ADBE Geometry2-0002', ppr: ['Position'], pprIndex: 1 },
      scale: { unit: 'raw', ae: 'ADBE Geometry2-0003', ppr: ['Scale', 'Scale Height'], pprIndex: 3 },
      rotation: { unit: 'raw', ae: 'ADBE Geometry2-0007', ppr: ['Rotation'], pprIndex: 7 },
      useCompShutter: { unit: 'bool', ae: 'ADBE Geometry2-0009', ppr: ["Use Composition's Shutter Angle"], pprIndex: 9 },
      shutterAngle: { unit: 'raw', ae: 'ADBE Geometry2-0010', ppr: ['Shutter Angle'], pprIndex: 10 },
    },
  },
  /** AE only: tiles the image with mirrored edges so scale < 100 % or rotation never shows black corners. */
  motionTile: {
    ae: 'ADBE Tile',
    params: {
      outputWidth: { unit: 'raw', ae: 'ADBE Tile-0004' },
      outputHeight: { unit: 'raw', ae: 'ADBE Tile-0005' },
      mirrorEdges: { unit: 'bool', ae: 'ADBE Tile-0006' },
    },
  },
  /** Shifts the image with wrap-around: whip pans without black edges in both apps. */
  offset: {
    ae: 'ADBE Offset',
    pprNames: ['Offset'],
    pprMatch: 'AE.ADBE Offset',
    params: {
      shift: { unit: 'point', ae: 'ADBE Offset-0001', ppr: ['Shift Center To'], pprIndex: 0 },
    },
  },
  directionalBlur: {
    ae: 'ADBE Motion Blur',
    pprNames: ['Directional Blur'],
    pprMatch: 'AE.ADBE Motion Blur',
    params: {
      direction: { unit: 'raw', ae: 'ADBE Motion Blur-0001', ppr: ['Direction'], pprIndex: 0 },
      length: { unit: 'px', ae: 'ADBE Motion Blur-0002', ppr: ['Blur Length'], pprIndex: 1 },
    },
  },
  gaussianBlur: {
    ae: 'ADBE Gaussian Blur 2',
    pprNames: ['Gaussian Blur'],
    pprMatch: 'AE.ADBE Gaussian Blur 2',
    params: {
      blurriness: { unit: 'px', ae: 'ADBE Gaussian Blur 2-0001', ppr: ['Blurriness'], pprIndex: 0 },
      repeatEdge: { unit: 'bool', ae: 'ADBE Gaussian Blur 2-0003', ppr: ['Repeat Edge Pixels'], pprIndex: 2 },
    },
  },
  waveWarp: {
    ae: 'ADBE Wave Warp',
    pprNames: ['Wave Warp'],
    pprMatch: 'AE.ADBE Wave Warp',
    params: {
      height: { unit: 'px', ae: 'ADBE Wave Warp-0002', ppr: ['Wave Height'], pprIndex: 1 },
      width: { unit: 'px', ae: 'ADBE Wave Warp-0003', ppr: ['Wave Width'], pprIndex: 2 },
      direction: { unit: 'raw', ae: 'ADBE Wave Warp-0004', ppr: ['Direction'], pprIndex: 3 },
      speed: { unit: 'raw', ae: 'ADBE Wave Warp-0005', ppr: ['Wave Speed'], pprIndex: 4 },
    },
  },
  brightness: {
    ae: 'ADBE Brightness & Contrast 2',
    pprNames: ['Brightness & Contrast'],
    pprMatch: 'AE.ADBE Brightness & Contrast 2',
    params: {
      brightness: { unit: 'raw', ae: 'ADBE Brightness & Contrast 2-0001', ppr: ['Brightness'], pprIndex: 0 },
      contrast: { unit: 'raw', ae: 'ADBE Brightness & Contrast 2-0002', ppr: ['Contrast'], pprIndex: 1 },
    },
  },
  glow: {
    ae: 'ADBE Glo2',
    params: {
      threshold: { unit: 'raw', ae: 'ADBE Glo2-0002' },
      radius: { unit: 'px', ae: 'ADBE Glo2-0003' },
      intensity: { unit: 'raw', ae: 'ADBE Glo2-0004' },
    },
  },
} satisfies Record<string, EffectDef>;

export type EffectId = keyof typeof EFFECTS;

export function effectDef(id: EffectId): EffectDef { return EFFECTS[id] as EffectDef; }
