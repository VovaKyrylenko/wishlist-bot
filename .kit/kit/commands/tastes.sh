#!/usr/bin/env bash
# kit tastes — read the catalog the way a person needs to read it.
#
# Written because the design created an obligation with no tool behind it: a deviation must
# record the fingerprint of the entry it argues with, and nothing printed one. A rule whose
# compliance requires guessing is a rule that gets ignored, and this one would have been
# ignored by its own author on the first project.

kit_cmd_tastes() {
  local sub="${1:-list}"
  [ $# -gt 0 ] && shift || true
  case "$sub" in
    list)    _kit_tastes_list "$@" ;;
    show)    _kit_tastes_show "$@" ;;
    promote) _kit_tastes_promote "$@" ;;
    --help|-h|help)
      printf 'kit tastes [list] [--scope S] [--kind K] [--open]\n'
      printf '  One line per entry: id, kind, scope, fingerprint, title.\n\n'
      printf 'kit tastes show <id>\n'
      printf '  The full entry, with the fingerprint line a deviation has to record.\n\n'
      printf 'kit tastes promote --scan <path>...\n'
      printf '  Group the inventions recorded across several projects and report those\n'
      printf '  seen three or more times. It proposes; you write the entry.\n'
      return 0 ;;
    *) die "tastes: unknown subcommand '$sub' — run 'kit tastes --help'" ;;
  esac
}

_kit_tastes_catalog() {
  local root; root="$(repo_root)"
  local c; c="$(taste_catalog_file "$root")"
  [ -n "$c" ] || die "tastes: no catalog found — this project has no vendored engine, and none ships beside this CLI"
  printf '%s\n' "$c"
}

_kit_tastes_list() {
  local want_scope="" want_kind="" only_open=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --scope) want_scope="${2:-}"; shift ;;
      --kind)  want_kind="${2:-}";  shift ;;
      --open)  only_open=1 ;;
      *) die "tastes list: unknown option '$1'" ;;
    esac
    shift
  done

  local catalog; catalog="$(_kit_tastes_catalog)"
  local id kind scope title n=0
  while IFS="$(printf '\t')" read -r id kind scope title; do
    [ -n "$id" ] || continue
    [ -n "$want_scope" ] && [ "$scope" != "$want_scope" ] && continue
    [ -n "$want_kind" ] && [ "$kind" != "$want_kind" ] && continue
    [ "$only_open" -eq 1 ] && [ "$kind" != "open-question" ] && continue
    printf '%-5s %-14s %-9s %-8s %s\n' \
      "$id" "$kind" "$scope" "$(taste_fingerprint "$catalog" "$id")" "$title"
    n=$((n + 1))
  done <<< "$(taste_entries "$catalog")"
  [ "$n" -eq 0 ] && printf 'no entries match\n' >&2
  return 0
}

_kit_tastes_show() {
  local id="${1:-}"
  [ -n "$id" ] || die "tastes show: an entry id is required, e.g. 'kit tastes show T12'"
  case "$id" in T*) ;; *) id="T$id" ;; esac

  local catalog; catalog="$(_kit_tastes_catalog)"
  local body; body="$(taste_entry_body "$catalog" "$id")"
  [ -n "$body" ] || die "tastes show: no entry '$id' in $catalog"

  printf '%s\n\n' "$body"
  # Printed as the exact line a deviation carries, so recording one is a copy rather than
  # a transcription — the step where a hand-typed hash would go wrong and warn forever.
  printf 'To deviate from this, put in .claude/tastes.md under ## Deviations:\n\n'
  printf -- '- **%s** `fingerprint: %s` — <what this project does instead>\n' \
    "$id" "$(taste_fingerprint "$catalog" "$id")"
  printf '  **Why the rationale did not hold here:** <what defeats the Why above, here>\n'
}

# Promotion is the catalog's only way to learn from projects rather than only dictating to
# them. It cannot be automatic: the vendored model isolates projects, so this has to be
# pointed at them, and a catalog that edited itself on evidence nobody reviewed would be
# worse than one that never grew.
_kit_tastes_promote() {
  local paths=() threshold=3
  while [ $# -gt 0 ]; do
    case "$1" in
      --scan) shift; while [ $# -gt 0 ] && [ "${1#--}" = "$1" ]; do paths+=("$1"); shift; done; continue ;;
      --threshold) threshold="${2:-3}"; shift ;;
      *) die "tastes promote: unknown option '$1'" ;;
    esac
    shift
  done
  [ "${#paths[@]}" -gt 0 ] || die "tastes promote: --scan <path>... is required"

  heading "Inventions across ${#paths[@]} path(s)"
  local tmp; tmp="$(mktemp)"
  local p f name
  for p in "${paths[@]}"; do
    [ -d "$p" ] || continue
    f="$p/$KIT_PROJECT_TASTES_REL"
    [ -f "$f" ] || continue
    # Only the Inventions section. An answer or a deviation is about an entry that already
    # exists; an invention is the thing with nowhere to live yet.
    awk '
      /^##[[:space:]]+[Ii]nventions/ { inv = 1; next }
      /^##[[:space:]]/ { inv = 0 }
      inv && /^[[:space:]]*-[[:space:]]+\*\*/ {
        line = $0
        sub(/^[[:space:]]*-[[:space:]]+\*\*/, "", line)
        sub(/\*\*.*$/, "", line)
        if (line != "") print tolower(line)
      }
    ' "$f" | while IFS= read -r name; do
      [ -n "$name" ] && printf '%s\t%s\n' "$name" "$(basename -- "$p")" >> "$tmp"
    done
  done

  if [ ! -s "$tmp" ]; then
    info "none" "no project under those paths recorded an invention"
    rm -f "$tmp"
    return 0
  fi

  local candidates=0
  while IFS= read -r line; do
    local count name_only projects
    count="$(printf '%s' "$line" | awk '{print $1}')"
    name_only="$(printf '%s' "$line" | cut -d' ' -f2-)"
    projects="$(awk -F'\t' -v n="$name_only" '$1 == n { printf "%s ", $2 }' "$tmp")"
    if [ "$count" -ge "$threshold" ]; then
      pass "candidate" "$name_only — seen $count time(s): $projects"
      candidates=$((candidates + 1))
    else
      info "below threshold" "$name_only — $count of $threshold: $projects"
    fi
  done <<< "$(cut -f1 "$tmp" | sort | uniq -c | sort -rn | sed 's/^ *//')"
  rm -f "$tmp"

  printf '\n'
  if [ "$candidates" -gt 0 ]; then
    info "" "$candidates candidate(s) have met the rule of three — write the entry yourself;"
    info "" "this command proposes and never edits the catalog"
  else
    info "" "nothing has met the rule of three yet"
  fi
  return 0
}
