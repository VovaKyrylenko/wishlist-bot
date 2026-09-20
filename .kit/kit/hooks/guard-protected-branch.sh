#!/usr/bin/env bash
# Blocks commits on a protected branch.
#
# Why this is a hook and not a rule in CLAUDE.md: instructions are advisory and their
# adherence decays with context length and changes between model versions. This does not.

set -euo pipefail
# Read by kit_target_repo in lib.sh, which this script sources.
# shellcheck disable=SC2034
KIT_GUARDED_SUBCOMMAND=commit
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

kit_read_input

kit_is_git_subcommand commit || exit 0

# A dry run changes nothing — but read it from the SKELETON. As a substring test on the
# raw command, `git commit -m "feat: x" # --dry-run` disabled the guard, and so did an
# ordinary message about adding a --dry-run flag.
case "$(kit_command_skeleton)" in
  *--dry-run*) exit 0 ;;
esac

kit_escape_hatch KIT_ALLOW_PROTECTED_BRANCH && exit 0

branch="$(kit_current_branch)"
[ -n "$branch" ] || exit 0

# The built-in list plus the repository's own default branch always apply; the profile
# can only ADD to them.
#
# Union rather than replace. The profile is an ordinary file, and editing it is not a
# Bash tool call, so no guard observes the change — a profile that could narrow policy
# would be a one-line, silent, permanent kill switch that survives review as a table row.
# Widening policy is useful; quietly switching it off is the thing being prevented.
default_branch="$(git -C "$(kit_target_repo)" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || true)"
default_branch="${default_branch#origin/}"

protected="main master production release"
[ -n "$default_branch" ] && protected="$protected $default_branch"
protected="$protected $(kit_profile_list PROTECTED_BRANCHES | awk '{ printf "%s ", $0 }')"

set -f
for p in $protected; do
  if [ "$branch" = "$p" ]; then
    kit_deny \
      "'$branch' is a protected branch — commit on a feature branch and open a pull request." \
      "Deliberate bypass: prefix the command with KIT_ALLOW_PROTECTED_BRANCH=1"
  fi
done
set +f

exit 0
