#!/usr/bin/env bash
# kit doctor — verify a project against its own profile.
#
# This is the maintenance loop. Every kit accumulates dead references, stale routing
# tables and duplicated policy; the surveyed ones all build the read and write paths
# and skip the part that keeps them honest. A finding here is always mechanical: it
# names a file and a line, never a feeling.

KIT_DOCTOR_BUILTIN_SKILLS="verify code-review simplify commit init review security-review run loop schedule"

# Generic stand-ins that appear in prose about the mechanism itself — "a skill uses
# <KEY>", "a /skill is referenced" — rather than naming a real key or skill. Found by
# running doctor against this repository, where its own documentation tripped it.
KIT_DOCTOR_META_PLACEHOLDERS="KEY NAME VALUE PLACEHOLDER"
KIT_DOCTOR_META_SKILLS="skill name command"

kit_cmd_doctor() {
  local fix=0 quiet=0 root profile
  while [ $# -gt 0 ]; do
    case "$1" in
      --fix)   fix=1 ;;
      --quiet) quiet=1 ;;
      --help|-h) printf 'kit doctor [--fix] [--quiet]\n'; return 0 ;;
      *) die "doctor: unknown option '$1'" ;;
    esac
    shift
  done

  root="$(repo_root)"
  profile="$(profile_path "$root")"

  heading "Profile"
  if [ ! -f "$profile" ]; then
    fail "profile-present" "no .claude/kit.md — run 'kit init'"
    kit_summary doctor; return 1
  fi
  pass "profile-present" "${profile#"$root"/}"

  _doctor_unresolved "$profile"
  _doctor_commands "$root" "$profile"
  _doctor_constraints "$root" "$profile"
  _doctor_readiness "$root" "$profile"
  _doctor_branch "$root" "$profile"
  _doctor_claude_md "$root" "$profile" "$fix"
  _doctor_duplicated_policy "$root" "$profile"
  _doctor_placeholders "$root" "$profile"
  _doctor_dead_keys "$root" "$profile"
  _doctor_skill_refs "$root"
  _doctor_engine "$root" "$fix"
  _doctor_ci_guards "$root" "$fix"
  _doctor_acceptance "$root" "$profile"
  _doctor_lenses "$root" "$profile"
  _doctor_tastes "$root"
  _doctor_objection_log "$root"
  _doctor_design_docs "$root" "$profile"
  _doctor_unused "$profile"
  _doctor_verification "$root" "$profile"

  if [ "$quiet" -eq 1 ]; then
    [ "$KIT_FAILURES" -eq 0 ]
    return
  fi
  kit_summary doctor
}

# B2 — an unresolved value is a failure, not a warning. A kit that ships with
# NEEDS_CONFIGURATION in it is a kit nobody finished installing.
_doctor_unresolved() {
  local hits
  hits="$(grep -n 'NEEDS_CONFIGURATION' "$1" || true)"
  if [ -n "$hits" ]; then
    fail "no-unresolved-values" "$(printf '%s\n' "$hits" | grep -c .) value(s) still NEEDS_CONFIGURATION"
    printf '%s\n' "$hits" | while IFS= read -r l; do info "" "kit.md:$l"; done
  else
    pass "no-unresolved-values"
  fi
}

# B1 — every command key resolves to something that actually exists.
_doctor_commands() {
  local root="$1" profile="$2" runner key value resolved
  runner="$(profile_get "$profile" RUNNER)"
  heading "Commands"
  for key in INSTALL BUILD TYPECHECK LINT TEST_UNIT TEST_E2E DEV; do
    value="$(profile_get "$profile" "$key")"
    case "$value" in
      ''|NEEDS_CONFIGURATION) continue ;;   # reported by _doctor_unresolved
      none) info "$key" "not applicable" ; continue ;;
      raw:*)
        resolved="${value#raw:}"
        local bin; bin="$(printf '%s' "$resolved" | awk '{print $1}')"
        if command -v "$bin" >/dev/null 2>&1; then
          pass "$key" "$resolved"
        else
          warn "$key" "'$bin' not on PATH here — fine if it only exists in CI"
        fi
        ;;
      *)
        if script_exists "$root" "$runner" "$value"; then
          pass "$key" "$runner $value"
        else
          fail "$key" "script '$value' does not exist in this project's runner ($runner)"
        fi
        ;;
    esac
  done
}

# The design cycle quotes this file verbatim into every agent prompt. Its absence is why,
# in the first live run, a constraint the owner had stated never reached the architect and
# the whole candidate set was built on a hosting option it had already ruled out.
_doctor_constraints() {
  local root="$1" profile="$2" path n
  path="$(profile_get "$profile" CONSTRAINTS)"
  heading "Constraints"
  case "$path" in
    ''|NEEDS_CONFIGURATION)
      info "constraints-file" "no CONSTRAINTS key in the profile — 'kit init --force' adds it"
      return 0 ;;
    none)
      info "constraints-file" "declared not applicable"
      return 0 ;;
  esac
  if [ ! -f "$root/$path" ]; then
    fail "constraints-file" "$path is named in the profile but does not exist — the design cycle has nothing to quote"
    return 0
  fi
  # Identified entries only. A prose paragraph cannot be cited by an objection, and an
  # objection that cannot cite the constraint it violates gets argued away.
  n="$(grep -cE '^[[:space:]]*[-*][[:space:]]+\*\*[A-Z][0-9]+\*\*' "$root/$path" 2>/dev/null || true)"
  if [ "${n:-0}" -eq 0 ]; then
    warn "constraints-file" "$path holds no identified constraints yet — expected entries like '- **C1** (interview, date) — …'"
    info "" "the interview's answers belong here verbatim, with their knock-ons"
  else
    pass "constraints-file" "$n recorded in $path"
  fi
  return 0
}

# Test files, by the two conventions that actually exist: a name shaped like a test, or a
# file living in a test directory. Naming patterns alone missed this kit's own suite —
# seven shell scripts called `test-*.sh` — and a check that cannot see the tests of the
# repository it ships from is not ready to judge anyone else's.
_doctor_test_files() {
  local root="$1"
  find "$root" \
    \( -name node_modules -o -name .git -o -name vendor -o -name target -o -name dist -o -name build \) -prune -o \
    -type f \( -name '*.test.*' -o -name '*.spec.*' -o -name '*_test.*' -o -name 'test_*' -o -name 'test-*' \
               -o -name '*Test.java' -o -name '*Tests.cs' \) -print 2>/dev/null
  find "$root" \
    \( -name node_modules -o -name .git -o -name vendor -o -name target -o -name dist -o -name build \) -prune -o \
    -type d \( -name tests -o -name test -o -name spec -o -name specs -o -name __tests__ -o -name e2e \) \
    -exec find {} -type f -print \; 2>/dev/null
}

