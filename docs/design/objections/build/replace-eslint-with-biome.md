route: lite
research: Biome current major and config schema; coverage of the two ESLint rules in use; noFloatingPromises status (done by the orchestrator, results in the plan)
autonomy: autonomous
lenses: none activated
why: dev tooling only (a config, a script swap, three dependencies removed, no runtime surface), reversible, but with several real decisions (formatter scope, rule mapping, floating promises, the owner's uncommitted files hitting the pre-commit hook) and a deviation from catalog entry T81 that must be recorded. Orchestrator plays advocate (lite route). Issue: #7.

# Facts measured by the orchestrator (2026-09-20)

- Biome latest is 2.5.14 (`npm view`), installed and pinned exactly. In 2.5 `linter.rules.recommended` is deprecated: `biome migrate` rewrote it to `"preset": "recommended"`.
- With the formatter and the assist (import sorting) disabled, `biome check` is lint-only, so no whole-tree reformat is needed or done (a reformat would conflict with 18 files the owner has uncommitted, and the pre-commit hook would fail their next commit on unformatted files).
- Parity with the ESLint config in use (`no-unused-vars` warn with `^_` args ignored; `no-explicit-any` off): the recommended preset already warns on `noUnusedVariables` / `noUnusedFunctionParameters` and ignores `_`-prefixed names (a probe with an unused arg, an unused local and `_ok` reported the first two only); `noExplicitAny` is set to off.
- ESLint on main today reports nothing. Biome's recommended preset on main reports 2 errors (`suspicious/useIterableCallbackReturn`: `arr.forEach((x) => lines.push(...))`, harmless), 33 warnings and 2 infos (`noNonNullAssertion` 21, `useOptionalChain` 10, `useImportType` 2, `useTemplate` 1). `useIterableCallbackReturn` is set to warn so no code has to change in files the owner is editing (`src/features/lists.ts`).
- `noFloatingPromises` (nursery since 2.0.0, default severity info) DOES work in this repository: a planted `save();` is reported, `void save()` and `await save()` are not. Enabled as `error`. It reports exactly one hit on main: `scripts/dev-polling.ts:11` `bot.start({...})` without `await` in a long-polling script (a failure of the polling loop then bypasses the `main().catch` that logs and exits 1); the fix is `await bot.start(...)`. The ESLint config never had this check (it was not type-aware), so this is a gain, not a carried-over rule.
- Carried-over ignores: generated, dist, node_modules, .kit, .claude/skills, .claude/agents; plus coverage and package-lock.json.
- On a read-only copy of the owner's uncommitted tree with the same config: 0 errors (50 warnings, 2 infos), so their next commit is not blocked by the hook.
- Removing ESLint invalidates criterion 21 of the accepted ADR 0003 (`git diff --quiet … eslint.config.mjs && npm run lint`); an accepted ADR is not edited, so a new ADR records the change.

# Plan

1. Add `@biomejs/biome` 2.5.14 (exact pin) and `biome.json` as above; `lint` becomes `biome check`; remove `eslint`, `@eslint/js`, `typescript-eslint` and `eslint.config.mjs`.
2. `scripts/dev-polling.ts`: `await bot.start(...)`.
3. Record the deviation from T81 (catalog default Oxlint) in `.claude/tastes.md` with the fingerprint from `kit tastes list`; the REASON is the owner's and is not invented: it says the owner chose Biome on 2026-09-20 (issue #7) and that no reason was given.
4. ADR 0004: the decision, the rule mapping and every downgrade, the residual warnings, and the amendment of ADR 0003 criterion 21.
5. Non-goals: no formatter, no import sorting, no rewrite of the 35 warnings, no change to CI (`ci.yml` still runs `npm run lint`), no change to the kit's vendored files.

# Acceptance criteria

- [ ] `npm run lint` exits 0 (warnings allowed, no errors).
      check: npm run lint
- [ ] ESLint is gone: no dependency, no config file, not installed.
      check: ! grep -qE '"(eslint|@eslint/js|typescript-eslint)"' package.json && [ ! -e eslint.config.mjs ] && ! npm ls eslint typescript-eslint @eslint/js 2>/dev/null | grep -qE 'eslint@|typescript-eslint@'
- [ ] Biome is pinned exactly (no range) and `lint` runs `biome check`.
      check: node -e 'const p=require("./package.json");process.exit(/^\d+\.\d+\.\d+$/.test(p.devDependencies["@biomejs/biome"])&&p.scripts.lint==="biome check"?0:1)'
- [ ] Lint-only: formatter and assist disabled, and no whole-tree reformat (the change to src, api, scripts and prisma is a handful of lines).
      check: jq -e '.formatter.enabled==false and .assist.enabled==false' biome.json && [ "$(git diff --numstat origin/main -- src api scripts prisma | awk '{a+=$1+$2} END{print a+0}')" -le 6 ]
- [ ] The ignores carried over from the ESLint config are present.
      check: jq -e '[.files.includes[]] | (index("!generated") and index("!dist") and index("!.kit") and index("!.claude/skills") and index("!.claude/agents") and index("!.claude/worktrees") and index("!**/node_modules"))' biome.json
- [ ] Parity with the old rules: an unused argument or local is reported, a `_`-prefixed one is not, `any` is allowed. Matched on rule categories, not on printed text (the printed source excerpt contains the names).
      check: d=$(mktemp -d) && cp biome.json tsconfig.json package.json "$d"/ && printf 'export function f(a: any, _b: string, c: string): number {\n  const u = 1;\n  return a;\n}\n' > "$d/t.ts" && (cd "$d" && "$OLDPWD/node_modules/.bin/biome" lint --reporter=json t.ts 2>/dev/null | jq -e '[.diagnostics[].category] | sort == ["lint/correctness/noUnusedFunctionParameters","lint/correctness/noUnusedVariables"]' >/dev/null)
- [ ] The new check bites: a planted floating promise fails the lint (exit non-zero) and `void`/`await` do not.
      check: d=$(mktemp -d) && cp biome.json tsconfig.json package.json "$d"/ && printf 'async function s(): Promise<void> {}\nexport function h(): void {\n  s();\n}\n' > "$d/bad.ts" && printf 'async function s(): Promise<void> {}\nexport async function h(): Promise<void> {\n  void s();\n  await s();\n}\n' > "$d/ok.ts" && (cd "$d" && ! "$OLDPWD/node_modules/.bin/biome" lint bad.ts >/dev/null 2>&1 && "$OLDPWD/node_modules/.bin/biome" lint ok.ts >/dev/null 2>&1)
- [ ] Lint covers the tests and `vitest.config.ts`, and `tsconfig.json` is unchanged (the intent of criterion 21 of ADR 0003, which this change amends).
      check: git diff --quiet origin/main -- tsconfig.json && npx biome check src/lib/access.test.ts vitest.config.ts >/dev/null
- [ ] The one real hit on main is fixed the way the rule suggests.
      check: grep -qE '^\s+await bot\.start\(' scripts/dev-polling.ts
- [ ] CI and the workflows are untouched (`ci.yml` still calls `npm run lint`).
      check: git diff --quiet origin/main -- .github/workflows
- [ ] The pre-commit hook still passes with Biome.
      check: bash .githooks/pre-commit
- [ ] The deviation from T81 is recorded with the current fingerprint and no invented reason.
      check: grep -q "$(kit tastes list | awk '$1=="T81"{print "fingerprint: "$4}')" .claude/tastes.md
      manual: read the T81 entry in .claude/tastes.md -> evidence: it names the owner's choice and states that no reason was given
- [ ] The owner's uncommitted tree is not blocked by the hook once it has the `scripts/dev-polling.ts` fix: the same config reports 0 errors on a read-only copy of their tree with that file replaced, and exactly 1 error (the dropped await) without the replacement.
      manual: copy the owner's tree to a temp dir, add biome.json, run `biome check` with and without the fixed dev-polling.ts -> evidence: the two counts (recorded in the verification file)
- [ ] ADR 0004 exists, lists every downgraded rule and the remaining warning counts, and says it amends criterion 21 of ADR 0003.
      manual: read docs/decisions/0004-*.md -> evidence: the sections exist

# Objection log

[OBJ-1] candidate: plan | severity: major | status: verified
CLAIM:      The criterion "Parity with the old rules" can never pass: its own `! grep -qE 'noExplicitAny|_b'` matches the `_b` inside Biome's printed source excerpt and fix diff.
EVIDENCE:   adversary ran the check through a script against the plan's own biome.json: "PARITY FAIL rc=0"; `biome lint t.ts | grep -nE 'noExplicitAny|_b'` matches lines 5, 14 and 15 (`_b: string` in the code frame); `--reporter=summary` shows only noUnusedFunctionParameters and noUnusedVariables, which is correct.
SCENARIO:   The check reports FAIL on a correct config, or someone edits the grep until it passes; either way it does not observe "_b not reported".
BAR:        Match on rule category and location, with a negative fixture.
HISTORY:    r1 open (design-adversary) -> r1 proposed (integrator: the criterion now reads `biome lint --reporter=json` and asserts the sorted list of categories equals exactly [noUnusedFunctionParameters, noUnusedVariables]; run on the correct config it passes, and on three broken configs (noExplicitAny warn, noUnusedVariables off, preset none) it is rejected)
            -> r2d verified (design-adversary review pass r1: the JSON-category parity check passes on the shipped biome.json and is rejected by five broken variants (noExplicitAny warn, noUnusedVariables off, noUnusedFunctionParameters off, preset none, options-only))

[OBJ-2] candidate: plan | severity: major | status: accepted-risk
CLAIM:      `noFloatingPromises` never fires on Prisma calls, so the one guard the plan sells as a gain does not cover the database writes that matter most.
EVIDENCE:   adversary: with the real generated client, bare `prisma.user.findMany();`, `prisma.$transaction([]);`, `prisma.processedUpdate.create({...});` and `p.$disconnect();` produced no diagnostic, while `ctx.reply`, `ctx.answerCallbackQuery`, `ctx.api.sendMessage` and a local Promise<void> were flagged; `PrismaPromise<T> extends Promise<T>` (runtime/client.d.ts:2158), so the rule fails to infer the type.
SCENARIO:   Someone drops the `await` on `prisma.processedUpdate.create` in api/webhook.ts or a write in src/features/promises.ts: lint exits 0.
BAR:        Do not claim Prisma coverage; state the limit and record it as accepted-risk, or add a negative fixture with a real Prisma call that fails.
HISTORY:    r1 open (design-adversary) -> r1 proposed (integrator: accepted-risk: ADR 0004 and the PR say plainly that the rule covers grammY calls and locally typed promises but NOT Prisma calls, so it is a partial gain, not a guard for database writes; tsc does not catch this either; bound: the write paths are covered by verify:flows, and the rule already found one real dropped await (scripts/dev-polling.ts))
            -> r2d accepted-risk (design-adversary review pass r1: on a copy with a real node_modules, ctx.reply, ctx.answerCallbackQuery and bot.api.sendMessage are flagged; prisma.processedUpdate.create, prisma.user.findMany and prisma.$transaction([]) are not; ADR wording accurate; the bound (verify:flows guards the writes) was not run; side note: with a symlinked node_modules grammY calls were not flagged either, so the rule depends on real type resolution (CI uses npm ci))

[OBJ-3] candidate: plan | severity: minor | status: verified
CLAIM:      The nursery rule's guard survives a Biome upgrade only as a loud CI failure, not silently, and the exact pin does not stop Dependabot.
EVIDENCE:   adversary: renaming the key gives "configuration resulted in errors", exit 1, so removal or promotion breaks loudly; biomejs.dev/internals/versioning says minor releases may promote a rule out of the nursery, remove recommended rules or demote a rule; .github/dependabot.yml groups npm-minor-patch with pattern "*" and Dependabot does bump exact pins.
SCENARIO:   A grouped weekly Dependabot PR bumps Biome and goes red on the rule key, dragging the other bumps in the group; or someone "fixes" it by deleting the entry and the check is gone.
BAR:        Say in ADR 0004 that a red Biome bump means migrating the nursery key, not deleting it.
HISTORY:    r1 open (design-adversary) -> r1 proposed (integrator: ADR 0004 states it and points at the criterion that plants a floating promise, which fails if the entry is deleted)
            -> r2d verified (design-adversary review pass r1: the floating-promise criterion passes on the correct config and fails when the entry is deleted or set to warn, info or off, or the linter is disabled; renaming the key gives 'Found an unknown key', rc 1; ADR 0004 says a red bump means migrating the key)

[OBJ-4] candidate: plan | severity: minor | status: proposed
CLAIM:      Biome's recommended set drops several typescript-eslint/ESLint `recommended` checks that the plan does not list.
EVIDENCE:   adversary: not reported at all: empty `catch (e) { }` and `if (true) {}` (no-empty), `namespace NS {}` (no-namespace), `require("fs")` (no-require-imports), bare expressions (no-unused-expressions); caught: noUnsafeFinally, noFallthroughSwitchClause, noNonNullAssertedOptionalChain, noAsyncPromiseExecutor, useValidTypeof, noDuplicateObjectKeys, noTsIgnore, noBannedTypes.
SCENARIO:   `catch (e) {}` swallows a Prisma or Telegram error and lint stays green where ESLint's no-empty was an error.
BAR:        List the dropped rules; optionally enable suspicious/noEmptyBlockStatements.
HISTORY:    r1 open (design-adversary) -> r1 proposed (integrator: suspicious/noEmptyBlockStatements is enabled as warn (one hit on main, an intentional `() => {}` console silencer in a test); no-namespace, no-require-imports and no-unused-expressions are listed in ADR 0004 as dropped and accepted: the repository is ESM TypeScript with no namespaces or require calls)
            -> r2d open (design-adversary review pass r1: ESLint 10.8.0 + typescript-eslint 8.65.0 (main's lockfile versions) and the Biome config were run on the same code: noEmptyBlockStatements is on; Biome also lacks no-var (silent under the shipped config), ban-ts-comment for @ts-nocheck/@ts-expect-error without a description, no-useless-assignment, preserve-caught-error, prefer-as-const; the ADR named three lost rules and read as complete; none is used in src, api or scripts today)
            -> r3 proposed (integrator: `suspicious/noVar` enabled as error (zero hits; a planted var fails the lint); ADR 0004 now lists every lost rule found by the comparison)

[OBJ-5] candidate: plan | severity: minor | status: proposed
CLAIM:      The lint is noisy and easy to ignore, and it fails in a new way when a nested biome.json exists under the root.
EVIDENCE:   adversary: `npm run lint` prints 20 diagnostics and "Diagnostics not shown: 16", "Found 35 warnings" (rc 0); the pre-commit hook prints 370 lines; owner's tree 50 warnings and 2 infos; noNonNullAssertion alone is 35 warnings and ESLint never had it; a nested `biome.json` under .claude/worktrees/x/ gives "Found a nested root configuration" exit 1, fixed by `!.claude/worktrees`.
SCENARIO:   Warnings appear on every commit and nobody reads them; a worktree checkout under .claude/worktrees makes the root lint and the hook fail with a misleading config error.
BAR:        Ignore .claude/worktrees; record the warning budget.
HISTORY:    r1 open (design-adversary) -> r1 proposed (integrator: `!.claude/worktrees` added to files.includes (criterion 5 checks it); the warning budget (35 warnings + 1 info on main, 50 + 2 on the owner's tree) is recorded in ADR 0004; `--error-on-warnings` is left for after the noNonNullAssertion warnings are cleaned up)
            -> r2d open (design-adversary review pass r1: the nested-config part is verified (rc 1 without `!.claude/worktrees`, rc 0 with it); the ADR said 35 warnings and 'not shown: 16', while `npm run lint` prints 36 warnings, 1 info and 'not shown: 17' (the ADR's own breakdown left out the noEmptyBlockStatements warning))
            -> r3 proposed (integrator: ADR 0004 corrected to 36 warnings, 1 info, 'not shown: 17', and its alternatives list adds the 1 noEmptyBlockStatements)

[OBJ-6] candidate: plan | severity: major | status: proposed
CLAIM:      ADR 0004 and its criterion say the config reports 0 errors on the owner's uncommitted tree so their commits are not blocked; run with a real node_modules it reports 1 error there.
EVIDENCE:   design-adversary review pass r1: on a read-only copy of the owner's tree plus biome.json, `biome check` gives 1 error, 50 warnings, 2 infos; the error is nursery/noFloatingPromises on scripts/dev-polling.ts, whose copy in their tree is unmodified and still has the dropped await. The orchestrator reproduced it with a real copy of node_modules: unfixed 1 error, with the fixed file 0 errors, 50 warnings, 2 infos; the earlier 0-error measurement used a symlinked node_modules, under which the rule cannot resolve types and stays silent.
SCENARIO:   The owner takes biome.json (or installs Biome) without the await fix and the pre-commit hook rejects every commit.
BAR:        The wording says "unblocked only together with the dev-polling fix", says why, and the real numbers are recorded.
HISTORY:    r2 open (design-adversary review pass r1) -> r3 proposed (integrator: ADR 0004 gets a paragraph "The owner's uncommitted tree" stating exactly that (their copy of the file is unmodified, so bringing main into their tree brings the fix); the criterion is reworded to require both measurements (with and without the fixed file); measured 2026-09-20: without 1 error / 50 warnings / 2 infos, with 0 errors / 50 warnings / 2 infos; hand-off tells the owner)

