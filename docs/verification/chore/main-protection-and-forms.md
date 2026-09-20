# Verification — chore/main-protection-and-forms (issue #5)

## Run 1 — checks and runtime observation (2026-09-20)

VERDICT: PASS
CLAIM:   The documentation issue form and the triage label are in place, the two existing forms use the bot's vocabulary and carry `triage`, and the branch-protection design (ADR 0002) is machine-checkable both before and after the owner applies it.
METHOD:  Ran every `check:` command of the revised criteria in the worktree; ran `scripts/main-protection.sh check` against 23 mutations of the payload and of `ci.yml`; ran `verify` against a stub `gh` returning GitHub-shaped responses (1 positive, 10+ negatives) and against the live repository (read-only).
STEPS:
  1. `kit design-check` -> 8 checks, 0 failed, 0 warnings; 19 objections, every blocker and major terminal.
  2. `bash scripts/main-protection.sh check` -> ok; every mutation rejected, and one valid edit (a trailing comment after `quality:`) accepted.
  3. `bash scripts/main-protection.sh verify` against the live repository -> exit 1, "rules in effect on main: ''": correct, nothing is applied yet.
  4. `npm run typecheck`, `npm run lint` (pre-commit hook, on all four commits) -> clean.
EVIDENCE: shared transcript of the commands, and the auditor blocks below.
FINDINGS: the first run of my own `check:` commands failed twice (a colon in a YAML value; Cyrillic in `ruby -e` without `-Ku`), which is why the criteria now say `ruby -Ku`. The review pass found that the first `verify` accepted any ruleset with the right rule types; it now asserts every parameter, the enforcement and the bypass actors.

## Run 2 — acceptance audit (2026-09-20)

CRITERION: documentation.yml is a valid issue form: non-empty name and description, labels exactly ["documentation","triage"], at least one non-markdown field, every non-markdown field with a unique id and a label.
VERDICT: PASS
EVIDENCE: check exits 0; three fields with ids `what-is-wrong`, `where`, `fix`, each with a label; labels exactly `["documentation", "triage"]`.
NOTE: the auditor found that the check alone would pass a form with a single field lacking an `id` (a lone `nil` counts as unique). The check now also requires `ids.none?(&:nil?)`; the file itself has all three ids.

CRITERION: All three forms exist and carry the `triage` label.
VERDICT: PASS
EVIDENCE: `labels:` at line 3 of `bug_report.yml`, `feature_request.yml`, `documentation.yml`; a mutated copy without `triage` or without a file makes the check exit 1.

CRITERION: None of the three forms contains a banned stem (case-folded), and all three files exist.
VERDICT: PASS
EVIDENCE: check exits 0; injected «Вішліст», «Мої Бронювання», «Архів», «ITEM» and a deleted file are all rejected.
NOTE: technical words remain in the maintainer-facing fields (вебхук, long polling, деплой, Cron), each covered by a comment in the form. The stem list lacks the genitive «бажань», which is allowed only in «список бажань», and `режим`, allowed only in «режим сюрпризу»; neither appears in the forms.

CRITERION: Every «…» quoted in the forms exists in src/text.ts (leading emoji ignored).
VERDICT: PASS
EVIDENCE: the forms contain exactly one, «➕ Створити список» (`bug_report.yml:29`), which is `src/text.ts:83`; an injected «Неіснуюча фраза xyz» makes the check exit 1.

CRITERION: The `triage` label exists in the repository.
VERDICT: PASS
EVIDENCE: `gh label list` -> `triage	Needs a first look	#fbca04`; a nonexistent name makes the same pipeline exit 1.

CRITERION: The ruleset payload satisfies every property of the design and names the job id ci.yml really has.
VERDICT: PASS
EVIDENCE: `bash scripts/main-protection.sh check` exits 0; 23 mutations rejected (enforcement, bypass, approvals, merge methods, integration id, strict, each missing rule, include/exclude, target, name, extra rules, extra check, `Quality`, job renamed, `name:`, `strategy:`, `paths:`).
NOTE: not asserted by `check`: the repository merge settings (only `verify` reads them), `allow_auto_merge` off, and that `ci.yml` still triggers on pull requests to main (removing the trigger would pass).

CRITERION: The ADR states: no bypass and why; the assistant's merge procedure; breaking changes via `type!:` in the PR title; apply order; rollback with id lookup; the verify command.
VERDICT: PASS
EVIDENCE: each item quoted with line numbers by the auditor (bypass line 20; merge procedure line 36; `type!:` line 29; apply order line 40; rollback lines 59-75; verify line 54); all commands balanced and copy-pasteable, the ruleset id in the DELETE command is a deliberate `<id>` placeholder printed by the preceding lookup.

CRITERION: After the owner applies the ADR commands, the protection is in effect.
VERDICT: UNKNOWN
EVIDENCE: `verify` exits 1 against the live repository ("rules in effect on main: ''"); `GET /rulesets` and `GET /rules/branches/main` both return `[]`. The assistant cannot apply admin settings.
NOTE: becomes PASS when the owner runs the ADR's Apply commands and `bash scripts/main-protection.sh verify` then exits 0.

CRITERION: The PR for this issue is titled `chore:` (no release, no channel post).
VERDICT: PASS
EVIDENCE: PR #9 is titled "chore: protect main by design and tidy the issue forms (#5)", with no rename events; the release script's own regex (`scripts/release/notes.ts:66`) classifies the squash subject as `chore`, so `notable` is 0 and the release is skipped before any model call; all six commit subjects on the branch are `chore` or `docs`, so even a rebase or merge-commit merge releases nothing.
NOTE: covers the title and commits as they stand at audit time; the kit-release workflow's handling of `skip=true` was not re-read by the auditor (it is the same one that skipped the release for #8).

SUMMARY: 8 PASS, 0 FAIL, 1 UNKNOWN.
