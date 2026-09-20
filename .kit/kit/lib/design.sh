#!/usr/bin/env bash
# Where a design cycle's objection log lives.
#
# One log per branch, because a fixed path collides: two feature branches that each ran
# a cycle conflict on every merge, and the conflict is in the file whose whole purpose is
# to survive being carried forward. Verification artifacts already solved this by
# branch-scoping; the log did not, until a real merge of two of this kit's own branches
# stopped on it.
#
# Legacy logs keep working: a repository that already has the old fixed-path file is
# read there until its next cycle writes a branch-scoped one.

KIT_DESIGN_LOG_LEGACY="docs/design/objections.md"

# design_log_path <root> — the log this branch should use, relative to the root.
# Prints the branch-scoped path when it exists, the legacy path when only that exists,
# and otherwise the branch-scoped path a new cycle ought to create.
design_log_path() {
  local root="$1" branch scoped
  branch="$(git -C "$root" symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
  [ -n "$branch" ] || branch="detached"
  scoped="docs/design/objections/$branch.md"
  if [ -f "$root/$scoped" ]; then printf '%s\n' "$scoped"; return 0; fi
  if [ -f "$root/$KIT_DESIGN_LOG_LEGACY" ]; then
    printf '%s\n' "$KIT_DESIGN_LOG_LEGACY"; return 0
  fi
  printf '%s\n' "$scoped"
}

# design_logs <root> — every objection log the repository carries, relative to the root.
#
# Repository-wide, not this branch's. A lens is judged across runs: one cycle produces a
# handful of entries, and a lens declared out of caution can easily go a whole cycle
# without firing while still being worth keeping. The legacy path is listed first so a
# repository mid-migration is counted once from each place, never twice from neither.
design_logs() {
  local root="$1"
  [ -f "$root/$KIT_DESIGN_LOG_LEGACY" ] && printf '%s\n' "$KIT_DESIGN_LOG_LEGACY"
  [ -d "$root/docs/design/objections" ] || return 0
  ( cd "$root" && find docs/design/objections -type f -name '*.md' | LC_ALL=C sort )
}

# design_lens_tally <root> — one row per lens tag found in those logs:
#   id <TAB> raised <TAB> survived <TAB> refuted <TAB> unresolved <TAB> logs
#
# Survival is `verified` or `accepted-risk`: the finding held up. `rejected` is counted
# separately as refuted, because a lens that only ever produces refuted objections is a
# lens that costs a pass and finds nothing — exactly the case the deletion rule exists
# to catch, and it would look healthy if every terminal state counted alike.
#
# Entries with no `lens:` field are the full pass's own findings, not any lens's; they
# are tallied under `(untagged)` so the totals reconcile against the log, and the report
# keeps them out of the lens table.
design_lens_tally() {
  local root="$1" f
  local files=()
  while IFS= read -r f; do
    [ -n "$f" ] && files+=("$root/$f")
  done <<< "$(design_logs "$root")"
  [ "${#files[@]}" -gt 0 ] || return 0

  awk '
    /^[ \t]*\[OBJ-/ {
      lens = ""; status = ""
      n = split($0, field, /\|/)
      for (i = 1; i <= n; i++) {
        if (match(field[i], /lens:[ \t]*/))   lens   = substr(field[i], RSTART + RLENGTH)
        if (match(field[i], /status:[ \t]*/)) status = substr(field[i], RSTART + RLENGTH)
      }
      gsub(/^[ \t]+|[ \t]+$/, "", lens)
      gsub(/^[ \t]+|[ \t]+$/, "", status)
      if (lens == "") lens = "(untagged)"
      raised[lens]++
      if (status == "verified" || status == "accepted-risk") survived[lens]++
      else if (status == "rejected")                         refuted[lens]++
      else                                                   unresolved[lens]++
      if (!((lens SUBSEP FILENAME) in seen)) { seen[lens, FILENAME] = 1; logs[lens]++ }
    }
    END {
      for (l in raised)
        printf "%s\t%d\t%d\t%d\t%d\t%d\n",
          l, raised[l], survived[l] + 0, refuted[l] + 0, unresolved[l] + 0, logs[l]
    }
  ' "${files[@]}" | LC_ALL=C sort
}