# A project claims one of these; each claim is checked against something falsifiable.
# Announcing a maturity nothing verifies is how "production ready" ends up meaning
# "the pipeline was green once".
KIT_DOCTOR_READINESS_STATES="bootstrap implementation deployment production"

_doctor_readiness() {
  local root="$1" profile="$2" state tests testcmd
  state="$(profile_get "$profile" READINESS)"
  heading "Readiness"
  case "$state" in
    ''|NEEDS_CONFIGURATION)
      info "readiness" "not declared — 'kit init --force' writes READINESS"
      return 0 ;;
  esac
  case " $KIT_DOCTOR_READINESS_STATES " in
    *" $state "*) pass "readiness" "$state" ;;
    *) fail "readiness" "'$state' is not one of: $KIT_DOCTOR_READINESS_STATES"; return 0 ;;
  esac

  case "$state" in
    implementation|deployment|production)
      tests="$(_doctor_test_files "$root" | grep -c . || true)"
      if [ "${tests:-0}" -eq 0 ]; then
        fail "readiness-tests" "READINESS is '$state' but no test file exists anywhere in the repository"
      else
        pass "readiness-tests" "$tests test file(s)"
      fi
      # --passWithNoTests is legitimate exactly once: on a bootstrap branch with no tests
      # yet. Past that point it means a suite that reports success while running nothing.
      testcmd="$(profile_command "$profile" TEST_UNIT)"
      if [ -f "$root/package.json" ] && [ "${tests:-0}" -gt 0 ] \
         && grep -q -- '--passWithNoTests' "$root/package.json" 2>/dev/null; then
        fail "readiness-test-flag" "--passWithNoTests survives in package.json past the bootstrap ($testcmd)"
        info "" "it makes an empty run green; remove it now that tests exist"
      fi
      ;;
  esac

  case "$state" in
    deployment|production)
      if [ -d "$root/.github/workflows" ] \
         && grep -rliE 'deploy|pages|publish|release' "$root/.github/workflows" >/dev/null 2>&1; then
        pass "readiness-deploy" "a deploy or release workflow exists"
      else
        warn "readiness-deploy" "READINESS is '$state' but no workflow mentions deploying or publishing"
      fi
      ;;
  esac

  if [ "$state" = "production" ]; then
    local tag
    tag="$(git -C "$root" tag --list 'v[1-9]*' 2>/dev/null | head -1)"
    if [ -n "$tag" ]; then
      pass "readiness-version" "released at $tag"
    else
      warn "readiness-version" "READINESS is 'production' with no 1.0 or later tag — 0.x says the opposite to every consumer"
    fi
  fi
  return 0
}

_doctor_branch() {
  local root="$1" profile="$2" branch
  branch="$(profile_get "$profile" MAIN_BRANCH)"
  heading "Git"
  if [ -z "$branch" ]; then
    fail "main-branch" "MAIN_BRANCH is not set"
  elif git -C "$root" rev-parse --verify --quiet "$branch" >/dev/null 2>&1 \
    || git -C "$root" rev-parse --verify --quiet "origin/$branch" >/dev/null 2>&1; then
    pass "main-branch" "$branch"
  else
    warn "main-branch" "'$branch' does not exist yet in this repository"
  fi
}

# B5 — the size budget. Long instruction files measurably reduce adherence, and the
# rules at the bottom are the ones silently dropped.
_doctor_claude_md() {
  local root="$1" profile="$2" fix="$3" budget lines
  budget="$(profile_get "$profile" CLAUDE_MD_MAX_LINES)"
  [ -n "$budget" ] || budget=60
  heading "Context budget"
  if [ ! -f "$root/CLAUDE.md" ]; then
    warn "claude-md-present" "no CLAUDE.md"
    return 0
  fi
  lines="$(grep -c '' "$root/CLAUDE.md")"
  if [ "$lines" -le "$budget" ]; then
    pass "claude-md-size" "$lines/$budget lines"
  else
    fail "claude-md-size" "$lines lines exceeds the $budget-line budget — move detail into a skill or a path-scoped rule"
  fi
  [ "$fix" -eq 1 ] && info "" "not auto-fixable: deciding what to cut is the point"
  return 0
}

