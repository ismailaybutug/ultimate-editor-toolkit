import type { PanelModule } from './types';
import { aeMotionModule } from './ae-motion';
import { subtitlesModule } from './subtitles';
// Each worker adds ONE import + ONE array entry here (the only shared line they touch).
export const MODULES: PanelModule[] = [aeMotionModule, subtitlesModule];
