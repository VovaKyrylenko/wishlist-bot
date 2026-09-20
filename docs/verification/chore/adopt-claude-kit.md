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

## Run 2 — release announcement (2026-09-20)

VERDICT: BLOCKED
CLAIM:   After a release, Claude writes an announcement and it is posted to a Telegram channel.
METHOD:  Ran `scripts/announce-release.ts` locally; parsed the workflow YAML.
STEPS:
  1. Run with no secrets set
     -> "Announcement skipped: ANTHROPIC_API_KEY, ANNOUNCE_BOT_TOKEN, ANNOUNCE_CHAT_ID not set.", exit 0.
  2. Run with an invalid API key and `DRY_RUN=1`
     -> a `::warning title=Release announcement failed::Anthropic API 401 …` line, exit 0.
  3. `check()` on six inputs: `SKIP`, blank, a clean Ukrainian text, text containing "забронювати", text containing "Вішлісти", 1300 characters
     -> only the clean text was accepted; the other five were rejected with the matching reason.
  4. Parsed `.github/workflows/kit-release.yml`
     -> steps: checkout, version, Release, setup-node, Announce.
EVIDENCE: outputs above. The failure paths and the validator are observed working.
FINDINGS: Not observed, because the secrets and the channel do not exist yet: a real Claude answer, a real Telegram post, and a run of the workflow on GitHub Actions. The first release is deliberately not announced, so the first real announcement will be the second release after merge.
