# Design Decision Record: Vitest unit tests and CI wiring (issue #4, Part A)

> **Amendment (orchestrator, 2026-09-20, after the review pass) — the split into PR-A and PR-B was reversed.**
> The fresh-eyes review found that merging PR-A alone would publish, on a public repository, a passing test named "KNOWN DEFECT" together with the URLs that exploit the unfixed guard, with the fix waiting on another pull request (log: OBJ-17). The arbiter's own Escalation 1 left "merge the fix first" open to the owner; because nothing had been pushed, the branch was rebuilt so that the fix comes first and the tests exist only in their final state, in ONE pull request: `build(deps)`, `fix(scrape)`, `test`, `ci`, `docs`, `docs`. Consequences for the criteria below: criterion 22 ("PR-A changes no production source") is **dropped** for this pull request (`dropped: 22 - the fix to src/lib/scrape.ts ships in the same pull request to avoid publishing an unfixed bypass; the tests and the fix are reviewed as separate commits`), criterion 19 (the fourteen rows pass as KNOWN DEFECT) is **replaced** by criterion 36 (they are refused), and criteria 36-39 now apply to this pull request. One factual correction to the arbiter's text: criterion 38 and the log's D20 say every changed line "moves toward more blocking"; the second review pass found that the old text pattern `^f[cd]` refused four public non-fc00::/7 spellings by accident (`[fd::1]`, `[fc::1]`, `[fc0::1]`, `[fdf::1]`), which the numeric comparison no longer refuses. No security consequence; criterion 38 is worded accordingly in ADR 0003. The arbiter's text below is otherwise kept as written.

Saved verbatim from the design-arbiter's output (2026-09-20). Route: full (open shape). The log this decision rests on is `docs/design/objections/test/vitest-unit-tests-and-ci.md`.

**State of the log before I rule.** I found no open `blocker`. Non-terminal `major` items:

- **OBJ-6** (major, `proposed`; the delta pass returned it as `open`) — **deciding despite it.** Both gaps the delta pass named are omissions of the rehearsal commit range, not of the design. The design requires edits to `.claude/kit.md`, `.github/pull_request_template.md` and `CONTRIBUTING.md`. I treat OBJ-6 as an implementation-level carried item, and it becomes terminal only when the review pass checks the committed diff (criteria 24–28).
- Every other blocker and major is `verified` (OBJ-1, 3, 4, 5, 7, 8) or `accepted-risk` (OBJ-2).
- Non-blocking: OBJ-15 (note, `proposed`, same root cause as OBJ-6). Minors OBJ-9, 10, 11, 12, 13, 14 and note OBJ-16 are `verified`.
- The design phase is at round 2 of 3. The review pass over the committed diff is the last round.

**What I checked myself, by reading only.** I had no shell, so I ran no command. Everything below is re-read from source or taken from a delta pass's logged reproduction.

- **SSRF bypass (OBJ-12).**
  - On main, `isBlockedAddress` matches IPv4-mapped IPv6 with `^::ffff:(\d+\.\d+\.\d+\.\d+)$`. It sees the text after `assertPublicUrl` strips the brackets from `new URL(...).hostname`.
  - WHATWG serialisation rewrites `[::ffff:169.254.169.254]` to `::ffff:a9fe:a9fe`. The regex never matches, no other branch applies, and `false` is returned, so the URL is fetched.
  - I found the same 14 URLs in `scrape.test.ts:78-84` that the old branches cannot catch: 4 `::ffff:` dotted, `::127.0.0.1`, `::2`, 2 `::ffff:0:`, 2 NAT64, `64:ff9b:1::1`, 2 6to4 and `febf::1`. Outcome: **confirmed**, and the delta pass reproduced it (D2).
  - The caller (`gifts.ts:252-253`) turns a `null` preview into `{ url }`. More blocking therefore never ends in silence, so C4 holds.
