#!/usr/bin/env bash
# Anti-gaming guard for CI.
#
# Agent-written pull requests fail in ways human ones rarely do: the fastest route to a
# green build is sometimes to weaken the build. These checks look for that specific move.
# They belong in CI rather than in a reviewer prompt, because a check that runs only when
# a model decides to run it is not a check.
#
#   scripts/kit-ci-guards.sh [base-ref]
#
# Exits non-zero on any finding. Deliberate CI changes are allowed by putting the token
# [ci-change] in a commit message in the range, which leaves a record in the history.

set -uo pipefail

BASE="${1:-${KIT_BASE_REF:-origin/main}}"
HEAD_REF="${KIT_HEAD_REF:-HEAD}"

# A missing base ref used to exit 0. That turned every condition which loses
# origin/<base> — a shallow clone, a renamed default branch — into a green anti-gaming
# job, which is the one outcome this script must never produce by accident.
git rev-parse --verify --quiet "$BASE" >/dev/null || {
  printf 'kit-ci-guards: base ref %s not found, so nothing could be compared.\n' "$BASE" >&2
  printf 'Fetch the base branch (fetch-depth: 0) or set KIT_BASE_REF.\n' >&2
  exit 1
}

RANGE="$BASE...$HEAD_REF"
findings=0

report() { printf '  FAIL  %s\n    %s\n' "$1" "$2"; findings=$((findings + 1)); }
note()   { printf '  ok    %s\n' "$1"; }

