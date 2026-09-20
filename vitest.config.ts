import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Risk-based coverage (issue #4, T35/T40): no repo-wide percentage, a floor per
// file whose regression would hurt a person. Numbers sit a few points under
// what the suite measures today, so a real gap fails but a refactor does not.
// They live in this file on purpose: kit-ci-guards.sh watches vitest configs for
// a lowered number.
const thresholds = {
  "src/lib/availability.ts": { lines: 95, functions: 95, branches: 90, statements: 95, perFile: true },
  "src/lib/deeplink.ts": { lines: 95, functions: 95, branches: 90, statements: 95, perFile: true },
  "src/lib/dates.ts": { lines: 95, functions: 95, branches: 90, statements: 90, perFile: true },
  "src/lib/access.ts": { lines: 95, functions: 95, branches: 90, statements: 95, perFile: true },
};

// A glob that matches no file passes silently, so a rename would disarm its
// own threshold. Keys are plain paths and are checked at load time; the
// negative fixture for this lives in src/coverage-policy.test.ts.
export function missingFiles(paths: readonly string[], exists: (path: string) => boolean = existsSync): string[] {
  return paths.filter((path) => !exists(path));
}

export const policyFiles = Object.keys(thresholds);
const missing = missingFiles(policyFiles);
if (missing.length > 0) {
  throw new Error(`vitest.config.ts: coverage thresholds name files that do not exist: ${missing.join(", ")}`);
}

// Deliberately NOT covered here (boundary, see the PR and docs/FLOWS.md): api/webhook.ts,
// src/features/*, requireList and every `{ owner: true }` call site import src/db.ts,
// which throws without DATABASE_URL. Those are guarded only by `npm run verify:flows`.
// src/lib/scrape.ts has behaviour tests but no number: its size changes with the price rewrite.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: policyFiles,
      reporter: [["text", { skipFull: false }]],
      thresholds,
    },
  },
});
