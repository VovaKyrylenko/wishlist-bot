# 0002: Protect main with a ruleset, squash only

Status: proposed (applied by the owner, see "Apply")
Date: 2026-09-20

## Context

`main` has no protection. `GET /repos/VovaKyrylenko/wishlist-bot/rulesets` returns `[]`, merge commits, squash and rebase are all allowed, and merged branches are not deleted. `ci.yml` says its `quality` job is "the required check for branch protection on main", but nothing requires it. The release pipeline (ADR 0001) turns every push to `main` into a possible release and channel post, so an unreviewed or red push is not just untidy, it is public.

Repository rulesets and merge-method settings are administration of the repository's security, so the assistant does not change them. This record is the decision and the exact commands; the owner applies them, and `scripts/main-protection.sh` proves afterwards that they took effect.

## Decision

A repository ruleset on the default branch, with these rules and nothing else:

- `deletion` and `non_fast_forward`: main cannot be deleted or force-pushed.
- `required_linear_history`.
- `pull_request`: a pull request is required, **0 required approvals** (a sole maintainer cannot approve their own PR, so 1 would deadlock every merge), and `allowed_merge_methods` is `["squash"]`.
- `required_status_checks`: `quality`, from the GitHub Actions app (`integration_id` 15368, so no other app can satisfy it), with "up to date" checking off (the issue does not ask for it and it forces a rebase on every PR).
- **No bypass actors.** A bypass would let the token the assistant merges with skip the checks, which is the one caller the rule exists to constrain. The emergency path is the owner disabling the ruleset (one API call, with an audit trail), not a standing exception.

Repository settings: squash merging only, delete head branches on merge, squash commit **title = PR title**, squash commit **message = blank**. Blank on purpose: a PR body would put the AI-attribution line into `main`'s history, which the kit forbids in commits, and would make the commit list noisy. `allow_auto_merge` stays off; nothing asked for it.

The payload is `docs/decisions/0002-main-ruleset.json`.

## Consequences that need a rule

- **The PR title is the release input.** With squash the title becomes the commit subject on `main`, and `scripts/release/notes.ts` reads its type: `feat`/`fix`/`perf` make a release and a channel post, `chore`/`docs`/`ci` do not. A `feat:` title on a docs change publishes something false.
- **Breaking changes are marked in the title, `type!:`.** Because the squash message is blank, a `BREAKING CHANGE:` footer in the PR body never reaches `main`, and `notes.ts` would call the release minor. `feat!: change link format` is read; the body is not.
- **The `quality` job id must not be renamed.** The required check is that job's id. A rename leaves every PR waiting for a check that never reports; `main-protection.sh check` fails when `ci.yml` has no `quality` job, and the change would need the emergency path.
- `kit-guards` and `announcement-preview` also run on PRs but are deliberately not required: the first needs the base branch's guard to exist, the second needs secrets.

## How merges work afterwards

Open the PR, wait for the required check (`gh pr checks --watch`), then `gh pr merge --squash`. Never `--admin` and never `--auto`. The release workflow only pushes tags with `GITHUB_TOKEN` and never pushes commits to `main`, and a branch ruleset does not cover tags, so it is unaffected. Dependabot PRs run the same `ci.yml`, which needs no secrets, so they can go green.

## Apply

Order matters: merge the PR that carries this record first (a ruleset applied earlier blocks it), then merge settings, then the ruleset.

```bash
gh api --method PATCH repos/VovaKyrylenko/wishlist-bot \
  -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true \
  -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=BLANK
```

```bash
gh api --method POST repos/VovaKyrylenko/wishlist-bot/rulesets --input docs/decisions/0002-main-ruleset.json
```

```bash
bash scripts/main-protection.sh verify
```

`verify` reads what GitHub reports for `main` and the repository settings, and exits non-zero on any difference. Applying the same payload twice makes a second ruleset or a 422, so re-run only `verify`.

## Roll back

Find the ruleset id and delete it; merge settings can be set back the same way.

```bash
gh api repos/VovaKyrylenko/wishlist-bot/rulesets --jq '.[] | select(.name=="main") | .id'
```

```bash
gh api --method DELETE repos/VovaKyrylenko/wishlist-bot/rulesets/<id>
```

## Alternatives considered

- **Classic branch protection.** GitHub is migrating repositories to rulesets; rulesets also express "squash only" and can be stored as a file and verified.
- **Admin bypass for emergencies.** Rejected above: it defeats the protection for the assistant's own merges, and disabling the ruleset is the same power with a record.
- **Required approvals of 1.** Deadlocks a single-maintainer repository.
- **Squash message from the PR body.** Keeps `BREAKING CHANGE` footers, at the cost of putting attribution and PR prose into `main`'s history.

## Risks accepted

- The payload was checked against GitHub's documentation and by `check`, but not applied: the first apply is the first real test. `verify` is the guard against "applied" being assumed.
- Whether `gh pr merge --squash` succeeds for the repository owner while the required check is pending was not tested; if it succeeds regardless, the ruleset protects against pushes and mistakes but not against the owner's token, and the merge procedure above is what keeps the assistant honest.
- `integration_id` 15368 is the GitHub Actions app: `GET /repos/VovaKyrylenko/wishlist-bot/commits/main/check-runs` reports `quality` with `app.id=15368` (`github-actions`), checked 2026-09-20. If a later PR shows `quality` never reporting, correct it here.
- The repository description on GitHub still says «вішлістів» (constraint C1). It is a public repository setting and not part of this change.

## Supersedes

## Superseded by
