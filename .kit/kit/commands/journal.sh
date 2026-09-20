#!/usr/bin/env bash
# kit journal — what a run actually cost, from the transcripts it left behind.
#
# The first live run of this kit had to be reconstructed by hand: which agents ran, on
# what model, for how long, at what token cost. All of it existed on disk and none of it
# was collected, so the only post-mortem possible was the one somebody had time to write
# out manually. This reads the same files mechanically.
#
# What it can know is bounded by what Claude Code records. Two honest gaps, both printed
# rather than papered over:
#
#   * The transcript does not name the agent's ROLE. It is inferred from the opening
#     prompt, and marked as inferred.
#   * Prices are not hardcoded. This kit tells its users to look up current pricing
#     instead of recalling it, so cost is computed only from a rates file the owner
#     supplies, and is otherwise reported as unknown.

kit_cmd_journal() {
  local session="" since="" out="" as_json=0 lenses_only=0 root
  while [ $# -gt 0 ]; do
    case "$1" in
      --session) session="${2:-}"; shift ;;
      --since)   since="${2:-}"; shift ;;
      --out)     out="${2:-}"; shift ;;
      --json)    as_json=1 ;;
      --lenses)  lenses_only=1 ;;
      --help|-h)
        printf 'kit journal [--session DIR] [--since ISO8601] [--out FILE] [--json] [--lenses]\n\n'
        printf '  Summarises the agent steps of a run: model, tokens, tool calls, duration.\n'
        printf '  Defaults to the most recent session recorded for this repository.\n'
        printf '  --lenses prints only the lens-survival tally, which is read from the\n'
        printf '  objection logs and needs no recorded session.\n'
        return 0 ;;
      *) die "journal: unknown option '$1'" ;;
    esac
    shift
  done

  root="$(repo_root)"

  # The lens tally comes from the objection logs, not from a transcript, so it is
  # reachable in a repository that has run cycles but has no session on this machine —
  # a fresh clone, or a run whose transcripts have been rotated away.
  if [ "$lenses_only" -eq 1 ]; then
    _journal_lens_report "$root"
    return 0
  fi

  if [ -z "$session" ]; then
    session="$(_journal_latest_session "$root")"
    [ -n "$session" ] || die "journal: no recorded session found for $root — pass --session DIR"
  fi
  [ -d "$session" ] || die "journal: '$session' is not a directory"

  local rows
  rows="$(_journal_rows "$session" "$since")"
  if [ -z "$rows" ]; then
    printf 'journal: %s holds no agent transcripts%s\n' "$session" \
      "$([ -n "$since" ] && printf ' after %s' "$since")"
    return 0
  fi

  rows="$(_journal_with_cost "$root" "$rows")"

  if [ -n "$out" ]; then
    mkdir -p "$(dirname -- "$out")"
    printf '%s\n' "$rows" > "$out"
    pass "journal-written" "${out#"$root"/}"
  fi
  if [ "$as_json" -eq 1 ]; then
    [ -n "$out" ] || printf '%s\n' "$rows"
    return 0
  fi

  _journal_report "$root" "$session" "$rows"
}

