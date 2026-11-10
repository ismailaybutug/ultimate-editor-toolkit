import type { PanelModule } from './types';
import { aeMotionModule } from './ae-motion';
import { transitionsModule } from './transitions';
// Each worker adds ONE import + ONE array entry here (the only shared line they touch).
export const MODULES: PanelModule[] = [aeMotionModule, transitionsModule];