# B3 — the defect the source audit found six times in one repository: the same risk
# policy restated in several files, guaranteed to drift.
_doctor_duplicated_policy() {
  local root="$1" profile="$2" key values hits=0
  heading "Single source of truth"
  # The engine's own skills are scanned too. They ship to every project, so a policy
  # restated there is the most expensive kind of duplication there is — and leaving them
  # out was an inconsistency, since the placeholder check already scans them.
  local search_paths=()
  [ -f "$root/CLAUDE.md" ] && search_paths+=("$root/CLAUDE.md")
  [ -d "$root/.claude/rules" ] && search_paths+=("$root/.claude/rules")
  local d; while IFS= read -r d; do search_paths+=("$d"); done <<< "$(_doctor_prose_dirs "$root")"
  if [ ${#search_paths[@]} -eq 0 ]; then
    info "duplicated-policy" "nothing to scan"
    return 0
  fi

  for key in HIGH_RISK_PATHS MONEY_SYMBOLS SECURITY_SYMBOLS DESTRUCTIVE_SQL SECRET_PATHS; do
    values="$(profile_list "$profile" "$key")"
    [ -n "$values" ] || continue
    local count; count="$(printf '%s\n' "$values" | grep -c . || true)"
    [ "$count" -ge 2 ] || continue
    while IFS= read -r found; do
      [ -n "$found" ] || continue
      fail "duplicated-policy" "$key restated in ${found#"$root"/} — reference .claude/kit.md instead"
      hits=$((hits + 1))
    done <<< "$(_doctor_find_restatement "$values" "${search_paths[@]}")"
  done
  [ "$hits" -eq 0 ] && pass "duplicated-policy" "no risk list restated outside kit.md"
  return 0
}

# Prints files containing two or more distinct values from the same list on one line.
# One mention is a reference; two is a copy.
#
# The value list goes through a file rather than `awk -v`, which cannot carry newlines.
_doctor_find_restatement() {
  local values="$1"; shift
  local vfile; vfile="$(mktemp)"
  printf '%s\n' "$values" > "$vfile"
  grep -rIl . "$@" 2>/dev/null | while IFS= read -r f; do
    # `.pre-kit` is what `kit vendor --adopt` parks a project's own skill under. It is an
    # archive, not live policy — scanning it reported the project restating its own rules
    # in a file nothing reads, on the first real onboarding this check ever saw.
    case "$f" in *"/kit.md"|*.pre-kit|*.pre-kit/*) continue ;; esac
    awk -v vfile="$vfile" '
      BEGIN {
        n = 0
        while ((getline line < vfile) > 0) { if (line != "") v[++n] = tolower(line) }
        close(vfile)
      }
      # Whole-word matching only. Substring matching produced false positives on
      # ordinary prose — "drops" matched DROP, "truncates" matched TRUNCATE — and a
      # check that fires on plain English is a check that gets switched off.
      function has_word(hay, needle,   pos, before, after, rest, off) {
        off = 0
        rest = hay
        while ((pos = index(rest, needle)) > 0) {
          before = (off + pos == 1) ? " " : substr(hay, off + pos - 1, 1)
          after  = substr(hay, off + pos + length(needle), 1)
          if (before !~ /[a-z0-9_]/ && (after == "" || after !~ /[a-z0-9_]/)) return 1
          off += pos + length(needle) - 1
          rest = substr(hay, off + 1)
        }
        return 0
      }
      {
        line = tolower($0); hits = 0
        for (i = 1; i <= n; i++) {
          if (has_word(line, v[i])) {
            hits++
            if (!(v[i] in seen)) { seen[v[i]] = 1; distinct++ }
          }
        }
        # Two on one line is a copied list. Three anywhere in the file is a list copied
        # as bullet points, which is how an instruction file normally restates policy —
        # and was invisible to the line-level rule.
        if (hits >= 2) { print FILENAME; found = 1; exit }
      }
      END { if (!found && distinct >= 3) print FILENAME }' "$f"
  done
  rm -f "$vfile"
}

# B4 — a skill referencing a profile key that does not exist is a broken skill.
_doctor_placeholders() {
  local root="$1" profile="$2" keys missing=0
  heading "Profile references"
  keys="$(profile_keys "$profile")"
  local dirs=() d
  while IFS= read -r d; do [ -n "$d" ] && dirs+=("$d"); done <<< "$(_doctor_prose_dirs "$root")"
  if [ ${#dirs[@]} -eq 0 ]; then info "profile-references" "no skills to scan"; return 0; fi

  local refs
  refs="$(grep -rhoE '<[A-Z][A-Z0-9_]{2,}>' "${dirs[@]}" 2>/dev/null | sort -u || true)"
  while IFS= read -r ref; do
    [ -n "$ref" ] || continue
    local bare="${ref#<}"; bare="${bare%>}"
    case " $KIT_DOCTOR_META_PLACEHOLDERS " in *" $bare "*) continue ;; esac
    if ! printf '%s\n' "$keys" | grep -Fxq "$bare"; then
      fail "profile-reference" "skills reference <$bare>, which .claude/kit.md does not define"
      missing=$((missing + 1))
    fi
  done <<< "$refs"
  [ "$missing" -eq 0 ] && pass "profile-references" "every <KEY> used by a skill is defined"
  return 0
}

# A profile key that nothing reads is fantasy configuration: it looks like policy, it
# gets edited, and it changes nothing. Either something consumes it or it should go.
#
# Descriptive keys are exempt — they exist to tell a reader what this project is, and
# are not claims about behaviour.
KIT_DOCTOR_DESCRIPTIVE_KEYS="PROJECT_NAME STACK CI SOURCE_DIR TEST_DIR RUNNER"

# Where the prose that reads a profile key actually lives, in either delivery mode: a
# checkout install keeps skills and agents under the engine, a vendored project keeps
# them under .claude/. Every check that scans prose asks this, because getting it wrong
# is silent — a vendored project reported *every* prose-read key as dead configuration
# until a live run looked at the warning.
_doctor_prose_dirs() {
  local root="$1" d
  for d in "$root/.claude/skills" "$root/.claude/agents" \
           "$KIT_HOME/kit/skills" "$KIT_HOME/kit/agents"; do
    [ -d "$d" ] && printf '%s\n' "$d"
  done
  return 0
}

_doctor_dead_keys() {
  local root="$1" profile="$2" key dead="" prose_dirs=() d
  heading "Live configuration"
  while IFS= read -r d; do [ -n "$d" ] && prose_dirs+=("$d"); done <<< "$(_doctor_prose_dirs "$root")"
  while IFS= read -r key; do
    [ -n "$key" ] || continue
    case " $KIT_DOCTOR_DESCRIPTIVE_KEYS " in *" $key "*) continue ;; esac
    # Read by a program, or referenced by an instruction a model will act on?
    #
    # init.sh is excluded deliberately: it contains the profile template, so every key
    # appears in it by construction. Counting that as a reader made this check vacuous —
    # it passed on keys nothing consumed, which is the failure it exists to detect.
    if grep -rqF --exclude=init.sh "$key" \
         "$KIT_HOME/kit/commands" "$KIT_HOME/kit/hooks" "$KIT_HOME/kit/lib" 2>/dev/null; then
      continue
    fi
    if [ ${#prose_dirs[@]} -gt 0 ] && grep -rqF "$key" "${prose_dirs[@]}" 2>/dev/null; then
      continue
    fi
    if [ -f "$root/CLAUDE.md" ] && grep -qF "$key" "$root/CLAUDE.md" 2>/dev/null; then continue; fi
    if [ -d "$root/.claude/rules" ] && grep -rqF "$key" "$root/.claude/rules" 2>/dev/null; then continue; fi
    dead="$dead $key"
  done <<< "$(profile_keys "$profile")"

  if [ -n "$dead" ]; then
    warn "dead-profile-keys" "nothing reads:$dead"
    info "" "either wire them into a skill or a check, or delete them — configuration that changes nothing is noise"
  else
    pass "dead-profile-keys" "every policy key is read by something"
  fi
  return 0
}

# A skill that points at a skill which does not exist is the dead-reference defect.
_doctor_skill_refs() {
  local root="$1" missing=0
  heading "Skill references"
  local dirs=() d
  [ -f "$root/CLAUDE.md" ] && dirs+=("$root/CLAUDE.md")
  # Agents are scanned too: an agent pointing at a skill that no longer exists is the
  # same dead reference, and it was only ever missed because the scan listed directories
  # by hand instead of asking where prose lives.
  while IFS= read -r d; do [ -n "$d" ] && dirs+=("$d"); done <<< "$(_doctor_prose_dirs "$root")"
  [ ${#dirs[@]} -eq 0 ] && { info "skill-references" "nothing to scan"; return 0; }

  # A skill reference is `/name` in BACKTICKS. Matching bare `/word` made every route in a
  # project's documentation a dead skill: the first real onboarding reported /admin, /api,
  # /jury, /login and — out of ordinary prose — /not.
  #
  # Backticks are not enough on their own, because a path in markdown is written in
  # backticks too: `/admin` is a route on one line and a skill on another, and no amount of
  # pattern-matching separates them. So the SEVERITY depends on who wrote the file.
  #
  # In the engine's own files the vocabulary is the kit's, a dead reference is a real
  # defect, and it FAILS — that is the defect this check was built for, found in the audit
  # that started this project. In a project's own prose the same string is more likely a
  # URL than a command, so it WARNS. A check that fails the build on every web project with
  # routes in its README is a check somebody switches off within a week.
  local scan_dir refs ref nm severity
  for scan_dir in "${dirs[@]}"; do
    case "$scan_dir" in "$KIT_HOME"/*) severity=fail ;; *) severity=warn ;; esac
    # `.pre-kit` is what `kit vendor --adopt` parks a project's own skill under: an
    # archive, whose references are history rather than this project's.
    refs="$(grep -rhoE --exclude-dir='*.pre-kit' --exclude='*.pre-kit' \
              '`/[a-z][a-z0-9-]{2,}`' "$scan_dir" 2>/dev/null | sed 's/`//g' | sort -u || true)"
    while IFS= read -r ref; do
      [ -n "$ref" ] || continue
      nm="${ref#/}"
      case " $KIT_DOCTOR_BUILTIN_SKILLS " in *" $nm "*) continue ;; esac
      case " $KIT_DOCTOR_META_SKILLS " in *" $nm "*) continue ;; esac
      if [ -d "$KIT_HOME/kit/skills/$nm" ] || [ -d "$root/.claude/skills/$nm" ] \
         || [ -d "$HOME/.claude/skills/$nm" ]; then
        continue
      fi
      if [ "$severity" = fail ]; then
        fail "skill-reference" "/$nm is referenced but no such skill exists"
      else
        warn "skill-reference" "/$nm reads as a skill reference but no such skill exists — a route or path is fine to ignore"
      fi
      missing=$((missing + 1))
    done <<< "$refs"
  done
  [ "$missing" -eq 0 ] && pass "skill-references" "no dead /skill references"
  return 0
}

_doctor_engine() {
  local root="$1" fix="$2" total=0 s
  heading "Engine"

  # A vendored project carries its own engine and is checked against its manifest; the
  # engine checkout itself is never vendored (OBJ-5) and takes the branch below.
  if [ -f "$root/$KIT_MANIFEST_REL" ]; then
    _doctor_engine_vendored "$root"
    return 0
  fi

  # Not vendored. Under ADR 0008 that means this is the engine checkout, or a project that
  # has not run `kit vendor` yet — and in neither case is a user-level installation the
  # thing to check. The previous version demanded one, so the engine checkout failed its
  # own doctor in CI, where nothing is installed and nothing should be.
  for s in "$KIT_HOME"/kit/skills/*/; do
    [ -d "$s" ] || continue
    total=$((total + 1))
  done
  if [ "$total" -eq 0 ]; then
    warn "engine-skills" "no skills in the engine yet"
  else
    pass "engine-skills" "$total available to vendor"
  fi

  # A guard that arrives without its executable bit is a guard that silently never fires,
  # and vendoring copies the mode across — so the source's modes are what matter.
  local guards=0 notexec=0 g
  for g in "$KIT_HOME"/kit/hooks/guard-*.sh; do
    [ -e "$g" ] || continue
    guards=$((guards + 1))
    [ -x "$g" ] || notexec=$((notexec + 1))
  done
  if [ "$guards" -eq 0 ]; then
    fail "engine-guards" "no guards in $KIT_HOME/kit/hooks"
  elif [ "$notexec" -gt 0 ]; then
    fail "engine-guards" "$notexec of $guards guard(s) are not executable — chmod +x them"
  else
    pass "engine-guards" "$guards executable"
  fi

  if [ -f "$root/.claude/kit.md" ] && [ "$(cd -P "$root" && pwd)" != "$(cd -P "$KIT_HOME" && pwd)" ]; then
    warn "not-vendored" "this project has no $KIT_MANIFEST_REL — its guards do not exist for anyone who clones it"
    info "" "install them: kit vendor"
  fi

  # Leftovers of the superseded symlink model are a WARN, not a failure: nothing is broken,
  # but a machine-level engine loading beside a project's pinned one is the version skew
  # ADR 0008 removes, and it is invisible unless something says so.
  local settings="$HOME/.claude/settings.json" legacy=0 hooked=0 link target cmd
  for link in "$HOME"/.claude/skills/* "$HOME"/.claude/agents/*; do
    [ -L "$link" ] || continue
    target="$(readlink -- "$link")"
    case "$target" in */kit/skills/*|*/kit/agents/*) legacy=$((legacy + 1)) ;; esac
  done
  if [ -f "$settings" ]; then
    while IFS= read -r cmd; do
      [ -n "$cmd" ] || continue
      case "$cmd" in */kit/hooks/guard-*.sh) hooked=$((hooked + 1)) ;; esac
    done <<< "$(jq -r '.hooks.PreToolUse[]?.hooks[]?.command // empty' "$settings" 2>/dev/null || true)"
  fi
  if [ "$legacy" -gt 0 ] || [ "$hooked" -gt 0 ]; then
    warn "legacy-install" "$legacy symlink(s) and $hooked guard(s) remain under ~/.claude from the pre-vendoring model"
    info "" "remove them: kit uninstall"
  fi
  return 0
}

# The vendored counterpart. What it can prove is bounded and worth stating: it compares
# bytes against hashes recorded in the same repository, so it catches an edited guard and
# an interrupted update — not someone who edits the guard and the manifest together
# (OBJ-2). There is no key a project can hold that the project cannot also use.
_doctor_engine_vendored() {
  local root="$1"
  local man="$root/$KIT_MANIFEST_REL"

  local ref commit ver
  ref="$(kit_manifest_field "$man" ref)"
  commit="$(kit_manifest_field "$man" commit)"
  ver="$(kit_manifest_field "$man" engine-version)"
  pass "vendored-engine" "${ver:-unknown} at ${ref:-unknown}${commit:+ ($(printf '%.12s' "$commit"))}"

  local problems state path count
  problems="$(kit_manifest_diff "$root" "$man")"
  count="$(kit_manifest_entries "$man" | grep -c . || true)"
  if [ -z "$problems" ]; then
    pass "vendored-intact" "$count file(s) match the manifest"
    # A kept item is a deliberate hole in the engine, and its cost arrives later: no
    # `kit update` will ever touch it, so it drifts from the version every other project
    # runs. Recorded in the manifest and said out loud here, because the alternative is a
    # divergence nobody is reminded of until it matters.
    local kept; kept="$(kit_manifest_kept "$man" | paste -sd' ' - 2>/dev/null || true)"
    [ -n "$kept" ] && warn "vendored-kept" "this project keeps its own, and updates skip them: $kept"
  else
    while IFS="$(printf '\t')" read -r state path; do
      [ -n "$path" ] || continue
      fail "vendored-intact" "$state: $path"
    done <<< "$problems"
    info "" "restore the engine: kit update --force"
  fi

  # Registered by the same ${CLAUDE_PROJECT_DIR} string `kit vendor` writes, and the file
  # behind it must exist and be executable — a guard registered at a path that is gone is
  # the failure that once reported "3/3 registered" while all three were dead.
  local settings="$root/.claude/settings.json" registered=0 dead=0 total=0 g name cmd
  for g in "$root/$KIT_VENDOR_DIR"/kit/hooks/guard-*.sh; do
    [ -e "$g" ] || continue
    total=$((total + 1))
    name="$(basename -- "$g")"
    cmd="\${CLAUDE_PROJECT_DIR}/$KIT_VENDOR_DIR/kit/hooks/$name"
    if [ -f "$settings" ] && jq -e --arg c "$cmd" \
         '[.hooks.PreToolUse[]?.hooks[]?.command] | index($c)' "$settings" >/dev/null 2>&1; then
      registered=$((registered + 1))
      [ -x "$g" ] || dead=$((dead + 1))
    fi
  done
  if [ "$total" -eq 0 ]; then
    fail "guards-registered" "no guards in $KIT_VENDOR_DIR/kit/hooks — run 'kit update --force'"
  elif [ "$dead" -gt 0 ]; then
    fail "guards-registered" "$dead registered guard(s) are not executable — run 'kit update --force'"
  elif [ "$registered" -eq "$total" ]; then
    pass "guards-registered" "$registered/$total in .claude/settings.json"
  else
    fail "guards-registered" "$registered/$total registered — run 'kit vendor' to re-register"
  fi
  return 0
}

_doctor_ci_guards() {
  local root="$1" fix="$2"
  local script="$root/scripts/kit-ci-guards.sh"
  heading "CI guards"

  # The profile is the single source of truth, so a stale CI value is not cosmetic: init
  # installs the guard and release workflows only when it says github-actions, and skills
  # read it to decide whether CI is a gate at all. The first live run finished with three
  # working workflows and `CI | none` in the profile, and nothing noticed.
  local declared actual
  declared="$(profile_get "$(profile_path "$root")" CI)"
  actual="$(detect_ci "$root")"
  if [ "$declared" = "$actual" ]; then
    pass "ci-profile-matches" "$declared"
  elif [ -z "$declared" ] || [ "$declared" = "NEEDS_CONFIGURATION" ]; then
    fail "ci-profile-matches" "the profile does not say what CI this project uses; detection says '$actual'"
  else
    fail "ci-profile-matches" "the profile says CI is '$declared' but this repository looks like '$actual' — re-run 'kit init' after adding CI, and fix the key"
  fi

  if [ ! -f "$script" ]; then
    fail "ci-guard-script" "scripts/kit-ci-guards.sh missing — run 'kit init'"
    return 0
  fi
  if [ -x "$script" ]; then
    pass "ci-guard-script" "present and executable"
  elif [ "$fix" -eq 1 ]; then
    chmod +x "$script"; pass "ci-guard-script" "made executable"
  else
    fail "ci-guard-script" "not executable — 'kit doctor --fix' repairs this"
  fi

  # Contents, not just presence. The script can be replaced with `exit 0` and, because
  # `kit init` never overwrites, that neutered copy survives every future init — a guard
  # that reports itself healthy while doing nothing.
  local template="$KIT_HOME/template/scripts/kit-ci-guards.sh"
  if [ -f "$template" ] && [ -f "$script" ]; then
    if cmp -s "$template" "$script"; then
      pass "ci-guard-intact" "matches the engine's copy"
    elif [ "$fix" -eq 1 ]; then
      cp "$template" "$script"; chmod +x "$script"
      pass "ci-guard-intact" "restored from the engine's copy"
    else
      fail "ci-guard-intact" "scripts/kit-ci-guards.sh differs from the engine's copy — restore it with 'kit doctor --fix', or keep the change deliberately and say why"
    fi
  fi
  if [ -d "$root/docs/decisions" ]; then
    pass "adr-directory" "docs/decisions"
  elif [ "$fix" -eq 1 ]; then
    mkdir -p "$root/docs/decisions"; pass "adr-directory" "created"
  else
    warn "adr-directory" "docs/decisions missing"
  fi
  return 0
}

# Acceptance criteria are the contract between a decision and everything downstream of it:
# the pull request body, the auditor, the review. A criterion with no way to check it is
# where that contract lapses without anyone noticing — and a `check:` naming a command the
# project does not have is the same lapse with a green tick on top. That second case is
# the one the first live run left behind: the decision record required an ESLint rule the
# project's actual linter had never been shown to support.
_doctor_acceptance() {
  local root="$1" profile="$2" runner rows kind rel lineno payload cmd first key
  local checks=0 manual=0 unchecked=0 broken=0
  heading "Acceptance criteria"
  if [ ! -d "$root/docs/decisions" ]; then
    info "acceptance-criteria" "no docs/decisions/"
    return 0
  fi
  runner="$(profile_get "$profile" RUNNER)"
  rows="$(_doctor_acceptance_rows "$root")"
  if [ -z "$rows" ]; then
    info "acceptance-criteria" "no decision record carries acceptance criteria"
    return 0
  fi

  while IFS="$(printf '\t')" read -r kind rel lineno payload; do
    [ -n "$kind" ] || continue
    case "$kind" in
      MANUAL) manual=$((manual + 1)) ;;
      UNCHECKED)
        unchecked=$((unchecked + 1))
        fail "acceptance-criterion" "$rel:$lineno carries neither check: nor manual: — nothing can rule on it"
        ;;
      CHECK)
        checks=$((checks + 1))
        cmd="$(printf '%s' "$payload" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//; s/^`//; s/`$//')"
        first="$(printf '%s' "$cmd" | awk '{print $1}')"
        key=""
        case "$runner" in
          ''|none|NEEDS_CONFIGURATION) ;;
          *) case "$cmd" in "$runner "*) key="$(printf '%s' "${cmd#"$runner" }" | awk '{print $1}')" ;; esac ;;
        esac
        if [ -n "$key" ]; then
          if ! script_exists "$root" "$runner" "$key"; then
            fail "acceptance-check" "$rel:$lineno runs '$cmd', but '$key' is not a script in this project's runner"
            broken=$((broken + 1))
          fi
        elif ! command -v "$first" >/dev/null 2>&1; then
          warn "acceptance-check" "$rel:$lineno runs '$first', which is not on PATH here — fine if it only exists in CI"
        fi
        ;;
    esac
  done <<< "$rows"

  if [ "$unchecked" -eq 0 ] && [ "$broken" -eq 0 ]; then
    pass "acceptance-criteria" "$checks with a command, $manual manual — all resolvable"
  fi
  _doctor_criteria_shared "$root" "$rows"
  _doctor_criteria_fidelity "$root"
  return 0
}

