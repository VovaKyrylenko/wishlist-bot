# Verification — build/adopt-pnpm-pin-node (issue #6)

## Run 1 — mechanical checks and CI (2026-09-20)

VERDICT: PASS for everything an assistant can check; the Vercel build is UNKNOWN until the owner reads it.
CLAIM:   The project installs, builds, lints and tests under pnpm 10.34.5 on Node 24; the lockfile carries the same 424 packages as before; the four workflows use pnpm and read Node from `engines`.
METHOD:  Ran the 14 `check:` lines of ADR 0005 in a clean worktree; compared the resolved packages of the two lockfiles; read the pull request's first CI run.
EVIDENCE:
  1. All 14 mechanical criteria exit 0 (frozen install changes nothing, no npm lockfile, pnpm pinned to 10.34.5, engines/mise agree, allowlist exact, Vercel-facing files unchanged, Prisma client generated, typecheck/lint/build/tests, workflows, guards 0 findings, pre-push prints `pnpm run test`, mutation battery incl. ssrf, owner's files untouched, T49 fingerprint recorded).
  2. Lockfile comparison: `package-lock.json` at origin/main 424 packages, `pnpm-lock.yaml` 424 packages, none missing, none extra (by name and version).
  3. PR #13, `quality` run 35520329602: green. `pnpm/action-setup@v6` installs pnpm 11.19.0 and then "Switching pnpm from v11.19.0 to v10.34.5", so the pin is honoured there. `setup-node` "Resolved package.json as >=22.12 <25", Node v24.20.0. `pnpm install --frozen-lockfile`: "Lockfile is up to date, resolution step is skipped". `anti-gaming`, `profile` and `preview` are green too.
  4. Not run before merge (by design, they need main or a dispatch): `kit-release.yml`, `flows.yml`. Their setup block is identical to the one proven in `quality`.
FINDINGS: the action installs pnpm 11 first and switches; that costs a few seconds and is fine. Ignored build scripts note ("prisma@7.9.1") is expected.

## Run 2 — criterion audit (2026-09-20)

One grouped audit over all criteria (they share one command source), with the rulings of a fresh reviewer on the objection log (12 objections, all terminal: 7 verified, 5 accepted-risk).

CRITERION: Vercel build (pnpm chosen, Node 24.x, prisma generate + migrate deploy, smoke checks 405/401)
VERDICT: UNKNOWN
EVIDENCE: no assistant can deploy or read Vercel; the owner reads the first build log after the merge against the lines listed in ADR 0005. Rollback: `git revert` of the squash commit.

CRITERION: all other criteria in ADR 0005
VERDICT: PASS
EVIDENCE: Run 1, items 1-3