# Path SEGMENTS and filename shapes, not substrings. Matching `*test*` made
# `src/ab-testing-flags.ts` a test file, and a guard that fires on ordinary filenames is
# a guard someone deletes.
is_test_path() {
  case "/$1" in
    */tests/*|*/test/*|*/spec/*|*/specs/*|*/__tests__/*|*/e2e/*|*/testing/*) return 0 ;;
  esac
  case "$(basename -- "$1")" in
    *.test.*|*.spec.*|test_*.py|*_test.py|*_test.go|*_test.rb|*Test.java|*Tests.cs) return 0 ;;
  esac
  return 1
}

changed() { git diff --name-only "$RANGE" -- "$@" 2>/dev/null; }

# Deletions, plus renames that move a test OUT of a test path — which removes coverage
# exactly as deleting it does. `--name-only` reports a rename's DESTINATION, so filtering
# on R alone hid the very move it was added to catch; the source path is what matters.
deleted() {
  git diff --name-status --diff-filter=D "$RANGE" 2>/dev/null | awk '{ print $2 }'
  git diff --name-status --diff-filter=R "$RANGE" 2>/dev/null \
    | while read -r _status old new; do
        if is_test_path "$old" && ! is_test_path "$new"; then printf '%s\n' "$old"; fi
      done
}
# The vendored engine (`.kit/`) is excluded from every scan below. It is not this
# project's tests or CI: it arrives whole from `kit update`, and its integrity is the
# manifest's job (`kit doctor` → vendored-intact), not this guard's. Scanning it produces
# only false positives — the engine ships a copy of THIS script, whose own detection
# regex contains the literals `.skip(` and `.only(`, which failed every project that
# vendored the kit.
KIT_VENDOR_EXCLUDE=':(exclude).kit'

added_lines()  { git diff -U0 "$RANGE" -- "$@" "$KIT_VENDOR_EXCLUDE" 2>/dev/null | grep -E '^\+[^+]' 2>/dev/null || true; }
removed_lines(){ git diff -U0 "$RANGE" -- "$@" "$KIT_VENDOR_EXCLUDE" 2>/dev/null | grep -E '^-[^-]' 2>/dev/null || true; }

approved_ci_change() {
  [ "${KIT_CI_CHANGE_APPROVED:-0}" = "1" ] && return 0
  # Matched WITHOUT a pipe, deliberately. `git log | grep -Fq` is a race under
  # `set -o pipefail`: grep exits the moment it matches, git log dies of SIGPIPE, and 141
  # becomes the pipeline's status even though the token was found. The same invocation
  # passed and failed on consecutive runs, so the guard's own documented escape hatch
  # worked by luck — which is worse than not having one, because people rely on it.
  case "$(git log --format=%B "$RANGE" 2>/dev/null)" in
    *'[ci-change]'*) return 0 ;;
  esac

  # A change whose every commit is typed `ci:` or `build:` is a declared CI change: the
  # conventional-commit type states the intent in the history exactly as the token does.
  # Replaying real history showed this guard failing commits whose entire purpose was to
  # add or fix a workflow — the largest false-positive class it had, and the kind that
  # gets a guard deleted rather than fixed.
  local subjects typed total
  subjects="$(git log --format=%s "$RANGE" 2>/dev/null)"
  [ -n "$subjects" ] || return 1
  total="$(printf '%s\n' "$subjects" | grep -c .)"
  typed="$(printf '%s\n' "$subjects" | grep -cE '^(ci|build)(\([^)]*\))?!?:' || true)"
  [ "$total" -gt 0 ] && [ "$typed" -eq "$total" ]
}

printf '\nkit CI guards (%s)\n\n' "$RANGE"

# 1. Deleted tests -----------------------------------------------------------
gone=""
while IFS= read -r f; do
  [ -n "$f" ] || continue
  is_test_path "$f" && gone="$gone $f"
done <<< "$(deleted)"
if [ -n "$gone" ]; then
  # The flag has to actually work here. The message advertised [ci-change] while this
  # check never consulted it, so the documented way out did nothing.
  if approved_ci_change; then
    note "tests removed, flagged [ci-change]:$gone"
  else
    report "tests deleted or moved out of a test path" "removed:$gone — put [ci-change] in a commit message if this is deliberate"
  fi
else
  note "no tests deleted"
fi

# 2. Newly skipped tests -----------------------------------------------------
# A skip whose first argument is a STRING disables a named test. A skip whose first
# argument is an expression is a conditional guard — `test.skip(rows === 0, "no data in
# staging")` is a legitimate pattern, and replaying real history showed this check failing
# two commits that used it. Same reasoning for pytest: `skip` is unconditional, `skipif`
# is a guard. `t.Skip(` is left out entirely: in Go it is nearly always inside an `if`.
# The guard's own file is excluded: it necessarily contains every one of these patterns
# inside its grep, so installing or updating the guard used to trip the guard — found on
# the first live bootstrap PR this script ever judged.
skips="$(added_lines . ':(exclude)scripts/kit-ci-guards.sh' | grep -Ei "(\.(skip|only)\([[:space:]]*[\"'\`]|\.(skip|only)\([[:space:]]*\)|\bxit\(|\bxdescribe\(|@pytest\.mark\.skip[^i]|#\[ignore\]|@Ignore)" || true)"
if [ -n "$skips" ]; then
  report "tests skipped or narrowed to .only" "$(printf '%s' "$skips" | head -3 | tr '\n' ' ')"
else
  note "no new skips"
fi

# 3. Lowered coverage thresholds --------------------------------------------
#
# Scoped to configuration files. Scanning every changed file compared the global maximum
# before against the global maximum after, so prose in a README ("coverage of the docs is
# 90 percent" -> "12 percent") was reported as a lowered threshold, and one unrelated
# larger number elsewhere masked a real 90 -> 50 drop.
cov_files="$(changed '*.json' '*.yml' '*.yaml' '*.toml' '*.ini' '*.cfg' '*.config.js' '*.config.ts' '*.config.mjs' \
  | grep -Ei 'package\.json|jest|vitest|nyc|nycrc|karma|codecov|coverage|sonar|pyproject|setup\.cfg|\.coveragerc|build\.gradle' || true)"
if [ -n "$cov_files" ]; then
  lowered=""
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    b="$(git diff -U0 "$RANGE" -- "$f" 2>/dev/null | grep -E '^-[^-]' | grep -Ei 'threshold|coverage|branches|lines|statements|functions' | grep -Eo '[0-9]+(\.[0-9]+)?' | sort -rn | head -1)"
    a="$(git diff -U0 "$RANGE" -- "$f" 2>/dev/null | grep -E '^\+[^+]' | grep -Ei 'threshold|coverage|branches|lines|statements|functions' | grep -Eo '[0-9]+(\.[0-9]+)?' | sort -rn | head -1)"
    if [ -n "$b" ] && [ -n "$a" ] && awk -v a="$a" -v b="$b" 'BEGIN { exit !(a < b) }'; then
      lowered="$lowered $f ($b -> $a)"
    fi
  done <<< "$cov_files"
  if [ -n "$lowered" ]; then
    report "coverage threshold lowered" "$lowered"
  else
    note "coverage thresholds not lowered"
  fi
else
  note "no coverage configuration changed"
fi

# 4. continue-on-error added -------------------------------------------------
# `|| true` appended to a test command is the same move as continue-on-error, written by
# hand instead of in YAML.
coe="$(added_lines .github/workflows .gitlab-ci.yml .circleci | grep -Ei 'continue-on-error:[[:space:]]*true|allow_failure:[[:space:]]*true|(test|pytest|vitest|jest|go test|cargo test)[^|]*\|\|[[:space:]]*(true|:)' || true)"
if [ -n "$coe" ]; then
  report "failure suppressed in CI" "$(printf '%s' "$coe" | head -2 | paste -sd'; ' -)"
else
  note "no failure suppression added"
fi

# 5. Workflow edits without the flag ----------------------------------------
# The guard's own script is watched too: without that, a pull request could disarm the
# guard in the same commit that would have tripped it, because CI runs the copy from the
# branch under test.
wf="$(changed .github/workflows .gitlab-ci.yml .circleci scripts/kit-ci-guards.sh)"
if [ -n "$wf" ]; then
  if approved_ci_change; then
    note "CI edited, flagged [ci-change]"
  else
    report "CI edited without [ci-change]" "$(printf '%s' "$wf" | tr '\n' ' ')"
  fi
else
  note "CI untouched"
fi

# 6. Test invocation removed from CI ----------------------------------------
if [ -n "$wf" ] && ! approved_ci_change; then
  lost="$(removed_lines .github/workflows | grep -Ei 'test|pytest|go test|cargo test' || true)"
  [ -n "$lost" ] && report "test step removed from CI" "$(printf '%s' "$lost" | head -2 | tr '\n' ' ')"
fi

# 7. "Green with no tests" surviving past the bootstrap ----------------------
#
# `--passWithNoTests` is legitimate exactly once: on the bootstrap branch, where the
# pipeline has to go green before any test exists. After the first test lands it means
# the suite reports success while running nothing, and it is invisible in a diff because
# nobody edits the line again. The first live bootstrap shipped it with a note promising
# the next pull request would remove it, which is precisely the kind of promise a guard
# exists to replace.
if [ -f package.json ] && grep -q -- '--passWithNoTests' package.json; then
  have_tests=""
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    if is_test_path "$f"; then have_tests="$f"; break; fi
  done <<< "$(git ls-files 2>/dev/null)"
  if [ -n "$have_tests" ]; then
    if approved_ci_change; then
      note "--passWithNoTests kept, flagged [ci-change]"
    else
      report "--passWithNoTests with tests present" "$have_tests exists, so the flag now only hides an empty run — remove it, or put [ci-change] in a commit message to keep it deliberately"
    fi
  else
    note "--passWithNoTests, and no test exists yet"
  fi
fi

printf '\n%d finding(s)\n' "$findings"
[ "$findings" -eq 0 ]
