#!/usr/bin/env bash
# kit lenses — hand the triage agent exactly the lens entries this project declares.
#
# Step T of the design phase requires the orchestrator to embed those entries in the
# triage prompt, and never to let the agent hunt for the catalog itself — its path
# differs by delivery mode. Assembling that by hand is a step with no command, and a
# step with no command is one that gets skipped without leaving a trace. This is the
# command.

kit_cmd_lenses() {
  local ids_only=0 root profile catalog local_file
  while [ $# -gt 0 ]; do
    case "$1" in
      --ids) ids_only=1 ;;
      --help|-h)
        printf 'kit lenses [--ids]\n\n'
        printf '  Prints the catalog entries for the lenses .claude/kit.md declares, in the\n'
        printf '  form the triage prompt embeds. --ids prints just the ids and their\n'
        printf '  grounding scripts. Exits non-zero when a declared id resolves nowhere.\n'
        return 0 ;;
      *) die "lenses: unknown option '$1'" ;;
    esac
    shift
  done

  root="$(repo_root)"
  profile="$(profile_path "$root")"
  [ -f "$profile" ] || die "no .claude/kit.md — run 'kit init'"

  local value; value="$(profile_get "$profile" LENSES)"
  case "$value" in
    ''|NEEDS_CONFIGURATION)
      printf 'This project declares no lenses (no LENSES key in .claude/kit.md).\n' >&2
      return 0 ;;
    none)
      printf 'This project deliberately declares no lenses (LENSES: none).\n' >&2
      return 0 ;;
  esac

  catalog="$(lens_catalog_file "$root")"
  local_file="$(lens_local_file "$root")"

  local id script missing=0 blocks=""
  while IFS="$(printf '\t')" read -r id script; do
    [ -n "$id" ] || continue
    if [ "$ids_only" -eq 1 ]; then
      printf '%s\t%s\n' "$id" "${script:-(manual-only)}"
      continue
    fi
    local found=""
    lens_has "$id" "$catalog"    && found="$catalog"
    [ -z "$found" ] && lens_has "$id" "$local_file" && found="$local_file"
    if [ -z "$found" ]; then
      printf 'lenses: %s is declared but defined in neither the catalog nor .claude/lenses.md\n' "$id" >&2
      missing=$((missing + 1))
      continue
    fi
    blocks="$blocks$(lens_block "$id" "$found")

"
  done <<< "$(lens_declared "$profile")"

  [ "$ids_only" -eq 1 ] && { [ "$missing" -eq 0 ]; return; }

  # The header carries the cap because activation is capped, not declaration: an agent
  # handed five entries and no cap will activate five.
  printf 'LENSES=%s\nMAX_ACTIVE_LENSES=%s\n\n' \
    "$value" "$(profile_get "$profile" MAX_ACTIVE_LENSES)"
  printf '%s' "$blocks"
  [ "$missing" -eq 0 ]
}
