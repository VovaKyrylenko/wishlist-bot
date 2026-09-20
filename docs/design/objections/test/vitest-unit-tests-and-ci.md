route: full
research: none
autonomy: autonomous
lenses: none activated (triage: no user-visible flow, copy, personal data or schema is touched; reliability-failure considered for network-dependent scrape tests, handled by keeping tests offline)
shape: one bounded chore with real design choices (mocking strategy, CI wiring, coverage policy), not competing architectures
why: edits .github/workflows/ci.yml (HIGH_RISK_PATHS, functional: it changes what gates merges), adds a devDependency and a coverage policy over auth and data-mutation code; the assistant plays orchestrator, roles run as fresh-context subagents. Issue: #4. Part A only: price.ts, scripts/scrape fixtures and verify:scrape are uncommitted owner work, not on main.

# Objection log

[OBJ-1] candidate: all | severity: major | status: verified
CLAIM:      The candidates skip src/lib/availability.ts, the pure module that encodes the product's central rule ("nobody gives the same thing twice"), and spend the effort on a mock-heavy lookupList test.
EVIDENCE:   availability.ts:1 is fully pure; HOLDING_STATUSES = ["ACTIVE","PURCHASED"] and computeAvailability carry a comment about the exact duplicate the bot exists to prevent; PRODUCT_GOALS says "nobody gives the same thing twice"; no candidate lists it.
SCENARIO:   Someone "simplifies" HOLDING_STATUSES to ["ACTIVE"] or changes Math.max(quantity - reserved, 0); the duplicate-gift regression returns and every planned check stays green.
BAR:        availability.test.ts (no DB) with golden cases: PURCHASED holds a unit, CANCELLED releases it, over-reservation clamps to 0, isFull/isPartial boundaries; included in the thresholds.
HISTORY:    r1 open (design-adversary)
            -> r1 proposed (advocate: availability.test.ts is first in the suite: HOLDING_STATUSES equals the generated enum minus CANCELLED (a new status fails until someone decides), PURCHASED holds, holdingReservations uses the same list, four computeAvailability cases incl. clamp to 0; mutation [ACTIVE,PURCHASED]->[ACTIVE] and dropping Math.max both exit 1; in the coverage floors)
            -> r2d verified (design-adversary delta pass r2: mutating [ACTIVE,PURCHASED]->[ACTIVE] failed the enum-minus-CANCELLED test (1 failed|5 passed); dropping Math.max failed the clamp test (1|5); the assertion is sound against generated/prisma/enums.ts (ReservationStatus, CANCELLED at :47))

