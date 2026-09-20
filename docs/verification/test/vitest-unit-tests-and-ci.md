# Verification — test/vitest-unit-tests-and-ci (issue #4)

## Run 1 — assembly and mechanical checks (2026-09-20)

VERDICT: PASS
CLAIM:   Vitest unit tests, coverage floors and a mutation battery exist and run in CI without a database; the SSRF bypass they found is fixed in the same change; `verify:flows` is a manual workflow with a stated gap.
METHOD:  Built the branch as eight commits, ran every check command of the decision record, ran the repository's own guards, ran the suite on a copy of the owner's uncommitted tree.
STEPS:
  1. `env -u DATABASE_URL -u BOT_TOKEN npm test` -> 6 files, 114 tests, coverage floors met.
  2. `bash scripts/mutation-battery.sh <class>` for availability, deeplink, access, dates, scrape-ipv4, ssrf -> 36/36 mutants killed; a stale expression and a surviving mutant each exit 1; an unknown class exits 2 (found and fixed while building it: it used to print 0/0 and succeed).
  3. `KIT_BASE_REF=origin/main bash scripts/kit-ci-guards.sh` -> 0 finding(s), with `[ci-change]` in the ci commit; without the token the same range fails.
  4. `bash scripts/main-protection.sh check` -> ok (the `quality` job is intact).
  5. `npm run typecheck`, `npm run lint`, `npm run build`, `npm ci --dry-run` -> clean.
  6. The suite on a copy of the owner's uncommitted tree with the merged fix -> 114 green; on the owner's unfixed scrape.ts -> exactly the 14 IPv6 refusal rows fail.
EVIDENCE: the criteria table below and the reviewers' rulings in the objection log (23 objections; every blocker and major terminal).
FINDINGS: A real SSRF bypass exists on main and in the owner's uncommitted rewrite of src/lib/scrape.ts (IPv6 spellings of private IPv4 addresses, e.g. `http://[::ffff:169.254.169.254]/`); fixed here. The first design (a separate fix pull request with the tests characterising the hole) was reversed after review because it would have published the bypass. My own checks failed several times on first run (Cyrillic in `ruby -e`, a shell-variable path defeating the branch guard, the battery's unknown-class hole, a redirect fake that did not model real fetch); each is fixed and recorded in the log.

## Run 2 — acceptance audit (2026-09-20)

Deviation from the protocol, stated plainly: the audit ran as four `acceptance-auditor` invocations grouped by area (criteria 1-9, 10-18, 20-29, 30-39), each giving a separate verdict per criterion, instead of one invocation per criterion. Criteria 19 and 22 are recorded as dropped in ADR 0003 (the SSRF fix ships in this pull request).

CRITERION: 1. The suite runs without a database or bot token.
VERDICT: PASS
EVIDENCE: `env -u DATABASE_URL -u BOT_TOKEN npm test` rc 0, 6 files / 114 tests; a temp test importing src/db.ts fails with 'DATABASE_URL is not set'

CRITERION: 2. At least 6 test files and 80 tests execute and none fail.
VERDICT: PASS
EVIDENCE: files 6, passed 114, failed 0; running one file only exits 1 (thresholds bite)

CRITERION: 3. The runner refuses an empty match; no green when no tests run.
VERDICT: PASS
EVIDENCE: `vitest run src/none-here` prints 'No test files found' and exits 1; with passWithNoTests true it would exit 0

CRITERION: 4. --passWithNoTests appears nowhere.
VERDICT: PASS
EVIDENCE: grep finds nothing; matches a mutated config

CRITERION: 5. No skipped, focused, todo or it.fails test exists.
VERDICT: PASS
EVIDENCE: grep clean; a planted skip/fails/only/xit matches on all three lines

CRITERION: 6. vitest.config.ts keys are plain file paths and no threshold is 100.
VERDICT: PASS
EVIDENCE: chain rc 0; four mutations (glob key, 100, perFile false, dropped key) each exit 1

