/**
 * Transitional shim: capture-waleg is now `capture-state --state wa`.
 * Kept so nothing bookmarked breaks during the task transition; delete after
 * the first scheduled cycle of "RepairMCP State Law Check" logs OK.
 */
import { runCapture } from './capture-state.js';

runCapture(['--state', 'wa', ...process.argv.slice(2)]).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