# Two criteria with the same `check:` cannot both be ruled on by it: whichever one is
# violated, the command says the same thing. The second live run shipped three criteria
# whose check was the whole test suite, and doctor called them "all resolvable" — which
# was true of their form and false of their function.
_doctor_criteria_shared() {
  local root="$1" rows="$2" dupes n
  dupes="$(printf '%s\n' "$rows" | awk -F"$(printf '\t')" '$1 == "CHECK" { print $2 "\t" $4 }' \
           | sed 's/[[:space:]]*$//' | sort | uniq -c | awk '$1 > 1 { $1 = $1; print }')"
  if [ -z "$dupes" ]; then
    pass "criteria-distinct" "no two criteria share a check command"
    return 0
  fi
  n="$(printf '%s\n' "$dupes" | grep -c .)"
  warn "criteria-distinct" "$n check command(s) are shared by several criteria — a shared command cannot say which one broke"
  printf '%s\n' "$dupes" | while IFS= read -r l; do info "" "$l"; done
  return 0
}

# The arbiter's record is the contract; the ADR is a retelling of it, and a retelling is
# where things go missing. The second live run's arbiter issued fifteen criteria and the
# decision record shipped seven — including the loss of the release-trigger and CI-parity
# guards, which were the only executable defences against a class of defect the first run
# had already produced. Dropping one is allowed; dropping it silently is not.
_doctor_criteria_fidelity() {
  local root="$1" ddr="docs/design/decision-record.md" ddr_n adr_n dropped_n
  if [ ! -f "$root/$ddr" ]; then
    info "criteria-fidelity" "no $ddr — nothing to compare the decision records against"
    return 0
  fi
  ddr_n="$(_doctor_criteria_count "$root/$ddr")"
  # `|| true` inside the pipeline, not after it: this file runs under `pipefail`, so a
  # grep that simply found nothing would kill the whole check — which it did, silently,
  # in exactly the case the check exists for.
  adr_n="$( { _doctor_acceptance_rows "$root" || true; } | grep -cE '^(CHECK|MANUAL)' || true)"
  dropped_n="$( { grep -rhcE '^[[:space:]]*dropped:' "$root"/docs/decisions/*.md 2>/dev/null || true; } \
               | awk '{s += $1} END { print s + 0 }')"
  if [ "$((adr_n + dropped_n))" -ge "$ddr_n" ]; then
    pass "criteria-fidelity" "$ddr_n in the arbiter's record, $adr_n carried, $dropped_n recorded as dropped"
  else
    fail "criteria-fidelity" "$ddr_n criteria in $ddr, only $adr_n carried into docs/decisions/ and $dropped_n recorded as dropped"
    info "" "carry each one, or add 'dropped: <criterion> — <reason>' so the loss is visible"
  fi
  return 0
}

