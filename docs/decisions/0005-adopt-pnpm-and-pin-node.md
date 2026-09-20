# 0005: Adopt pnpm 10 and pin Node through engines

Status: proposed (not to be merged before the Vercel criterion below is settled by the owner)
Date: 2026-09-20

## Context

Issue #6 asked to move from npm to pnpm and to pin the Node version. The catalog wants pnpm everywhere (T70), the version pinned through `packageManager` (T50) and Node pinned with mise (T49). The application deploys to Vercel and its build runs `prisma generate && prisma migrate deploy`, so a broken install takes the webhook down; the assistant cannot deploy or read a Vercel build, and this repository has no Vercel deployment records on pull requests.

## Decision

- `pnpm-lock.yaml` replaces `package-lock.json` (converted with `pnpm import`; 424 packages, same versions). `packageManager` is `pnpm@10.34.5`, the newest 10.x: Vercel documents pnpm up to 10 and does not select 11 or 12 by itself. `pnpm.onlyBuiltDependencies` allows `@prisma/engines` (downloads the schema engine `prisma migrate deploy` runs) and `esbuild`; pnpm 10 blocks other install scripts. The allowlist is in package.json, not in a settings-only `pnpm-workspace.yaml`, which breaks tools that read it (turbo failed on it) and which Vercel reads for monorepo detection. pnpm 11 removes `onlyBuiltDependencies`; if the pin ever moves to 11, move the allowlist to `allowBuilds` in `pnpm-workspace.yaml` together with a `packages:` field.
- Node: `engines.node` is `>=22.12 <25` and is the single source of truth: Vercel reads only that field (resolves to 24.x today; Node 20 is disabled there on 2026-10-01), CI reads it through `setup-node` `node-version-file: package.json`, and `<25` keeps out Node 25, which Vitest 5 does not support. `mise.toml` (`node = "24"`) is for people who use mise and must stay inside the range. This departs from T49 (recorded in `.claude/tastes.md`).
- All four workflows use `pnpm/action-setup@v6` (reads `packageManager`), then `setup-node` with `cache: pnpm`, then `pnpm install --frozen-lockfile`. `vercel.json` and the `vercel-build` script are unchanged, and there is no `installCommand` override (Vercel would use its oldest pnpm for it).
- The kit profile (`RUNNER`, `INSTALL`) and the docs that tell people which command to type say pnpm. `README.md` and `docs/FLOWS.md` are not touched: the owner has uncommitted edits in them.

## Alternatives considered

- **mise as the source of truth for Node (T49 as written, the issue's proposal).** Rejected: Vercel does not read it, so production and CI could diverge; kept as a local convenience.
- **pnpm 11 or 12.** Rejected: Vercel does not select them automatically and its pnpm 11 detection was still an open pull request when checked.
- **`allowBuilds` in a settings-only `pnpm-workspace.yaml`.** Rejected for now (see Decision).
- **Keeping npm.** Rejected by the issue.

## Consequences

- Development on Node 22.12+ works and is not warned about; CI runs the newest Node within the range (24), which is what Vercel runs.
- A new dependency that needs an install script will not build until it is added to the allowlist (pnpm 10 warns "Ignored build scripts"; pnpm 11 would fail).
- **The owner's uncommitted work:** `package.json` merges cleanly with the owner's (checked with their HEAD as the base), but `pnpm-lock.yaml` will need regenerating after their rewrite lands, and `README.md` still says `npm` until they commit their own edits to it.
- **Earlier ADRs' criteria that name npm** are to be read with these equivalents: `npm run X` -> `pnpm run X`, `npm test` -> `pnpm test`, `npm ci --dry-run` -> `pnpm install --frozen-lockfile`, `npm ls P` -> `pnpm ls P`, `package-lock.json` -> `pnpm-lock.yaml`, `npx vitest` -> `pnpm exec vitest`; in ADR 0003 that concerns criteria 1, 2, 20, 21, 23, 25 (the hook now prints `kit pre-push: pnpm run test`), 29 (the lockfile-engines part is dropped: pnpm-lock.yaml has no root engines) and 30 (`run: pnpm test`), and in ADR 0004 criteria 1, 2 and 12.
- **Unverified, needs a real Vercel build:** that the build image honours the `packageManager` pin (or picks pnpm 10 from the lockfile), which pnpm 10.x patch it ships, that `prisma migrate deploy` works with the allowlist under Vercel, that Node 24.x is used, and that `/api/webhook` and `/api/cron` answer. Until the owner checks a preview build, this pull request is not merged.
- Revisit when: Vercel supports pnpm 11+ (then move the allowlist), Node 24 leaves maintenance (2028-04-30) or Vercel drops it, or a dependency needs an install script.

## Acceptance criteria

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

## Supersedes

Nothing; it changes the commands named in criteria of `0003` and `0004` as listed in Consequences.

## Superseded by
