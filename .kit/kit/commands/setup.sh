#!/usr/bin/env bash
# kit setup — the front door: init, vendor, doctor, and the name of the next step.
#
# Three commands to put the kit on a project was two too many, and the ceremony landed on
# the moment a person is least willing to spend patience: the first minute. This wraps
# them; it does not replace them. `init`, `vendor` and `doctor` stay available for the
# cases that need one without the others — regenerating a profile without re-vendoring,
# checking without writing.
#
# Setup deliberately does NOT ask anything. Everything a project needs decided is decided
# by the skill it names at the end, where an agent has read the code and can argue about
# the answer instead of collecting it blind.

kit_cmd_setup() {
  local source="" ref="" dry=0 adopt="" keep=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --source) source="${2:-}"; shift ;;
      --ref)    ref="${2:-}";    shift ;;
      --dry-run) dry=1 ;;
      --adopt)  adopt="$(_kit_setup_mode_arg "${2:-}")"; [ "$adopt" = all ] || shift ;;
      --keep)   keep="$(_kit_setup_mode_arg "${2:-}")";  [ "$keep" = all ] || shift ;;
      --help|-h)
        printf 'kit setup [--source URL|PATH] [--ref REF] [--adopt [NAMES]] [--keep [NAMES]] [--dry-run]\n\n'
        printf '  Puts the kit on this project: detect the stack and write the profile,\n'
        printf '  vendor the engine and pin it, then verify. Ends by naming the skill to\n'
        printf '  run next — /bootstrap-project for an empty directory, /onboard-project\n'
        printf '  for an existing codebase.\n\n'
        printf '  Safe to run twice. When a skill or agent name collides with one this\n'
        printf '  project already has, the run refuses and names it:\n\n'
        printf '    --adopt          take the kit'"'"'s version; yours moves to <name>.pre-kit\n'
        printf '    --keep           keep yours; the kit never installs or updates its own\n'
        printf '    --keep a,b --adopt   mix — name the ones to keep, adopt the rest\n\n'
        printf '  A kept item is recorded in the MANIFEST and honoured by every later\n'
        printf '  update, so the choice is made once.\n'
        return 0 ;;
      *) die "setup: unknown option '$1'" ;;
    esac
    shift
  done

  local root; root="$(repo_root)"

  # Read the shape BEFORE init writes anything, or the profile and CLAUDE.md this run
  # creates are themselves counted as the project's existing content and every empty
  # directory looks like a codebase.
  local existing; existing="$(_kit_setup_existing_files "$root")"

  if [ ! -d "$root/.git" ] && [ "$(repo_root)" = "$PWD" ]; then
    if [ "$dry" -eq 1 ]; then
      info "would run" "git init -b main"
    else
      heading "Repository"
      git init -q -b main "$root" || die "setup: git init failed in $root"
      pass "git" "initialised at $root"
    fi
  fi

  local rc=0

  # Each phase reports its own tally. The counters are global and cumulative, so without
  # this the vendor summary printed init's unanswered PRODUCT_GOALS as a vendoring
  # failure — a phase blamed for another phase's finding.
  kit_reset_counters
  . "$KIT_HOME/kit/commands/init.sh"
  if [ "$dry" -eq 1 ]; then kit_cmd_init --dry-run; else kit_cmd_init; fi || rc=1

  # The engine checkout manages itself through kit/ and refuses to vendor into itself.
  # Calling vendor there would abort the whole setup on a die(), so the step is skipped
  # with a reason rather than attempted and explained afterwards.
  if [ "$(cd -P "$root" && pwd)" = "$(cd -P "$KIT_HOME" && pwd)" ]; then
    heading "Engine"
    info "skipped" "this IS the engine checkout — it uses kit/ directly"
  else
    kit_reset_counters
    . "$KIT_HOME/kit/commands/vendor.sh"
    local vargs=()
    [ -n "$source" ] && vargs+=(--source "$source")
    [ -n "$ref" ] && vargs+=(--ref "$ref")
    [ -n "$adopt" ] && { [ "$adopt" = all ] && vargs+=(--adopt) || vargs+=(--adopt "$adopt"); }
    [ -n "$keep" ] && { [ "$keep" = all ] && vargs+=(--keep) || vargs+=(--keep "$keep"); }
    [ "$dry" -eq 1 ] && vargs+=(--dry-run)
    if [ -f "$root/$KIT_MANIFEST_REL" ]; then
      kit_cmd_update "${vargs[@]+"${vargs[@]}"}" || rc=1
    else
      kit_cmd_vendor "${vargs[@]+"${vargs[@]}"}" || rc=1
    fi
  fi

  if [ "$dry" -eq 1 ]; then
    heading "Next"
    info "would verify" "kit doctor"
    _kit_setup_next_step "$existing"
    return "$rc"
  fi

  # Doctor's own failures are reported by doctor; setup does not re-tally them, because a
  # fresh project is EXPECTED to fail here. PRODUCT_GOALS has no answer in any repository,
  # and the skill named below is what supplies it. Reporting that as setup's failure would
  # teach people that a red first run means something is broken.
  . "$KIT_HOME/kit/commands/doctor.sh"
  kit_reset_counters
  kit_cmd_doctor >/dev/null 2>&1 || true
  local doctor_failures="$KIT_FAILURES"

  heading "Setup"
  if [ "$doctor_failures" -eq 0 ]; then
    pass "doctor" "clean"
  else
    info "doctor" "$doctor_failures finding(s) — run 'kit doctor' to see them"
    info "" "a fresh project fails here until PRODUCT_GOALS is answered; that is the next step's job"
  fi

  _kit_setup_next_step "$existing"
  return "$rc"
}