_doctor_criteria_count() {
  awk '
    /^##[[:space:]]/ { insec = (tolower($0) ~ /^##[[:space:]]+acceptance criteria/); next }
    insec && /(^|[[:space:]])(check|manual):[[:space:]]*[^[:space:]]/ { n++ }
    END { print n + 0 }
  ' "$1"
}

# Prints one TSV row per criterion found under an "## Acceptance criteria" heading:
#   CHECK|MANUAL|UNCHECKED <tab> file <tab> line <tab> payload
#
# The annotation may sit on the item's own line or on a continuation line beneath it,
# because both read naturally and forcing one shape would only teach people to fight the
# format instead of writing the check.
_doctor_acceptance_rows() {
  local root="$1" f
  for f in "$root"/docs/decisions/*.md; do
    [ -e "$f" ] || continue
    case "$(basename -- "$f")" in 0000-template.md|README.md) continue ;; esac
    awk -v file="${f#"$root"/}" '
      function flush() { if (pending) { printf "UNCHECKED\t%s\t%d\t%s\n", file, pline, ptext; pending = 0 } }
      function cmdof(l,   p) { p = index(l, "check:"); return substr(l, p + 6) }
      /^##[[:space:]]/ {
        flush()
        insec = (tolower($0) ~ /^##[[:space:]]+acceptance criteria/)
        next
      }
      !insec { next }
      {
        item       = ($0 ~ /^[[:space:]]*[-*][[:space:]]+\[[ xX]\]/)
        has_check  = ($0 ~ /(^|[[:space:]])check:[[:space:]]*[^[:space:]]/)
        has_manual = ($0 ~ /(^|[[:space:]])manual:[[:space:]]*[^[:space:]]/)
        if (item) flush()
        if (has_check)  { printf "CHECK\t%s\t%d\t%s\n",  file, NR, cmdof($0); pending = 0; next }
        if (has_manual) { printf "MANUAL\t%s\t%d\t-\n",  file, NR;            pending = 0; next }
        if (item) { pending = 1; pline = NR; ptext = $0 }
      }
      END { flush() }
    ' "$f"
  done
}

# Lenses are declared in the profile and defined in the catalog. Where the catalog lives
# is `kit/lib/lenses.sh`'s job, shared with `kit lenses`: two copies of a resolution
# order is how one of them goes vacuous in the delivery mode nobody tested.
_doctor_lenses() {
  local root="$1" profile="$2" value catalog local_file f
  heading "Lenses"
  value="$(profile_get "$profile" LENSES)"
  case "$value" in
    '')
      # Profiles predating the key keep working; a missing declaration is migration
      # debt, not a broken project.
      warn "lenses-declared" "no LENSES key in the profile — run 'kit init --migrate' to add it, then declare lenses or set it to 'none'"
      return 0 ;;
    NEEDS_CONFIGURATION) return 0 ;;   # reported by _doctor_unresolved
    none)
      info "lenses-declared" "deliberately none"
      return 0 ;;
  esac

  catalog="$(lens_catalog_file "$root")"
  local_file="$(lens_local_file "$root")"
  if [ -z "$catalog" ] && [ -z "$local_file" ]; then
    fail "lens-catalog" "LENSES is set but no catalog is reachable — neither .claude/skills/work-issue/references/lenses.md nor the engine's copy exists"
    return 0
  fi

  # Every lens block must carry Attack, Trigger and Evidence. A lens missing one can
  # only be activated vaguely, and vague activation is the fantasy-output failure the
  # catalog exists to prevent.
  local shape_bad=0 line
  for f in "$catalog" "$local_file"; do
    [ -n "$f" ] && [ -f "$f" ] || continue
    while IFS= read -r line; do
      [ -n "$line" ] || continue
      fail "lens-shape" "$line"
      shape_bad=$((shape_bad + 1))
    done <<< "$(awk -v file="$(basename -- "$f")" '
      function flush() {
        if (id == "") return
        if (!a) printf "%s: lens %s has no Attack line\n", file, id
        if (!t) printf "%s: lens %s has no Trigger line\n", file, id
        if (!e) printf "%s: lens %s has no Evidence line\n", file, id
      }
      /^### /  { flush(); id = substr($0, 5); a = t = e = 0; next }
      /^## /   { flush(); id = "" }
      id != "" && /\*\*Attack:\*\*/   { a = 1 }
      id != "" && /\*\*Trigger:\*\*/  { t = 1 }
      id != "" && /\*\*Evidence:\*\*/ { e = 1 }
      END { flush() }
    ' "$f")"
  done
  [ "$shape_bad" -eq 0 ] && pass "lens-shape" "every lens block carries Attack, Trigger and Evidence"

  # Each declared id must resolve to a block, and each grounding script to the
  # project's runner — the same contract as the command keys, for the same reason:
  # a name CI cannot invoke is a promise, not a check.
  local runner id script broken=0 ungrounded=0 n=0
  runner="$(profile_get "$profile" RUNNER)"
  while IFS="$(printf '\t')" read -r id script; do
    [ -n "$id" ] || continue
    n=$((n + 1))
    if ! lens_has "$id" "$catalog" && ! lens_has "$id" "$local_file"; then
      fail "lens-id" "'$id' is not defined in the catalog or .claude/lenses.md"
      broken=$((broken + 1))
      continue
    fi
    if [ -n "$script" ]; then
      if ! script_exists "$root" "$runner" "$script"; then
        fail "lens-grounding" "'$id' names grounding script '$script', which does not exist in this project's runner ($runner)"
        broken=$((broken + 1))
      fi
    else
      ungrounded=$((ungrounded + 1))
    fi
  done <<< "$(lens_declared "$profile")"

  if [ "$broken" -eq 0 ] && [ "$n" -gt 0 ]; then
    pass "lenses-resolve" "$n lens(es): $((n - ungrounded)) grounded, $ungrounded manual-only"
  fi
  return 0
}