- **Hermetic tests.** `access.test.ts:19-33` mocks `../db.js` and `./users.js` with factories, so the throwing `db.ts:4-7` is never loaded. The only runtime import of generated code is `availability.test.ts` importing `generated/prisma/enums.js`. Outcome: **confirmed by reading.** The delta pass ran `env -u DATABASE_URL -u BOT_TOKEN npm test` and got 6 files, 107 tests, rc 0. That run is the evidence, not mine.
- **OBJ-6 gap.** `spike-4e/.claude/kit.md` still has `TEST_UNIT none` and `TEST_DIR scripts`. `.githooks/pre-push` exits 0 on `none`. `CONTRIBUTING.md:18` still says "юніт-тестів немає". The ci.yml comment "npm test is also what the pre-push hook runs" is false until kit.md changes. Outcome: **confirmed.** The design is only right once the implementation range contains those edits.
- **Not checked:**
  - `actionlint` (not installed for anyone).
  - Vercel's `engines` to Node mapping (docs not fetched).
  - GitHub-side behaviour of the `quality` job with the new step.
  - Whether Vitest 5 reports never-imported `coverage.include` files, which criterion 8 depends on. It must be run once and recorded.
  - Whether ESLint accepts a root-level `vitest.config.ts`. Criterion 20 will show it.

**Decision rests on `proposed` items.**

- The kit.md, PR-template and CONTRIBUTING edits exist only as a plan (OBJ-6, OBJ-15).
- The claim that `npm test` and pre-push are the same command is a plan until criterion 24 runs.
- The claim that the suite passes against the owner's uncommitted `scrape.ts` is the advocate's run; the adversary did not re-run it.
- The claim that `git merge-file` gives 0 conflicts is on a snapshot of a tree still being edited.

## Decision

**Chosen: Candidate A, with B's separation of the flows workflow, split into two pull requests.**

- **PR-A** (this issue, `Refs #4`, not `Closes`):
  - Adds Vitest 5.0.1 and `@vitest/coverage-v8`.
  - Adds six co-located `src/**/*.test.ts` files, ordered by product risk: availability, access, deeplink, scrape, dates, coverage-policy.
  - Adds `npm test`, defined as `vitest run --coverage`, as a step in the existing `quality` job.
  - Adds a dispatch-only `.github/workflows/flows.yml`.
  - Changes no production source (criterion 22).
- **PR-B** (security fix): the `fix(scrape)` commit (+33/-7 in `src/lib/scrape.ts`) and the move of 14 test rows from "known defect" to "refused". It is opened right away as a draft stacked on PR-A.

**Why A.**

- It stays green against today's code and leaves the `quality` job hermetic. Secrets are absent by design (ADR 0002).
- `access.ts` is tested through the factory-mocked seam, with no edit to a SECURITY_SYMBOLS file.
- The suite is chosen by what breaks the product, not by what is easy to import (OBJ-1, OBJ-16). `availability.ts`, the "nobody gives the same thing twice" rule, comes first.
- Measured runtime is 0.84 s against a 10-minute job timeout.

**Why B's transplant.**

- `verify:flows` needs `DATABASE_URL`, plus a dummy `BOT_TOKEN`. `harness.ts:28` calls `getBot()` at import and `bot.ts:21` throws without it.
- The flows wipe four tables, so one concurrency group is needed.
- A flaky staging database must not be able to redden the required check.
- All of this fits a separate workflow, not the `quality` job (OBJ-5, verified).

**Why split the SSRF fix.**

- Merge strategy is `squash`, so "commit 5 is droppable" stops being true at merge. Only a separate PR gives an independent revert and an independent review.
- The fix sits in a SECURITY_SYMBOLS file the owner is mid-rewrite on. It deserves its own review, not a place in a "tests and CI" PR.
- PR-A then touches no production source at all, including the owner's in-flight `scrape.ts`. It can merge without waiting on the owner's decision about their rewrite (criterion 22).
- The defect is bounded (see Residual risks), so a short, tracked delay is acceptable.
- One command undoes the split: cherry-pick the PR-B commit into PR-A.

## Rejected alternatives

- **Candidate B as framed.** It extracts `decideAccess` in `access.ts`, a SECURITY_SYMBOLS file, in a "test what exists" task.
  - It wins nothing for the named regression: a call site that omits `{ owner: true }` is invisible to a predicate test (OBJ-2, accepted by the delta pass).
  - The mock-free predicate test proves the rule but not that `lookupList` passes `include: { editors: true }`. The typed, include-honouring fake covers that.
  - Its weekly schedule was dropped. Once the secret exists, the owner can dispatch manually.
- **Candidate A's own flows step inside `quality`.** This argument is dead.
  - It would fail on its first real run for lack of `BOT_TOKEN`.
  - Its job-level `env` would expose the secret to `npm ci`.
  - It would race on the shared staging database.
  - It contradicts ADR 0002's "ci.yml needs no secrets" (OBJ-5).
