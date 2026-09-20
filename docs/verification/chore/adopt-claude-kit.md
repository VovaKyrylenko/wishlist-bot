# Verification — chore/adopt-claude-kit

## Run 1 — kit adoption and local checks (2026-09-20)

VERDICT: PASS
CLAIM:   The kit is installed, the profile is configured, hooks run, and the repository still typechecks and lints.
METHOD:  Ran the commands on the branch.
STEPS:
  1. `kit setup`, then `kit doctor`
     -> 35 checks, 1 failed (`readiness-tests`: no test file; tracked in issue #4), 2 warnings (design docs empty; this file).
  2. `git commit` on the branch (pre-commit hook: `npm run typecheck`, `npm run lint`)
     -> both passed on all three commits.
  3. `git check-ignore -v .claude/settings.json .claude/skills/prisma-cli`
     -> settings.json is no longer ignored; the prisma symlinks still are.
EVIDENCE: `doctor: 35 checks, 1 failed, 2 warnings`; three commits accepted by the hook.
FINDINGS: `claude-md-size` failed at 77 lines before the CLAUDE.md split and passes at 53.

## Run 2 — release announcement, mmz-style pipeline (2026-09-20)

VERDICT: BLOCKED
CLAIM:   After a release, Claude writes an announcement from the diff and it is posted to a Telegram channel, the way miss_zakarpattia does it.
METHOD:  Ran `scripts/release/notes.ts` on real commits of this repository (`befde27~1..14e46ec`) against a local stand-in for the AI Gateway (`AI_GATEWAY_URL`), in four modes; parsed both workflow files.
STEPS:
  1. Stand-in returns a valid JSON answer wrapped in a markdown fence
     -> `announce=true`; the message has the header, the block, the numbered steps and the release link; the request carried `Authorization: Bearer <key>` and model `anthropic/claude-sonnet-5` on `/v1/chat/completions`.
  2. Stand-in returns a highlight using "забронювати" / "Бронювання"
     -> the highlight was dropped; the post became the neutral "Бот оновився" text.
  3. Stand-in returns text that is not JSON
     -> the same neutral text, exit 0.
  4. Stand-in returns `{"items":[]}`
     -> `announce=false`, so no post.
  5. `tsc --noEmit` and `eslint .` (also run by the pre-commit hook); YAML of `kit-release.yml` and `announcement-preview.yml` parsed.
     -> clean.
EVIDENCE: outputs above. Parsing, vocabulary vetting, message assembly and the skip decision are observed working.
FINDINGS: Not observed, because the secrets and the channel do not exist yet: a real AI Gateway answer, a real Telegram post, and a run of either workflow on GitHub Actions. The gateway endpoint and auth header were checked against Vercel's documentation, not exercised. The baseline tag `v1.0.0` must exist on `origin` before the first push to `main`, or the first release will treat the whole history as new.