CRITERION: 7. Renaming a file that a threshold names fails at load with the policy error.
VERDICT: PASS
EVIDENCE: 'coverage thresholds name files that do not exist: src/lib/access-RENAMED.ts', rc 1; without the throw the run exits 0

CRITERION: 8. A threshold not met fails the run for the right reason.
VERDICT: PASS
EVIDENCE: 'Coverage for lines (0%) does not meet "src/lib/availability.ts" threshold (95%)' (Vitest 5 does report never-imported files); removing thresholds or narrowing include makes the run pass

CRITERION: 9. src/coverage-policy.test.ts holds the negative fixture.
VERDICT: PASS
EVIDENCE: 2 tests pass; mutating missingFiles or dropping a key breaks them

CRITERION: 10. availability class killed.
VERDICT: PASS
EVIDENCE: battery 3/3; a harmless mutant SURVIVES and a stale sed exits 1

CRITERION: 11. deeplink class killed.
VERDICT: PASS
EVIDENCE: battery 3/3; same two negative controls

CRITERION: 12. access class killed.
VERDICT: PASS
EVIDENCE: battery 5/5; relationLoadStrategy 'join' added to access.ts stays green (114)

CRITERION: 13. dates class killed.
VERDICT: PASS
EVIDENCE: battery 6/6; same negative controls

CRITERION: 14. scrape guard class killed.
VERDICT: PASS
EVIDENCE: battery 9/9 (the criterion names four; the redirect-option, cap and boundary mutants were added after review)

CRITERION: 15. Every clock-dependent dates test pins time with fake timers.
VERDICT: PASS
EVIDENCE: no bare new Date() / Date.now(); a planted one is matched

CRITERION: 16. availability.test.ts asserts the holding list against the generated enum.
VERDICT: PASS
EVIDENCE: 6 tests pass; adding a status to a copy of generated/prisma/enums.ts fails with 'expected [CANCELLED, EXPIRED] to deeply equal [CANCELLED]'

CRITERION: 17. access.test.ts asserts returned values only.
VERDICT: PASS
EVIDENCE: no toHaveBeenCalled; a planted one is matched

CRITERION: 18. scrape.test.ts asserts no price value or format, and it survives the owner's rewrite.
VERDICT: PASS
EVIDENCE: auditor: first half PASS, second half UNKNOWN (no check). Orchestrator observation: on a copy of the owner's uncommitted tree with scrape.ts = git merge-file(owner's, origin/main, fixed) the suite is 6 files / 114 tests green; control on the owner's UNFIXED scrape.ts: 14 failed | 48 passed, exactly the IPv6 refusal rows

CRITERION: 20. Type-check passes with tests included.
VERDICT: PASS
EVIDENCE: tsc --noEmit rc 0 and lists the test files; a planted type error gives TS2322

CRITERION: 21. Lint passes with tests and vitest.config.ts included; eslint and tsconfig unchanged.
VERDICT: PASS
EVIDENCE: git diff --quiet on both files rc 0; eslint rc 0; planted errors are reported in both a test and the config

CRITERION: 23. The build passes.
VERDICT: PASS
EVIDENCE: npm run build rc 0 (dist/ removed afterwards); a planted type error fails it

CRITERION: 24. kit.md sets TEST_UNIT to test and TEST_DIR to src.
VERDICT: PASS
EVIDENCE: lines 18 and 49; each half fails when reverted

CRITERION: 25. The pre-push hook prints `kit pre-push: npm run test` and passes.
VERDICT: PASS
EVIDENCE: first output line matched, then 6 files / 114 tests; TEST_UNIT none prints nothing, raw:false exits 1

CRITERION: 26. The PR template has npm test and verify:flows checkboxes.
VERDICT: PASS
EVIDENCE: two added lines; each half fails when removed

CRITERION: 27. CONTRIBUTING.md no longer says there are no unit tests and names npm test and the verify:flows gate.
VERDICT: PASS
EVIDENCE: check rc 0; fails on the origin/main copy