[OBJ-2] candidate: all | severity: major | status: accepted-risk
CLAIM:      "A PR that breaks an access rule fails CI" holds only for the 10-line lookupList; the rules that matter (owner-only actions, surprise mode) live in code no candidate can reach without a database.
EVIDENCE:   27 `owner: true` call sites in src/features/lists.ts, enforced at lists.ts:75; surprise privacy at showcase.ts:295 and :354; canEditGifts is set to true at access.ts:48 and read nowhere; the issue's thresholds on api/webhook.ts, promises.ts, lists.ts are dropped as "DB-bound" with no recorded boundary.
SCENARIO:   A refactor drops `{ owner: true }` from a destructive handler; typecheck, lint, build, every unit test and every threshold pass; a co-author can delete the owner's list. Only verify:flows would see it, and it does not run.
BAR:        Do not claim the issue's access-rule criterion beyond what is true; mark the boundary next to it as .claude/rules/tests.md requires; say plainly which regression class stays unguarded until flows run in CI; if requireList's owner branch can be extracted as a pure predicate, test that.
HISTORY:    r1 open (design-adversary)
            -> r1 proposed (advocate: accepted-risk proposed: not claiming the access criterion beyond the lookupList decision table and the include contract; extracting a pure predicate rejected (requireList is three lines calling render functions; the named regression is a call site forgetting {owner:true}, which no predicate test sees, and it would edit a SECURITY_SYMBOL file); boundary written in access.test.ts, vitest.config.ts, ci.yml, PR body; PR says Refs #4; bound: verify:flows stays a local gate)
            -> r1d accepted-risk (design-adversary delta pass r1: rejecting the pure-predicate extraction is acceptable: requireList already delegates to the tested lookupList, the remaining branch is one boolean, and the regression class (a caller omitting {owner:true}) is a call-site fact no predicate test sees; bounded by the PR wording (Refs #4, gap stated in access.test.ts, vitest.config.ts, ci.yml and the PR body); optional later: a lint/grep rule counting owner:true per destructive handler)

[OBJ-3] candidate: all | severity: major | status: verified
CLAIM:      A glob threshold that matches no file passes silently, so a rename or typo disarms it, and guard 3 cannot see a threshold key being deleted.
EVIDENCE:   In the spike, thresholds for src/lib/access-RENAMED.ts and src/features/promises.ts (100%) ran with rc=0 and no error; kit-ci-guards.sh:142-146 only reports when both removed and added lines carry a number.
SCENARIO:   access.ts is moved to access/index.ts; the "risk-based coverage" still looks configured but guards nothing.
BAR:        A check that every key of coverage.thresholds matches an existing file, shipped with a negative fixture (a config naming a nonexistent file must fail).
HISTORY:    r1 open (design-adversary)
            -> r1 proposed (advocate: vitest.config.ts keeps thresholds as literal plain-path keys (guard 3 still sees the numbers), exports missingFiles(paths, exists) and throws at load if a key names a missing file (renaming access.ts gave 'Startup Error… coverage thresholds name files that do not exist', rc 1); src/coverage-policy.test.ts is the negative fixture)
            -> r1d verified (design-adversary delta pass r1: config throws at load on a missing file; coverage-policy.test.ts holds the negative fixture and asserts policyFiles contains access, deeplink and availability, which closes the key-deletion gap guard 3 misses; spike suite 86 tests + 1 expected fail, rc 0; not run: the rename-triggered throw itself)

[OBJ-4] candidate: A | severity: major | status: verified
CLAIM:      The access.test.ts mock design asserts wiring rather than behaviour and breaks on a legitimate refactor while missing the case that matters.
EVIDENCE:   Adding a behaviour-preserving option (relationLoadStrategy: "join") to access.ts turned the spike test red on toHaveBeenCalledWith; the factory returns an untyped fake; tests.md says assert behaviour, not structure.
SCENARIO:   A harmless query change turns CI red; the maintainer "updates the test", the weakening habit the rules warn against; the mock drifts from the real client silently.
BAR:        Assert only the returned ListLookup for the four cases; type the fake as Pick<PrismaClient["wishlist"], "findUnique">, or extract a pure decideAccess; if the mock stays, say it proves the decision table, not the query.
HISTORY:    r1 open (design-adversary)
            -> r1 proposed (advocate: assert only the returned ListLookup, no toHaveBeenCalledWith; the db.js fake is typed to the one contract that matters (relation absent without include.editors); fixtures typed from generated Prisma types; mutation run: relationLoadStrategy join stays green (50/50), dropping include / isOwner=true / swapped roles / dropped deny branch all red; claim stays: proves the decision table and the include contract, not the real query)
            -> r2d verified (design-adversary delta pass r2: relationLoadStrategy addition stayed green (6/6); dropping include failed 5/6, isOwner=true 2, swapped roles 3, dropped deny branch 1, canEditGifts: isOwner 1, && to || 3; tests assert returned values only; residual accepted: the fake is not tied to PrismaClient["wishlist"], so drift from the real client is caught only by verify:flows)

[OBJ-5] candidate: A | severity: major | status: verified
CLAIM:      A's dormant flows step would fail on its first real run and weakens the required `quality` job in ways ADR 0002 excludes.
EVIDENCE:   the sketched step sets only DATABASE_URL, but src/bot.ts:20-21 throws without BOT_TOKEN and harness.ts:28 calls getBot() at import; ADR 0002 says Dependabot PRs "run the same ci.yml, which needs no secrets"; ci.yml's header says CI has no secrets; concurrency is per ref so two PRs would both deleteMany four tables in one staging database; job-level env exposes the secret to `npm ci`.
SCENARIO:   Months later the owner adds the secret and the first run fails on a missing BOT_TOKEN, red on the required check; a cold start or shared staging DB makes `quality` flaky.
BAR:        Do not put flows in `quality`. If in ci.yml at all: step-scoped env, BOT_TOKEN dummy, a global concurrency group, a SKIPPED line in the step summary; the stronger option is a separate workflow.
HISTORY:    r1 open (design-adversary)
            -> r1 proposed (advocate: flows are NOT in `quality`: .github/workflows/flows.yml is new, workflow_dispatch only (no schedule), permissions contents: read, concurrency group staging-database (no cancel), first step is a preflight that exits 1 with ::error:: if the secret is empty (step-scoped env, npm ci never sees it), dummy step-scoped BOT_TOKEN (reproduced: without it tsx run.ts dies at bot.ts:21), no second staging check (assertStaging stays the only door), no migrate step (documented precondition); actionlint rc 0; ci.yml gets no secrets; main-protection check rc 0)
            -> r1d verified (design-adversary delta pass r1: flows.yml trigger is workflow_dispatch only; the secret is set only in the preflight and run steps so npm ci never sees it; dummy BOT_TOKEN is safe because assertStaging (harness.ts:208) refuses any database without 'staging' before every deleteMany; actionlint not installed, advocate's rc 0 unverified; residual accepted: anyone with write access can dispatch a branch's workflow and reach the secret)

[OBJ-6] candidate: all | severity: major | status: verified
CLAIM:      "What the owner loses" is not stated: under every candidate nothing gates merges for promise, reservation or surprise behaviour.
EVIDENCE:   flows are the only place those behaviours are checked (about 94 assertions); A never runs them until a secret exists; B only by dispatch or weekly; C is speculative (db.ts:9 uses PrismaNeon).
SCENARIO:   The maintainer sees a green `quality` and assumes flows were checked.
BAR:        Write the reason and the gap in the workflow itself (no staging DB, no secret), and give the owner one concrete local gate (run verify:flows before merging anything touching src/features/ or prisma/).
HISTORY:    r1 open (design-adversary)
            -> r1 proposed (advocate: gap written where a maintainer meets it: ci.yml comment block 'NOT checked here: npm run verify:flows…' with the local gate, flows.yml header, CONTRIBUTING.md:18 corrected, PR template gets npm test / verify:flows checkboxes, PR body 'What is not guarded'; README.md and docs/FLOWS.md untouched (owner edits))
            -> r2d open (design-adversary delta pass r2: the gap statement is present and true in the ci.yml comment block and the flows.yml header, and CONTRIBUTING.md names the local gate; MISSING 1: the promised PR-template checkboxes are not in the rehearsal range (.github/pull_request_template.md unchanged); MISSING 2: two sentences are false on that range: the ci.yml step comment ('npm test is also what the pre-push hook runs (TEST_UNIT)') and CONTRIBUTING.md ('the pre-push hook and CI run the same command'), because .claude/kit.md still has TEST_UNIT none and .githooks/pre-push exits 0 on none)
            -> r3 proposed (orchestrator-as-integrator: both gaps are omissions of the REHEARSAL range, not of the design; the implementation range adds them: commit 3 edits .claude/kit.md (TEST_UNIT test, TEST_DIR src) so the two sentences become true, and commit 4 edits .github/pull_request_template.md (npm test and, for src/features/, api/ or prisma/, verify:flows checkboxes) and CONTRIBUTING.md; to be ruled by the review pass against the committed diff by running `git diff origin/main --name-only`, `grep TEST_UNIT .claude/kit.md` and `.githooks/pre-push` printing 'kit pre-push: npm run test')
            -> r3d verified (review pass r1 (ledger): the diff contains .claude/kit.md (TEST_UNIT test, TEST_DIR src), the PR template with npm test and verify:flows checkboxes, CONTRIBUTING.md without 'юніт-тестів немає' and with a Tests section stating the gap and the local gate; the ci.yml comment and the flows.yml header state the gap; README.md and docs/FLOWS.md untouched; the ~94 assertion figure is true (49 edges.ts + 45 core.ts))

[OBJ-7] candidate: all | severity: major | status: verified
CLAIM:      Scrape tests written against main will be discarded when the owner's uncommitted rewrite lands, and package.json will conflict.
EVIDENCE:   the owner's working tree has scrape.ts at 507 changed lines (removes plausiblePrice, PRICE_NEAR_CURRENCY, priceFromJsonLd; adds priceAmount/priceCurrency; price becomes a canonical "12 999 ₴" string), plus scripts/scrape/ and a verify:scrape script directly under verify:flows in package.json.
SCENARIO:   Tests asserting price strings go red on the owner's merge; fixing them means rewriting (wasted) or loosening (weakening).
BAR:        Restrict scrape tests to what survives the rewrite (title, og:title fallback, relative og:image resolved against finalUrl, store from hostname, null when empty), assert nothing about price format, keep the package.json script lines away from the verify:* hunk, and tell the owner the expected conflict.
HISTORY:    r1 open (design-adversary)
            -> r1 proposed (advocate: scrape.test.ts asserts no price value/format: og:title -> <title> fallback, relative og:image resolved against finalUrl, javascript: images dropped, og:site_name else host without www, null for empty page, SSRF table; suite run against the owner's working-tree scrape.ts and price.ts: passes as on main; git merge-file of the owner's package.json with the plan gives 0 conflicts (my script lines after lint, theirs after verify:flows); no coverage threshold on scrape.ts)
            -> r1d verified (design-adversary delta pass r1: git merge-file of the plan's package.json with the owner's working-tree one gives 0 conflicts; scrape.test.ts asserts no price format; not run by the adversary: the suite against the owner's tree (advocate's run taken as given); note: package-lock.json will need regenerating after merge, 0 conflicts on package.json does not cover it)

[OBJ-8] candidate: all | severity: major | status: verified
CLAIM:      The deeplink "round-trip property" is close to a tautology and would not catch a change that breaks links already handed out.
EVIDENCE:   deeplink.ts:1-3, 27-39: parse(encode(x)) passes for any prefix constants as long as both change together.
SCENARIO:   `list_` renamed to `l_` in both places: all tests pass at 100% coverage while every shared t.me/bot?start=list_… link and every res_/ed_ token in chat histories stops working.
BAR:        Golden literals ("list_abc" -> {type:"list",slug:"abc"}, likewise res_ and ed_), unknown prefixes and empty/undefined -> {type:"none"}; keep the property as a supplement.
HISTORY:    r1 open (design-adversary)
            -> r1 proposed (advocate: deeplink.test.ts pins literals (list_abc123, res_r-42, ed_tok3n; list_res_abc -> slug res_abc; undefined, empty, hello, List_abc, listabc, x_list_abc -> none), encoders and t.me links as literals; round trip kept as a supplement; mutation list_->l_ gave 4 failures, res_->r_ rc 1)
            -> r2d verified (design-adversary delta pass r2: list_->l_ failed 4 tests, res_->r_ 2, ed_->e_ 3; golden literals at deeplink.test.ts:16-18, 24, 27, 37-44)

[OBJ-9] candidate: all | severity: minor | status: verified
CLAIM:      `kit doctor` readiness-tests is a weak proof of "done": it passes vacuously in this checkout because the design log's directory is named `test`.
EVIDENCE:   doctor.sh _doctor_test_files counts every file under any directory named test; running kit doctor in wt-4 printed "1 test file(s)" for docs/design/objections/test/….
SCENARIO:   The criterion is green whether or not a Vitest file exists.
BAR:        Verify against the diff: *.test.ts files exist and `npm run test` executes N tests (Vitest fails on "No test files found" without --passWithNoTests).
HISTORY:    r1 open (design-adversary)
            -> r1 proposed (advocate: acceptance measured on the diff and the runner, not on doctor: >=6 *.test.ts tracked files, >=80 tests via vitest json reporter, `npx vitest run src/none-here` exits non-zero (no vacuous green), no --passWithNoTests; doctor kept as a supplementary line)
            -> r2d verified (design-adversary delta pass r2: `env -u DATABASE_URL -u BOT_TOKEN npm test` exits 0 with 6 files and 107 tests; `npx vitest run src/none-here` exits 1; no --passWithNoTests in package.json)

[OBJ-10] candidate: A,B,C | severity: minor | status: verified
CLAIM:      The tsconfig split (exclude, tsconfig.test.json, doubled typecheck) buys nothing and adds maintenance.
EVIDENCE:   dist/ is gitignored; vercel.json has no buildCommand so Vercel runs vercel-build (prisma generate && prisma migrate deploy) and never `npm run build`; no runtime use of dist/ in README/CONTRIBUTING/api/scripts/.github; the spike typechecked and linted with tests included, rc 0.
SCENARIO:   The only effect is that an unused dist/*.test.js does not exist; the cost is a second config that can drift.
BAR:        Keep tests in the main tsconfig.json; a tsconfig.build.json only if cleaner output is wanted; keep tests out of api/ (they would become serverless functions).
HISTORY:    r1 open (design-adversary)
            -> r1 proposed (advocate: adopted: tsconfig.json and eslint.config.mjs unchanged; build emits dist/**/*.test.js (gitignored, unused); the explicit test.include is load-bearing because Vitest 5's default exclude is only node_modules and .git; no tests under api/)
            -> r2d verified (design-adversary delta pass r2: tsconfig.json and eslint.config.mjs byte-identical to wt-4; typecheck passes; build emits gitignored unused dist/**/*.test.js)

[OBJ-11] candidate: all | severity: minor | status: verified
CLAIM:      The Vitest 5 line is five days old and needs a newer Node than the repo declares.
EVIDENCE:   vitest 5.0.1 engines.node "^22.12.0 || ^24.0.0 || >=26.0.0"; the repo declares ">=20"; 4.1.11 is available.
SCENARIO:   On Node 20 the pre-push hook fails, and the owner bypasses it with KIT_SKIP_HOOKS=1.
BAR:        Raise engines to ">=22.12" in the same change (CI runs 22) or pin Vitest 4.x; say so in the PR.
HISTORY:    r1 open (design-adversary)
            -> r1 proposed (advocate: accepted-risk proposed: Vitest ^5.0.1 + @vitest/coverage-v8 ^5.0.1 (peer-pinned together); pinning 4.1.9-4.1.11 fails on npm 10.9.4 ('Cannot read properties of null (reading edgesOut)', reproduced), only 4.0.x remains; engines.node >=22.12 (prisma 7.9.1, vite 7, eslint 10 already need it; Vercel maps both >=20 and >=22.12 to 24.x); fallback vitest@4.0.18 pinned; unverified: the runner's npm version)
            -> r1d verified (design-adversary delta pass r1: `npm i -D vitest@4.1.11` fails with 'Cannot read properties of null (reading edgesOut)' on npm 10.9.4/Node 22.22.1; 5.0.1 installs and `npm ci` from the lockfile works (417 packages); dist-tags latest is 5.0.1; not verified: the Vercel mapping to 24.x (docs not fetched) and the engines of prisma/vite/eslint (advocate's `npm view` output not re-run); runner npm version accepted, the lockfile makes `npm ci` independent of the resolver quirk)

[OBJ-12] candidate: all | severity: minor | status: verified
CLAIM:      The scrape.ts SSRF guard is the security-relevant part of that file but is not exported, and all candidates test "parse only".
EVIDENCE:   isBlockedAddress and assertPublicUrl block loopback, 169.254 metadata, private ranges, CGNAT and IPv4-mapped IPv6; fetchLinkPreview is reached from gifts.ts:252 with user-pasted URLs; the owner's rewrite may restructure it.
SCENARIO:   A refactor drops the ::ffff: branch or the a>=224 check; `http://[::ffff:169.254.169.254]/` passes and no test notices.
BAR:        Export isBlockedAddress (pure) and test a table of addresses; coordinate with the owner's rewrite first, since the export lands on a file they are mid-editing.
HISTORY:    r1 open (design-adversary)
            -> r1 proposed (advocate: isBlockedAddress is NOT exported (file is mid-rewrite by the owner); the guard is tested through fetchLinkPreview with stubbed fetch and mocked node:dns/promises (19 blocked inputs, mixed public/private DNS answers, redirect re-check, boundary allows); FINDING: new URL('http://[::ffff:169.254.169.254]/').hostname is '[::ffff:a9fe:a9fe]' so the regex ^::ffff:(\d+\.\d+\.\d+\.\d+)$ never matches and the URL is fetched - on main and in the owner's rewrite; commit 2 records it as it.fails (not .skip/.only, so guard 2 does not match), commit 5 fix(scrape) adds 7 lines and flips it to it; merges with 0 conflicts on the owner's tree; the fix commit is droppable)
            -> r1d open (design-adversary delta pass r1: D2 reproduced (`[::ffff:169.254.169.254]` -> hostname `::ffff:a9fe:a9fe`); the advocate's fix closes that form and the boundary allows still pass (20 addresses run; the it.fails case goes red with 'Expect test to fail' and 35/35 pass as a plain it); STILL MISSING: `[::127.0.0.1]` (normalises to `::7f00:1`), `[::ffff:0:7f00:1]` and NAT64 `[64:ff9b::7f00:1]` are not blocked by the fixed function (rated minor: the first two do not route to loopback on Linux, NAT64 depends on the network) - block them or write the bound into the PR and test comment; `it.fails` passes on any throw, so give it a positive companion (the same fetch with a public literal succeeds) so a broken setup cannot pass for the wrong reason; the PR body must say that dropping commit 5 keeps the vulnerability)
            -> r2 proposed (advocate: the fix now closes the class: isBlockedAddress parses the IPv6 literal into 8 numeric groups (ipv6Groups) and compares numbers: ::/96 wholesale (covers ::, ::1, ::127.0.0.1), fe80::/10 and fc00::/7 by bit mask (the old startsWith('fe80') missed febf::1), the last 32 bits of ::ffff:0:0/96, ::ffff:0:0:0/96 and 64:ff9b::/96 run through the same IPv4 blocklist, 64:ff9b:1::/48 wholesale, 6to4 2002::/16 reads bits 16-47, unparseable -> blocked; +33/-7 lines in src/lib/scrape.ts; public addresses unchanged (2001:4860:4860::8888, ::ffff:8.8.8.8, 64:ff9b::8.8.8.8, 2002:808:808::1 and the IPv4 boundary allows still pass); full suite 6 files / 107 tests; the new table against the UNFIXED origin/main scrape.ts gives 14 failed / 41 passed (incl. [::ffff:169.254.169.254], [::127.0.0.1], [::ffff:0:127.0.0.1], [64:ff9b::127.0.0.1]); nine mutants (one branch removed at a time) each killed by >=1 row; one survivor, fail-open on unparseable input, is unreachable because isIP already validated (dead defensive code, accepted); git merge-file against the owner's working-tree scrape.ts rc 0, 0 conflict markers (owner's copy still has the old function at lines 42-64, hunks disjoint; snapshot of a tree still being edited); it.fails is DROPPED: commit 2 holds the 14 open forms as a characterisation test 'KNOWN DEFECT: <url> is still fetched' asserting probe(url) equals REACHED ({connected:true,title:'Ok'}), the exact outcome of the public-address control rows in the same file, so a broken setup (removing vi.stubGlobal('fetch')) turns 28 tests red instead of looking green; on the fixed file exactly those 14 fail, which is the cue that commit 5 moves them to the refused table (23 changed lines); dropping commit 5 keeps the vulnerability and the PR body says so; residual bound written in the PR body and above the table: DNS rebinding between resolve and fetch (already documented at scrape.ts:76-79), Teredo 2001::/32 and other tunnel prefixes, deprecated fec0::/10 and IPv6 multicast, no connect-time IP pinning; unverified: whether real Linux stacks route ::ffff:0:127.0.0.1, NAT64 or 6to4 to loopback (blocked regardless))
            -> r2d verified (design-adversary delta pass r2: characterisation test on the fixed file 14 failed|41 passed (exactly the 14 KNOWN DEFECT rows), on the base file 55/55, final test on the fixed file 55/55, without vi.stubGlobal('fetch') 28 failed (a broken setup goes red); six of seven mutants killed, the survivor (zone-id split) is dead code because a zone id cannot arrive through new URL; differential fuzz over 312 IPv4 addresses written as mapped, SIIT, NAT64 and 6to4 in dotted/hex/uppercase/full-length/zero-padded/mixed spellings, raw and after a new URL().hostname round trip: 11,928 spellings, 0 mismatches, plus random fe80/10 and fc00/7 checks 0 mismatches; decimal/octal/hex/short IPv4 hosts all normalise to a blocked dotted quad; no failing literal found; not blocked, already in the residual list: fec0::1, ff02::1, 2001::1 (Teredo), DNS rebinding; note, not in the list and pre-existing: 192.0.0.0/24 and 192.0.2.0/24)
            -> r3 note: the split into two pull requests recommended by the arbiter was REVERSED after the fresh-eyes review (see OBJ-17): the class fix (commit 2) and the tests in their final state (commit 3) ship in ONE pull request, so no commit or file carries a passing test that pins the unfixed behaviour; the characterisation ('KNOWN DEFECT') rows and it.fails no longer exist anywhere on the branch

[OBJ-13] candidate: A,B | severity: minor | status: verified
CLAIM:      The plan does not spell out the [ci-change] requirement or the checks that guard the `quality` job.
EVIDENCE:   kit-ci-guards.sh:171-180 fails any .github/workflows change without [ci-change] in a commit body (test:-typed commits defeat the "all typed" escape); main-protection.sh check requires the exact `^  quality:` header and no name:/strategy:/paths:.
SCENARIO:   kit-guards turns red for an avoidable reason, or a `name: Quality` added to the job leaves every PR waiting for a check called quality.
BAR:        [ci-change] in a commit body; run `bash scripts/main-protection.sh check` and `bash scripts/kit-ci-guards.sh` in verification; do not rename or restructure `quality`.
HISTORY:    r1 open (design-adversary)
            -> r1 proposed (advocate: commit 3 is typed ci: and carries [ci-change] in its body (guard 5 reads the whole range); `quality` is not renamed/restructured, only a step added (main-protection.sh check rc 0); guards 2,3,4,6,7 walked by re-running their regexes; verification runs main-protection check and kit-ci-guards (the latter unverified-by-construction by the advocate))
            -> r1d open (design-adversary delta pass r1: guard 2 does not match `it.fails(` and guard 3 sees no lowered number, so D6 holds for the regexes; STILL MISSING: run `bash scripts/kit-ci-guards.sh` and `bash scripts/main-protection.sh check` end to end on the assembled commit range and cite the output; a regex walk is not the script)
            -> r2 proposed (advocate: guard run END TO END in a throwaway clone of wt-4 on branch test/vitest-guards-rehearsal (no bypass variable; the kit hook resolves the target repo from `git -C <path>`), origin/main pinned to c7bc192, 5 commits (build(deps), test, ci with [ci-change] in the body, docs, fix(scrape)): (A) `KIT_BASE_REF=origin/main bash scripts/kit-ci-guards.sh` -> 0 finding(s), rc 0, and `bash scripts/main-protection.sh check` rc 0; (B) same range without the token: 'FAIL CI edited without [ci-change]' listing ci.yml and flows.yml, rc 1 (the token is load-bearing); (C) an extra commit turning one `it(` into `it.skip call`: 'FAIL tests skipped or narrowed to .only', rc 1; (D) `it.fails(` -> 0 findings (no longer in the plan); correction to round 1: the ci.yml comment references .github/workflows/flows.yml, which does not exist on origin/main, so commit 3 must add it (it does, and the guard listed both files); unverified: the same range under GitHub's fetch-depth: 0 checkout)
            -> r2d verified (design-adversary delta pass r2: re-ran the guard in the rehearsal clone: 0 finding(s), `ok CI edited, flagged [ci-change]`; main-protection check ok; rh-noci FAIL 'CI edited without [ci-change]' rc 1; rh-skip FAIL 'tests skipped or narrowed to .only' rc 1; the fetch-depth caveat answered by kit-guards.yml:20 (fetch-depth: 0))

[OBJ-14] candidate: all | severity: minor | status: verified
CLAIM:      Time-dependent date tests and 100% thresholds are brittle and easy to satisfy vacuously.
EVIDENCE:   dates.ts:32 calls new Date() inside todayUtc(), reached by nextOccurrence, isPast, daysUntil and the relative words; 100% branch coverage forces tests for dead-looking paths; v8 line coverage passes with assertion-free tests.
SCENARIO:   A test without fake timers breaks on New Year's Eve or leap day; under a threshold someone adds a shallow test to reach the number.
BAR:        Fake timers in every clock-dependent test; thresholds a few points below actual per file, not 100%; explicit behaviour cases ("8 березня" in April means next year; 31.02 gives null).
HISTORY:    r1 open (design-adversary)
            -> r1 proposed (advocate: every clock-reading dates test pins time with vi.useFakeTimers/setSystemTime and restores; explicit cases (8 березня in April -> next year; 10 квітня on 10 April stays; 31.02.2026, 29.02.2027, 32.01.2026 -> null; two-digit year; month stems; New Year's Eve 23:59:59Z; isPast/daysUntil at 23:30Z); property loop over every day of 2027-2029 incl. 2028-02-29; thresholds derived from measurement (floor(measured) minus ~5, rounded to 5, never 100): dates 95/95/90/90, others 95/95/95/90; assertion-free tests can still meet coverage: accepted, bounded by a six-mutant battery in the PR body)
            -> r2d verified (design-adversary delta pass r2: no bare new Date()/Date.now() in the tests except as the argument to setSystemTime (dates.test.ts:9-13 uses useFakeTimers/useRealTimers); thresholds 90-95, never 100; measured 98.79 statements / 97.91 branches, above every floor)

[OBJ-15] candidate: all | severity: note | status: verified
CLAIM:      Pre-push runs `test`, and coverage thresholds run only in CI, so a miss is found after the push.
EVIDENCE:   .githooks/pre-push runs RUNNER + TEST_UNIT and nothing else.
SCENARIO:   The push succeeds and CI is red; not serious for a two-person bot.
BAR:        Accept, or point TEST_UNIT at the script that includes coverage (the suite is fast).
HISTORY:    r1 open (design-adversary)
            -> r1 proposed (advocate: `test` is `vitest run --coverage` and TEST_UNIT is `test`: pre-push and CI run the identical command; measured 0.84 s; fast loops use test:watch or npx vitest run <file>)
            -> r2d open (design-adversary delta pass r2: the answer 'TEST_UNIT is test; pre-push and CI run the identical command' is not in the rehearsal diff (`git diff origin/main..HEAD --name-only | grep -c '^\.claude'` returns 0); the test script itself is correct: vitest run --coverage)
            -> r3 proposed (orchestrator-as-integrator: the implementation range includes the .claude/kit.md edit in commit 3 (see OBJ-6); the review pass cites `.githooks/pre-push` printing 'kit pre-push: npm run test')
            -> r3d verified (review pass r1 (ledger): `test` is `vitest run --coverage` and .githooks/pre-push runs exactly `npm run test` (criterion 25); filtered runs do not enforce thresholds (R8, stated in CONTRIBUTING.md))

[OBJ-16] candidate: all | severity: note | status: verified
CLAIM:      Product verdict: worth doing, but the suite should be chosen by what breaks the product (availability, golden deep links, dates), not by what is easy to import; C is a large spike to protect a bot with two real users; B's separation of flows fits ADR 0002 best but still leaves a false sense of coverage unless the gap is written down.
EVIDENCE:   the adversary's product paragraph, round 1.
SCENARIO:   Effort lands on the least valuable test while the highest-value rule stays unguarded.
BAR:        The chosen plan orders tests by product risk and states the unguarded gap.
HISTORY:    r1 open (design-adversary)
            -> r2d verified (design-adversary delta pass r2: the suite covers availability, access, deeplink, scrape and dates and the gap statement exists (see OBJ-6 for two flaws, now answered))

            -> r1 proposed (advocate: suite and commit order follow product risk (availability, access, deeplink, scrape, dates, policy); C not chosen; B's separation of flows adopted; the gap is stated (OBJ-2, OBJ-6); PR uses Refs #4)

[OBJ-17] candidate: A | severity: major | status: proposed
CLAIM:      The branch as first built ships a live SSRF hole on a public repository as passing tests, and publishes the bypass spellings before any fix exists; its comment points at a commit that is not in the range.
EVIDENCE:   fresh-eyes review r1: 14 rows named 'KNOWN DEFECT: %s is still fetched' expect REACHED for http://[::ffff:169.254.169.254]/ and its siblings; `git log origin/main..HEAD` had no fix commit; src/lib/scrape.ts unchanged; ledger N3: no issue and no fix branch existed, and the OBJ-12 HISTORY described a commit 5 that was not in the range.
SCENARIO:   After a squash merge main carries a test that names the hole and lists the URLs that exploit it, and the fix waits on a separate pull request that may never land (R10); anyone reading the public repository learns the bypass before it is closed.
BAR:        The hole is not published unfixed: the fix ships with the tests, or the tests do not describe it.
HISTORY:    r3 open (design-adversary review pass r1: fresh eyes, confirmed by the ledger as N3) -> r3 proposed (integrator: the decision record's split is reversed, see its Amendment: branch rebuilt so that the order is build(deps), fix(scrape), test, ci, docs; the tests exist only in their final state (the address table refuses the fourteen spellings), so no commit and no file contains a passing 'KNOWN DEFECT' test; criterion 22 is dropped for this branch and criteria 36-39 apply to it; nothing was pushed before this change)

[OBJ-18] candidate: A | severity: major | status: proposed
CLAIM:      The redirect test does not detect `redirect: "manual"` being changed to "follow", which would silently disable the per-hop SSRF re-check; three boundary mutants also survive.
EVIDENCE:   fresh-eyes review r1: mutants redirect manual->follow, MAX_REDIRECTS 3->100, `b === 18 || b === 19`->`b === 18` and `b <= 127`->`b <= 126` all SURVIVED (107 tests green); the existing test mocks fetch to always answer 302 and never observes the option.
SCENARIO:   Someone "simplifies" the manual redirect loop to redirect: "follow"; a public URL that bounces to 169.254.169.254 is then followed with no re-check and CI stays green.
BAR:        Tests that fail on each of the four mutants, through behaviour, and the four mutants in the battery.
HISTORY:    r3 open (design-adversary review pass r1: fresh eyes) -> r3 proposed (integrator: a fake fetch that behaves like the real one (asked to follow it lands on the final page, otherwise it hands back the 302) makes the option observable through behaviour: 'never lets fetch follow a redirect on its own'; 'gives up on a redirect chain longer than the cap' (a chain that would end after six hops must return null) and 'follows a short chain of public redirects to the page'; rows for 198.19.255.255 and 100.127.255.255 (refused) and 198.17.255.255, 198.20.0.1 (allowed); scripts/mutation-battery.sh scrape-ipv4 now has the four mutants and kills 8/8, the ssrf class kills 10/10 including the code as it was on origin/main; suite 114 tests)

[OBJ-19] candidate: all | severity: major | status: proposed
CLAIM:      The committed range fails the anti-gaming guard: the design-log commit quotes a skipped-test construct, so `kit-guards` goes red and the branch's own "0 findings" claim is false.
EVIDENCE:   ledger N1 and fresh-eyes finding 3: `KIT_BASE_REF=origin/main bash scripts/kit-ci-guards.sh` on b409d4b printed 'FAIL tests skipped or narrowed to .only' (the log line quoted the construct followed by a backtick, which guard 2's regex matches); with the docs commit dropped it printed 0 findings. The kit-guards workflow runs the base branch's copy of the guard, so it cannot be fixed inside the pull request.
SCENARIO:   The PR opens with a red non-required check for a reason unrelated to the tests, training the owner to ignore it or to add [ci-change] or a guard edit as a workaround.
BAR:        The guard reports 0 findings on the final range as it will be pushed, cited from a real run.
HISTORY:    r3 open (design-adversary review pass r1: ledger, fresh eyes) -> r3 proposed (integrator: every quotation of the construct in docs/design is reworded so that no `.skip call` / `.only call` is followed by a quote or backtick; the guard is re-run end to end on the final range and its output is cited in docs/verification)

[OBJ-20] candidate: A | severity: minor | status: proposed
CLAIM:      flows.yml runs whatever code is on the dispatched ref with the staging secret in its environment, and there is no environment gate.
EVIDENCE:   fresh-eyes review r1: `on: workflow_dispatch` accepts any branch; that branch's harness.ts and run.ts execute with DATABASE_URL set; assertStaging() can be edited away by that branch.
SCENARIO:   Anyone with write access pushes a branch that prints the secret or skips the name check and dispatches it (GitHub masks the exact string; a base64 print gets past it). Low exposure in a solo repository today, growing with the first collaborator.
BAR:        The secret is reachable only from reviewed code, or the gap is stated and bounded.
HISTORY:    r3 open (design-adversary review pass r1: fresh eyes) -> r3 proposed (integrator: the job declares `environment: staging`, and the workflow header says why a github.ref check written in this file would NOT be a boundary (the branch can edit the file) and that the restriction is the owner's to configure: create the `staging` Environment with deployment branches limited to main and store STAGING_DATABASE_URL there; CONTRIBUTING.md says so; accepted-risk until then: any writer can dispatch a branch and read the secret; bound: the workflow fails at its first step until the secret exists at all)

[OBJ-21] candidate: all | severity: minor | status: proposed
CLAIM:      The lockfile's root `engines` still says >=20 while package.json says >=22.12.
EVIDENCE:   ledger N2: package-lock.json line 33; `npm install --package-lock-only --ignore-scripts` on a copy diffs exactly that line.
SCENARIO:   The next `npm install` dirties the tree and criterion 29's "lockfile in sync" is not strictly true.
BAR:        The lockfile is regenerated in the dependency commit.
HISTORY:    r3 open (design-adversary review pass r1: ledger) -> r3 proposed (integrator: regenerated with `npm install --package-lock-only --ignore-scripts` and folded into the dependency commit)

[OBJ-22] candidate: A | severity: note | status: proposed
CLAIM:      flows.yml pins actions by moving tag although .claude/rules/github-actions.md says to pin third-party actions to a SHA, and this workflow receives a secret.
EVIDENCE:   ledger N4: actions/checkout@v4 and actions/setup-node@v4, as in ci.yml.
SCENARIO:   A compromised tag runs in a job that holds the staging secret.
BAR:        Stated and accepted, or pinned.
HISTORY:    r3 open (design-adversary review pass r1: ledger) -> r3 proposed (integrator: accepted-risk: both are GitHub-owned actions and ci.yml uses the same tags; bound: the job is manual-only and cannot run until the secret exists; pinning both workflows to SHAs is a separate change)

## Round Delta — round 1

New load-bearing claims:
- [D1] "npm 10.9.4 cannot install vitest 4.1.9-4.1.11 ('Cannot read properties of null (reading edgesOut)' in #loadPeerSet); 4.0.18 and 5.0.1 install" — supports OBJ-11 — evidence: command output reproduced in a fresh directory and in a copy of wt-4
- [D2] "new URL('http://[::ffff:169.254.169.254]/').hostname is '[::ffff:a9fe:a9fe]', so isBlockedAddress returns false and fetchLinkPreview fetches it; same on main and in the owner's uncommitted rewrite" — supports OBJ-12 (security) — evidence: a failing plain `it` (AssertionError: expected {title:'Ok'} to be null) and scrape.ts:42-66,72-93
- [D3] "renaming a file named in coverage.thresholds makes vitest fail at startup via a load-time throw in vitest.config.ts; Vitest itself does not fail on an empty match" — supports OBJ-3 — evidence: reproduced (rc 1 with the renamed file; rc 0 without the throw)
- [D4] "the plan's package.json lines and the owner's uncommitted package.json merge with 0 conflicts (git merge-file); the tests pass against the owner's working-tree scrape.ts/price.ts" — supports OBJ-7 — evidence: merge-file and a run on the owner's tree
- [D5] "engines.node >=22.12 is nearly free: prisma 7.9.1, vite 7 and eslint 10 already require it; Vercel maps >=20 and >=22.12 to 24.x, Node 20 deprecated 2026-10-01" — supports OBJ-11 — evidence: npm view engines, Vercel docs table
- [D6] "kit-ci-guards guard 2 does not match `it.fails(`; guard 5 reads all commit bodies of the range so one [ci-change] suffices; guards 2,3,4,6,7 do not fire on the plan" — supports OBJ-12/OBJ-13 — evidence: grep rc 1 on the regexes; the script itself was NOT run end to end (advocate: unverified-by-construction)

New decisions or mechanisms:
- [D7] flows are moved out of `quality` into a new dispatch-only .github/workflows/flows.yml with a preflight that fails loudly without STAGING_DATABASE_URL, step-scoped env, a dummy BOT_TOKEN, concurrency group staging-database, no migrate step (candidate B's transplant; not in any candidate as such)
- [D8] `test` is `vitest run --coverage`; TEST_UNIT is `test`; TEST_DIR becomes `src`
- [D9] test files ordered by product risk: availability, access, deeplink, scrape, dates, coverage-policy; access.test.ts uses a typed include-honouring db.js fake and asserts only returned values
- [D10] a droppable fifth commit `fix(scrape)` adds 7 lines to src/lib/scrape.ts (the owner's file in flight) and flips the it.fails to it
- [D11] `it.fails` is used as a known-defect marker for the SSRF bypass until commit 5
- [D12] the PR says `Refs #4`, not Closes: Part A only; the gap (handler-level access rules, surprise mode, promise/reservation state) stays guarded by verify:flows only
- [D13] thresholds are derived from measured coverage (floor minus ~5, rounded to 5, never 100): dates 95/95/90/90, availability/deeplink/access 95/95/95/90; scrape.ts and DB-bound files carry none
- [D14] CONTRIBUTING.md:18 and the PR template are edited to state the gates; README.md and docs/FLOWS.md are not touched

New dependencies or services:
- [D15] devDependencies vitest ^5.0.1 and @vitest/coverage-v8 ^5.0.1 (peer-pinned to each other); optional repository secret name STAGING_DATABASE_URL (absent today)

Unchanged: candidates A/B/C as framed; OBJ-2's rejection of extracting a pure predicate is a decision the delta pass should rule on.

## Round Delta — round 2

New load-bearing claims:
- [D16] "isBlockedAddress compared as numbers closes the IPv4-embedding IPv6 class (mapped, SIIT, NAT64, 6to4, ::/96) without changing any public-address outcome" — supports OBJ-12 (security) — evidence: 107-test suite; the new table gives 14 red on unfixed origin/main scrape.ts; nine one-branch mutants each killed; public control rows still pass; the owner's working-tree scrape.ts still has the old function
- [D17] "git merge-file of the fixed scrape.ts against the owner's working-tree scrape.ts is rc 0 with 0 conflict markers" — supports OBJ-7/OBJ-12 — evidence: command output on a snapshot of a tree still being edited
- [D18] "kit-ci-guards.sh run end to end on the assembled 5-commit range: 0 findings with [ci-change]; fails without it; fails on it.skip" — supports OBJ-13 — evidence: outputs (A)-(C) in the advocate's round 2, produced in a throwaway clone on a feature-named branch without any bypass variable; unverified: under GitHub's fetch-depth: 0 checkout

New decisions or mechanisms:
- [D19] the `it.fails` marker is dropped; commit 2 carries a passing characterisation test ("KNOWN DEFECT: <url> is still fetched") that asserts the same REACHED outcome as the public control rows, so a broken test setup cannot pass for the wrong reason; commit 5 moves the 14 rows to the refused table
- [D20] commit 5 grew from 7 to +33/-7 lines in src/lib/scrape.ts (the owner's file in flight): a 16-line ipv6Groups helper plus the rewritten IPv6 branch; it changes behaviour only toward more blocking (::/96 wholesale, fe80::/10 by mask, 64:ff9b:1::/48, unparseable blocked)
- [D21] commit 3 also adds .github/workflows/flows.yml (the ci.yml comment references it); commit 4 adds a "Tests" section to CONTRIBUTING.md, whose language needs a decision (the file is Ukrainian; the rehearsal text is English)
- [D22] residual bound accepted and written down: DNS rebinding, Teredo/tunnel prefixes, fec0::/10, multicast, no connect-time pinning

Unchanged: everything else from round 1. NOT yet ruled by any delta pass and to be judged now against the assembled implementation (scratchpad/spike-4e): OBJ-1, OBJ-4, OBJ-6, OBJ-8 (majors) and OBJ-9, OBJ-10, OBJ-14, OBJ-15, OBJ-16 (minor/note).

