# Verification — build/replace-eslint-with-biome (issue #7)

## Run 1 — assembly and mechanical checks (2026-09-20)

VERDICT: PASS
CLAIM:   ESLint is replaced by Biome as a lint-only tool; nothing is reformatted; the rules with real value are kept or their loss is written down; the one dropped await the new rule finds is fixed.
METHOD:  Built the change in a worktree, ran every criterion, ran Biome and ESLint (the versions of main's lockfile) side by side on planted code, and ran Biome on read-only copies of the owner's uncommitted tree.
STEPS:
  1. `npm run lint` -> 36 warnings, 1 info, 0 errors, 17 diagnostics not shown.
  2. `npm run typecheck`, `env -u DATABASE_URL -u BOT_TOKEN npm test` -> green (114 tests).
  3. `KIT_BASE_REF=origin/main bash scripts/kit-ci-guards.sh` -> 0 finding(s); workflows untouched.
  4. The owner's tree with the config: 1 error without the dev-polling fix, 0 errors with it (50 warnings, 2 infos both times).
  5. `git merge-file` of package.json against the owner's uncommitted one, with THEIR HEAD as the base -> clean.
EVIDENCE: the criteria below and the reviewers' rulings in the objection log (6 objections, every blocker and major terminal).
FINDINGS: `noFloatingPromises` catches dropped awaits on grammY calls and on locally typed promises, found one real one, and does NOT catch them on Prisma calls; it needs a real node_modules to resolve types (a symlinked one made it silent and gave me a wrong 0-error measurement first); my first parity check could never pass (it matched the source excerpt Biome prints); my first three-way merge used the wrong base and reported a conflict that does not exist. Each is fixed or corrected in the log.

## Run 2 — acceptance audit (2026-09-20)

Audited by one `acceptance-auditor` invocation covering all criteria, with a separate verdict per criterion (the criteria are few and share one command source); every check was shown to fail on a mutated copy.

CRITERION: 1. `npm run lint` exits 0 (warnings allowed, no errors).
VERDICT: PASS
EVIDENCE: 36 warnings, 1 info, no errors; with the await removed from a copy the lint fails with noFloatingPromises

CRITERION: 2. ESLint is gone: no dependency, no config file, not installed.
VERDICT: PASS
EVIDENCE: `npm ls eslint typescript-eslint @eslint/js` is empty; restoring a dependency or the config file fails the check

CRITERION: 3. Biome is pinned exactly and `lint` runs `biome check`.
VERDICT: PASS
EVIDENCE: 2.5.14 and `biome check`; a caret range or `biome lint` fail the check

CRITERION: 4. Lint-only: formatter and assist disabled, no whole-tree reformat.
VERDICT: PASS
EVIDENCE: 1 changed line in src/api/scripts/prisma (limit 6); enabling either or adding 7 lines fails the check

CRITERION: 5. The ignores carried over from the ESLint config are present.
VERDICT: PASS
EVIDENCE: deleting `!.claude/worktrees` fails the check

CRITERION: 6. Parity with the old rules (matched on rule categories).
VERDICT: PASS
EVIDENCE: only noUnusedFunctionParameters and noUnusedVariables reported; noUnusedVariables off or noExplicitAny error fail the check

CRITERION: 7. The new check bites: a planted floating promise fails the lint and void/await do not.
VERDICT: PASS
EVIDENCE: bad.ts: `lint/nursery/noFloatingPromises`, Found 1 error; deleting the rule entry lets it pass, so the check fails

CRITERION: 8. Lint covers the tests and vitest.config.ts, and tsconfig.json is unchanged.
VERDICT: PASS
EVIDENCE: a planted floating promise in a test file fails the lint; caveat: a future `!**/*.test.ts` ignore would not fail this particular check (explicitly named ignored files are skipped)

CRITERION: 9. The one real hit on main is fixed the way the rule suggests.
VERDICT: PASS
EVIDENCE: `scripts/dev-polling.ts:11: await bot.start({`, one changed line

CRITERION: 10. CI and the workflows are untouched.
VERDICT: PASS
EVIDENCE: `git diff --quiet origin/main -- .github/workflows` rc 0

CRITERION: 11. The pre-commit hook still passes with Biome.
VERDICT: PASS
EVIDENCE: rc 0; with the await removed the hook prints 'Found 1 error.' and exits 1

CRITERION: 12. The deviation from T81 is recorded with the current fingerprint and no invented reason.
VERDICT: PASS
EVIDENCE: fingerprint 78f14df matches `kit tastes list`; .claude/tastes.md:36-37 says the owner chose Biome and no reason was given

CRITERION: 13. The owner's uncommitted tree is not blocked by the hook once it has the dev-polling fix.
VERDICT: PASS
EVIDENCE: copy of the owner's tree with a real node_modules: without the fixed file 1 error / 50 warnings / 2 infos, with it 0 errors / 50 warnings / 2 infos

CRITERION: 14. ADR 0004 exists, lists every downgraded rule and the counts, and says it amends criterion 21 of ADR 0003.
VERDICT: PASS
EVIDENCE: sections present; counts 21+10+2+2+1 match `biome check --reporter=json`; one sentence said ADR 0003 is not edited although it gained a pointer line: corrected

SUMMARY: 14 PASS, 0 FAIL, 0 UNKNOWN.
