#!/usr/bin/env bash
# kit design-check — the convergence test, as a program instead of a paragraph.
#
# The second live run declared convergence while a delta pass had written "this is not
# ready for an arbiter" and two majors were still open, and it did so because the rule
# lived only in prose read by the party that pays for another round. The same run also
# permuted six of seven objection ids across two passes, so even a careful reader could
# not tell which item a ruling belonged to.
#
# Both failures need the log to be a file with stable ids. That is what this reads.

KIT_DESIGN_STATES="open proposed verified accepted-risk rejected"
KIT_DESIGN_TERMINAL="verified accepted-risk rejected"
KIT_DESIGN_SEVERITIES="blocker major minor note"

kit_cmd_design_check() {
  local path="" quiet=0 root log
  while [ $# -gt 0 ]; do
    case "$1" in
      --quiet) quiet=1 ;;
      --help|-h)
        printf 'kit design-check [PATH] [--quiet]\n\n'
        printf '  Reads an objection log and applies the convergence test:\n'
        printf '  every blocker and major in a terminal state, ids unique and well formed.\n'
        printf '  Defaults to this branch'"'"'s log under docs/design/objections/, falling back\n'
        printf '  to a legacy docs/design/objections.md. Non-zero until the cycle converges.\n'
        return 0 ;;
      -*) die "design-check: unknown option '$1'" ;;
      *)  path="$1" ;;
    esac
    shift
  done

  root="$(repo_root)"
  log="${path:-$(design_log_path "$root")}"
  case "$log" in /*) ;; *) log="$root/$log" ;; esac

  heading "Objection log"
  if [ ! -f "$log" ]; then
    fail "log-present" "${log#"$root"/} does not exist — the cycle has no log to converge on"
    info "" "start one from the shape in kit/skills/work-issue/references/design-artifacts.md"
    [ "$quiet" -eq 1 ] && return 1
    kit_summary design-check
    return 1
  fi
  pass "log-present" "${log#"$root"/}"

  # Creating this branch's log stops the legacy one from being checked by anything.
  # If that file was carrying an open blocker, the guard would quietly disappear —
  # coverage may shrink, but not silently.
  if [ "${log#"$root"/}" != "$KIT_DESIGN_LOG_LEGACY" ] && [ -f "$root/$KIT_DESIGN_LOG_LEGACY" ]; then
    warn "legacy-log" "$KIT_DESIGN_LOG_LEGACY is no longer checked — this branch has its own log; move its open items across or delete it"
  fi

  local rows
  rows="$(_design_rows "$log")"
  if [ -z "$rows" ]; then
    # A cycle can legitimately raise nothing — a lens pass reporting NOTHING FOUND is a
    # first-class result by contract, and a sweep whose objections live in another
    # cycle's log raises none of its own. What distinguishes that from the failure this
    # check exists for is the route block: a log somebody deliberately opened says which
    # route it belongs to, while a narrative written where entries belong does not.
    if _design_has_route "$log"; then
      _design_route "$log"
      info "log-entries" "no objections raised in this cycle"
      if [ "$quiet" -eq 1 ]; then [ "$KIT_FAILURES" -eq 0 ]; return; fi
      kit_summary design-check
      return
    fi
    fail "log-entries" "no entries — an objection header looks like '[OBJ-1] severity: major | status: open'"
    [ "$quiet" -eq 1 ] && return 1
    kit_summary design-check
    return 1
  fi
  pass "log-entries" "$(printf '%s\n' "$rows" | grep -c .) objection(s)"

  _design_route "$log"
  _design_ids_wellformed "$log"
  _design_lens_tags "$root" "$log"
  _design_shape "$log" "$rows"
  _design_convergence "$log" "$rows"

  if [ "$quiet" -eq 1 ]; then
    [ "$KIT_FAILURES" -eq 0 ]
    return
  fi
  kit_summary design-check
}

# A `lens:` tag has to name a lens, or the survival metric that reads it measures noise.
#
# `kit journal --lenses` counts findings per lens to decide which lenses earn their place.
# The first time it ran over this repository's own logs, ten of twelve tags named no lens
# in any catalog — `who-writes`, `review-pass`, `none-route` — because the artifact spec
# listed only id, severity and status as machine-readable and the field was free text by
# omission. Free text is not wrong prose; it is a denominator that cannot be computed.
#
# Advisory (WARN, exit 0): every log written before this rule existed would otherwise
# fail, and a checker that fails on history nobody can change is a checker people disable.
_design_lens_tags() {
  local root="$1" log="$2" catalog local_file tags tag unknown=""
  catalog="$(lens_catalog_file "$root")"
  local_file="$(lens_local_file "$root")"
  # `|| true` is load-bearing under the `set -euo pipefail` of bin/kit: a log whose
  # entries carry no lens: field makes both greps exit non-zero, which aborted the whole
  # command before the checks below it ever ran — silently, since the abort is a clean
  # exit. Caught by the suite, not by reading.
  tags="$(grep -oE '^\[OBJ-[0-9]+\].*' "$log" \
          | grep -oE 'lens:[[:space:]]*[A-Za-z0-9-]+' \
          | sed 's/^lens:[[:space:]]*//' | LC_ALL=C sort -u || true)"
  [ -n "$tags" ] || return 0
  while IFS= read -r tag; do
    [ -n "$tag" ] || continue
    lens_has "$tag" "$catalog" && continue
    lens_has "$tag" "$local_file" && continue
    unknown="$unknown $tag"
  done <<< "$tags"
  if [ -n "$unknown" ]; then
    warn "lens-tags" "not a lens in any catalog:$unknown — 'kit journal --lenses' cannot count these"
    info "" "use a catalog id (kit lenses --ids), define it in .claude/lenses.md, or drop the lens: field"
  else
    pass "lens-tags" "every lens: tag names a catalog lens"
  fi
}

