#!/usr/bin/env bash
# Checks the branch-protection design of ADR 0002 in two directions:
#
#   check   offline: the ruleset payload has every property the design needs, and the
#           required check names the job id ci.yml really has. Safe anywhere.
#   verify  online, read-only (GET only): what GitHub reports for main matches the
#           design. Run it after the owner has applied the ADR's commands; exits
#           non-zero on the first difference, so "applied" is a fact, not a belief.
#
# It never changes any repository setting. Applying is the owner's act (ADR 0002).

set -euo pipefail

payload="docs/decisions/0002-main-ruleset.json"
workflow=".github/workflows/ci.yml"

cmd_check() {
  [ -f "$payload" ] || { echo "missing $payload" >&2; exit 1; }
  # A payload that parses but does not protect is the failure this guards: disabled
  # enforcement, an include that matches nothing, or a required check that no job
  # reports would each pass a syntax check and leave main open (or unmergeable).
  jq -e '
    .name == "main" and .target == "branch" and .enforcement == "active"
    and .conditions.ref_name.include == ["~DEFAULT_BRANCH"]
    and .conditions.ref_name.exclude == []
    and .bypass_actors == []
    and ([.rules[].type] | sort) ==
        (["deletion","non_fast_forward","pull_request","required_linear_history","required_status_checks"] | sort)
    and (.rules[] | select(.type == "pull_request") | .parameters
         | .required_approving_review_count == 0
           and .allowed_merge_methods == ["squash"]
           and has("dismiss_stale_reviews_on_push") and has("require_code_owner_review")
           and has("require_last_push_approval") and has("required_review_thread_resolution"))
    and (.rules[] | select(.type == "required_status_checks") | .parameters
         | has("strict_required_status_checks_policy")
           and .required_status_checks == [{"context":"quality","integration_id":15368}])
  ' "$payload" >/dev/null || { echo "ruleset payload does not match the design" >&2; exit 1; }

  # The context is a job id, not a label: renaming the job would leave main waiting on a
  # check that never reports.
  grep -q '^  quality:$' "$workflow" \
    || { echo "$workflow has no job with id 'quality'" >&2; exit 1; }
  echo "ok: ruleset payload matches the design and 'quality' is a real job id"
}

cmd_verify() {
  local repo
  repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"

  local types
  types="$(gh api "repos/$repo/rules/branches/main" --jq '[.[].type] | unique | sort | join(",")')"
  local want="deletion,non_fast_forward,pull_request,required_linear_history,required_status_checks"
  [ "$types" = "$want" ] || { echo "rules in effect on main: '$types' (want '$want')" >&2; exit 1; }

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