- **Candidate C, a Postgres service container.**
  - `db.ts:9` uses PrismaNeon. Plain-Postgres compatibility is unknown, so it needs a spike.
  - The alternatives are a speculative Neon proxy container or editing production DB wiring (HIGH_RISK).
  - Flows in `quality` would make any flake block every merge.
  - It is disproportionate for a bot with two real users (OBJ-16).
- **A's `tsconfig.test.json`, build exclude and doubled typecheck.** Dead (OBJ-10).
  - `dist/` is gitignored and Vercel never runs `npm run build`.
  - The build emits unused `dist/**/*.test.js`, and that is fine.
  - `tsconfig.json` and `eslint.config.mjs` stay byte-identical.
- **Pinning Vitest 4.x (OBJ-11).** `npm i vitest@4.1.11` fails on npm 10.9.4 with "reading edgesOut" (reproduced twice). Only 4.0.x installs. I chose `^5.0.1` plus `engines >=22.12` instead.
- **`it.fails` as the defect marker, and "7 lines" as the fix size (OBJ-12).** Both are dead.
  - `it.fails` passes on any throw.
  - The characterisation test asserts the same `REACHED` outcome as the public-address control rows, so a broken setup goes red. The delta pass measured 28 failures without `vi.stubGlobal('fetch')`.
  - The fix grew to +33/-7 in `scrape.ts`.
- **"Commit 5 is droppable"** as a reason to keep it in PR-A. It is dead under `squash`.
- **Toolkit choices that died:**
  - `toHaveBeenCalledWith` assertions on the query (OBJ-4).
  - Glob threshold keys, which pass silently on a rename (OBJ-3).
  - 100% thresholds (OBJ-14).
  - Any assertion about price format (OBJ-7).
  - Tests under `scripts/`. TEST_DIR is edited to `src` instead.

## Residual risks (knowingly accepted)

- **R1 (OBJ-2, accepted-risk).** Handler-level access rules stay guarded only by `npm run verify:flows`: `{ owner: true }` on the 27 `lists.ts` call sites, surprise privacy at `showcase.ts:295` and `:354`, and promise/reservation state changes.
  - A refactor that drops `{ owner: true }` from a destructive handler passes typecheck, lint, build, every unit test and every threshold. A co-author could then delete the owner's list.
  - Bound: the boundary is written next to the code (`access.test.ts`, `vitest.config.ts`, the ci.yml comment, the PR body). The PR says `Refs #4`.
  - Local gate: run `verify:flows` before merging anything under `src/features/`, `api/` or `prisma/`.
  - Optional later: a grep or lint count of `owner: true` per destructive handler.
- **R2 (OBJ-6, open as a plan).** Nothing in CI gates promise, reservation or surprise behaviour.
  - Bound: the gap is stated in ci.yml, the flows.yml header, CONTRIBUTING, the PR template and the PR body. It stays true until the implementation range is checked (criteria 24–28).
- **R3 (OBJ-4, residual).** The `db.js` fake is not tied to `PrismaClient["wishlist"]`. Drift from the real client shows up only in `verify:flows`.
- **R4 (OBJ-5).** Anyone with write access can dispatch a branch's `flows.yml` and reach `STAGING_DATABASE_URL`.
  - `assertStaging` (`harness.ts:69-79`) is a substring check that the database name contains `staging`. A production database named `…staging…` would be wiped.
  - Bound: the workflow fails at its first step until the secret exists.
- **R5 (OBJ-14).** Assertion-free tests can still meet a coverage floor. Bound: the mutation battery (criteria 10–15) and thresholds a few points under measured (dates statements 90, others 90–95, never 100).
- **R6 (OBJ-7).** The scrape tests assert no price format.
  - The suite passing against the owner's uncommitted `scrape.ts` and `price.ts` is the advocate's run, not re-run by the adversary.
  - `git merge-file` gives 0 conflicts on `package.json` for a snapshot only. `package-lock.json` must be regenerated after the owner merges.
- **R7 (OBJ-11).** Vitest 5.0.1 is five days old.
  - Bound: fallback `vitest@4.0.18`, pinned.
  - Unverified: the Vercel mapping of `engines` to Node 24.x, and the `engines` of prisma, vite and eslint (only `npm view` output logged).
  - Criterion 29 makes the mapping observable.
