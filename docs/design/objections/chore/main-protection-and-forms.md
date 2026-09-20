route: lite
research: none
autonomy: autonomous
lenses: content-copy
why: In-repo part is one new YAML issue form plus a label edit; the risk is in the hand-off ruleset commands (a wrong ruleset can lock the project out) and in Ukrainian user-facing text under C1. Orchestrator plays advocate (lite route). Issue: #5.

# Plan (issue #5)

Scope: what the assistant may do is only the in-repo part. Repository rulesets, merge-method settings and branch cleanup are admin/security settings the assistant must not change; they go to the owner as runnable commands in an ADR, with the ruleset payload as a file next to it.

1. Create the `triage` label (done before this plan; it must exist before the forms land, because GitHub silently drops labels that do not exist).
2. Add `.github/ISSUE_TEMPLATE/documentation.yml`: issue form, labels `["documentation","triage"]`, three short fields (what is wrong in the docs; where; what it should say), text only in the bot's vocabulary (C1).
3. Add `triage` to `labels:` of `bug_report.yml` (`["bug","triage"]`) and `feature_request.yml` (`["enhancement","triage"]`).
4. Separate commit: replace banned vocabulary (вішліст, бронювання, підписки) in those two existing forms with the bot's own words, using the real button names from src/text.ts (e.g. «➕ Створити список», «🎁 Я подарую це», «👀 Списки друзів»).
5. `docs/decisions/0002-main-branch-protection.md` + `docs/decisions/0002-main-ruleset.json`: the decision, the defaults, the deadlock analysis, and the exact `gh api` commands. Defaults: ruleset on the default branch; rules: deletion, non_fast_forward, required_linear_history, pull_request (0 required approvals, allowed_merge_methods ["squash"]), required_status_checks [quality] with strict off; bypass actor = repository admin role, bypass_mode pull_request; then merge settings: squash only, delete branch on merge, squash title = PR title, squash message = BLANK (a PR body would land in main's history and carry the AI-attribution line the kit forbids in commits).

# Acceptance criteria

- [ ] `.github/ISSUE_TEMPLATE/documentation.yml` is a valid GitHub issue form (name, description, labels, body with typed fields) labelled documentation and triage.
      check: ruby -Ku -ryaml -e 'd=YAML.load_file(".github/ISSUE_TEMPLATE/documentation.yml"); abort unless d["labels"]==["documentation","triage"] && d["body"].all?{|b| b["type"] && b["attributes"]}'
- [ ] All three issue forms carry the `triage` label.
      check: for f in bug_report feature_request documentation; do ruby -ryaml -e 'abort unless YAML.load_file(ARGV[0])["labels"].include?("triage")' .github/ISSUE_TEMPLATE/$f.yml || exit 1; done
- [ ] None of the three forms contains a word C1 bans (вішліст, бронюв, підписк, редактор, архів, пріоритет).
      check: ! grep -i -E 'вішліст|бронюв|підписк|редактор|архів|пріоритет' .github/ISSUE_TEMPLATE/*.yml
- [ ] The `triage` label exists in the repository.
      check: gh label list --repo VovaKyrylenko/wishlist-bot | grep -q '^triage'
- [ ] The ruleset payload parses and requires the check that ci.yml actually reports, with no required approvals.
      check: jq -e '.rules[] | select(.type=="required_status_checks") | .parameters.required_status_checks[0].context=="quality"' docs/decisions/0002-main-ruleset.json && jq -e '.rules[] | select(.type=="pull_request") | .parameters.required_approving_review_count==0' docs/decisions/0002-main-ruleset.json
- [ ] The ADR states the deadlock analysis and the exact commands to apply and to roll back.
      manual: read docs/decisions/0002-main-branch-protection.md -> evidence: the sections exist and every command is copy-pasteable
- [ ] After the owner applies the commands: a direct push to main is rejected, a PR needs a green `quality`, the merge button offers squash only, new issues carry `triage`.
      manual: owner applies the ADR commands -> evidence: NOT VERIFIABLE by the assistant (admin settings); reported as UNKNOWN at hand-off

# Objection log

[OBJ-1] candidate: plan | severity: major | status: accepted-risk
CLAIM:      A bypass actor (repo admin, mode pull_request) is the identity the assistant merges with, so "a PR needs a green quality" is not delivered to the one caller it must constrain.
EVIDENCE:   gh api repos/VovaKyrylenko/wishlist-bot shows permissions.admin=true, owner.type=User; a bypass actor merges without waiting for required checks.
SCENARIO:   `gh pr merge` on a red or pending PR succeeds, and the push to main runs the Release workflow (tag + channel post).
BAR:        The ruleset binds the owner's own token, or the loophole is stated and accepted.
HISTORY:    r1 open (design-adversary) -> r1 proposed (orchestrator-as-advocate: `bypass_actors` is an empty list; the emergency path is the owner disabling the ruleset with one API call, which leaves an audit trail; the assistant's merge procedure is `gh pr checks --watch` then `gh pr merge --squash`, written into the ADR)
            -> r2 accepted-risk (design-adversary review pass: payload holds the mechanism (bypass_actors == [] is asserted; mutation makes `check` exit 1); the load-bearing claim that the owner's `gh pr merge --squash` is refused while `quality` is pending cannot be tested before apply, and the ADR's Risks accepted says so; bounded: at worst the owner's token merges a red PR and a chore:/docs: title does not publish)

[OBJ-2] candidate: plan | severity: major | status: verified
CLAIM:      The jq checks cannot fail on the ways the payload can silently not protect main (enforcement disabled, wrong include, missing required booleans, `quality` not equal to the ci.yml job id, no integration_id).
EVIDENCE:   Criterion 5 tested two facts only; GitHub docs https://docs.github.com/en/rest/repos/rules list required pull_request and required_status_checks fields.
SCENARIO:   A payload with enforcement "disabled" passes and protects nothing; a missing boolean gives a 422 only when the owner applies it.
BAR:        One offline check asserts every property and cross-checks the context against the workflow.
HISTORY:    r1 open (design-adversary) -> r1 proposed (advocate: scripts/main-protection.sh `check` asserts name, target, enforcement, include/exclude, empty bypass, the exact rule-type set, squash-only, all required booleans, and required_status_checks == [{quality, integration_id 15368}]; it also greps `^  quality:` in ci.yml)
            -> r2 open (design-adversary review pass: values of strict_required_status_checks_policy and four pull_request booleans were only checked for presence; 4 mutations exited 0; a `name:` on the quality job was invisible to the grep)
            -> r2 proposed (advocate: DESIGN now asserts every value; `check` also rejects a `name:` on the quality job; 9 mutations of the payload and ci.yml all rejected)
            -> r3 verified (design-adversary review pass round 2: 17 payload mutations and 5 ci.yml mutations run; all payload mutations exit 1; the earlier gaps (values not asserted, name: invisible) are closed)

[OBJ-3] candidate: plan | severity: major | status: verified
CLAIM:      Squash message BLANK drops BREAKING CHANGE footers, which scripts/release/notes.ts reads; the plan also never states the PR title type.
EVIDENCE:   scripts/release/notes.ts: `commits.some((c) => c.breaking || c.body.includes("BREAKING CHANGE"))`; body is read with %b.
SCENARIO:   A PR body says "BREAKING CHANGE: old links stop working"; after squash the body is empty, the release is minor, the notes lack the warning. A feat:/fix: title on a docs change would tag a release and post to the channel.
BAR:        Breaking changes remain signalable, and the PR-title rule is written down.
HISTORY:    r1 open (design-adversary) -> r1 proposed (advocate: keep BLANK, because a PR body would put the AI-attribution line into main's history, which the kit forbids in commits; the ADR states that breaking changes must use `type!:` in the PR title, which notes.ts reads from the subject; the PR for this issue is titled `chore:`)
            -> r2 verified (design-adversary review pass: notes.ts:66 regex run on `feat!: change link format (#12)` gives type feat and breaking set; notes.ts:292 reads body; ADR Consequences states the `type!:` rule; CLAUDE.md:23 and guard-ai-attribution.sh confirm the attribution rule)

[OBJ-4] candidate: plan | severity: minor | status: verified
CLAIM:      The issue-form check passes forms GitHub would reject (only-markdown body, no name/description).
EVIDENCE:   Adversary ran the one-liner against such forms; both exit 0.
SCENARIO:   A documentation.yml without `description` is green here and rejected by the chooser.
BAR:        The check asserts name, description, at least one non-markdown field, unique ids and labels.
HISTORY:    r1 open (design-adversary) -> r1 proposed (advocate: criterion 1 is restated with a stricter ruby check)
            -> r2 verified (design-adversary review pass: restated check aborts on four mutated copies (no description, markdown-only body, duplicate id, missing triage) and passes the real file)

[OBJ-5] candidate: plan | lens: content-copy | severity: major | status: verified
CLAIM:      The banned-word check can pass without checking anything (a missing file or an unmatched glob passes under `! grep`), and its stem list is a subset of the C1 table («Товари» is not caught).
EVIDENCE:   Lens pass reproduced `! grep … nonexistent*.yml` -> rc 0; the regex omits бажання, бронь, придбан, приватн, чуж, ротаці, item, wishlist, товар.
SCENARIO:   A form saying «Бронь» or «Товари», or a form at the wrong path, stays green.
BAR:        The check asserts the files exist and uses the full stem list with case folding that does not depend on the grep implementation.
HISTORY:    r1 open (design-adversary lens: content-copy; the full pass raised the same point as its own finding) -> r1 proposed (advocate: criterion 3 is a ruby script: assert the three files exist, downcase, test the full stem list; `режим` is left out because «режим сюрпризу» is the approved replacement)
            -> r2 verified (design-adversary review pass: missing path aborts, a scratch file with «Бронь і Товари» aborts on бронь, real forms pass all 16 stems)

[OBJ-6] candidate: plan | lens: content-copy | severity: minor | status: verified
CLAIM:      The vocabulary swap covers three words, but the forms also carry «Товари», «редагування», «Гостьовий перегляд», «Підписки/сповіщення», none matching src/text.ts.
EVIDENCE:   feature_request.yml:27-30, bug_report.yml:37-38; src/text.ts has «подарунок», «✏️ Змінити», «🔔 Стежити», «Сповіщення».
SCENARIO:   Three named words swapped, the rest stays in another product's language.
BAR:        Every dropdown option and placeholder maps to wording in src/text.ts.
HISTORY:    r1 open (design-adversary lens: content-copy) -> r1 proposed (advocate: step 4 rewrites every option with the bot's own terms)
            -> r2 verified (design-adversary review pass: git diff shows all four terms replaced; no banned stem left in any form)

[OBJ-7] candidate: plan | lens: content-copy | severity: minor | status: verified
CLAIM:      Audience and register are undecided; the forms mix bot-user questions with developer questions («вебхук», «long polling», «деплой»).
EVIDENCE:   Public repo; README invites PRs and issues; bug_report.yml has both kinds of fields.
SCENARIO:   Stripping developer terms to satisfy C1 loses triage information; keeping them makes "bot vocabulary only" false.
BAR:        One register per field is stated.
HISTORY:    r1 open (design-adversary lens: content-copy) -> r1 proposed (advocate: decision recorded as a comment at the top of each form: fields that describe what a person pressed or saw use the bot's words and «ти»; the environment/infrastructure fields are for maintainers and may keep technical terms)
            -> r2 verified (design-adversary review pass: register comments read in bug_report.yml, feature_request.yml and the where field of documentation.yml; note: the decision is recorded as comments in the forms, not in the ADR (corrected below))

[OBJ-8] candidate: plan | lens: content-copy | severity: minor | status: verified
CLAIM:      The existing forms address the reader as «Ви» and carry English names («Bug report», «Feature request»), against the «ти» tone rule.
EVIDENCE:   bug_report.yml:9, feature_request.yml:17, line 1 of each.
SCENARIO:   The swap lands and a reviewer still sees «Ви».
BAR:        Tone and names follow voice.md.
HISTORY:    r1 open (design-adversary lens: content-copy) -> r1 proposed (advocate: rewritten with «ти»; names become «🐛 Щось не працює», «✨ Ідея чи покращення», «📄 Документація»)
            -> r2 verified (design-adversary review pass: no «Ви/Вас/Вам/Ваш» in the forms; names are now «🐛 Щось не працює», «✨ Ідея чи покращення», «📄 Документація»)

[OBJ-9] candidate: plan | lens: content-copy | severity: minor | status: verified
CLAIM:      Nothing ties the button names quoted in the forms to src/text.ts, so a redesign leaves the template naming a button that no longer exists.
EVIDENCE:   The three quoted names match today (text.ts:83, :86, :172) but nothing checks it.
SCENARIO:   «Створити список» is renamed; the bug template keeps sending people to it.
BAR:        A check extracts every «…» from the forms and finds it in src/text.ts.
HISTORY:    r1 open (design-adversary lens: content-copy) -> r1 proposed (advocate: added as criterion 4; the documentation form quotes no bot strings so it stays out of scope of the check)
            -> r2 verified (design-adversary review pass: check passes real files and reports a scratch «➕ Створити всесвіт» as MISSING; loose substring match accepted for a minor item)

[OBJ-10] candidate: plan | severity: minor | status: verified
CLAIM:      "NOT VERIFIABLE by the assistant" is wrong: read-only calls (rules/branches/main and the repo GET) can verify the applied state.
EVIDENCE:   `gh api repos/VovaKyrylenko/wishlist-bot/rules/branches/main` returns [] today; the repo GET gives the merge settings.
SCENARIO:   The owner applies a wrong --input and nothing is applied; the hand-off still says UNKNOWN and nobody notices.
BAR:        A post-apply verification exists and is runnable by anyone.
HISTORY:    r1 open (design-adversary) -> r1 proposed (advocate: `scripts/main-protection.sh verify` reads both endpoints and exits non-zero on any difference; the ADR lists it as the last step; the criterion becomes UNKNOWN only until it is run)
            -> r2 verified (design-adversary review pass: `verify` exits 1 today against the live repo (rules in effect: ''), live GET /rulesets returns [])

[OBJ-11] candidate: plan | severity: minor | status: verified
CLAIM:      The assistant's merge command, the ADR's rollback (ruleset id), idempotency and apply order are undefined.
EVIDENCE:   allow_auto_merge is false, so `gh pr merge --auto` fails; a second POST of the same payload duplicates or 422s.
SCENARIO:   The assistant retries with --admin after the first rejection (see OBJ-1).
BAR:        The ADR states the merge procedure, the rollback with id lookup, and the order.
HISTORY:    r1 open (design-adversary) -> r1 proposed (advocate: ADR sections "How merges work afterwards", "Apply", "Roll back"; order is merge settings, then ruleset; auto-merge stays off, because nothing asked for it)
            -> r2 verified (design-adversary review pass: ADR has How merges work afterwards, Apply (order, duplicate warning) and Roll back (id lookup); allow_auto_merge is false live)

[OBJ-12] candidate: plan | severity: note | status: verified
CLAIM:      The bypass actor_id 5 for the admin role is not in official docs.
EVIDENCE:   github/rest-api-description issue #4406.
SCENARIO:   A wrong mapping gives a 422 or the wrong role bypassing.
BAR:        Moot once the bypass is dropped.
HISTORY:    r1 open (design-adversary) -> r1 proposed (advocate: moot, see OBJ-1: bypass_actors is empty)
            -> r2 verified (design-adversary review pass: moot, bypass_actors is [] and `check` enforces it)

[OBJ-13] candidate: plan | lens: content-copy | severity: note | status: accepted-risk
CLAIM:      The GitHub repository description still contains the banned word «вішлістів»; the plan's criteria do not cover it.
EVIDENCE:   gh repo view shows the description; C1 knock-ons already list it.
SCENARIO:   Users see «вішліст» on the page that links to the forms.
BAR:        Stated as out of scope and reported at hand-off.
HISTORY:    r1 open (design-adversary lens: content-copy) -> r1 proposed (advocate: accepted-risk: the description is a public repository setting and package.json carries the owner's uncommitted edits; both are named in the report)
            -> r2 accepted-risk (design-adversary review pass: live repo GET shows the description; named in the ADR's Risks accepted; cosmetic, bounded to one public page)

[OBJ-14] candidate: plan | severity: major | status: verified
CLAIM:      `verify` reports "protected as designed" for any ruleset that merely contains the five rule types; it never reads parameters, bypass actors or enforcement.
EVIDENCE:   Review pass ran verify with a stubbed gh returning approvals=1, allowed_merge_methods ["squash","merge"], context "other": output "ok", rc 0.
SCENARIO:   The owner applies a payload edited to 1 approval or with a bypass actor; verify says ok, so "applied" is believed while the design is not in force.
BAR:        verify asserts the same design as `check` on what GitHub reports, plus enforcement and bypass actors.
HISTORY:    r2 open (design-adversary review pass) -> r2 proposed (advocate: the design is one jq definition used by both commands; verify asserts every parameter of the rules in effect, that exactly one ruleset applies, and reads GET rulesets/<id> for enforcement == active and bypass_actors == []; tested against a stub gh: 1 positive and 10 negatives)
            -> r3 verified (design-adversary review pass round 2: verify tested against GitHub-shaped fixtures (extra keys, parameterless rules, current_user_can_bypass): positive passes rc 0; 16 negatives fail with the right message; live run against the real repo exits 1 before apply; bound: the real echo is checked against the documented schema, not a captured response, and an undocumented extra key in a check object would fail closed)

[OBJ-15] candidate: plan | severity: minor | status: verified
CLAIM:      The branch had a `fix:` commit; under the old merge settings a rebase or merge commit would carry it into main and publish an announcement about issue templates.
EVIDENCE:   git log ecfd4a5 "fix: give the bug and idea forms…"; live allow_merge_commit and allow_rebase_merge are true; notes.ts reads `git log --no-merges`.
SCENARIO:   The owner clicks the UI merge button instead of `gh pr merge --squash`.
BAR:        No release-worthy type in the commits of this branch, and the ADR says how to merge it.
HISTORY:    r2 open (design-adversary review pass) -> r2 proposed (advocate: the commit is retitled `docs:`; the ADR states that this PR is squash-merged with a `chore:` title)
            -> r3 verified (design-adversary review pass round 2: git log --format=%s origin/main..HEAD has no feat/fix/perf; notes.ts SKIP_TYPES contains chore and docs)

[OBJ-16] candidate: plan | severity: minor | status: verified
CLAIM:      The rollback for merge settings is not a copy-pasteable command and the prior values are not recorded.
EVIDENCE:   ADR said merge settings "can be set back the same way"; pre-apply live values: merge and rebase allowed, delete_branch_on_merge false, title COMMIT_OR_PR_TITLE, message COMMIT_MESSAGES.
SCENARIO:   Someone has to reconstruct the previous settings during an incident.
BAR:        The reverse PATCH is in the ADR with the recorded values.
HISTORY:    r2 open (design-adversary review pass) -> r2 proposed (advocate: reverse PATCH added to Roll back, values recorded 2026-09-20)
            -> r3 verified (design-adversary review pass round 2: ADR values equal the live pre-apply GET (merge true, rebase true, delete false, COMMIT_OR_PR_TITLE, COMMIT_MESSAGES); both PATCH pairings valid)

[OBJ-17] candidate: plan | severity: note | status: verified
CLAIM:      Two ADR statements were wrong ("kit-guards needs the base branch's guard to exist"; "a ruleset applied earlier blocks the PR"), and the ruleset's public-repository dependency was not stated.
EVIDENCE:   kit-guards.yml:19-24 falls back to the branch's own guard; a green squash PR merges under the ruleset; GitHub docs: rulesets on Free plans are public-repo only.
SCENARIO:   A reader acts on a wrong reason.
BAR:        The ADR states only true reasons.
HISTORY:    r2 open (design-adversary review pass) -> r2 proposed (advocate: both sentences rewritten, the public-repo dependency added to Consequences)
            -> r3 verified (design-adversary review pass round 2: kit-guards.yml:19-24 falls back to the branch's script; the ADR now says a green squash PR still merges under the ruleset; live repo is public)

[OBJ-18] candidate: plan | severity: minor | status: proposed
CLAIM:      `check` says "quality is a real job id" but cannot see a `strategy:` matrix or a `paths:` filter, which also make the required check never report.
EVIDENCE:   Review pass round 2 added each to ci.yml; `check` returned ok for both.
SCENARIO:   A later CI edit passes `check` and leaves every PR, or every docs PR, waiting on a required check.
BAR:        `check` rejects both, or the ADR states its limit.
HISTORY:    r3 open (design-adversary review pass round 2) -> r3 proposed (advocate: `check` rejects name:, strategy: inside the quality job and paths:/paths-ignore: anywhere in ci.yml, and accepts a trailing comment after `quality:`; negative controls run: 4 rejected, 1 valid edit accepted; the ADR names all four)

[OBJ-19] candidate: plan | severity: note | status: proposed
CLAIM:      `verify` says "not active or has bypass actors" when the caller cannot read bypass_actors (no write access), which is misleading.
EVIDENCE:   GitHub docs: bypass_actors is returned only to a caller with write access to the ruleset.
SCENARIO:   A collaborator without admin is told the ruleset has bypass actors when it does not.
BAR:        A distinct message, or a documented requirement.
HISTORY:    r3 open (design-adversary review pass round 2) -> r3 proposed (advocate: a distinct message when the field is absent, and the ADR says to run verify as the owner or an admin; tested with a stub gh)

# Revised acceptance criteria (after r1)

- [ ] documentation.yml is a valid issue form: non-empty name and description, labels exactly ["documentation","triage"], at least one non-markdown field, every non-markdown field with a unique id and a label.
      check: ruby -Ku -ryaml -e 'd=YAML.load_file(".github/ISSUE_TEMPLATE/documentation.yml"); f=d["body"].reject{|b| b["type"]=="markdown"}; ids=f.map{|b| b["id"]}; abort "bad" unless d["name"].to_s.size>0 && d["description"].to_s.size>0 && d["labels"]==["documentation","triage"] && f.size>0 && ids.none?(&:nil?) && ids.uniq.size==ids.size && f.all?{|b| b["attributes"]["label"].to_s.size>0}'
- [ ] All three forms exist and carry the `triage` label.
      check: ruby -Ku -ryaml -e '%w[bug_report feature_request documentation].each{|n| p=".github/ISSUE_TEMPLATE/#{n}.yml"; abort "missing #{p}" unless File.file?(p); abort "no triage in #{p}" unless YAML.load_file(p)["labels"].include?("triage")}'
- [ ] None of the three forms contains a banned stem (case-folded), and all three files exist.
      check: ruby -Ku -e 'stems=%w[вішліст wishlist бронюв бронь бажання придбан підписк підписа редактор архів приватн чуж ротаці пріоритет товар item]; %w[bug_report feature_request documentation].each{|n| p=".github/ISSUE_TEMPLATE/#{n}.yml"; abort "missing #{p}" unless File.file?(p); t=File.read(p).downcase; stems.each{|s| abort "#{p}: #{s}" if t.include?(s)}}'
- [ ] Every «…» quoted in the forms exists in src/text.ts (leading emoji ignored).
      check: ruby -Ku -e 'src=File.read("src/text.ts"); Dir[".github/ISSUE_TEMPLATE/*.yml"].each{|f| File.read(f).scan(/«([^»]+)»/).flatten.each{|q| s=q.sub(/\A[^\p{L}]+/,"").strip; abort "#{f}: «#{q}»" unless src.include?(s)}}'
- [ ] The `triage` label exists in the repository.
      check: gh label list --repo VovaKyrylenko/wishlist-bot | grep -q '^triage'
- [ ] The ruleset payload satisfies every property of the design and names the job id ci.yml really has.
      check: bash scripts/main-protection.sh check
- [ ] The ADR states: no bypass and why; the assistant's merge procedure; breaking changes via `type!:` in the PR title; apply order; rollback with id lookup; the verify command.
      manual: read docs/decisions/0002-main-branch-protection.md -> evidence: each section exists
- [ ] The PR for this issue is titled `chore:` (no release, no channel post).
      manual: PR title at creation -> evidence: the title
- [ ] After the owner applies the ADR commands, the protection is in effect.
      check: bash scripts/main-protection.sh verify   (UNKNOWN until the owner applies; the assistant cannot apply admin settings)
