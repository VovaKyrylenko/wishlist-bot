route: bounded full (one approach, no competing candidates: architect and arbiter are skipped, as the protocol allows for a bounded shape)
research: Vercel package-manager detection; Node selection; pnpm 10 install-script policy; pnpm/action-setup; node-version-file; pnpm import (brief: scratchpad/brief-6.md, cited, with its own "unverified" list)
autonomy: autonomous, with a HOLD: the merge waits for the owner to verify a Vercel build (the assistant cannot deploy or read Vercel)
lenses: none activated
why: edits .github/workflows/ (HIGH_RISK_PATHS) and changes how the production build installs dependencies; a broken build takes the Telegram webhook down and `vercel-build` runs `prisma migrate deploy`. Issue: #6.
protocol deviation, stated plainly: the plan was NOT put through an adversary pass before implementation; the implementation was built from the research brief and then reviewed as a committed diff by two independent reviewers with different angles (Vercel/production semantics; CI, guards, tooling and the owner's tree), whose rulings are recorded below. There was no debate cycle.

# Facts (research brief 2026-09-20, with the assistant's own measurements)

- Vercel picks pnpm from pnpm-lock.yaml; lockfile 9.0 means pnpm 9 or 10 by project creation date (10 for projects created after 2025-02-27; this repository's first commit is 2026-07-27); pnpm 11 and 12 are not selected by Vercel by itself. Whether Vercel honours `packageManager` without ENABLE_EXPERIMENTAL_COREPACK=1 is contradictory in its docs and source (UNVERIFIED).
- `engines.node` overrides the Vercel project setting; ">=22.12" and "24.x" both resolve to 24.x; Node 20 is disabled on Vercel on 2026-10-01; .nvmrc, .node-version and mise.toml are not read by Vercel. setup-node v4 reads `engines.node` from package.json (verified in the action's docs).
- pnpm 10 blocks dependency install scripts; @prisma/engines downloads the schema-engine binary that `prisma migrate deploy` runs, esbuild has a validating script; prisma@7.9.1 has only a Node-version preinstall guard (blocked, harmless).
- Measured here: `pnpm import` gave 424 packages, the same versions as package-lock.json; `pnpm install --frozen-lockfile` runs the root postinstall (`prisma generate`); `pnpm run typecheck|lint|build`, `pnpm test` (114 tests) and the six mutation-battery classes pass; `vercel-build` with an unreachable database generates the client and fails only at the connection (P1001), so the schema engine is present; a settings-only pnpm-workspace.yaml (no `packages:`) made turbo fail here, hence the allowlist lives in package.json.
- Found on the way: the `ssrf` battery class had been failing since the fix merged (its baseline was origin/main, which now contains the fix); it uses a fixed pre-fix commit now.

# Acceptance criteria

- [ ] The lockfile is in sync: a frozen install succeeds and changes nothing.
      check: pnpm install --frozen-lockfile >/dev/null 2>&1 && git diff --quiet -- pnpm-lock.yaml
- [ ] The migration kept the resolved versions: 424 packages before and after, the same name and version for each (the only difference is the name of an npm alias, path-to-regexp-updated -> path-to-regexp@6.3.0).
      manual: compare package-lock.json at origin/main with pnpm-lock.yaml -> evidence: the comparison output in docs/verification/build/adopt-pnpm-pin-node.md
- [ ] No npm lockfile is left, tracked or not.
      check: [ ! -e package-lock.json ] && [ -z "$(git ls-files package-lock.json)" ]
- [ ] pnpm is pinned to an exact 10.x version (Vercel documents pnpm up to 10 and does not select 11 or 12 by itself).
      check: node -e 'process.exit(/^pnpm@10\.\d+\.\d+$/.test(require("./package.json").packageManager)?0:1)'
- [ ] Node: `engines.node` is the single source of truth and mise.toml stays inside it.
      check: node -e 'const e=require("./package.json").engines.node;const m=+require("fs").readFileSync("mise.toml","utf8").match(/node\s*=\s*"(\d+)/)[1];process.exit(e===">=22.12 <25"&&m>=22&&m<25?0:1)'
- [ ] Only the two install scripts this project needs are allowed, in package.json, and there is no pnpm-workspace.yaml.
      check: jq -e '.pnpm.onlyBuiltDependencies == ["@prisma/engines","esbuild"]' package.json >/dev/null && [ ! -e pnpm-workspace.yaml ]
- [ ] The Vercel-facing files are unchanged: vercel.json, and the vercel-build script.
      check: git diff --quiet origin/main -- vercel.json && jq -e '.scripts["vercel-build"] == "prisma generate && prisma migrate deploy"' package.json >/dev/null
- [ ] The Prisma client is generated and the CLI runs after a pnpm install (this does NOT prove the `@prisma/engines` allowlist was needed: without it the schema engine is downloaded on first use; the install log line `@prisma/engines postinstall: Done` is what shows the script ran).
      check: pnpm exec prisma --version >/dev/null 2>&1 && [ -d generated/prisma ]
- [ ] Typecheck, lint, build and the tests pass under pnpm.
      check: pnpm run typecheck >/dev/null && pnpm run lint >/dev/null && pnpm run build >/dev/null && env -u DATABASE_URL -u BOT_TOKEN pnpm test >/dev/null
- [ ] All four workflows use pnpm/action-setup, `node-version-file: package.json`, `cache: pnpm` and a frozen install; none still uses `npm ci` or `cache: npm`; the `quality` job is intact.
      check: for f in ci flows kit-release announcement-preview; do grep -q 'pnpm/action-setup@v6' .github/workflows/$f.yml && grep -q 'node-version-file: package.json' .github/workflows/$f.yml && grep -q 'cache: pnpm' .github/workflows/$f.yml && grep -q 'pnpm install --frozen-lockfile' .github/workflows/$f.yml || exit 1; done; ! grep -rnE 'npm ci|cache: npm' .github/workflows && bash scripts/main-protection.sh check
- [ ] The repository's own guards report nothing.
      check: KIT_BASE_REF=origin/main bash scripts/kit-ci-guards.sh
- [ ] The kit profile and the hooks use pnpm: pre-push prints the pnpm command and passes.
      check: out=$(bash .githooks/pre-push 2>&1) && printf '%s\n' "$out" | grep -qx 'kit pre-push: pnpm run test'
- [ ] The mutation battery, including its ssrf class, passes under pnpm (the ssrf class had failed since the fix merged: its baseline was origin/main).
      check: for c in availability deeplink access dates scrape-ipv4 ssrf; do bash scripts/mutation-battery.sh $c >/dev/null 2>&1 || exit 1; done
- [ ] Files the owner has uncommitted edits in are untouched.
      check: git diff --quiet origin/main -- README.md docs/FLOWS.md
- [ ] The deviation from T49 is recorded with the current fingerprint.
      check: grep -q "$(kit tastes list | awk '$1=="T49"{print "fingerprint: "$4}')" .claude/tastes.md
- [ ] ADR 0005 exists and maps the npm commands in earlier ADRs' criteria to their pnpm equivalents.
      manual: read docs/decisions/0005-adopt-pnpm-and-pin-node.md -> evidence: the mapping table
- [ ] On the pull request, the `quality` run installs with pnpm and a frozen lockfile, runs on Node 24 and is green; the announcement preview and guards are green.
      manual: open the PR's runs -> evidence: the run links and the Node/pnpm version lines, recorded in docs/verification/build/adopt-pnpm-pin-node.md
- [ ] The Vercel build (the criterion no assistant can read), checked by the owner after the merge, against a GREEN BASELINE (the last good production deployment or a preview of `main` before this change). The first build's log must show: the line "Detected `pnpm-lock.yaml` version 9 generated by pnpm@10.x from package.json#packageManager pnpm@10.34.5" (pin honoured; if instead "Using pnpm@N based on project creation date" appears, the pin was ignored and the version came from the lockfile date, which is also fine but must be recorded), "Done in Xs using pnpm v10.34.5" at the end of the install, `@prisma/engines postinstall: Done` and `esbuild postinstall: Done` with "Ignored build scripts: prisma@7.9.1" as the only ignored package, a Node 24.x build, and `prisma generate` followed by `prisma migrate deploy` succeeding. Then two safe smoke checks: `GET /api/webhook` answers 405 and `GET /api/cron` without a Bearer token answers 401 (a tracing failure would show as 500). Do NOT call `/api/cron` with the secret on a deployment that carries production variables: it sends real reminders. Also check Project Settings > Build and Development Settings: no Install or Build Command override and no `ENABLE_EXPERIMENTAL_COREPACK` variable.
      manual: the owner reads the first deployment's build log and the two smoke responses -> evidence: the lines above; UNKNOWN until then. Rollback: `git revert` of the squash commit (a failed Vercel build does not replace the live deployment: expected, not observed here).

# Objection log

[OBJ-1] candidate: plan | severity: major | status: proposed
CLAIM:      None of the four workflows has ever run, and `pnpm/action-setup@v6` is a floating tag with open issues about pnpm pins, so the only proof the CI wiring works is reasoning.
EVIDENCE:   review B: the branch was not pushed, no runs exist; v6 resolves to v6.1.0 (2026-09-05); open issues #268 (ERR_PNPM_PNPM_ENGINE_IDENTITY_MISMATCH with a pnpm 10 pin and no `version` input), #227/#225; the action reads `packageManager` when `version` is omitted (the documented shape).
SCENARIO:   A patch under the v6 tag breaks the pin; `quality` (required) fails before merge, but kit-release.yml runs only on push to main and would stop releases silently.
BAR:        A green `quality` run of this exact branch before merge, and the pnpm/Node lines read from its log.
HISTORY:    r1 open (design-adversary review B) -> r1 proposed (integrator: the branch is pushed and the pull request's own CI is the first run of all changed workflows except kit-release and flows; the pnpm and Node versions are read from the run log and recorded in docs/verification; kit-release.yml and flows.yml cannot run before merge and are accepted-risk in ADR 0005)

[OBJ-2] candidate: plan | severity: major | status: proposed
CLAIM:      Production (Vercel) does not necessarily install with the pinned pnpm: `packageManager` governs CI and local runs, not Vercel.
EVIDENCE:   review B: Vercel docs say a lockfileVersion 9.0 pnpm-lock.yaml is interpreted by pnpm 9 or 10 and `packageManager` is used only with Corepack; vercel.json has no installCommand; pnpm 9.15.9 run against this `packageManager` field gave no error and a pnpm 10.34.5 clone installed cleanly.
SCENARIO:   Vercel installs with pnpm 9 or another 10.x; peer/optional resolution or the build step under pnpm's layout differs.
BAR:        Stated as an accepted risk, or ENABLE_EXPERIMENTAL_COREPACK=1 set, or the pnpm version read from a build log.
HISTORY:    r1 open (design-adversary review B) -> r1 proposed (integrator: accepted-risk written in ADR 0005 with its bound; the owner can set ENABLE_EXPERIMENTAL_COREPACK=1 in Vercel (an owner setting the assistant cannot change); the first production build log settles it)

[OBJ-3] candidate: plan | severity: minor | status: proposed
CLAIM:      The documented migration command is wrong under pnpm: `pnpm run prisma:migrate -- --name x` forwards the literal `--`.
EVIDENCE:   review B: with a stub script the command line ended `-- --name x`; in a clone `-- --name zz --bogusflag` was not rejected while the same flags without `--` printed Prisma's usage error.
SCENARIO:   The name flag is silently ignored and the contributor is prompted.
BAR:        The line says `pnpm run prisma:migrate --name опис`.
HISTORY:    r1 open (design-adversary review B) -> r1 proposed (integrator: CONTRIBUTING.md fixed; my generic npm->pnpm replacement had run before the specific one and left the `--`)

[OBJ-4] candidate: plan | severity: minor | status: proposed
CLAIM:      Every install prints "Ignored build scripts: prisma@7.9.1".
EVIDENCE:   review B: clean frozen install prints it; prisma generate, the schema engine, tsx (esbuild), vitest, typecheck, lint, build and tests all work, so the allowlist is correct.
SCENARIO:   Noise in every CI log; a future reader thinks something is broken.
BAR:        Silenced or documented.
HISTORY:    r1 open (design-adversary review B) -> r1 proposed (integrator: `pnpm.ignoredBuiltDependencies: ["prisma"]` was tried and did NOT silence the warning, so it was not kept; the warning is documented in CONTRIBUTING and ADR 0005)

[OBJ-5] candidate: plan | severity: minor | status: proposed
CLAIM:      A contributor without pnpm gets a broken pre-commit hook, and plain `npm install` crashes on a pnpm-managed node_modules.
EVIDENCE:   review B: .githooks run `pnpm run …` from RUNNER with no command-not-found handling; `npm install --dry-run` on pnpm's node_modules failed with "Cannot read properties of null (reading 'matches')"; Corepack downloads pnpm 10.34.5 on first use; Node 20 gives only a WARN.
SCENARIO:   Every commit is blocked for someone with only npm.
BAR:        CONTRIBUTING says pnpm only.
HISTORY:    r1 open (design-adversary review B) -> r1 proposed (integrator: CONTRIBUTING says pnpm only and names the warning; accepted-risk in ADR 0005)

[OBJ-6] candidate: plan | severity: note | status: proposed
CLAIM:      The open Dependabot pull request #12 will conflict after the merge (the npm lockfile is deleted); PR #3 is already closed.
EVIDENCE:   `gh pr view 3` CLOSED; #12 on branch dependabot/npm_and_yarn/npm-minor-patch-17915bf4d9; dependabot.yml package-ecosystem npm covers pnpm; reports of Dependabot rewriting pnpm lockfiles' quoting style and of pnpm 11 multi-document lockfiles (not applicable to a pnpm 10 pin).
SCENARIO:   A stale Dependabot pull request.
BAR:        Stated.
HISTORY:    r1 open (design-adversary review B) -> r1 proposed (integrator: accepted-risk in ADR 0005; the owner may close #12 and let Dependabot recreate it)

[OBJ-7] candidate: plan | severity: major | status: proposed
CLAIM:      The Vercel criterion cannot say which pnpm actually ran: "detects pnpm 10" is too weak.
EVIDENCE:   review A: vercel/vercel main, packages/build-utils/src/fs/run-user-scripts.ts (2026-09-20), the log lines differ: "Detected `pnpm-lock.yaml` version 9 generated by pnpm@10.x from package.json#packageManager pnpm@10.34.5" when the pin is honoured, "may be generated by pnpm@9.x, pnpm@10.x, or pnpm@11.x / Using pnpm@N based on project creation date" when ignored; a cold `CI=1 pnpm install --frozen-lockfile` ended "Done in 5m 45.6s using pnpm v10.34.5".
SCENARIO:   The owner ticks the box on "pnpm@10.x" while pnpm 9 ran, and a later change assumes the pin is enforced.
BAR:        The criterion names the lines that prove the exact pnpm.
HISTORY:    r1 open (design-adversary review A) -> r1 proposed (integrator: the criterion in ADR 0005 now lists both variants of the Detected line, the "Done in Xs using pnpm v10.34.5" line and what to record if the pin was ignored)

[OBJ-8] candidate: plan | severity: major | status: proposed
CLAIM:      The Vercel criterion does not require a green baseline build and does not say what to hit, so a failing preview cannot be attributed to pnpm.
EVIDENCE:   review A: prisma.config.ts reads only DATABASE_URL_UNPOOLED; src/db.ts throws without DATABASE_URL; vercel-build runs `prisma migrate deploy` on every build; origin/main under npm and this branch under pnpm gave the identical result (generate ok, then P1001 with an unreachable database); api/cron.ts:141-175 with a valid secret sends real reminders.
SCENARIO:   A preview lacking DATABASE_URL_UNPOOLED fails and pnpm is blamed, or it passes by pointing at production; calling cron with the secret on a preview with production variables sends real messages; `vercel deploy` from the owner's dirty tree uploads an untracked migration.
BAR:        A baseline, safe smoke checks, and a warning about cron and the dirty tree.
HISTORY:    r1 open (design-adversary review A) -> r1 proposed (integrator: the criterion now requires a green baseline, the smoke checks GET /api/webhook -> 405 and GET /api/cron without a token -> 401, forbids calling cron with the secret on production variables, and the owner check happens after the merge with the revert as the rollback; deploy from a clean checkout is stated in the pull request)

[OBJ-9] candidate: plan | severity: minor | status: proposed
CLAIM:      The "schema engine present" guard cannot fail: it is satisfied with or without the @prisma/engines allowlist.
EVIDENCE:   review A: in a copy installed with --ignore-scripts the engines directory held only LICENSE, README, dist, package.json and scripts, yet `pnpm exec prisma migrate deploy` downloaded the engine on demand and reached P1001.
SCENARIO:   "P1001 proves the engine is present" is read as evidence that the allowlist worked; the real exposure is a first-use download at migrate time on Vercel.
BAR:        Reword the criterion or accept the risk; look for the postinstall line in the log.
HISTORY:    r1 open (design-adversary review A) -> r1 proposed (integrator: the local criterion is reworded to what it can show (client generated, CLI runs) and says it does not prove the allowlist was needed; the Vercel criterion looks for `@prisma/engines postinstall: Done`)

[OBJ-10] candidate: plan | severity: minor | status: proposed
CLAIM:      Dashboard Install/Build Command overrides or a project-level ENABLE_EXPERIMENTAL_COREPACK=1 are not covered.
EVIDENCE:   review A: docs (2026-08-11) say an override install command such as `pnpm install` uses the oldest pnpm (6); a dashboard `npm ci` would bypass detection; with the variable and a packageManager value Corepack must supply pnpm 10.34.5.
SCENARIO:   An old override makes the build run npm and fail, or drift.
BAR:        The owner checks Project Settings.
HISTORY:    r1 open (design-adversary review A) -> r1 proposed (integrator: added to the Vercel criterion)

[OBJ-11] candidate: plan | severity: minor | status: proposed
CLAIM:      A pnpm older than 10.34.5 in the build image self-switches by fetching the pinned pnpm, a new install-time network dependency.
EVIDENCE:   review A: pnpm 10.9.0 switched to 10.34.5; with an unreachable registry the switch failed hard with ERR_PNPM_META_FETCH_FAIL.
SCENARIO:   A registry hiccup during the switch fails the build; Vercel already needs the registry for the install.
BAR:        Accepted risk.
HISTORY:    r1 open (design-adversary review A) -> r1 proposed (integrator: accepted-risk, bound: a failed build leaves the previous deployment serving (expected, not observed); noted in ADR 0005)

[OBJ-12] candidate: plan | severity: note | status: proposed
CLAIM:      `engines.node ">=22.12 <25"` is accepted by Vercel and gives 24.x; a future Node 26 with 24 dropped fails loudly instead of silently moving.
EVIDENCE:   review A: node-version.ts getSupportedNodeVersion uses semver validRange + intersects against 24.x, 22.x, 20.x (semver 7.8.5): the range intersects 24.x and 22.x and not 20.x, first match taken.
SCENARIO:   None today.
BAR:        Stated.
HISTORY:    r1 open (design-adversary review A) -> r1 proposed (integrator: stated; no change)