# One TSV row per objection: id, severity, status, line, has-claim, has-history.
#
# The route a cycle took must be readable from its log after the session is gone —
# otherwise "which protocol produced this?" is answered from memory, which is how two
# one-pass protocols become indistinguishable. Advisory on purpose (WARN, exit 0):
# pre-route logs are expected to warn until their next cycle rewrites them. Anchored to
# the preamble — a route: line inside an entry's prose is quotation, not a header.
# A route block before the first entry — the marker that somebody deliberately opened
# this log, as opposed to writing prose where entries belong.
_design_has_route() {
  awk '/^\[OBJ-/ { exit } /^route:[[:space:]]*[^[:space:]]/ { found = 1; exit } END { exit !found }' "$1"
}

_design_route() {
  local log="$1"
  if _design_has_route "$log"; then
    # The display grep mirrors the detection pattern — a blank "route:" line above the
    # real one must not blank the PASS detail.
    pass "route-recorded" "$(grep -m1 -E '^route:[[:space:]]*[^[:space:]]' "$log" | awk '{ $1 = ""; sub(/^ /, ""); sub(/\r$/, ""); print }')"
  else
    warn "route-recorded" "no route: block before the first entry — the route this cycle took is not auditable (pre-route logs are expected to warn)"
  fi
  return 0
}

# Lens passes emit unnumbered blocks and the orchestrator assigns ids at merge. An id
# like [OBJ-a11y-1] would not collide — it would vanish, because the row parser reads
# only numeric ids, and a blocker under a vanished id leaves the convergence test green.
# Vanishing silently is worse than failing, so malformed ids fail loudly here.
_design_ids_wellformed() {
  local log="$1" rel hits
  rel="${log##*/}"
  # The wide net is deliberate: [obj-2] or an indented header would not collide with
  # anything — it would hide a live objection from every check below, convergence
  # included. Anything that looks like an objection header must be the canonical form.
  hits="$(grep -inE '^[[:space:]]*\[obj' "$log" | grep -vE '^[0-9]+:\[OBJ-[0-9]+\]' || true)"
  if [ -n "$hits" ]; then
    fail "ids-wellformed" "$(printf '%s\n' "$hits" | grep -c .) header(s) not of the form [OBJ-<digits>] — invisible to every check below"
    printf '%s\n' "$hits" | while IFS= read -r l; do info "" "$rel:$l"; done
  else
    pass "ids-wellformed" "every [OBJ- header is numeric"
  fi
  return 0
}

# The header line is the contract. Everything else in an entry is prose for humans, and
# parsing prose is how a checker starts disagreeing with its readers.
_design_rows() {
  awk '
    function field(line, name,   re, s) {
      re = name ": *"
      if (match(line, re "[A-Za-z-]+")) {
        s = substr(line, RSTART, RLENGTH)
        sub(re, "", s)
        return s
      }
      return ""
    }
    function flush() {
      if (id != "") printf "%s\t%s\t%s\t%d\t%d\t%d\n", id, sev, st, ln, claim, hist
      id = ""; sev = ""; st = ""; ln = 0; claim = 0; hist = 0
    }
    /^\[OBJ-[0-9]+\]/ {
      flush()
      id = substr($0, 2, index($0, "]") - 2)
      sev = field($0, "severity")
      st  = field($0, "status")
      ln  = NR
      next
    }
    id != "" && /^[[:space:]]*CLAIM:/   { claim = 1 }
    id != "" && /^[[:space:]]*HISTORY:/ { hist = 1 }
    END { flush() }
  ' "$1"
}

_design_in_set() { # _design_in_set <needle> <space-separated set>
  case " $2 " in *" $1 "*) return 0 ;; *) return 1 ;; esac
}

