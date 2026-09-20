#!/usr/bin/env bash
# Shared helpers for kit PreToolUse guards.
#
# A guard is a small program that reads the hook payload on stdin and either exits 0
# (allow) or calls kit_deny (block, with the reason shown to the model and the user).
# Guards must be fast: they run before every matching tool call.

set -euo pipefail

# jq is resolved through PATH, not hardcoded. An absolute /usr/bin/jq killed every guard
# under `set -e` on any machine where jq lives elsewhere — Homebrew, nix, most Linux
# images — and Claude Code treats that as a hook error rather than a block, so all three
# guards failed OPEN while `kit doctor` still reported them installed.
KIT_JQ="$(command -v jq 2>/dev/null || true)"

# Reads the PreToolUse payload and exports KIT_CMD (the bash command) and KIT_CWD.
# Exits 0 immediately for any tool call that is not a Bash command, so a guard can
# be registered without worrying about payload shape.
kit_read_input() {
  local payload
  payload="$(cat)"

  if [ -z "$KIT_JQ" ]; then
    # Without jq the payload cannot be parsed. Allowing everything would be a guard that
    # silently stops guarding, so deny exactly the operations this kit protects and let
    # everything else through.
    case "$payload" in
      *KIT_ALLOW_*=1*) exit 0 ;;
      *'git commit'*|*'git add'*)
        printf 'Blocked by kit guard: jq is not installed, so this command could not be inspected.\n' >&2
        printf 'Install jq (the kit requires shell, git and jq), or bypass deliberately with KIT_ALLOW_SECRETS=1 / KIT_ALLOW_PROTECTED_BRANCH=1.\n' >&2
        exit 2 ;;
      *) exit 0 ;;
    esac
  fi

  # jq's exit status is checked, not swallowed. `|| true` turned a broken or unusable jq
  # into an empty command string, which read as "not a Bash call" and allowed everything —
  # the same fail-open the hardcoded path caused, reintroduced one line lower.
  local jq_status
  set +e
  KIT_CMD="$(printf '%s' "$payload" | "$KIT_JQ" -r '.tool_input.command // empty' 2>/dev/null)"
  jq_status=$?
  set -e

  if [ "$jq_status" -ne 0 ]; then
    case "$payload" in
      *KIT_ALLOW_*=1*) exit 0 ;;
      *'git commit'*|*'git add'*)
        printf 'Blocked by kit guard: jq failed (exit %s), so this command could not be inspected.\n' "$jq_status" >&2
        printf 'Check your jq installation, or bypass deliberately with KIT_ALLOW_SECRETS=1 / KIT_ALLOW_PROTECTED_BRANCH=1.\n' >&2
        exit 2 ;;
      *) exit 0 ;;
    esac
  fi

  KIT_CWD="$(printf '%s' "$payload" | "$KIT_JQ" -r '.cwd // empty' 2>/dev/null || true)"
  [ -n "$KIT_CMD" ] || exit 0
  [ -n "$KIT_CWD" ] || KIT_CWD="$PWD"
  export KIT_CMD KIT_CWD
}

# kit_deny "<reason>" ["<how to proceed deliberately>"]
# Exit code 2 blocks the tool call; stderr becomes the reason the model sees.
kit_deny() {
  printf 'Blocked by kit guard: %s\n' "$1" >&2
  if [ "${2:-}" != "" ]; then
    printf '%s\n' "$2" >&2
  fi
  exit 2
}

# kit_escape_hatch <VAR_NAME> — true when the operator has deliberately opted out.
#
# Two accepted forms, on purpose:
#   * the variable set in Claude Code's own environment (survives a whole session)
#   * the literal `VAR=1` written as an environment assignment prefixing the command:
#       KIT_ALLOW_PROTECTED_BRANCH=1 git commit -m "..."
#
# The second form exists because the first requires restarting Claude Code, which is not
# a real option mid-session.
#
# It must be ANCHORED to the assignment position. An earlier version matched the token
# anywhere in the command line, which meant that documenting the escape hatch, grepping
# for it, or mentioning it in a commit message all silently disarmed the guard — and the
# likeliest victim was this repository, where the token appears in prose constantly.
kit_escape_hatch() {
  local var="$1" prefix
  [ "${!var:-0}" = "1" ] && return 0
  # Only the command PREFIX counts — the run of environment assignments before the first
  # real word. Grepping the whole command, even anchored, still matched at the start of
  # any line of a commit message and after a `;` or `|` inside a quoted string, so a
  # commit whose message merely documented the hatch disarmed the guard. A hatch that is
  # legal in the middle of a line is not an anchor.
  prefix="$(printf '%s' "$KIT_CMD" | head -1 \
    | sed -E 's/^([[:space:]]*(env[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*).*/\1/')"
  printf '%s' "$prefix" | grep -Eq "(^|[[:space:]])${var}=1([[:space:]]|$)"
}