- **R8 (OBJ-15, note).** Pre-push runs the same command as CI, so coverage misses are caught locally. Filtered runs (`npx vitest run <file>`) do not enforce thresholds.
- **R9 (OBJ-12).** The SSRF class fix leaves these open:
  - DNS rebinding between resolve and fetch (`scrape.ts:76-79` already documents it), and no connect-time IP pinning.
  - Teredo `2001::/32` and other tunnel prefixes.
  - Deprecated `fec0::/10` and IPv6 multicast.
  - The pre-existing `192.0.0.0/24` and `192.0.2.0/24`.
  - Whether real Linux stacks route `::ffff:0:127.0.0.1`, NAT64 or 6to4 to loopback (blocked regardless).
  - `ipv6Groups` fails open on a zone-id split, but that is dead code because `isIP` has already validated.
- **R10 (this decision).** Until PR-B merges, the vulnerability is on main and characterised as passing tests named "KNOWN DEFECT". If PR-B is never merged, that test permanently documents a live hole.
- **R11 (OBJ-13).** The guard run was rehearsed in a throwaway clone. The `fetch-depth: 0` behaviour is covered by `kit-guards.yml:20`, which I did not re-run.

## Acceptance criteria (→ the pull request body)

Criteria 1–29 belong to PR-A and criteria 30–33 to PR-B. Run from the repo root on the committed range. `BASE=origin/main`.

(Numbering note by the orchestrator: the arbiter's list runs 1–39 and places the CI-wiring criteria 30–35 in PR-A and the SSRF class criteria 36–39 in PR-B; the sentence above is the arbiter's own and is kept verbatim.)

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
- [ ] 19. The 14 IPv6 spellings present in `scrape.test.ts` as KNOWN DEFECT rows each pass, and the public-address control rows pass.
      check: `out=$(mktemp) && npx vitest run src/lib/scrape.test.ts --coverage.enabled=false --reporter=json --outputFile="$out" >/dev/null && OUT="$out" node -e 'const r=JSON.parse(require("fs").readFileSync(process.env.OUT,"utf8"));const a=r.testResults.flatMap(t=>t.assertionResults);const k=a.filter(x=>x.fullName.includes("KNOWN DEFECT")&&x.status==="passed").length;const c=a.filter(x=>x.fullName.includes("still allows")&&x.status==="passed").length;if(k!==14||c<12){console.error(k,c);process.exit(1)}'`

**Typecheck, lint, build; scope**

- [ ] 20. Type-check passes with tests included.
      check: `npm run typecheck`
- [ ] 21. Lint passes with tests and `vitest.config.ts` included, with `eslint.config.mjs` and `tsconfig.json` unchanged.
      check: `git diff --quiet origin/main -- tsconfig.json eslint.config.mjs && npm run lint`