# A design cycle that has run leaves a log behind, and the log is what the next round —
# or the next person — rules on. Doctor does not repeat `kit design-check`'s work; it
# reports whether the cycle this repository last ran ever converged, because a decision
# record built on an unconverged log is exactly what the second live run shipped.
_doctor_tastes() {
  local root="$1" catalog project_file
  heading "Tastes"

  catalog="$(taste_catalog_file "$root")"
  if [ -z "$catalog" ]; then
    info "taste-catalog" "no catalog reachable — the engine predates it"
    return 0
  fi

  # Shape. An entry missing its kind cannot be applied (nobody knows how much judgment it
  # wants); an entry missing its scope cannot be excluded, which is worse — it is the
  # difference between a default and an instruction to a project that should never see it.
  local shapeless="" id kind scope _title
  while IFS="$(printf '\t')" read -r id kind scope _title; do
    [ -n "$id" ] || continue
    [ -n "$kind" ] && [ -n "$scope" ] && continue
    shapeless="$shapeless $id"
  done <<< "$(taste_entries "$catalog")"
  if [ -n "$shapeless" ]; then
    fail "taste-shape" "no kind or no scope:$shapeless"
  else
    pass "taste-shape" "$(taste_entries "$catalog" | grep -c .) entries carry a kind and a scope"
  fi

  # The catalog states that ids are stable handles, never reused — and nothing checked it.
  # A duplicated id makes `taste_entry_body` concatenate two entries, so `kit tastes show`
  # prints both as one and the fingerprint hashes the merge: every deviation against either
  # id is then pinned to a text that exists nowhere.
  local dupes; dupes="$(taste_entries "$catalog" | cut -f1 | sort | uniq -d | paste -sd' ' -)"
  if [ -n "$dupes" ]; then
    fail "taste-ids-unique" "the same id appears twice: $dupes"
  else
    pass "taste-ids-unique" "every id appears once"
  fi

  # The stack-agnosticism rule, as a command rather than a convention. SPEC C3 greps the
  # instruction surface for product names and excludes this file, because a catalog of
  # tastes without product names would be useless. This is what replaces it: naming a
  # product is allowed once a stack has been established, and `any` means no stack has.
  local leaked="" hits
  while IFS="$(printf '\t')" read -r id kind scope _title; do
    [ "$scope" = "any" ] || continue
    hits="$(taste_products_in "$catalog" "$id")"
    [ -n "$hits" ] && leaked="$leaked $id($(printf '%s' "$hits" | paste -sd, -))"
  done <<< "$(taste_entries "$catalog")"
  if [ -n "$leaked" ]; then
    fail "taste-scope-neutral" "scoped 'any' but names a product:$leaked"
    info "" "an 'any' entry ships to every stack — give it the scope its product belongs to"
  else
    pass "taste-scope-neutral" "no unscoped entry names a product"
  fi

  # What the project recorded against the catalog.
  project_file="$root/$KIT_PROJECT_TASTES_REL"
  if [ ! -f "$project_file" ]; then
    info "taste-answers" "no $KIT_PROJECT_TASTES_REL — run /onboard-project or /bootstrap-project"
    return 0
  fi

  local known; known="$(taste_entries "$catalog" | cut -f1)"
  local unknown="" stale="" unfiled="" fp section recorded
  while IFS="$(printf '\t')" read -r id fp section; do
    [ -n "$id" ] || continue
    # A record under no recognised heading is the shape a typo takes — "## Deviation" for
    # "## Deviations". It is reported rather than skipped, because a deviation nobody
    # files is a deviation nobody checks.
    [ "$section" = "unfiled" ] && unfiled="$unfiled $id"
    if ! printf '%s\n' "$known" | grep -qxF "$id"; then
      unknown="$unknown $id"
      continue
    fi
    # Only a deviation carries a fingerprint: it is the one kind of record that argues
    # with the entry's own text, so it is the one that goes stale when that text changes.
    [ "$section" = "deviations" ] || continue
    [ -n "$fp" ] || { stale="$stale $id(none)"; continue; }
    recorded="$(taste_fingerprint "$catalog" "$id")"
    [ "$fp" = "$recorded" ] || stale="$stale $id"
  done <<< "$(taste_project_refs "$project_file")"

  if [ -n "$unknown" ]; then
    fail "taste-ids" "names an entry the catalog does not have:$unknown"
  else
    pass "taste-ids" "every id recorded here exists in the catalog"
  fi

  # A warning, not a failure. Most catalog edits are irrelevant to most deviations, and
  # failing every project on every engine update would teach people to re-stamp the
  # fingerprint without re-reading the entry — which is the one thing it exists to force.
  if [ -n "$stale" ]; then
    warn "taste-fingerprint" "the entry has changed since the deviation was written:$stale"
    info "" "re-read it, then restate the deviation or drop it"
  fi

  if [ -n "$unfiled" ]; then
    fail "taste-sections" "recorded under no recognised heading:$unfiled"
    info "" "put each under '## Answers', '## Deviations' or '## Inventions' — the heading is what says which rule applies"
  fi

  # Unanswered open-questions are LISTED, not failed: whether one is in scope for this
  # project is a judgement doctor cannot make from the profile, and failing on an entry
  # that legitimately does not apply would be a check that punishes correct behaviour.
  local unanswered="" answered
  answered="$(taste_project_refs "$project_file" | awk -F'\t' '$3 == "answers" { print $1 }')"
  while IFS="$(printf '\t')" read -r id kind scope _title; do
    [ "$kind" = "open-question" ] || continue
    printf '%s\n' "$answered" | grep -qxF "$id" || unanswered="$unanswered $id"
  done <<< "$(taste_entries "$catalog")"
  [ -n "$unanswered" ] && info "taste-open" "unanswered (ignore those out of scope here):$unanswered"

  return 0
}

