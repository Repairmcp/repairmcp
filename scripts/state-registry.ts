/**
 * The registry of state capture profiles. capture-state.ts and
 * check-state.ts iterate this — adding a state to the platform means adding
 * its profile here (plus its package and worker). Keys are the lowercase
 * postal codes the --state flag takes.
 */
import type { StateCaptureProfile } from '../packages/state-law/src/capture.js';
import { WA_CAPTURE_PROFILE } from '../packages/state-wa/src/capture-profile.js';

export const STATE_PROFILES: Record<string, StateCaptureProfile> = {
  wa: WA_CAPTURE_PROFILE,
};