- [ ] 22. PR-A changes no production source, so `scrape.ts` (the owner's in-flight file) and the security files are untouched. No test lives under `api/`.
      check: `[ -z "$(git diff origin/main --name-only -- src ':!*.test.ts')" ] && [ -z "$(git ls-files 'api/**/*.test.*')" ]`
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
- [ ] 38. The fix's diff to `scrape.ts` is bounded, and every changed line in `isBlockedAddress` and its new helper moves toward more blocking.
      manual: `git diff --stat origin/main -- src/lib/scrape.ts` and `git diff origin/main -- src/lib/scrape.ts` reviewed by a human → evidence: PR-B body. Differential fuzz: 11,928 spellings over 312 IPv4 addresses, 0 mismatches (adversary).
- [ ] 39. `git merge-file` of the fixed `scrape.ts` against the owner's working-tree copy gives no conflict markers.
      manual: run it at implementation time and again just before opening PR-B (the tree is moving) → evidence: PR-B body, with the date.

Criteria 1–5 and 20–23 are the ones every reviewer can re-run in under a minute.

## Risk flags (→ the pre-merge audit)

Taken from `.claude/kit.md`:

- **HIGH_RISK_PATHS: `.github/workflows/`.** Edited `ci.yml` and new `flows.yml`.
  - `ci.yml` changes what gates merges.
  - `flows.yml` gives write-access users a path to the staging-database secret.
  - Effort and review: **full review** by a human. Read the workflow diff line by line, run the guard scripts end to end, run `actionlint`, and do not auto-merge.
- **SECURITY_SYMBOLS: `access`.** The tests mock `access.ts`'s dependencies and do not edit it. **Full review** of `access.test.ts` (does it assert the right decisions?) and of the boundary comment.
- **SECURITY_SYMBOLS: `deeplink`.** Tests pin the golden literals. No source edit. **Standard review.**
- **SSRF guard in `src/lib/scrape.ts`.** No listed key, but security-relevant.
  - PR-B edits it, so it gets **full security review** plus the adversary's differential run.
  - PR-A does not touch it.
- **Also touched:** `package.json`, `package-lock.json` (dependency update, engines bump), `.claude/kit.md` (profile; hooks and doctor read it), the PR template, `CONTRIBUTING.md`.
- **Not touched:** MONEY_SYMBOLS (`priceAmount` and `priceCurrency` are not on main), DESTRUCTIVE_SQL, `prisma/migrations/`, `api/webhook.ts`, `api/cron.ts`, `vercel.json`.
- **Runtime effect:** `flows.yml` triggers a harness that deletes rows from four tables in a database given by a secret. The only door is `assertStaging`.

## Implementation notes

- **Branches:** PR-A on `test/vitest-unit-tests-and-ci`; PR-B on `fix/scrape-ipv6-embedded-ipv4`, based on PR-A's branch, opened as a draft. Retarget to `main` after PR-A merges (squash).
- **Commit plan for PR-A** (conventional commits; no AI attribution):
  1. `build(deps): add Vitest and require Node >=22.12`
     - `package.json`: `vitest ^5.0.1`, `@vitest/coverage-v8 ^5.0.1`, `engines.node >=22.12`.
     - `package-lock.json`.
     - Do not add `test` scripts here, because `npm test` with no test files would exit 1 in this commit.
  2. `test: cover availability, access rules, deep links, link scraping and dates`
     - `vitest.config.ts`.
     - Six files, in this order: `availability.test.ts`, `access.test.ts`, `deeplink.test.ts`, `scrape.test.ts`, `dates.test.ts`, `src/coverage-policy.test.ts`.
     - `scripts/mutation-battery.sh`.
     - `package.json` scripts `"test": "vitest run --coverage"` and `"test:watch": "vitest"`, placed after the `lint` line and away from the `verify:*` hunk so the owner's `verify:scrape` line does not conflict.
     - `scrape.test.ts` must be in the commit-2 state (the 14 rows as `KNOWN DEFECT: <url> is still fetched`, asserting `REACHED` on the same `probe` as the public-address rows), not the fixed state in `spike-4e`.
  3. `ci: run unit tests in the quality job and add a manual flows workflow`
     - Body contains `[ci-change]` and `Refs #4`. Do not use a `test:` type for this commit (guard 5's "all typed" escape would not apply).
     - Files: `.github/workflows/ci.yml`, new `.github/workflows/flows.yml`, and the `.claude/kit.md` edit (`TEST_UNIT` test, `TEST_DIR` src).
     - The kit.md edit must be in this commit, because the ci.yml comment "npm test is also what the pre-push hook runs" is false without it.
  4. `docs: describe the test gates in CONTRIBUTING and the PR template`
     - Write both files in Ukrainian, matching them, and use plain words a grandmother would follow. Do not reintroduce the banned vocabulary.
     - The PR template gets an `npm test` checkbox, and a checkbox for `verify:flows` when `src/features/`, `api/` or `prisma/` change.
     - `CONTRIBUTING.md:18` currently says "юніт-тестів немає" and must be replaced.
     - Say `npx vitest run <file>` and `npm run test:watch` for fast loops, because `npm test <file>` fails the coverage floors.
     - Do not touch `README.md` or `docs/FLOWS.md`, which the owner is editing.
- **Commit plan for PR-B:** `fix(scrape): block IPv6 forms of private IPv4 addresses`.
  - The commit body says it is a security fix and gives the threat: a link that makes the server call inward.
  - `src/lib/scrape.ts` gets the diff in `ssrf-fix.diff`: `ipv6Groups` plus the rewritten IPv6 branch.
  - `scrape.test.ts`: the 14 rows move from the KNOWN DEFECT table to the "refuses" table.
  - `scripts/mutation-battery.sh` gets the `ssrf` class.
  - Include the residual-bound sentence (R9) above the table and in the PR body.
- **Thresholds** (derived from measurement: floor(measured) minus about 5, never 100):
  - `dates.ts`: lines 95, functions 95, branches 90, statements 90 (measured 98.79 statements, 97.91 branches).
  - `availability.ts`, `deeplink.ts`, `access.ts`: lines 95, functions 95, branches 90, statements 95.
  - `scrape.ts` and every DB-bound file carry none.
- **Do not add:** a `tsconfig.test.json`, a build exclude, retries, `--passWithNoTests`, any test under `api/`, any Vitest globals (import `describe`, `it`, `expect`, `vi` explicitly).
- **PR body (PR-A):**
  - `Refs #4`, Part A only.
  - What is guarded; what is not guarded (R1, R2), with the local gate.
  - Why flows are dispatch-only.
  - The threshold table with measured values.
  - The mutation-battery output for each class.
  - The engines bump and the Vercel build-log evidence.
  - The KNOWN DEFECT rows, plus a link to PR-B and to an issue for the SSRF. The orchestrator should file that issue; I must not, and the record does not assume it exists.
  - The owner-facing merge notes (see ESCALATION).
- **Supplementary, not proof:** `kit doctor` `readiness-tests` passes vacuously in this checkout because the design log lives under a directory named `test`. Do not cite it as evidence of tests (OBJ-9). Run `TZ=Pacific/Kiritimati npx vitest run --coverage.enabled=false` once and note the result in the PR body; dates use UTC, so it should pass.
- **Doctor will count criteria.** If any of the 39 does not ship, drop it in the ADR on its own line: `dropped: <criterion> — <reason, and where the work is tracked>`.
- **Write the ADR** with `/write-adr` (the decision constrains future work: test layout, coverage policy, flows separation, the split of the SSRF fix). It copies the criteria whole.

## ESCALATION (no blocker is open; these need the owner)

1. **The SSRF bypass exists on main and in your uncommitted rewrite of `src/lib/scrape.ts`.**
   - `http://[::ffff:169.254.169.254]/` and 13 sibling spellings are fetched by the bot when a user pastes them. The old regex cannot match the hex form that `new URL` produces.
   - Bounds: the page body goes only to the sender, and the scraper extracts only title, image and price. So this is a bounded leak, not remote code execution. I could not verify whether the Vercel runtime can reach any internal endpoint.
   - **Ship decision: split.** PR-B carries the fix, PR-A characterises the defect.
   - Your rewrite still contains the old function (lines 42-64). The fix's hunks are disjoint and `git merge-file` gave rc 0 on a snapshot. If you land your rewrite first, apply the diff at `.../scratchpad/ssrf-fix.diff` to it, or tell us and we rebase PR-B.
   - Cheapest road back if you want one PR: `git cherry-pick <PR-B commit>` onto the PR-A branch, and delete the KNOWN DEFECT block in the same step.
   - After PR-A merges and before PR-B, the repo carries a test named KNOWN DEFECT that asserts vulnerable behaviour. Say so if you want PR-B merged first.
2. **Commit 5 edits a file you are mid-rewrite on.** With the split, PR-A no longer does (criterion 22). PR-B does, and that is the conflict to watch. `package-lock.json` must be regenerated after your rewrite lands; `package.json` merges clean on the snapshot.
3. **Should `verify:flows` ever gate merges?**
   - Today nothing does, and that is deliberate. A merge gate would need a staging database, a secret, and either a second required check (a change to ADR 0002) or flows inside `quality`.
   - Dispatch-only was my choice for flows.yml, and it is weaker than the issue's "when a staging secret exists" implies. Making it a gate is your decision, not the design cycle's.
4. **Language of edited docs.** I chose Ukrainian for `CONTRIBUTING.md` and the PR template to match the files, and English for workflow comments, test code and commit messages. Change it if you want otherwise.
5. **Existing breach of C1 not fixed here.** `package.json` still says «вішлістів» and `CONTRIBUTING.md:31` says "забронювали". Neither is in this change's scope (package.json is being edited by you). Say if you want them fixed in this PR.
6. **Proxy-owner asterisk.** C1–C4 were quoted from owner documents, not an interview. This decision breaks none of them (C4: a blocked link still becomes `{ url }`, `gifts.ts:252-253`). Any "the owner decided" resting on this record carries that asterisk until you confirm it.
