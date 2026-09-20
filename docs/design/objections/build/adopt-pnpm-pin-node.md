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
- [ ] The Prisma schema engine is present after a pnpm install (the allowed install script ran) and the client is generated.
      check: pnpm exec prisma --version 2>&1 | grep -q 'Schema Engine' && [ -d generated/prisma ]
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
- [ ] THE HOLD-BACK CRITERION (not verifiable by the assistant): a Vercel preview or production build of this branch detects pnpm 10, uses Node 24.x, runs `prisma generate` and `prisma migrate deploy` successfully, and `/api/webhook` and `/api/cron` answer.
      manual: the owner deploys a preview of the branch (Vercel dashboard or `vercel deploy`) and reads its build log -> evidence: the "Detected pnpm" and Node version lines and a successful webhook/cron response; UNKNOWN until then, and this pull request is not merged before it
