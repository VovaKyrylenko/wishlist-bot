# 0004: Lint with Biome instead of ESLint (lint only)

Status: accepted
Date: 2026-09-20

## Context

Issue #7 asked to replace ESLint 10 + typescript-eslint with Biome. The catalog default is Oxlint (T81); choosing Biome is a deviation recorded in `.claude/tastes.md`, and the owner gave no reason for it, so none is claimed here. What shaped the change: the owner has 18 files uncommitted, so a whole-tree reformat would conflict with them and the pre-commit hook would fail their next commit on unformatted files; ESLint on `main` reported nothing while Biome's recommended preset reports 35 warnings; the ESLint config was not type-aware, so there was never a floating-promise check.

## Decision

- `@biomejs/biome` 2.5.14, pinned exactly; `lint` is `biome check`; `eslint`, `@eslint/js`, `typescript-eslint` and `eslint.config.mjs` are removed. `ci.yml` still runs `npm run lint`, so no workflow changes.
- `biome.json`: formatter and assist (import sorting) **off**, so `biome check` is lint-only and nothing is reformatted; preset `recommended`; ignores carried over (generated, dist, node_modules, .kit, .claude/skills, .claude/agents) plus coverage, package-lock.json and `.claude/worktrees` (a nested `biome.json` under a worktree makes the root run fail).
- Rule mapping: `noExplicitAny` off (as before); unused variables and arguments warn and ignore `_` names (the preset's default, same as the old `argsIgnorePattern`); `suspicious/useIterableCallbackReturn` downgraded from error to **warn** (two harmless `forEach((x) => lines.push(...))`, one of them in a file the owner is editing); `suspicious/noEmptyBlockStatements` **warn** (partly restores `no-empty`); `nursery/noFloatingPromises` **error** (new, see below).
- `scripts/dev-polling.ts`: `await bot.start(...)`, the one real hit the new rule found on `main` (a failure of the polling loop bypassed the `main().catch` that logs and exits 1).
- Turning the formatter on is a separate change, after the owner's work has landed.

## Alternatives considered

- **Oxlint (the catalog default).** Not chosen by the owner; no reason recorded.
- **Keep ESLint.** Rejected by the owner's request.
- **Biome with the formatter on, one formatting commit.** Rejected: it would conflict with the owner's 18 uncommitted files and fail their next commit on the hook.
- **Fix the code the new rules complain about.** Rejected for this change: 35 warnings (21 `noNonNullAssertion`, 10 `useOptionalChain`, 2 `useImportType`, 2 `useIterableCallbackReturn`) would touch files the owner is editing; they stay warnings.

## Consequences

- **What is gained:** `noFloatingPromises` catches a dropped `await` on grammY calls (`ctx.reply`, `ctx.answerCallbackQuery`, `ctx.api.*`) and on locally typed promises, and it found one real bug. It is a partial gain, not a guard for the database: **it does not flag a dropped `await` on Prisma calls** (`PrismaPromise` is not recognised; `prisma.processedUpdate.create(...)` without `await` passes), and `tsc` does not catch that either. Those write paths are guarded only by `npm run verify:flows`.
- **What is lost:** ESLint's `no-namespace`, `no-require-imports` and `no-unused-expressions` (the code is ESM TypeScript without namespaces or `require`); `no-empty` is only partly covered by `noEmptyBlockStatements`.
- **Noise:** `biome check` prints about 20 diagnostics and "Diagnostics not shown: 16" on every run and every commit: 35 warnings and 1 info on `main` (50 warnings and 2 infos on the owner's uncommitted tree; 0 errors there, so their commits are not blocked). Warnings do not fail the run; `--error-on-warnings` is for after `noNonNullAssertion` is cleaned up.
- **Upgrades:** `noFloatingPromises` is a nursery rule. Removing or promoting it in a later minor release makes the config invalid and CI red (loudly, not silently). Dependabot's grouped minor/patch update bumps an exact pin too, so **a red Biome bump means migrating the nursery key, never deleting it**; the planted-floating-promise criterion below fails if the entry is deleted.
- This ADR **amends criterion 21 of ADR 0003** ("Lint passes with tests and `vitest.config.ts` included, with `eslint.config.mjs` and `tsconfig.json` unchanged"): its `check:` names a file that no longer exists. The intent (lint covers the tests and the vitest config, and `tsconfig.json` is unchanged) is kept by the first and last criteria below; ADR 0003 itself is not edited.
- Revisit when: the formatter is turned on, the owner states the reason for departing from Oxlint (or reverts), or Biome promotes `noFloatingPromises` and gains Prisma promise inference.

## Acceptance criteria

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
- [ ] The owner's uncommitted tree is not blocked by the hook: the same config reports 0 errors on a read-only copy of it.
      manual: copy the owner's tree to a temp dir, add biome.json, run `biome lint` -> evidence: "Found 0 errors" (recorded in the verification file)
- [ ] ADR 0004 exists, lists every downgraded rule and the remaining warning counts, and says it amends criterion 21 of ADR 0003.
      manual: read docs/decisions/0004-*.md -> evidence: the sections exist

## Supersedes

Amends criterion 21 of `0003-unit-tests-and-ci-wiring.md` (see Consequences); nothing else.

## Superseded by
