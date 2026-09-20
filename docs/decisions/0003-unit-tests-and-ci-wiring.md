# 0003: Unit tests with per-file coverage floors, run in CI; flows stay manual

Status: accepted
Date: 2026-09-20

## Context

The repository had no automated tests and CI ran none of the checks it did have (typecheck, lint, build only). Issue #4 asked for Vitest tests on the modules that matter, a way to run `verify:flows` in CI, and risk-based coverage thresholds instead of a repo-wide percentage. What the code allows: `src/db.ts` throws at import without `DATABASE_URL`, so anything importing it needs a fake; the end-to-end script `verify:flows` needs a staging database, wipes four tables and there is no staging secret; the required check `quality` must stay a single unnamed job that always reports (ADR 0002); Vitest 4.1.x does not install with npm 10.9.4; and the SSRF guard for pasted links has a real bypass (IPv6 spellings of private IPv4 addresses) that the new tests found.

## Decision

- Vitest ^5.0.1 with `@vitest/coverage-v8`, `engines.node >=22.12`; co-located `src/**/*.test.ts` with explicit imports (no globals); `tsconfig.json` and `eslint.config.mjs` unchanged.
- Six suites ordered by what breaks the product: availability (nobody gives the same thing twice), access (`lookupList` decision table over a typed fake of `db.js`, asserting returned values only), deep links (golden literals), link scraping (parsing without price assertions, plus the address table and redirect handling of the SSRF guard), dates (fake timers), and a coverage-policy test.
- `npm test` is `vitest run --coverage`; `.claude/kit.md` sets `TEST_UNIT` to `test`, so pre-push, CI and local runs are the same command. Thresholds are per-file, plain paths, a few points under measured, never 100, on four files; `vitest.config.ts` throws at load if a key names a missing file. Files that need a database carry no number.
- `ci.yml` gains one step in the existing `quality` job: no `if`, no `env`, no secrets.
- `verify:flows` is NOT in `quality`. A new dispatch-only `.github/workflows/flows.yml` runs it against `STAGING_DATABASE_URL`, fails loudly at its first step without the secret, uses a dummy `BOT_TOKEN`, one concurrency group, and `environment: staging`; the owner is to create that Environment restricted to `main` and keep the secret there.
- `scripts/mutation-battery.sh` (36 one-line mutants in six classes) proves the suites can fail.
- The IPv6 bypass in `isBlockedAddress` is fixed in the same pull request, first, by comparing numeric groups instead of text.

## Alternatives considered

