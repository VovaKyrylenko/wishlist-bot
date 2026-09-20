#!/usr/bin/env bash
# kit diff-shape — what is actually in this branch, by weight.
#
# Written after a live run whose pull request added 62,920 lines: 854 of code, 742 of
# tests, and 41,391 of an unrelated documentation directory that happened to be sitting
# untracked in the working tree when somebody ran `git add -A`. That run produced 39
# objections, four adversary lens passes and a dedicated review pass. Not one of them
# mentioned it — every reader was looking at the diff through the question it was asked,
# and nobody asked the cheapest question there is.
#
# So this is deliberately mechanical and deliberately first. It reads one `git diff
# --numstat` and cannot judge whether a file belongs; what it can do is put the shape in
# front of a person before the expensive passes start, and refuse when the shape is the
# one that means a payload came along for the ride.

kit_cmd_diff_shape() {
  local base="" quiet=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --quiet) quiet=1 ;;
      --help|-h)
        printf 'kit diff-shape [BASE] [--quiet]\n\n'
        printf '  Splits this branch'"'"'s added lines into code, tests, docs and other, and\n'
        printf '  names the largest additions. BASE defaults to the profile'"'"'s MAIN_BRANCH.\n\n'
        printf '  Fails when non-code additions dwarf the code by more than %sx — the\n' "${KIT_DIFF_SHAPE_RATIO:-10}"
        printf '  signature of an unrelated payload swept in by `git add -A`, which is how\n'
        printf '  41,391 lines of somebody else'"'"'s documentation reached a feature branch\n'
        printf '  past four adversary passes.\n'
        return 0 ;;
      -*) die "diff-shape: unknown option '$1'" ;;
      *) base="$1" ;;
    esac
    shift
  done

  local root; root="$(repo_root)"
  if [ -z "$base" ]; then
    local profile; profile="$(profile_path "$root" 2>/dev/null || true)"
    [ -n "$profile" ] && base="$(profile_get "$profile" MAIN_BRANCH 2>/dev/null || true)"
    [ -n "$base" ] || base=main
  fi

  # A base that does not resolve must not read as "nothing changed". Silence here would be
  # the same failure the check exists to prevent, one level up.
  local range
  if git -C "$root" rev-parse --verify --quiet "origin/$base" >/dev/null 2>&1; then
    range="origin/$base...HEAD"
  elif git -C "$root" rev-parse --verify --quiet "$base" >/dev/null 2>&1; then
    range="$base...HEAD"
  else
    die "diff-shape: neither '$base' nor 'origin/$base' resolves — pass the base branch explicitly"
  fi

  heading "Diff shape ($range)"

  local numstat; numstat="$(git -C "$root" diff --numstat "$range" 2>/dev/null || true)"
  if [ -z "$numstat" ]; then
    info "diff-shape" "no changes against $range"
    return 0
  fi

  # Classified by path, because that is all a mechanical check can honestly know. The
  # engine's own vendored tree counts as neither: it arrives whole from `kit update` and
  # would swamp every other number on the run that installs it.
  local tallies
  tallies="$(printf '%s\n' "$numstat" | awk -F'\t' '
    $1 == "-" { next }                      # binary
    {
      add = $1; f = $3
      # The whole vendored engine, not just `.kit/`: the skills and agents land under
      # `.claude/` because that is the only place Claude Code discovers them, and they are
      # markdown, so counting them as docs made this check fail every onboarding commit —
      # a false positive on the one run that legitimately adds ten thousand lines it did
      # not write.
      if (f ~ /^\.kit\// || f ~ /^\.claude\/(skills|agents)\// || f ~ /lock/) { vendored += add; next }
      if (f ~ /(^|\/)(test|tests|spec|specs|e2e|__tests__)\//)    { tests += add; next }
      if (f ~ /\.(test|spec)\.[a-z]+$/)                           { tests += add; next }
      if (f ~ /\.(md|mdx|txt|rst|adoc)$/ || f ~ /^docs\//)        { docs += add; next }
      if (f ~ /\.(json|ya?ml|toml|ini|cfg|conf)$/)                { config += add; next }
      code += add
    }
    END { printf "%d\t%d\t%d\t%d\t%d\n", code+0, tests+0, docs+0, config+0, vendored+0 }
  ')"
  local code tests docs config vendored
  IFS="$(printf '\t')" read -r code tests docs config vendored <<< "$tallies"

  info "code"     "$code line(s) added"
  info "tests"    "$tests"
  info "docs"     "$docs"
  info "config"   "$config"
  [ "$vendored" -gt 0 ] && info "vendored/locks" "$vendored — excluded from the ratio"

  if [ "$quiet" -eq 0 ]; then
    printf '\n'
    info "largest additions" ""
    printf '%s\n' "$numstat" | awk -F'\t' '$1 != "-" { printf "%s\t%s\n", $1, $3 }' \
      | sort -rn | head -5 | while IFS="$(printf '\t')" read -r n f; do
          info "" "$(printf '%7s  %s' "+$n" "$f")"
        done
  fi

  printf '\n'
  local built=$((code + tests))
  local rest=$((docs + config))
  local ratio="${KIT_DIFF_SHAPE_RATIO:-10}"

  # The threshold is a signature, not a quality bar. A documentation-only change has zero
  # code and is fine; what is being caught is a branch that built something small and
  # carries something enormous that has nothing to do with it.
  if [ "$built" -gt 0 ] && [ "$rest" -gt $((built * ratio)) ]; then
    fail "diff-shape" "$rest non-code line(s) against $built built — more than ${ratio}x"
    info "" "that ratio is the signature of a payload swept in by 'git add -A'"
    info "" "check the largest additions above: does each belong to THIS change?"
    info "" "deliberate (a docs drop, a generated file): re-run with KIT_DIFF_SHAPE_RATIO higher"
  elif [ "$built" -eq 0 ] && [ "$rest" -gt 0 ]; then
    pass "diff-shape" "no code — a documentation or configuration change"
  else
    pass "diff-shape" "$built built, $rest supporting"
  fi

  kit_summary diff-shape
}
