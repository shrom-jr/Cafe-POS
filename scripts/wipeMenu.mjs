/**
 * Retired unsafe menu wipe command.
 *
 * It previously erased canonical menu data and inventory catalogs without a
 * backup or comparison. Use scripts/fixDatabaseSchema.mjs instead; it produces
 * a dry-run report and backup before it can remove deprecated menu roots.
 */

console.error(
  'This command is intentionally disabled. Run node scripts/fixDatabaseSchema.mjs --dry-run instead.',
);
process.exitCode = 1;