- **Extract a pure `decideAccess` from access.ts (candidate B).** Edits a security file in a test task and does not help the regression that matters (a handler forgetting `{ owner: true }` is a call-site fact). Rejected.
- **`verify:flows` as a step in `quality`.** Would fail on its first real run (`BOT_TOKEN`), expose the secret to `npm ci`, race on one staging database, and let a flaky database redden the required check. Rejected.
- **An ephemeral Postgres service container (candidate C).** `db.ts` uses the Neon serverless adapter; plain-Postgres compatibility is unknown and needs a spike or a production wiring change. Rejected as disproportionate.
- **A `tsconfig.test.json`, a build exclude and a doubled typecheck.** Vercel never runs `npm run build`; the only effect is an unused, gitignored `dist/**/*.test.js`. Rejected.
- **Pinning Vitest 4.x.** Not installable with npm 10.9.4 (4.1.9-4.1.11); only 4.0.x resolves. Vitest 5 chosen, fallback `vitest@4.0.18`.
- **Characterising the SSRF bypass as passing tests ("KNOWN DEFECT") and shipping the fix in a separate pull request** (the arbiter's first decision). Rejected after review: it would publish the exploit spellings on a public repository before the fix, and leave a test documenting a live hole if the second pull request never landed (log OBJ-17). `it.fails` was also rejected everywhere: it passes on any throw.
- **Glob keys for coverage thresholds.** A glob that matches nothing passes silently; plain paths are checked at load.

## Consequences

- Refactors of availability, access decisions, deep links, dates and the SSRF guard are caught; the mutation battery shows the suites can fail.
- **Accepted risks, with bounds:**
  - Handler-level access rules (`{ owner: true }` on the 27 call sites in `lists.ts`, surprise privacy in `showcase.ts`) and every promise/reservation state change are guarded only by `npm run verify:flows`, a local gate written down in `ci.yml`, `flows.yml`, CONTRIBUTING and the PR template; the pull request says `Refs #4`.
  - The `db.js` fake is not tied to `PrismaClient["wishlist"]`; drift shows only in `verify:flows`.
  - Until the `staging` Environment is configured, anyone with write access can dispatch a branch's `flows.yml` and read the staging secret (the check `assertStaging` is only a substring test of the database name).
  - Assertion-free tests can still meet a coverage floor; bounded by the mutation battery.
  - Vitest 5.0.1 is days old; the Vercel mapping of `engines` to a Node major was not verified.
  - The scrape tests assert no price format and pass against the owner's uncommitted rewrite (checked); `package-lock.json` must be regenerated after that rewrite lands.
  - The SSRF fix leaves DNS rebinding (documented in the code), Teredo and other tunnel prefixes, `fec0::/10`, IPv6 multicast, `192.0.0.0/24`, `192.0.2.0/24` and connect-time IP pinning uncovered.
  - `actionlint` was not run (not installed); the workflow YAML was parsed and the repository's own guards were run.
- Revisit when: a staging database and secret exist (whether `verify:flows` should gate merges is the owner's call and changes ADR 0002), the price rewrite lands (scrape tests for it, thresholds), or a new `ReservationStatus` appears (the availability test forces a decision).

## Acceptance criteria
**Suite and runner**

- [ ] 1. The suite runs without a database or bot token.
      check: `env -u DATABASE_URL -u BOT_TOKEN npm test`
- [ ] 2. At least 6 test files and 80 tests execute and none fail (the assertion count is not vacuous).
      check: `out=$(mktemp) && env -u DATABASE_URL -u BOT_TOKEN npx vitest run --coverage.enabled=false --reporter=json --outputFile="$out" >/dev/null && OUT="$out" node -e 'const r=JSON.parse(require("fs").readFileSync(process.env.OUT,"utf8"));const f=new Set(r.testResults.map(t=>t.name)).size;if(r.numFailedTests>0||r.numPassedTests<80||f<6){console.error("files",f,"passed",r.numPassedTests,"failed",r.numFailedTests);process.exit(1)}'`
- [ ] 3. The runner refuses an empty match; no green when no tests run.
      check: `! npx vitest run src/none-here`
- [ ] 4. `--passWithNoTests` appears nowhere in `package.json`, the Vitest config, the workflows or the hooks.
      check: `! grep -rn 'passWithNoTests' package.json vitest.config.ts .github/workflows .githooks`
- [ ] 5. No skipped, focused, todo or `it.fails` test exists. `it.fails` passes on any throw, which is how a broken setup would look green.
      check: `! grep -rnE '\b(it|test|describe)\.(skip|only|todo|fails)\b|\bx(it|describe)\(' src`

**Coverage policy (thresholds bite)**

- [ ] 6. `vitest.config.ts` keys are plain file paths (no globs) for `availability.ts`, `deeplink.ts`, `dates.ts` and `access.ts`, and no threshold is 100.
      check: `! grep -nE '"[^"]*[*?{][^"]*":' vitest.config.ts && ! grep -nE '(lines|functions|branches|statements): 100' vitest.config.ts && grep -c 'perFile: true' vitest.config.ts | grep -qx 4`
- [ ] 7. Renaming a file that a threshold names makes the run fail at load with the policy error, not pass silently.
      check: `sed 's#"src/lib/access.ts"#"src/lib/access-RENAMED.ts"#' vitest.config.ts > vitest.rename.config.ts; out=$(npx vitest run --config vitest.rename.config.ts 2>&1); rc=$?; rm -f vitest.rename.config.ts; [ $rc -ne 0 ] && printf '%s' "$out" | grep -q 'do not exist'`
- [ ] 8. A threshold not met fails the run for the right reason. Running one test file leaves the other included files at 0%, so the run must fail with Vitest's "does not meet" message.
      check: `out=$(npx vitest run --coverage src/lib/deeplink.test.ts 2>&1); rc=$?; [ $rc -ne 0 ] && printf '%s' "$out" | grep -q 'does not meet'`
      (Not run by me. If Vitest 5 does not report never-imported `coverage.include` files, replace this with a config copy that raises one floor above the measured value, and record the change in the PR body.)
- [ ] 9. `src/coverage-policy.test.ts` holds the negative fixture: a missing path is found, and `policyFiles` names `access.ts`, `deeplink.ts` and `availability.ts`.
      check: `npx vitest run src/coverage-policy.test.ts --coverage.enabled=false`

**Mutation battery (suite must kill each mutant)**

`scripts/mutation-battery.sh <class>` is a new dev script of about 40 lines. It copies the tree to a temp dir (symlinking `node_modules` and `generated`), applies each mutant as `<file> <sed-expression>` (or `@base` for the `origin/main` version of the file), and runs `npx vitest run --coverage.enabled=false`. It exits 0 only if every mutant of the class is killed (the suite fails) and every mutant actually changed its file. A mutant that changes nothing exits 1, so a stale sed cannot pass vacuously. Every survivor is a test to add, never a mutant to delete.

- [ ] 10. availability class killed. Mutants: `HOLDING_STATUSES ["ACTIVE","PURCHASED"] → ["ACTIVE"]`; drop `Math.max(quantity - reserved, 0)`; `isPartial: reserved > 0 && available > 0 → reserved > 0`. Killers: the enum-minus-CANCELLED test, the clamp test and the full-not-partial test (adversary: 1 failed, 1 failed).
      check: `bash scripts/mutation-battery.sh availability`
- [ ] 11. deeplink class killed. Mutants: `LIST_PREFIX "list_"→"l_"`, `RES_PREFIX "res_"→"r_"`, `EDITOR_PREFIX "ed_"→"e_"`. The golden literals in `deeplink.test.ts` catch what a round-trip property cannot (adversary: 4, 2, 3 failures).
      check: `bash scripts/mutation-battery.sh deeplink`
- [ ] 12. access class killed. Mutants: `include: { editors: true } → include: {}`; `const isOwner = true`; `!isOwner && !isCoAuthor → !isOwner || !isCoAuthor`; swap the `owner`/`coAuthor` roles; `canEditGifts: true → isOwner`. Adversary kill counts were 5, 2, 3, 3, 1 of 6. A behaviour-preserving `relationLoadStrategy: "join"` must stay green.
      check: `bash scripts/mutation-battery.sh access`
- [ ] 13. dates class killed. Mutants (minimum): `>= today → > today` in `nextOccurrence`; year `+ 1 → + 0`; delete the overflow rejection at `dates.ts:27`; `isPast <  → <=`; `"післязавтра": 2 → 3`; month-stem length check `< 4 → < 1`.
      check: `bash scripts/mutation-battery.sh dates`
- [ ] 14. scrape guard class killed (PR-A state). Mutants: delete `await assertPublicUrl(current)`; drop `|| a === 127`; `a >= 224 → a >= 225`; `172.16–31 → 16–32`.
      check: `bash scripts/mutation-battery.sh scrape-ipv4`
- [ ] 15. Every clock-dependent dates test pins time with fake timers. A bare `new Date()` or `Date.now()` appears only as the argument to `setSystemTime`.
      check: `! grep -nE 'new Date\(\)|Date\.now\(\)' src/lib/dates.test.ts | grep -v setSystemTime`

**Correctness and ordering of the suite**

- [ ] 16. `availability.test.ts` asserts the holding list against the generated enum (`CANCELLED` is the only releasing status), so a new status fails until someone decides.
      check: `grep -q 'ReservationStatus' src/lib/availability.test.ts && npx vitest run src/lib/availability.test.ts --coverage.enabled=false`
- [ ] 17. `access.test.ts` asserts returned values only. `toHaveBeenCalledWith` and `toHaveBeenCalled` do not appear.
      check: `! grep -nE 'toHaveBeenCalled' src/lib/access.test.ts`
- [ ] 18. `scrape.test.ts` asserts no price value or format (nothing about `price` except absence of assertions on it), and it survives the owner's rewrite.
      check: `! grep -nE 'price' src/lib/scrape.test.ts | grep -vE '^\s*[0-9]+:\s*//'`
**Typecheck, lint, build; scope**

- [ ] 20. Type-check passes with tests included.
      check: `npm run typecheck`
- [ ] 21. Lint passes with tests and `vitest.config.ts` included, with `eslint.config.mjs` and `tsconfig.json` unchanged.
      check: `git diff --quiet origin/main -- tsconfig.json eslint.config.mjs && npm run lint`
- [ ] 23. The build passes.
      check: `npm run build`

**Profile, hooks, docs (the OBJ-6 and OBJ-15 items)**

- [ ] 24. `.claude/kit.md` sets `TEST_UNIT` to `test` and `TEST_DIR` to `src`.
      check: `grep -qE '^\| TEST_UNIT \| test \|' .claude/kit.md && grep -qE '^\| TEST_DIR \| src \|' .claude/kit.md`
- [ ] 25. The pre-push hook prints `kit pre-push: npm run test` and passes, so pre-push and CI run the same command.
      check: `out=$(bash .githooks/pre-push 2>&1) && printf '%s\n' "$out" | grep -qx 'kit pre-push: npm run test'`
- [ ] 26. The PR template has a `npm test` checkbox and a `verify:flows` checkbox for changes under `src/features/`, `api/` or `prisma/`.
      check: `grep -q 'npm test' .github/pull_request_template.md && grep -q 'verify:flows' .github/pull_request_template.md`
- [ ] 27. `CONTRIBUTING.md` no longer says there are no unit tests, and names `npm test` and the local `verify:flows` gate.
      check: `! grep -q 'юніт-тестів немає' CONTRIBUTING.md && grep -q 'npm test' CONTRIBUTING.md && grep -q 'verify:flows' CONTRIBUTING.md`
- [ ] 28. The new prose uses no banned word (C1) and adds no text literal to bot copy (C2).
      check: `! git diff origin/main -- CONTRIBUTING.md .github 'src/**/*.test.ts' | grep '^+' | grep -iE 'вішліст|бронюв|заброньов|бажанн|придбан|підписк|редактор|архів|приватніст|пріоритет'`
- [ ] 29. `engines.node` is `>=22.12`, Vitest and its coverage plugin share one `^5` version, and the lockfile is in sync.
      check: `node -e 'const p=require("./package.json");const d=p.devDependencies;process.exit(p.engines.node===">=22.12"&&d.vitest===d["@vitest/coverage-v8"]&&d.vitest.startsWith("^5")?0:1)' && npm ci --dry-run`
      manual: read the Node version in the Vercel preview build log, confirm it is unchanged from before the PR (24.x per the advocate's unverified docs reading) → evidence: PR body.

**CI wiring and guards (HIGH_RISK_PATHS)**

- [ ] 30. `ci.yml` runs `npm test` as a step of the single `quality` job, with no `if:`, no `env:`, no `secrets.`, and the job is not renamed or restructured.
      check: `grep -qE '^\s+run: npm test$' .github/workflows/ci.yml && ! grep -nE '^\s+if:|secrets\.|^\s*env:' .github/workflows/ci.yml && bash scripts/main-protection.sh check`
- [ ] 31. `flows.yml` is dispatch-only. It has `permissions: contents: read`, concurrency group `staging-database` without cancellation, no job-level `env`, and the preflight step comes before checkout.
      check: `f=.github/workflows/flows.yml; grep -q '^  workflow_dispatch:' $f && ! grep -nE '^  (push|pull_request|pull_request_target|schedule):' $f && grep -q 'contents: read' $f && grep -q 'group: staging-database' $f && grep -q 'cancel-in-progress: false' $f && ! grep -nE '^ {0,4}env:' $f && awk '/Require the staging secret/{a=NR} /actions\/checkout/{b=NR} END{exit !(a&&b&&a<b)}' $f`
- [ ] 32. The preflight fails loudly when the secret is empty. The step exits 1 and prints an `::error::` line; it never skips.
      check: `awk '/Require the staging secret/,/actions\/checkout/' .github/workflows/flows.yml | grep -q '::error::' && awk '/Require the staging secret/,/actions\/checkout/' .github/workflows/flows.yml | grep -q 'exit 1'`
- [ ] 33. `kit-ci-guards.sh` reports 0 findings on the assembled range with `[ci-change]` in a commit body.
      check: `KIT_BASE_REF=origin/main bash scripts/kit-ci-guards.sh`
- [ ] 34. The workflow YAML lints clean.
      manual: run `actionlint .github/workflows/ci.yml .github/workflows/flows.yml` (docker `rhysd/actionlint` or brew) → evidence: output pasted in the PR body. The advocate's rc 0 is unverified.
- [ ] 35. The `quality` check is green on the PR with the "Unit tests" step present and no secrets in the run.
      manual: `gh pr checks <n> --required` and open the run → evidence: PR body.

**PR-B (SSRF class)**

- [ ] 36. The SSRF class is closed. Every spelling of a blocked IPv4 address inside IPv6 is refused without a connection. Verified spellings include `[::ffff:169.254.169.254]`, `[::127.0.0.1]`, `[::ffff:0:127.0.0.1]`, `[64:ff9b::127.0.0.1]`, `[2002:7f00:1::]` and `[febf::1]`, and the public control rows still pass.
      check: `out=$(mktemp) && npx vitest run src/lib/scrape.test.ts --coverage.enabled=false --reporter=json --outputFile="$out" >/dev/null && OUT="$out" node -e 'const r=JSON.parse(require("fs").readFileSync(process.env.OUT,"utf8"));const a=r.testResults.flatMap(t=>t.assertionResults);const need=["[::ffff:169.254.169.254]","[::127.0.0.1]","[::ffff:0:127.0.0.1]","[64:ff9b::127.0.0.1]","[2002:7f00:1::]","[febf::1]"];const bad=need.filter(u=>!a.some(x=>x.fullName.includes(u)&&x.fullName.includes("refuses")&&x.status==="passed"));if(bad.length||a.some(x=>x.fullName.includes("KNOWN DEFECT"))||r.numFailedTests>0){console.error(bad);process.exit(1)}'`
- [ ] 37. The new table bites on the unfixed file. Against `origin/main`'s `scrape.ts` exactly 14 rows fail, and the mutation class over the IPv6 branch is killed.
      check: `bash scripts/mutation-battery.sh ssrf`
      (Includes `@base` and the nine one-branch mutants. The delta pass ran seven; one survivor, the zone-id split, is dead code.)
- [ ] 38. The fix's diff to `scrape.ts` is bounded, and it blocks strictly more addresses than before, except four groups the old text pattern `^f[cd]` refused by accident (`[fd::1]`, `[fc::1]`, `[fc0::1]`, `[fdf::1]`: groups outside fc00::/7, public, so no security consequence).
      manual: `git diff --stat origin/main -- src/lib/scrape.ts` and `git diff origin/main -- src/lib/scrape.ts` reviewed by a human → evidence: PR-B body. Differential fuzz: 11,928 spellings over 312 IPv4 addresses, 0 mismatches (adversary).
- [ ] 39. `git merge-file` of the fixed `scrape.ts` against the owner's working-tree copy gives no conflict markers.
      manual: run it at implementation time and again just before opening PR-B (the tree is moving) → evidence: PR-B body, with the date.

Criteria 1–5 and 20–23 are the ones every reviewer can re-run in under a minute.

dropped: 19. "The 14 IPv6 spellings present in scrape.test.ts as KNOWN DEFECT rows each pass" — replaced by criterion 36: the arbiter's plan characterised the unfixed guard as passing tests and shipped the fix separately; that would have published the bypass on a public repository before it was closed (log OBJ-17), so the fix ships in the same pull request and the rows are asserted as refused. No test on the branch pins the unfixed behaviour.
dropped: 22. "PR-A changes no production source" — the fix to src/lib/scrape.ts ships in the same pull request (log OBJ-17); it is a separate commit (`fix(scrape)`) reviewed on its own, and criteria 36-39 cover it.

## Supersedes

## Superseded by