_design_shape() {
  local log="$1" rows="$2" id sev st ln claim hist rel
  local dupes bad=0
  rel="${log##*/}"

  dupes="$(printf '%s\n' "$rows" | cut -f1 | sort | uniq -d)"
  if [ -n "$dupes" ]; then
    fail "ids-unique" "duplicate id(s): $(printf '%s' "$dupes" | tr '\n' ' ')"
    info "" "an id is the only thing a later round can rule on — reusing one loses a verdict"
  else
    pass "ids-unique" "$(printf '%s\n' "$rows" | grep -c .) distinct id(s)"
  fi

  while IFS="$(printf '\t')" read -r id sev st ln claim hist; do
    [ -n "$id" ] || continue
    if ! _design_in_set "$sev" "$KIT_DESIGN_SEVERITIES"; then
      fail "entry-shape" "$rel:$ln $id has severity '${sev:-none}' — expected one of: $KIT_DESIGN_SEVERITIES"
      bad=$((bad + 1))
    elif ! _design_in_set "$st" "$KIT_DESIGN_STATES"; then
      fail "entry-shape" "$rel:$ln $id has status '${st:-none}' — expected one of: $KIT_DESIGN_STATES"
      bad=$((bad + 1))
    elif [ "$claim" -eq 0 ]; then
      fail "entry-shape" "$rel:$ln $id has no CLAIM: line — an objection nobody can restate cannot be ruled on"
      bad=$((bad + 1))
    elif [ "$st" != "open" ] && [ "$hist" -eq 0 ]; then
      # Without a transition record, "verified" is a word somebody typed. The history is
      # what makes it auditable after the session that produced it is gone.
      fail "entry-shape" "$rel:$ln $id is '$st' with no HISTORY: line — record who moved it and on what evidence"
      bad=$((bad + 1))
    fi
  done <<< "$rows"

  [ "$bad" -eq 0 ] && pass "entry-shape" "every entry carries a severity, a status, a claim and its history"
  return 0
}

# The convergence test itself, verbatim from design-phase.md:
#   Converged ⇔ every blocker and major is in a terminal state.
# `proposed` does not count: it means the role with a stake in the answer has offered one.
_design_convergence() {
  local log="$1" rows="$2" blocking count override
  # The terminal set comes from the one declaration at the top of this file: a second copy
  # inside the awk program is how a state gets added in one place and forgotten in the other.
  blocking="$(printf '%s\n' "$rows" | awk -F"$(printf '\t')" -v terminal=" $KIT_DESIGN_TERMINAL " '
    ($2 == "blocker" || $2 == "major") &&
    index(terminal, " " $3 " ") == 0 { printf "%s(%s/%s) ", $1, $2, $3 }')"

  if [ -z "$blocking" ]; then
    pass "convergence" "every blocker and major is terminal"
    return 0
  fi

  count="$(printf '%s\n' "$blocking" | wc -w | tr -d ' ')"
  override="$(_design_override "$log")"
  if [ -n "$override" ]; then
    # An override is legitimate and recorded; an unrecorded one is the defect. The point
    # is not to forbid shipping with an open major — it is to make the choice visible to
    # whoever reads the record later.
    warn "convergence" "$count item(s) not terminal, carried under a recorded override: $blocking"
    printf '%s\n' "$override" | while IFS= read -r l; do info "" "$l"; done
    return 0
  fi

  fail "convergence" "$count blocker/major not terminal: $blocking"
  info "" "run another round (cap: MAX_DESIGN_ROUNDS), or record a 'convergence: override' block"
  info "" "an override needs items:, verdict: (quoted from the delta pass) and accepted-by:"
  return 0
}

# An override block, and only if it is complete. A partial one prints nothing, because
# the three fields are exactly what a later reader needs to judge the call that was made
# — and a half-written override that still suppressed the failure would be worse than
# none: it would look like a decision while recording none of it.
_design_override() {
  awk '
    /^convergence:[[:space:]]*override/ { inblock = 1; next }
    inblock && /^[[:space:]]*(items|verdict|accepted-by):/ {
      line = $0; sub(/^[[:space:]]+/, "", line)
      buf[++n] = line
      if (line ~ /^items:/)       seen_items = 1
      if (line ~ /^verdict:/)     seen_verdict = 1
      if (line ~ /^accepted-by:/) seen_by = 1
      infield = 1
      next
    }
    inblock && NF == 0 { next }
    # An indented line continues the field above it. Without this, a `verdict:` wrapped
    # across lines ended the block before `accepted-by:` was reached, and the override was
    # silently ignored — on exactly the overrides most worth recording, since the protocol
    # asks for the delta verdict QUOTED, and a quote long enough to be worth reading does
    # not fit on one line.
    inblock && infield && /^[[:space:]]+[^[:space:]]/ {
      line = $0; sub(/^[[:space:]]+/, "", line)
      buf[n] = buf[n] " " line
      next
    }
    inblock { inblock = 0; infield = 0 }
    END {
      if (!(seen_items && seen_verdict && seen_by)) exit 0
      for (i = 1; i <= n; i++) print buf[i]
    }
  ' "$1" 2>/dev/null
}