_kit_setup_mode_arg() {
  case "${1:-}" in
    ""|-*) printf 'all\n' ;;
    *)     printf '%s\n' "$1" ;;
  esac
}

# Files that were the project's own before this run. Kit-owned trees are excluded: a
# second `kit setup` must not read its own previous output as a codebase.
_kit_setup_existing_files() {
  local root="$1"
  # `git ls-files` covers a committed project; the find is the fallback for one whose code
  # is not committed yet. It used to stop at `-maxdepth 2`, which missed everything under
  # `packages/<name>/src/` in an uncommitted workspace and recommended /bootstrap-project
  # for a repository already full of code. The prune list is what keeps it cheap, not the
  # depth limit.
  { git -C "$root" ls-files 2>/dev/null; find "$root" \
      \( -name .git -o -name node_modules -o -name .kit -o -name .claude -o -name dist \
         -o -name target -o -name build -o -name vendor -o -name .next -o -name .venv \) -prune -o \
      -type f -print 2>/dev/null | sed "s#^$root/##"; } \
    | grep -vE '^(\.kit/|\.claude/|CLAUDE\.md$|docs/decisions/|docs/design/|docs/verification/|\.githooks/|scripts/kit-ci-guards\.sh$|\.github/workflows/kit-)' \
    | grep -vE '^(README\.md|LICENSE|\.gitignore|\.gitattributes)$' \
    | sort -u | grep -c . || true
}

# The choice is a heuristic and says so. Both skills are always available, so a wrong
# guess costs a sentence, not a wrong run — which is why this prints a recommendation
# rather than refusing to proceed until someone confirms the project's nature.
_kit_setup_next_step() {
  local existing="${1:-0}"
  heading "Next step"
  if [ "$existing" -eq 0 ]; then
    info "run" "/bootstrap-project"
    info "" "nothing here yet — that skill interviews, decides the stack and scaffolds"
  else
    info "run" "/onboard-project"
    info "" "$existing existing file(s) — that skill reads the code, drafts what this"
    info "" "project is for, and reports where it differs from the kit's practices"
  fi
}