_doctor_objection_log() {
  local root="$1" log out
  log="$(design_log_path "$root")"
  heading "Objection log"
  if [ ! -f "$root/$log" ]; then
    info "objection-log" "none — no design cycle has been logged in this repository"
    return 0
  fi
  out="$(cd "$root" && "$KIT_HOME/bin/kit" design-check "$log" 2>&1 || true)"
  case "$out" in
    *"FAIL  convergence"*)
      fail "objection-log" "$log has not converged — run 'kit design-check' for the blocking ids" ;;
    *"WARN  convergence"*)
      warn "objection-log" "$log carries non-terminal items under a recorded override" ;;
    *"FAIL  "*)
      fail "objection-log" "$log is malformed — run 'kit design-check' for the finding" ;;
    *"WARN  "*)
      # A non-convergence warning (route-recorded and its future siblings) must not be
      # silently upgraded to "converged" — that swallow was found by a lens pass before
      # it ever shipped.
      warn "objection-log" "$log converged, with a design-check warning — run 'kit design-check' for the line" ;;
    *)
      pass "objection-log" "$log converged" ;;
  esac
  return 0
}

# Design docs are the reference the conformance review checks against; a project whose
# profile names them but lacks the directory has a review stage aimed at nothing.
_doctor_design_docs() {
  local root="$1" profile="$2" dir n
  dir="$(profile_get "$profile" DESIGN_DOCS)"
  heading "Design docs"
  case "$dir" in
    ''|none|NEEDS_CONFIGURATION) info "design-docs" "not configured"; return 0 ;;
  esac
  if [ ! -d "$root/$dir" ]; then
    fail "design-docs" "$dir/ is named in the profile but missing — run 'kit init'"
    return 0
  fi
  n="$(find "$root/$dir" -name '*.md' ! -name 'README.md' 2>/dev/null | grep -c . || true)"
  if [ "$n" -eq 0 ]; then
    warn "design-docs" "$dir/ holds no decisions yet — UI and flow reviews have nothing to check against"
    info "" "author ui.md / backend.md (decisions, not descriptions); /bootstrap-project covers this for new projects"
  else
    pass "design-docs" "$n decision file(s) in $dir/"
  fi
  return 0
}

