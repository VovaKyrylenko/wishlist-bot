#!/usr/bin/env bash
# kit eval — measure the kit instead of asserting that it helps.
#
# Every framework surveyed while designing this one claims value and measures nothing.
# The cheapest honest measurement available is: replay real history through the guards and
# count how often they would have blocked work that was, in fact, fine. That number is the
# false-positive rate, and a guard with a bad one gets switched off by its owner within a
# week — so it is the number that decides whether a guard is worth having.

kit_cmd_eval() {
  local what="${1:-}"
  [ $# -gt 0 ] && shift || true
  case "$what" in
    guards)  _eval_guards "$@" ;;
    ci)      _eval_ci "$@" ;;
    profile) _eval_profile "$@" ;;
    --help|-h|"") cat <<'EOF'
kit eval guards [--since REF] [--limit N] [--repo PATH]
    Replay real commits through every guard; report what each would have blocked.

kit eval ci [--limit N] [--repo PATH]
    Replay real commits through the CI anti-gaming guard, one commit at a time,
    and report which would have failed the build.

kit eval profile [PATH]
    Report what `kit init` would detect for an existing repository, and whether
    each detected command actually resolves.
EOF
      ;;
    *) die "eval: unknown subject '$what'" ;;
  esac
}

_eval_guards() {
  local since="" limit=200 repo="$PWD"
  while [ $# -gt 0 ]; do
    case "$1" in
      --since) since="${2:-}"; shift ;;
      --limit) limit="${2:-200}"; shift ;;
      --repo)  repo="${2:-$PWD}"; shift ;;
      *) die "eval guards: unknown option '$1'" ;;
    esac
    shift
  done
  repo="$(cd "$repo" && repo_root)"
  git -C "$repo" rev-parse --git-dir >/dev/null 2>&1 || die "eval guards: $repo is not a git repository"

  # No array here on purpose: bash 3.2 — still the system bash on macOS — treats an
  # empty array expansion as an unbound variable under `set -u`.
  local shas
  if [ -n "$since" ]; then
    shas="$(git -C "$repo" log --format=%H --no-merges -n "$limit" "$since..HEAD" 2>/dev/null || true)"
  else
    shas="$(git -C "$repo" log --format=%H --no-merges -n "$limit" 2>/dev/null || true)"
  fi
  local total; total="$(printf '%s\n' "$shas" | grep -c . || true)"
  [ "$total" -gt 0 ] || die "eval guards: no commits in range"

  heading "Replaying $total commit(s) from $(basename -- "$repo")"

  local hooks="$KIT_HOME/kit/hooks"
  local attr_blocked=0 secret_blocked=0
  local attr_list="" secret_list=""

  local sha subject msg files
  while IFS= read -r sha; do
    [ -n "$sha" ] || continue
    subject="$(git -C "$repo" log -1 --format=%s "$sha")"
    msg="$(git -C "$repo" log -1 --format=%B "$sha")"
    files="$(git -C "$repo" show --pretty=format: --name-only --diff-filter=AM "$sha" | grep -c . >/dev/null 2>&1 && \
             git -C "$repo" show --pretty=format: --name-only --diff-filter=AM "$sha" | grep . || true)"

    if _eval_would_block "$hooks/guard-ai-attribution.sh" "$repo" "$(_eval_commit_cmd "$msg")"; then
      attr_blocked=$((attr_blocked + 1))
      attr_list="$attr_list
  ${sha:0:9}  $subject"
    fi

    if [ -n "$files" ]; then
      local add_cmd="git add"
      while IFS= read -r f; do
        [ -n "$f" ] || continue
        add_cmd="$add_cmd $f"
      done <<< "$files"
      if _eval_would_block "$hooks/guard-secrets.sh" "$repo" "$add_cmd"; then
        secret_blocked=$((secret_blocked + 1))
        secret_list="$secret_list
  ${sha:0:9}  $subject"
      fi
    fi
  done <<< "$shas"

  heading "Results"
  _eval_report "guard-ai-attribution" "$attr_blocked" "$total" "$attr_list"
  _eval_report "guard-secrets"        "$secret_blocked" "$total" "$secret_list"

  printf '\n  n/a   %-22s %s\n' "guard-protected-branch" \
    "not evaluable from history — git does not record which branch a commit was authored on."
  printf '        %-22s %s\n' "" "Verified instead by kit/scripts/test-guards.sh against a live repository."

  printf '\nEvery blocked commit above is either a real policy violation in the history or a\n'
  printf 'false positive. Read them. A guard with false positives gets disabled, which makes\n'
  printf 'it worse than no guard at all.\n'
}

_eval_report() { # _eval_report <name> <blocked> <total> <list>
  local name="$1" blocked="$2" total="$3" list="$4" pct
  pct="$(awk -v b="$blocked" -v t="$total" 'BEGIN { printf "%.1f", (t ? b * 100 / t : 0) }')"
  if [ "$blocked" -eq 0 ]; then
    pass "$name" "0/$total commits blocked"
  else
    warn "$name" "$blocked/$total commits blocked (${pct}%) — inspect each"
    printf '%s\n' "$list"
  fi
}