# kit_command_skeleton — the command with quoted regions blanked out.
#
# Everything that reasons about command STRUCTURE — which segments exist, where `cd` and
# `-C` appear, which subcommand is being run — must look at this rather than at the raw
# command. Otherwise a commit message containing `cd /elsewhere` or a `;` becomes part of
# the parse, which is how three separate bypasses worked.
kit_command_skeleton() {
  printf '%s' "$KIT_CMD" | awk '
    function emit(s) { printf "%s", s }
    BEGIN { RS = "\0" }
    {
      inq = ""; esc = 0
      n = length($0)
      for (i = 1; i <= n; i++) {
        c = substr($0, i, 1)
        if (esc) { emit(" "); esc = 0; continue }
        # A backslash-escaped quote must not flip the quote state, or the rest of the
        # line is treated as quoted and silently disappears from the parse.
        if (c == "\\") { emit(" "); esc = 1; continue }
        if (inq == "") {
          # An unquoted `#` starts a comment: the shell never executes the rest of the
          # line, so neither should the parse. `git commit -m "x" # --dry-run` was
          # switching the guard off with eight characters that run nothing.
          if (c == "#" && (i == 1 || substr($0, i - 1, 1) ~ /[ \t]/)) {
            while (i <= n && substr($0, i, 1) != "\n") { emit(" "); i++ }
            if (i <= n) emit("\n")
            continue
          }
          if (c == "\"" || c == "'"'"'") { inq = c; emit(" ") }
          else emit(c)
        } else {
          if (c == inq) { inq = ""; emit(" ") }
          else if (c == "\n") emit("\n")
          else emit(" ")
        }
      }
    }'
}

# kit_dequoted — the command with quote characters removed but their contents kept, at
# the same character offsets. Path extraction reads THIS; structure detection reads the
# skeleton. Reading paths off the skeleton was a straight regression of round one's
# lesson: any path containing a space must be quoted, so blanking quoted regions before
# extracting `cd`/`-C` targets brought the quoted-path bypass back.
kit_dequoted() {
  printf '%s' "$KIT_CMD" | awk '
    BEGIN { RS = "\0" }
    {
      inq = ""; esc = 0
      n = length($0)
      for (i = 1; i <= n; i++) {
        c = substr($0, i, 1)
        if (esc) { printf "%s", c; esc = 0; continue }
        if (c == "\\") { printf " "; esc = 1; continue }
        if (inq == "") {
          if (c == "\"" || c == "'"'"'") { inq = c; printf " " }
          else printf "%s", c
        } else {
          if (c == inq) { inq = ""; printf " " }
          else printf "%s", c
        }
      }
    }'
}

# kit_effective_command — the skeleton, plus the body of any `sh -c` / `bash -c` wrapper.
#
# `sh -c "git commit -m x"` runs a commit; the guard has to see it. The quoted body is
# re-included here, and only here, so that `echo "git commit"` — which runs nothing —
# still does not trip anything.
kit_effective_command() {
  local skeleton inner
  skeleton="$(kit_command_skeleton)"
  inner="$(printf '%s' "$KIT_CMD" | sed -nE 's/.*(ba|z|da)?sh[[:space:]]+-[a-z]*c[[:space:]]+("([^"]*)"|'"'"'([^'"'"']*)'"'"').*/\3\4/p')"
  printf '%s %s' "$skeleton" "$inner"
}

# kit_command_words — the command's arguments with shell quoting resolved, one per line.
#
# `for w in $KIT_CMD` leaves the quote characters inside the word, so `git add ".env"`
# compared as the literal `".env"` and never matched anything. xargs performs the same
# quote parsing a shell would, without executing anything.
kit_command_words() {
  local parsed
  # xargs emits the words it managed to parse BEFORE failing on an unterminated quote,
  # so `cmd || fallback` printed both lists and the caller saw duplicates — different
  # duplicates on BSD and GNU. Capture first, decide after.
  if parsed="$(printf '%s' "$KIT_CMD" | xargs -n1 2>/dev/null)"; then
    printf '%s\n' "$parsed"
  else
    printf '%s' "$KIT_CMD" | awk '{ for (i = 1; i <= NF; i++) print $i }'
  fi
}

# kit_target_repo — the repository the GUARDED command operates on.
#
# The payload's cwd is only a default: `git -C <path> commit` and `cd <path> && git
# commit` both act somewhere else, and judging the wrong repository is wrong in both
# directions — it lets a protected-branch commit through, and it blocks a fine one.
#
# It must resolve PER SEGMENT. A first attempt scanned the whole command line and took
# the last `-C` it saw, so `git -C other status && git commit -m x` was judged against
# `other` while the commit landed in the current repository — a regression that made the
# guard weaker than the naive version it replaced.
#
# KIT_GUARDED_SUBCOMMAND (set by the caller, default "commit") names the segment to find.
kit_target_repo() {
  local dir="$KIT_CWD" want="${KIT_GUARDED_SUBCOMMAND:-commit}" candidate=""
  local skeleton dequoted line

  skeleton="$(kit_command_skeleton)"
  dequoted="$(kit_dequoted)"

  # Structure is read from the skeleton and paths from the dequoted text at the SAME
  # offsets — both transformations preserve character positions, so awk can walk them
  # together. Subshell depth is tracked rather than "any bracket disables cd", which
  # over-corrected: `(cd /main && git commit)` genuinely does commit in /main.
  # Both strings go through files: awk -v cannot carry a newline, and a commit message
  # routinely contains them.
  local sf df
  sf="$(mktemp)"; df="$(mktemp)"
  printf '%s' "$skeleton" > "$sf"
  printf '%s' "$dequoted" > "$df"

  line="$(awk -v want="$want" -v sfile="$sf" -v dfile="$df" '
    function slurp(f,   s, l) { s = ""; while ((getline l < f) > 0) s = s (s == "" ? "" : "\n") l; close(f); return s }
    # Reads the token starting at position p of a segment. If the skeleton is blank there,
    # the raw text was quoted, so the token runs to the end of that blank run — which is
    # the only way a path containing spaces can be recovered.
    function token(sk, dq, p,   c, q, out) {
      while (p <= length(sk) && substr(sk, p, 1) ~ /[ \t]/ && substr(dq, p, 1) ~ /[ \t]/) p++
      if (p > length(sk)) return ""
      c = substr(sk, p, 1)
      if (c ~ /[ \t]/) {                      # blank in skeleton, content in dequoted
        out = ""
        while (p <= length(sk) && substr(sk, p, 1) ~ /[ \t]/) { out = out substr(dq, p, 1); p++ }
        gsub(/^[ \t]+|[ \t]+$/, "", out)
        return out
      }
      out = ""
      while (p <= length(sk) && substr(sk, p, 1) !~ /[ \t]/) { out = out substr(dq, p, 1); p++ }
      return out
    }
    # Nesting depth at a given offset within a segment. Both `(cd X && git commit)` and
    # `(cd X && git status); git commit` are one paren and two segments; only the position
    # of each command inside them tells the two apart.
    function depth_at(s, upto, base,   j, c, d) {
      d = base
      for (j = 1; j < upto && j <= length(s); j++) {
        c = substr(s, j, 1)
        if (c == "(") d++
        else if (c == ")") d--
      }
      return d
    }
    function seg_has_git(s,   re) {
      re = "(^|[ \t(])([^ \t;&|]*/)?git([ \t]+-[^ \t]+([ \t]+[^ \t]+)?)*[ \t]+" want "([ \t]|$)"
      return (s ~ re)
    }
    BEGIN {
      skel = slurp(sfile); deq = slurp(dfile)
      n = length(skel)
      depth = 0; segDepth = 0; start = 1
      for (i = 1; i <= n + 1; i++) {
        c = (i <= n) ? substr(skel, i, 1) : ""
        two = (i < n) ? substr(skel, i, 2) : ""
        isSep = (i > n) || (two == "&&" || two == "||") || c == ";" || c == "\n"
        if (c == "(") depth++
        if (c == ")") depth--
        if (!isSep) continue

        sk = substr(skel, start, i - start)
        dq = substr(deq,  start, i - start)

        if (match(sk, /^[ \t]*\(?[ \t]*cd[ \t]/)) {
          rest = token(sk, dq, RSTART + RLENGTH)
          # Depth AT THE START of the segment. Measuring it after the segment had been
          # scanned made `(cd X && git commit)` look like the cd was more deeply nested
          # than the commit, because the closing paren had already been counted.
          # Measured past the match, so an opening paren the match swallowed is counted:
          # in `(cd X`, the cd is one level deep, not zero.
          if (rest != "") { cdDir = rest; cdDepth = depth_at(sk, RSTART + RLENGTH, segDepth) }
        }
        if (seg_has_git(sk)) {
          cmdDepth = depth_at(sk, index(sk, "git"), segDepth)
          if (match(sk, /[ \t]-C[ \t]/)) {
            cand = token(sk, dq, RSTART + RLENGTH)
          } else if (match(sk, /--work-tree[= \t]/)) {
            cand = token(sk, dq, RSTART + RLENGTH)
          } else if (match(sk, /--git-dir[= \t]/)) {
            v = token(sk, dq, RSTART + RLENGTH); sub(/\/\.git$/, "", v); cand = v
          }
          # A cd applies when it happened at this nesting level or an enclosing one.
          if (cand == "" && cdDir != "" && cdDepth <= cmdDepth) cand = cdDir
          print cand; exit
        }
        if (two == "&&" || two == "||") i++
        start = i + 1
        segDepth = depth
      }
    }' </dev/null 2>/dev/null || true)"

  rm -f "$sf" "$df"
  candidate="$line"
  if [ -n "$candidate" ]; then
    case "$candidate" in
      /*) [ -d "$candidate" ] && dir="$candidate" ;;
      *)  [ -d "$KIT_CWD/$candidate" ] && dir="$KIT_CWD/$candidate" ;;
    esac
  fi
  printf '%s' "$dir"
}

# kit_is_git_subcommand <subcommand> — true when the command invokes `git <subcommand>`.
#
# Matches git invoked by any path — `/usr/bin/git`, `./bin/git` — and inside `sh -c`.
# Requiring whitespace before `git` meant an absolute path bypassed all three guards at
# their first line, and this project's own memory tells the agent to prefer /usr/bin/tr
# over a shell function, so reaching for /usr/bin/git after a block is a short step.
kit_is_git_subcommand() {
  local want="$1" cmd
  cmd="$(kit_effective_command)"
  case "$cmd" in
    *git*) ;;
    *) return 1 ;;
  esac
  printf '%s' "$cmd" | grep -Eq "(^|[;&|(]|[[:space:]])([^[:space:];&|]*/)?git([[:space:]]+-[^[:space:]]+([[:space:]]+[^[:space:]]+)?)*[[:space:]]+${want}([[:space:]]|$)"
}

# kit_current_branch — of the repository the command targets, not merely of cwd.
# Empty on detached HEAD or outside a repository.
kit_current_branch() {
  git -C "$(kit_target_repo)" symbolic-ref --quiet --short HEAD 2>/dev/null || true
}

# kit_profile_value <KEY> — a value from the project's .claude/kit.md, or empty.
#
# Guards read the profile so that policy has one home. They must still work in a
# repository that has never seen `kit init`, so every caller supplies a fallback and
# an unreadable profile silently yields nothing rather than an error.
kit_profile_value() {
  local root file
  root="$(git -C "$(kit_target_repo)" rev-parse --show-toplevel 2>/dev/null || kit_target_repo)"
  file="$root/.claude/kit.md"
  [ -f "$file" ] || return 0
  awk -F'|' -v key="$1" '
    NF >= 3 {
      k = $2; v = $3
      gsub(/^[ \t]+|[ \t]+$/, "", k); gsub(/^[ \t]+|[ \t]+$/, "", v)
      if (k == key) { print v; exit }
    }' "$file" 2>/dev/null || true
}

# kit_profile_list <KEY> — the same, split on commas, one item per line.
kit_profile_list() {
  kit_profile_value "$1" | awk -F',' '
    { for (i = 1; i <= NF; i++) { v = $i; gsub(/^[ \t]+|[ \t]+$/, "", v); gsub(/^`|`$/, "", v); if (v != "") print v } }'
}