# K2 — the deletion ritual, automated. Only explicitly typed invocations are visible
# in Claude Code's history, so this under-counts; it names candidates, never deletes.
_doctor_unused() {
  local profile="$1" window hist now cutoff s name last
  window="$(profile_get "$profile" UNUSED_ENGINE_ITEM_DAYS)"
  [ -n "$window" ] || window=90
  hist="$HOME/.claude/history.jsonl"
  heading "Deletion ritual"
  if [ ! -f "$hist" ]; then
    info "unused-engine-items" "no usage history available"
    return 0
  fi
  now="$(date +%s)"
  cutoff=$(( now - window * 86400 ))
  # Judged by invocation only. An earlier version skipped any skill whose directory
  # mtime was inside the window, which meant editing a skill reset its clock — so every
  # skill was skipped, and the check printed PASS having examined nothing.
  local never="" stale=""
  for s in "$KIT_HOME"/kit/skills/*/; do
    [ -d "$s" ] || continue
    name="$(basename -- "$s")"
    last="$(jq -r --arg n "/$name" 'select((.display // "") | startswith($n)) | .timestamp' "$hist" 2>/dev/null \
            | sort -rn | head -1 || true)"
    if [ -z "$last" ]; then
      never="$never $name"
    elif [ $(( last / 1000 )) -lt "$cutoff" ]; then
      stale="$stale $name"
    fi
  done
  if [ -n "$stale" ]; then
    warn "unused-engine-items" "last invoked over $window days ago:$stale"
    info "" "delete what you no longer need; the model may already do it unaided"
  else
    pass "unused-engine-items" "nothing invoked longer than $window days ago"
  fi
  if [ -n "$never" ]; then
    info "never-invoked" "$never"
    info "" "only invocations you typed yourself are visible here, so this under-counts"
  fi
  return 0
}

# Runtime evidence is the highest-yield practice available, and the failure mode it
# guards against is the model reporting success it never observed. That only works if the
# evidence outlives the session, so this checks the artifact exists — never whether the
# words in it are true, which no program can know.
_doctor_verification() {
  local root="$1" profile="$2" branch main artifact changed
  heading "Verification evidence"
  branch="$(git -C "$root" symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
  main="$(profile_get "$profile" MAIN_BRANCH)"
  if [ -z "$branch" ] || [ "$branch" = "$main" ]; then
    info "verification-artifact" "not applicable on ${branch:-a detached HEAD}"
    return 0
  fi
  git -C "$root" rev-parse --verify --quiet "$main" >/dev/null 2>&1 || {
    info "verification-artifact" "no '$main' to compare against"
    return 0
  }

  # Only source changes call for evidence: a docs or test-only branch has no runtime
  # surface to observe, and demanding a report for one would train people to fake it.
  changed="$(git -C "$root" diff --name-only "$main...HEAD" 2>/dev/null \
             | grep -vE '(^|/)(docs|\.github)/|\.md$|(^|/)tests?/|\.test\.|\.spec\.' | grep -c . || true)"
  artifact="$root/docs/verification/$branch.md"

  if [ -f "$artifact" ]; then
    # Presence alone is not evidence: an artifact without a single VERDICT: line —
    # verify-change's per-run verdict or the auditor's per-criterion one — records
    # nothing a reader can rule on, while satisfying a bare existence check.
    # The verdict may open a markdown blockquote or be bold — three of this repo's own
    # five artifacts write **VERDICT:** — but it starts its line; a mid-sentence
    # mention is prose, not a record.
    if grep -qE '^[>[:space:]]*(\*\*)?VERDICT:' "$artifact"; then
      pass "verification-artifact" "docs/verification/$branch.md"
    else
      warn "verification-artifact" "docs/verification/$branch.md exists but carries no VERDICT: line — evidence was never recorded"
    fi
  elif [ "$changed" -eq 0 ]; then
    pass "verification-artifact" "no source change on this branch to verify"
  else
    warn "verification-artifact" "$changed source file(s) changed and no docs/verification/$branch.md"
    info "" "run /verify-change — passing tests are not evidence that the change works"
  fi
  return 0
}