CRITERION: 28. The new prose uses no banned word and adds no text literal to bot copy.
VERDICT: PASS
EVIDENCE: grep rc 0 over CONTRIBUTING, .github and the tests; a planted 'вішліст' is caught; the auditor also read the added lines against voice.md; src/text.ts, src/features and api untouched

CRITERION: 29. engines.node is >=22.12, Vitest and coverage plugin share one ^5 version, lockfile in sync.
VERDICT: UNKNOWN
EVIDENCE: check part PASS (node expression, `npm ci --dry-run` rc 0, lockfile engines >=22.12; mutations fail); the manual part (Node version in the Vercel preview build log) cannot be read until the pull request exists

CRITERION: 30. ci.yml runs npm test as a step of the single quality job.
VERDICT: PASS
EVIDENCE: check rc 0; six mutations (if, env, secrets, renamed job, job name, `npm run test`) each fail; caveat: an extra job would NOT fail the check, 'not restructured' rests on the additions-only diff

CRITERION: 31. flows.yml is dispatch-only, read-only permissions, one concurrency group, no job env, preflight before checkout.
VERDICT: PASS
EVIDENCE: check rc 0; eight mutations each fail

CRITERION: 32. The preflight fails loudly when the secret is empty.
VERDICT: PASS
EVIDENCE: the step's run block was EXECUTED: empty or unset secret prints '::error::…Nothing was checked.' and exits 1, set exits 0; the grep alone could not see an inverted -z/-n, the execution closes that

CRITERION: 33. kit-ci-guards.sh reports 0 findings on the assembled range with [ci-change] in a commit body.
VERDICT: PASS
EVIDENCE: 0 finding(s), guard script not in the diff; the same range without the token: FAIL 'CI edited without [ci-change]' rc 1

CRITERION: 34. The workflow YAML lints clean.
VERDICT: UNKNOWN
EVIDENCE: actionlint is not installed and was not downloaded; both files parse, use only valid keys and contexts (auditor's reading, not actionlint's output)

CRITERION: 35. The quality check is green on the PR with the Unit tests step present and no secrets in the run.
VERDICT: UNKNOWN
EVIDENCE: no pull request existed at audit time; to be read from the PR's quality run

CRITERION: 36. The SSRF class is closed (every spelling of a blocked IPv4 inside IPv6 is refused without a connection).
VERDICT: PASS
EVIDENCE: 62 assertions, 0 failed, 0 'KNOWN DEFECT'; all six named spellings pass as 'refuses'; the check fails on four mutated variants and on origin/main's scrape.ts

CRITERION: 37. The new table bites on the unfixed file; the mutation class over the IPv6 branch is killed.
VERDICT: PASS
EVIDENCE: battery ssrf 10/10 including @base; counted on origin/main's scrape.ts: failed 14 of 62 (the 14 named rows)

CRITERION: 38. The fix's diff to scrape.ts is bounded and blocks strictly more, except the accidental class.
VERDICT: UNKNOWN
EVIDENCE: evidence supports it (34 insertions / 7 deletions, one helper plus the IPv6 branch; differential of old and new: only the 34 first-group values were relaxed, 260 addresses tightened); the criterion wording said 'four groups' and has been corrected to the measured class; the human-review record belongs in the pull request body

CRITERION: 39. git merge-file of the fixed scrape.ts against the owner's working-tree copy gives no conflict markers.
VERDICT: PASS
EVIDENCE: run 2026-09-20 by the auditor and again by the orchestrator: rc 0, 0 markers; merged output holds both ipv6Groups and the owner's price code; the owner's file is still moving, so re-run before relying on it

SUMMARY: 33 PASS, 0 FAIL, 4 UNKNOWN (29 manual part, 34, 35, 38), 2 dropped (19, 22).

Open, to be settled on the pull request: 29 (Node version in the Vercel preview build log), 34 (actionlint output), 35 (the `quality` run), 38 (human-review note in the pull request body).