# The session directory Claude Code writes for a repository. Its name is the project path
# with separators flattened; the exact flattening has varied, so a second spelling is
# tried before giving up.
_journal_latest_session() {
  local root="$1" p base
  # Several spellings of the same directory reach here. `git rev-parse` returns the
  # physical path, while the session was recorded under whatever path Claude Code was
  # launched with — on macOS /tmp and /var are symlinks into /private, so the two differ
  # for any repository under them and the lookup silently found nothing.
  local paths=("$root")
  case "$root" in
    /private/*) paths+=("${root#/private}") ;;
    *)          paths+=("/private$root") ;;
  esac
  local bases=()
  for p in "${paths[@]}"; do
    bases+=("$HOME/.claude/projects/$(printf '%s' "$p" | sed 's#[/ ]#-#g')")
    bases+=("$HOME/.claude/projects/$(printf '%s' "$p" | sed 's#[^A-Za-z0-9]#-#g')")
  done
  for base in "${bases[@]}"; do
    [ -d "$base" ] || continue
    # Most recently touched session that actually holds subagent transcripts. An empty
    # session directory is the common case for short interactive sessions.
    find "$base" -type d -name subagents 2>/dev/null | while IFS= read -r d; do
      [ -n "$(find "$d" -name 'agent-*.jsonl' -print -quit 2>/dev/null)" ] || continue
      printf '%s\t%s\n' "$(_journal_mtime "$d")" "$(dirname -- "$d")"
    done | sort -rn | head -1 | cut -f2-
    return 0
  done
}

_journal_mtime() {
  # BSD and GNU stat disagree on flags, and neither is guaranteed present.
  stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null || printf '0\n'
}

# One JSON object per agent step, oldest first.
_journal_rows() {
  local session="$1" since="$2" f
  local list=""
  list="$(find "$session" -name 'agent-*.jsonl' 2>/dev/null | sort)"
  [ -n "$list" ] || return 0
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    _journal_row "$f" "$since"
  done <<< "$list" | jq -sc 'sort_by(.startedAt) | .[]'
}

_journal_row() {
  local f="$1" since="$2"
  jq -s --arg since "$since" --arg file "$(basename -- "$f")" '
    def ms: (.[0:19] + "Z" | fromdateiso8601) * 1000 + ((.[20:23] // "0") | tonumber);
    def texts: if type == "string" then . else ([.[]? | select(.type == "text") | .text] | join(" ")) end;

    (map(.timestamp) | min) as $start
    | if ($since != "" and $start < $since) then empty else
    {
      runId:      (.[0].sessionId // "unknown"),
      stepId:     (.[0].agentId // ($file | sub("^agent-"; "") | sub("\\.jsonl$"; ""))),
      role:       "unknown",
      roleSource: "inferred-from-prompt",
      # A step that never reached the model has no model name, and an empty field used to
      # shift every column after it — so a failed step was rendered as a successful one
      # with odd numbers. Name the absence instead.
      model:      (([.[] | .message.model? // empty] | unique | join("+")) | if . == "" then "unknown" else . end),
      startedAt:  $start,
      finishedAt: (map(.timestamp) | max),
      durationMs: (((map(.timestamp) | max) | ms) - ($start | ms)),
      toolCalls:  ([.[] | select(.type == "assistant") | .message.content[]? | select(.type == "tool_use") | .name] | length),
      tools:      ([.[] | select(.type == "assistant") | .message.content[]? | select(.type == "tool_use") | .name] | unique | join(",")),
      tokensIn:   ([.[] | .message.usage.input_tokens? // 0] | add),
      tokensOut:  ([.[] | .message.usage.output_tokens? // 0] | add),
      cacheRead:  ([.[] | .message.usage.cache_read_input_tokens? // 0] | add),
      cacheWrite: ([.[] | .message.usage.cache_creation_input_tokens? // 0] | add),
      gitBranch:  (.[0].gitBranch // ""),
      cliVersion: (.[0].version // ""),
      status:     (if ([.[] | select(.type == "assistant")] | length) > 0 then "ok" else "no-output" end),
      prompt:     ([.[] | select(.type == "user") | .message.content | texts] | first // "" | .[0:160])
    } end' "$f" 2>/dev/null | jq -c '
      # A prompt that declares its role is believed; the design cycle requires the
      # declaration. Everything else falls back to reading the opening prompt, which is a
      # guess and is labelled one — the first rehearsal of the new cycle mislabelled two
      # of five steps that way, calling an adversary an architect because its prompt said
      # "candidate" more often than it said "adversary".
      (.prompt | ascii_downcase) as $p
      # capture/2 emits NOTHING when it does not match, and an empty stream in an `as`
      # binding drops the whole row — which is how this silently reported no steps at
      # all. Wrapping it in an array turns "no match" into null instead of nothing.
      | ([.prompt | capture("(^|\\n)ROLE:[ \\t]*(?<role>[a-z][a-z0-9-]+)"; "i")] | first | .role) as $declared
      | if $declared != null then (.role = ($declared | ascii_downcase) | .roleSource = "declared")
        else .role = (
          if   ($p | test("delta pass|round delta")) then "design-adversary"
          elif ($p | test("adversary|objection log|attack per|you may not approve")) then "design-adversary"
          elif ($p | test("advocate")) then "design-advocate"
          elif ($p | test("arbiter|decision record")) then "design-arbiter"
          elif ($p | test("candidate|architect")) then "approach-architect"
          elif ($p | test("codebase brief|scout|reconnaissance")) then "codebase-scout"
          elif ($p | test("acceptance criteri")) then "acceptance-auditor"
          elif ($p | test("triage")) then "issue-triage"
          else "unknown" end)
        end'
}

# Cost only when the owner supplies rates. Model prices move, and a kit that hardcodes
# them is a kit that quietly reports a wrong number long after the number changed — the
# same failure its own hosting step warns about.
_journal_with_cost() {
  local root="$1" rows="$2"
  local rates="$root/.claude/model-rates.json"
  if [ ! -f "$rates" ]; then
    printf '%s\n' "$rows" | jq -c '.estimatedCostUsd = null | .costSource = "no rates file"'
    return 0
  fi
  printf '%s\n' "$rows" | jq -c --slurpfile r "$rates" '
    ($r[0][.model] // $r[0]["default"]) as $m
    | if $m == null then (.estimatedCostUsd = null | .costSource = "no rate for \(.model)")
      else
        .estimatedCostUsd = (((.tokensIn * ($m.input // 0))
                            + (.tokensOut * ($m.output // 0))
                            + (.cacheRead * ($m.cacheRead // 0))
                            + (.cacheWrite * ($m.cacheWrite // 0))) / 1000000)
        | .costSource = "\(.model) rates from .claude/model-rates.json"
      end'
}

# A rates file is only better than no rates file while its prices are current. Once it
# is stale it produces the exact failure the no-hardcoding rule exists to prevent — a
# confident wrong number — and it does so silently, because nothing about the output
# changes when a price does. `_asOf` is the file's own claim about when it was looked up;
# this is the only thing that ever reads it.
_journal_rates_age() {
  local rates="$1/.claude/model-rates.json"
  [ -f "$rates" ] || return 0
  jq -r '
    if ._asOf == null then
      "the rates file carries no _asOf date — nothing here can tell whether its prices are current"
    else
      (((now - ((._asOf + "T00:00:00Z") | fromdateiso8601)) / 86400) | floor) as $days
      | if $days > 90 then
          "rates were looked up \($days) days ago (_asOf \(._asOf)) — re-check them before trusting this cost"
        else empty end
    end' "$rates" 2>/dev/null
}

_journal_report() {
  local root="$1" session="$2" rows="$3" cpath chash n first last
  n="$(printf '%s\n' "$rows" | grep -c . || true)"
  first="$(printf '%s\n' "$rows" | jq -rs 'map(.startedAt) | min')"
  last="$(printf '%s\n' "$rows" | jq -rs 'map(.finishedAt) | max')"

  heading "Run journal"
  info "session" "${session#"$HOME"/}"
  info "runId" "$(printf '%s\n' "$rows" | jq -rs '.[0].runId')"
  info "runVersion" "$(_journal_kit_version)"
  info "window" "$first → $last"
  info "steps" "$n agent step(s)"

  cpath="$(profile_get "$(profile_path "$root")" CONSTRAINTS)"
  case "$cpath" in
    ''|none|NEEDS_CONFIGURATION) info "constraintsHash" "no constraints file configured" ;;
    *)
      if [ -f "$root/$cpath" ]; then
        chash="$(_journal_sha "$root/$cpath")"
        info "constraintsHash" "$cpath sha256:${chash:0:16}"
        _journal_constraints_drift "$root" "$cpath" "$first" "$last"
      else
        info "constraintsHash" "$cpath is named in the profile but missing"
      fi
      ;;
  esac

  printf '\n%-10s  %-18s  %-22s  %9s  %9s  %5s  %8s  %-9s\n' \
    STEP ROLE MODEL IN OUT TOOLS TIME STATUS
  # Tab-separated and read with IFS set to it: whitespace-splitting silently shifted the
  # columns whenever any field was empty, which is exactly the case of a failed step.
  printf '%s\n' "$rows" | jq -r '
    [.stepId[0:8], .role[0:18], .model[0:22], (.tokensIn|tostring), (.tokensOut|tostring),
     (.toolCalls|tostring), (.durationMs|tostring), .status] | @tsv' \
  | while IFS="$(printf '\t')" read -r step role model tin tout tools dur status; do
      printf '%-10s  %-18s  %-22s  %9s  %9s  %5s  %8s  %-9s\n' \
        "$step" "$role" "$model" "$(_journal_human "$tin")" "$(_journal_human "$tout")" "$tools" "$(_journal_dur "$dur")" "$status"
    done

  printf '%s\n' "$rows" | jq -rs '
    "\ntotals: \(map(.tokensIn) | add) in, \(map(.tokensOut) | add) out, " +
    "\(map(.cacheRead) | add) cache read, \(map(.toolCalls) | add) tool calls"'
  printf '%s\n' "$rows" | jq -rs '
    if (map(.estimatedCostUsd) | map(select(. != null)) | length) == 0
    then "cost:   not computed — " + (.[0].costSource // "no rates") +
         " (add .claude/model-rates.json with current, looked-up prices)"
    else "cost:   $" + ((map(.estimatedCostUsd // 0) | add) | tostring)
    end'
  local stale; stale="$(_journal_rates_age "$root")"
  [ -n "$stale" ] && info "" "$stale"

  local nonok
  nonok="$(printf '%s\n' "$rows" | jq -rs '[.[] | select(.status != "ok")] | length')"
  [ "$nonok" -eq 0 ] || info "" "$nonok step(s) produced no assistant output — treat their results as absent, not empty"

  info "" "role is inferred from each agent's opening prompt — the transcript does not record it"

  _journal_lens_report "$root"

  heading "Commits in this repository during the run"
  local commits
  commits="$(git -C "$root" log --since="$first" --format='%h %s' 2>/dev/null | head -20)"
  if [ -n "$commits" ]; then
    printf '%s\n' "$commits" | while IFS= read -r l; do info "" "$l"; done
  else
    info "" "none"
  fi
}

# The falsifier for the lens catalog.
#
# A catalog sized for "maximally different products" is an assertion, and until this ran
# it was an assertion nothing could contradict: no count existed of what any lens
# actually found, so a lens that had never fired looked exactly like one that fired every
# time. The rule the catalog header already states — an unused lens is a deletion
# candidate — had no way to be applied.
#
# Two things this deliberately does not do. It does not judge a lens on one run: the
# tally is repository-wide, because a single cycle raises a handful of entries and a lens
# can miss one legitimately. And it does not treat every terminal state as survival —
# `rejected` means the lens fired and was wrong, and folding that into the same number
# would make a pure false-positive generator look like the catalog's best performer.
_journal_lens_report() {
  local root="$1" profile tally declared nlogs
  profile="$(profile_path "$root")"
  tally="$(design_lens_tally "$root")"
  declared=""
  [ -f "$profile" ] && declared="$(lens_declared "$profile" | cut -f1)"

  # Nothing declared and nothing tagged: this repository does not use lenses, and a
  # header announcing an empty table is noise.
  [ -n "$tally" ] || [ -n "$declared" ] || return 0

  nlogs="$(design_logs "$root" | grep -c . || true)"
  heading "Lens survival"
  info "source" "${nlogs:-0} objection log(s) in this repository, all branches"

  local catalog local_file
  catalog="$(lens_catalog_file "$root")"
  local_file="$(lens_local_file "$root")"

  local id raised survived refuted unresolved logs note
  local candidates="" undeclared="" adhoc="" untagged=""
  printf '\n%-26s  %6s  %8s  %7s  %10s  %s\n' \
    LENS RAISED SURVIVED REFUTED UNRESOLVED NOTE

  # The union of what is declared and what was tagged. A declared lens absent from every
  # log is the loudest row in the table and the one a tally over the logs alone misses.
  local seen_ids=""
  # shellcheck disable=SC2034  # `logs` is the field that absorbs the rest of the line;
  # dropping it from the read would fold trailing columns into `unresolved`.
  while IFS="$(printf '\t')" read -r id raised survived refuted unresolved logs; do
    [ -n "$id" ] || continue
    if [ "$id" = "(untagged)" ]; then
      untagged="$raised"
      continue
    fi
    seen_ids="$seen_ids $id "
    note=""
    # Three cases, and conflating the last two is what makes this table unreadable: a
    # declared lens is evidence about the catalog, an undeclared catalog lens is a
    # profile that is out of step with what the cycles actually ran, and a tag that
    # names no lens at all is the `lens:` field being used as free-text — which is
    # evidence about neither.
    if printf '%s\n' "$declared" | grep -Fxq -- "$id"; then
      [ "$survived" -eq 0 ] && { note="deletion candidate"; candidates="$candidates $id"; }
    elif lens_has "$id" "$catalog" || lens_has "$id" "$local_file"; then
      note="in the catalog, not in LENSES"
      undeclared="$undeclared $id"
    else
      note="not a lens id"
      adhoc="$adhoc $id"
    fi
    printf '%-26s  %6s  %8s  %7s  %10s  %s\n' \
      "$id" "$raised" "$survived" "$refuted" "$unresolved" "$note"
  done <<< "$tally"

  while IFS= read -r id; do
    [ -n "$id" ] || continue
    case "$seen_ids" in *" $id "*) continue ;; esac
    printf '%-26s  %6s  %8s  %7s  %10s  %s\n' "$id" 0 0 0 0 "deletion candidate — no entry at all"
    candidates="$candidates $id"
  done <<< "$declared"

  printf '\n'
  if [ -n "$candidates" ]; then
    info "deletionCandidates" "$(printf '%s' "${candidates# }" | sed 's/ /, /g')"
    info "" "declared with no surviving finding — drop from LENSES, or say in the profile why it is kept"
    # The denominator this tally does not have. A lens can be correctly activated and
    # correctly find nothing, and can be correctly left inactive on a task it does not
    # apply to — podil's first cycle recorded exactly that for its three UI lenses, on a
    # change with no screen. Objections are countable; activations are prose in the route
    # block, so the list above is a question for the owner, never a verdict.
    info "" "counted from findings, not activations — check whether each was activated and found nothing, or never applied"
  else
    info "deletionCandidates" "none — every declared lens has a finding that survived"
  fi
  [ -n "$undeclared" ] && info "" \
    "ran but undeclared:$undeclared — a catalog lens the cycles used and LENSES does not name"
  [ -n "$adhoc" ] && info "" \
    "free-text tags:$adhoc — the lens: field named an ad-hoc angle, not a catalog id; these count for and against nothing"
  [ -n "$untagged" ] && info "" \
    "$untagged entr(ies) carry no lens: tag — full-pass findings, attributable to no lens"
  return 0
}

# Which commit of the kit ran. Without it a journal says what a run cost but not what it
# was running, so two journals cannot be compared across a change to the engine — which
# is the only comparison a post-mortem actually wants.
_journal_kit_version() {
  local sha
  sha="$(git -C "$KIT_HOME" rev-parse --short HEAD 2>/dev/null || true)"
  if [ -n "$sha" ]; then
    printf 'kit %s (%s)\n' "${KIT_VERSION:-unknown}" "$sha"
  else
    printf 'kit %s (not a git checkout)\n' "${KIT_VERSION:-unknown}"
  fi
}

# A constraints file amended mid-run means the single hash above describes the end state
# and nothing else: agents that ran before the amendment read a different document. The
# second live run amended it four times (C8-C11) and the journal recorded one hash, so
# nothing in the record said which agent saw which version.
_journal_constraints_drift() {
  local root="$1" cpath="$2" first="$3" last="$4" mtime start_s end_s commits
  mtime="$(_journal_mtime "$root/$cpath")"
  start_s="$(_journal_epoch "$first")"
  end_s="$(_journal_epoch "$last")"
  commits="$(git -C "$root" log --since="$first" --until="$last" --oneline -- "$cpath" 2>/dev/null | grep -c . || true)"
  if [ "${commits:-0}" -gt 0 ]; then
    info "constraintsDrift" "$commits commit(s) touched $cpath during the run — the hash above is the end state only"
  elif [ "${mtime:-0}" -gt "${start_s:-0}" ] && [ "${mtime:-0}" -lt "$(( ${end_s:-0} + 60 ))" ]; then
    info "constraintsDrift" "$cpath was modified inside the run window — the hash above is the end state only"
  fi
  return 0
}

# ISO 8601 to epoch seconds, without assuming GNU date. `date -j` is BSD, `date -d` is GNU;
# a run's timestamps are always UTC with a trailing Z, which both refuse in that spelling.
_journal_epoch() {
  local t="${1%%.*}"; t="${t%Z}"
  date -u -j -f '%Y-%m-%dT%H:%M:%S' "$t" +%s 2>/dev/null \
    || date -u -d "${t}Z" +%s 2>/dev/null \
    || printf '0\n'
}

_journal_sha() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else printf 'unavailable\n'; fi
}

_journal_human() { # 12345 -> 12.3k
  awk -v n="${1:-0}" 'BEGIN { if (n >= 1000) printf "%.1fk\n", n / 1000; else printf "%d\n", n }'
}

_journal_dur() {
  awk -v ms="${1:-0}" 'BEGIN {
    s = int(ms / 1000)
    if (s >= 60) printf "%dm%02ds\n", int(s / 60), s % 60; else printf "%ds\n", s
  }'
}
