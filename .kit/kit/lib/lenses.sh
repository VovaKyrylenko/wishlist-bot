#!/usr/bin/env bash
# Resolving the lens catalog — shared by `kit doctor` and `kit lenses`.
#
# The catalog's path differs by delivery mode: a vendored project carries the work-issue
# skill under .claude/skills, a checkout install reads the engine at $KIT_HOME.
# Project-local wins, so a vendored copy beats a stale checkout. Both readers ask these
# functions rather than each spelling the order out, because two copies of a resolution
# order is how one of them ends up vacuous in the mode nobody tested.

# lens_catalog_file <root> — the catalog to read, or nothing when none is reachable.
lens_catalog_file() {
  local root="$1" c
  for c in "$root/.claude/skills/work-issue/references/lenses.md" \
           "$KIT_HOME/kit/skills/work-issue/references/lenses.md"; do
    [ -f "$c" ] && { printf '%s\n' "$c"; return 0; }
  done
  return 0
}

# lens_local_file <root> — the project's own extension catalog, if it has one.
lens_local_file() {
  [ -f "$1/.claude/lenses.md" ] && printf '%s\n' "$1/.claude/lenses.md"
  return 0
}

# lens_declared <profile> — one "id<TAB>script" line per declared lens; script is empty
# for a manual-only lens. Spaces around '=' are the owner's table formatting.
lens_declared() {
  profile_list "$1" LENSES | awk -F'=' '
    {
      id = $1; script = (NF > 1 ? $2 : "")
      gsub(/^[ \t]+|[ \t]+$/, "", id)
      gsub(/^[ \t]+|[ \t]+$/, "", script)
      if (id != "" && id != "none") printf "%s\t%s\n", id, script
    }'
}

# lens_has <id> <file> — does this file define the lens?
lens_has() {
  [ -f "$2" ] || return 1
  grep -Fxq -- "### $1" "$2"
}

# lens_block <id> <file> — the lens's entry, heading included.
lens_block() {
  [ -f "$2" ] || return 1
  awk -v want="### $1" '
    $0 == want { inb = 1; print; next }
    inb && /^### / { exit }
    inb && /^## /  { exit }
    inb { print }
  ' "$2"
}
