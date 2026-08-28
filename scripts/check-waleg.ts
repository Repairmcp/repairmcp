/**
 * Transitional shim: check-waleg is now `check-state --state wa`.
 * Kept so the old Scheduled Task keeps working until the new combined task
 * ("RepairMCP State Law Check") is proven; delete after its first scheduled
 * cycle logs OK.
 */
import { runCheck } from './check-state.js';

runCheck(['--state', 'wa', ...process.argv.slice(2)]).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
