#!/usr/bin/env node
// Placeholder for a verification command named in specs/TESTING.md section 8
// whose suite does not exist yet. Prints why and exits non-zero so the
// command can never be mistaken for a passing, empty suite.
const [, , name, reason] = process.argv;

console.error(`[not built yet] pnpm ${name}`);
console.error(reason ?? 'No reason given.');
console.error('See specs/IMPLEMENTATION_PLAN.md for the task that builds this.');
process.exit(1);