# _eval_would_block <guard> <cwd> <command> — true when the guard exits 2.
_eval_would_block() {
  local guard="$1" cwd="$2" cmd="$3" code
  printf '{"tool_name":"Bash","cwd":%s,"tool_input":{"command":%s}}' \
    "$(printf '%s' "$cwd" | jq -Rs .)" "$(printf '%s' "$cmd" | jq -Rs .)" \
    | "$guard" >/dev/null 2>&1
  code=$?
  [ "$code" -eq 2 ]
}

# Rebuilds the command line a commit would have been made with.
_eval_commit_cmd() {
  printf 'git commit -m %s' "$(printf '%s' "$1" | jq -Rs .)"
}

# The anti-gaming guard is where the remaining false-positive risk lives: it reasons about
# diffs with regular expressions, and every heuristic in it has already produced one
# (a filename containing "testing", a number changing in prose). Replaying real commits is
# the only way to find out how often it would have stopped legitimate work.
_eval_ci() {
  local limit=100 repo="$PWD"
  while [ $# -gt 0 ]; do
    case "$1" in
      --limit) limit="${2:-100}"; shift ;;
      --repo)  repo="${2:-$PWD}"; shift ;;
      *) die "eval ci: unknown option '$1'" ;;
    esac
    shift
  done
  case "$limit" in ''|*[!0-9]*) die "eval ci: --limit takes a number" ;; esac
  repo="$(cd "$repo" && repo_root)"

  local guard="$KIT_HOME/template/scripts/kit-ci-guards.sh"
  [ -f "$guard" ] || die "eval ci: $guard is missing"

  local shas total=0 blocked=0 list=""
  shas="$(git -C "$repo" log --format=%H --no-merges -n "$limit" 2>/dev/null || true)"
  [ -n "$shas" ] || die "eval ci: no commits found"

  heading "Replaying commits through the CI guard"
  local sha subject out
  while IFS= read -r sha; do
    [ -n "$sha" ] || continue
    git -C "$repo" rev-parse --verify --quiet "$sha^" >/dev/null 2>&1 || continue
    total=$((total + 1))
    subject="$(git -C "$repo" log -1 --format=%s "$sha")"
    # Each commit is treated as a one-commit pull request against its own parent.
    if ! out="$(cd "$repo" && KIT_BASE_REF="$sha^" KIT_HEAD_REF="$sha" bash "$guard" "$sha^" 2>&1)"; then
      blocked=$((blocked + 1))
      list="$list
  ${sha:0:9}  $subject
      $(printf '%s' "$out" | grep -A1 'FAIL' | head -2 | sed 's/^/    /')"
    fi
  done <<< "$shas"

  heading "Results"
  local pct; pct="$(awk -v b="$blocked" -v t="$total" 'BEGIN { printf "%.1f", (t ? b * 100 / t : 0) }')"
  if [ "$blocked" -eq 0 ]; then
    pass "kit-ci-guards" "0/$total commits would have failed the build"
  else
    warn "kit-ci-guards" "$blocked/$total commits would have failed (${pct}%) — read each"
    printf '%s\n' "$list"
  fi

  printf '\nA commit here is a one-commit pull request against its own parent, which is\n'
  printf 'stricter than reality: a real branch has several commits and [ci-change] applies\n'
  printf 'across all of them. Treat this as an upper bound on the false-positive rate.\n'
}

_eval_profile() {
  local target="${1:-$PWD}"
  target="$(cd "$target" 2>/dev/null && repo_root)" || die "eval profile: cannot read $1"

  heading "Detection for $(basename -- "$target")"
  local stack runner
  stack="$(detect_stack "$target")"
  runner="$(detect_runner "$target")"
  info "stack" "$stack"
  info "runner" "$runner"
  info "branch" "$(detect_main_branch "$target")"
  info "ci" "$(detect_ci "$target")"
  info "e2e configured" "$(detect_e2e "$target")"

  heading "Command resolution"
  local existing; existing="$(profile_path "$target")"
  if [ -f "$existing" ]; then
    info "existing profile" "${existing#"$target"/} — comparing against it"
    local key value
    for key in INSTALL BUILD TYPECHECK LINT TEST_UNIT TEST_E2E DEV; do
      value="$(profile_get "$existing" "$key")"
      case "$value" in
        ''|none|NEEDS_CONFIGURATION) info "$key" "${value:-unset}" ;;
        raw:*) info "$key" "${value#raw:}" ;;
        *)
          if script_exists "$target" "$runner" "$value"; then pass "$key" "$runner $value"
          else fail "$key" "profile names '$value' but the runner has no such script"; fi
          ;;
      esac
    done
  else
    info "existing profile" "none — run 'kit init' to create one"
  fi

  kit_summary "eval profile"
}
