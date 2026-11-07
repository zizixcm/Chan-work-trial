import path from 'node:path';
import { createDebugRecorder } from './capture';
import { LocalDebugStore } from './store';
import type { DebugMetadata } from './types';

/** Worker-safe factory: explicit opt-in for source-content diagnostics.
 * Never enables analysis or bypasses application consent. */
export function createConfiguredDebugRecorder(metadata: DebugMetadata) {
  if (process.env.ANALYSIS_DEBUG_CAPTURE !== '1') return null;
  return createDebugRecorder(metadata, new LocalDebugStore(
    path.join(path.resolve(process.env.PORTAL_DATA_DIR || '.data'), 'analysis-debug'),
  ));
}
