#!/usr/bin/env bash
# Checks the branch-protection design of ADR 0002 in two directions:
#
#   check   offline: the ruleset payload has every property the design needs, with the
#           values the design states, and the required check names a job id that
#           ci.yml really has. Safe anywhere.
#   verify  online, read-only (GET only): what GitHub reports for main and for the
#           repository matches the design, parameters included. Run it after the
#           owner has applied the ADR's commands; it exits non-zero on the first
#           difference, so "applied" is a fact, not a belief.
#
# It never changes any repository setting. Applying is the owner's act (ADR 0002).

set -euo pipefail

payload="docs/decisions/0002-main-ruleset.json"
workflow=".github/workflows/ci.yml"

# The design of the rules, written once and applied to a list of rules. `check` runs it
# on the payload; `verify` runs it on what GitHub reports as in effect, so the two cannot
# drift apart. Every value is asserted, not just the key's presence: a payload with
# 1 required approval deadlocks a sole maintainer, and "up to date" checking on forces a
# rebase on every PR.
DESIGN='
  def design:
    (map(select(.type == "pull_request")) | length == 1)
    and (map(select(.type == "required_status_checks")) | length == 1)
    and (.[] | select(.type == "pull_request") | .parameters
         | .required_approving_review_count == 0
           and .allowed_merge_methods == ["squash"]
           and .dismiss_stale_reviews_on_push == false
           and .require_code_owner_review == false
           and .require_last_push_approval == false
           and .required_review_thread_resolution == false)
    and (.[] | select(.type == "required_status_checks") | .parameters
         | .strict_required_status_checks_policy == false
           and .required_status_checks == [{"context":"quality","integration_id":15368}]);
'
WANT_TYPES="deletion,non_fast_forward,pull_request,required_linear_history,required_status_checks"

cmd_check() {
  [ -f "$payload" ] || { echo "missing $payload" >&2; exit 1; }
  # A payload that parses but does not protect is the failure this guards: disabled
  # enforcement, an include that matches nothing, or a required check that no job
  # reports would each pass a syntax check and leave main open (or unmergeable).
  jq -e "$DESIGN"'
    .name == "main" and .target == "branch" and .enforcement == "active"
    and .conditions.ref_name.include == ["~DEFAULT_BRANCH"]
    and .conditions.ref_name.exclude == []
    and .bypass_actors == []
    and ([.rules[].type] | sort | join(",")) == "'"$WANT_TYPES"'"
    and (.rules | design)
  ' "$payload" >/dev/null || { echo "ruleset payload does not match the design" >&2; exit 1; }

  # The context is a job id, not a label: renaming the job would leave main waiting on a
  # check that never reports.
  grep -q '^  quality:$' "$workflow" \
    || { echo "$workflow has no job with id 'quality'" >&2; exit 1; }
  # GitHub reports a check under the job's `name:` when it has one, and the required
  # context is matched against that, not against the id.
  if awk '/^  quality:$/ {inq=1; next} inq && /^  [A-Za-z0-9_-]+:$/ {inq=0} inq && /^    name:/ {found=1} END {exit found ? 0 : 1}' "$workflow"; then
    echo "the quality job in $workflow has a name:, so its check would not be reported as 'quality'" >&2
    exit 1
  fi
  echo "ok: ruleset payload matches the design and 'quality' is a real job id"
}

cmd_verify() {
  local repo rules id
  repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"

  rules="$(gh api "repos/$repo/rules/branches/main")"
  local types
  types="$(printf '%s' "$rules" | jq -r '[.[].type] | unique | sort | join(",")')"
  [ "$types" = "$WANT_TYPES" ] \
    || { echo "rules in effect on main: '$types' (want '$WANT_TYPES')" >&2; exit 1; }
  printf '%s' "$rules" | jq -e "$DESIGN"'design' >/dev/null \
    || { echo "rule parameters in effect on main differ from the design" >&2; exit 1; }

  # rules/branches/main does not carry bypass actors or enforcement, so read the ruleset
  # itself. Exactly one ruleset may be in charge, or "the design" would be ambiguous.
  printf '%s' "$rules" | jq -e '[.[].ruleset_id] | unique | length == 1' >/dev/null \
    || { echo "more than one ruleset applies to main" >&2; exit 1; }
  id="$(printf '%s' "$rules" | jq -r '.[0].ruleset_id')"
  gh api "repos/$repo/rulesets/$id" | jq -e '.enforcement == "active" and .bypass_actors == []' >/dev/null \
    || { echo "ruleset $id is not active or has bypass actors" >&2; exit 1; }

  gh api "repos/$repo" | jq -e '
    .allow_squash_merge == true and .allow_merge_commit == false and .allow_rebase_merge == false
    and .delete_branch_on_merge == true
    and .squash_merge_commit_title == "PR_TITLE" and .squash_merge_commit_message == "BLANK"
  ' >/dev/null || { echo "merge settings differ from the design (see ADR 0002)" >&2; exit 1; }
  echo "ok: main is protected as designed on $repo"
}

case "${1:-}" in
  check)  cmd_check ;;
  verify) cmd_verify ;;
  *) echo "usage: $0 check|verify" >&2; exit 2 ;;
esac
