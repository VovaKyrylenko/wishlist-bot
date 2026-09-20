#!/usr/bin/env bash
# kit init — detect the stack and write the project profile.
#
# Detection policy, stated once because it drives every value below:
#
#   * When the runner can be ENUMERATED (package.json scripts, Makefile targets,
#     justfile recipes), a missing script is positive evidence of absence -> `none`.
#   * When it cannot be enumerated, presence of the tool is inferred from the
#     manifest or a config file; absence of evidence -> `none` only if the stack has
#     no plausible default, otherwise NEEDS_CONFIGURATION.
#   * Anything the repository genuinely cannot answer -> NEEDS_CONFIGURATION, which
#     makes `kit doctor` fail until a human decides. Never a silent guess.
#
# Every assumption is printed at the end, so a wrong guess is visible immediately
# rather than discovered months later.

kit_cmd_init() {
  local dry_run=0 force=0 migrate=0 root
  while [ $# -gt 0 ]; do
    case "$1" in
      --dry-run) dry_run=1 ;;
      --force)   force=1 ;;
      --migrate) migrate=1 ;;
      --help|-h)
        printf 'kit init [--dry-run] [--force] [--migrate]\n\n'
        printf '  --force    regenerate the profile from detection, discarding every hand-filled value\n'
        printf '  --migrate  add only the keys this engine expects and the profile lacks; never\n'
        printf '             touches a row that already exists\n'
        return 0 ;;
      *) die "init: unknown option '$1'" ;;
    esac
    shift
  done

  root="$(repo_root)"
  # `.git` is a FILE in a linked worktree and in a submodule, so testing for a directory
  # called it "not a git repository" in two perfectly ordinary setups.
  if [ "$(git -C "$root" rev-parse --is-bare-repository 2>/dev/null || echo false)" = "true" ]; then
    die "init: '$root' is a bare repository — it has no working tree to write a profile into"
  fi
  git -C "$root" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
    || warn "not-a-git-repository" "$root — branch policy checks will be limited"

  # A manifest that does not parse is not the same as a project without scripts, and
  # treating them alike is exactly the silent guess this command forbids itself.
  if [ -f "$root/package.json" ] && ! jq empty "$root/package.json" >/dev/null 2>&1; then
    fail "manifest-parses" "package.json is not valid JSON — detection cannot read it"
    info "" "fix the manifest and re-run; until then every command would be a guess"
    kit_summary init
    return 1
  fi

  local stack runner name branch ci source_dir test_dir
  stack="$(detect_stack "$root")"
  runner="$(detect_runner "$root")"
  name="$(detect_project_name "$root")"
  branch="$(detect_main_branch "$root")"
  ci="$(detect_ci "$root")"
  source_dir="$(first_existing_dir "$root" src app lib source internal pkg)"
  test_dir="$(first_existing_dir "$root" tests test e2e spec __tests__)"
  [ -n "$source_dir" ] || source_dir="none"
  [ -n "$test_dir" ] || test_dir="none"

  heading "Detected"
  info "stack" "$stack"
  info "runner" "$runner"
  info "project" "$name"
  info "default branch" "$branch"
  info "ci" "$ci"
  info "source dir" "$source_dir"
  info "test dir" "$test_dir"

  # --- command resolution --------------------------------------------------
  local c_install c_build c_typecheck c_lint c_test c_e2e c_dev
  case "$stack" in
    node)
      local pm; pm="$(node_package_manager "$root")"
      if [ "$pm" = "npm" ] && [ -f "$root/package-lock.json" ]; then
        c_install="raw:npm ci"
      else
        c_install="raw:$pm install"
      fi
      c_build="$(_init_script "$root" "$runner" build compile bundle)"
      c_typecheck="$(_init_script "$root" "$runner" typecheck type-check tsc types check-types)"
      c_lint="$(_init_script "$root" "$runner" lint eslint check)"
      c_test="$(_init_script "$root" "$runner" test test:unit unit vitest jest)"
      c_e2e="$(_init_script "$root" "$runner" test:e2e e2e playwright cypress)"
      c_dev="$(_init_script "$root" "$runner" dev start serve)"
      ;;
    go)
      c_install="raw:go mod download"
      c_build="raw:go build ./..."
      c_typecheck="none"   # the compiler is the type checker; BUILD covers it
      if has_any_file "$root" '.golangci.yml' '.golangci.yaml' '.golangci.toml'; then
        c_lint="raw:golangci-lint run"
      else
        c_lint="raw:go vet ./..."
      fi
      c_test="raw:go test ./..."
      c_e2e="$(_init_e2e_or_none "$root")"
      c_dev="none"
      ;;
    rust)
      c_install="raw:cargo fetch"
      c_build="raw:cargo build"
      c_typecheck="raw:cargo check"
      c_lint="raw:cargo clippy -- -D warnings"
      c_test="raw:cargo test"
      c_e2e="$(_init_e2e_or_none "$root")"
      c_dev="none"
      ;;
    python)
      if   [ -f "$root/uv.lock" ];            then c_install="raw:uv sync"
      elif [ -f "$root/poetry.lock" ];        then c_install="raw:poetry install"
      elif [ -f "$root/requirements.txt" ];   then c_install="raw:pip install -r requirements.txt"
      else c_install="raw:pip install -e ."
      fi
      c_build="none"
      if has_dep "$root" mypy || has_any_file "$root" 'mypy.ini' '.mypy.ini'; then
        c_typecheck="raw:mypy ."
      elif has_dep "$root" pyright; then c_typecheck="raw:pyright"
      else c_typecheck="none"; fi
      if has_dep "$root" ruff || has_any_file "$root" 'ruff.toml' '.ruff.toml'; then
        c_lint="raw:ruff check ."
      elif has_dep "$root" flake8; then c_lint="raw:flake8"
      elif has_dep "$root" pylint; then c_lint="raw:pylint ."
      else c_lint="none"; fi
      if has_dep "$root" pytest || [ -d "$root/tests" ]; then c_test="raw:pytest"
      else c_test="none"; fi
      c_e2e="$(_init_e2e_or_none "$root")"
      c_dev="none"
      ;;
    *)
      # Enumerable runner (make/just) or nothing at all.
      c_install="$(_init_script "$root" "$runner" install deps setup bootstrap)"
      c_build="$(_init_script "$root" "$runner" build all)"
      # Not bare `check`: by GNU convention `make check` runs the test suite, so
      # detecting it as a type check would make the quick gate run everything.
      c_typecheck="$(_init_script "$root" "$runner" typecheck type-check types)"
      c_lint="$(_init_script "$root" "$runner" lint vet)"
      c_test="$(_init_script "$root" "$runner" test)"
      c_e2e="$(_init_script "$root" "$runner" e2e test-e2e)"
      c_dev="$(_init_script "$root" "$runner" dev run serve)"
      if [ "$runner" = "none" ]; then
        c_install="NEEDS_CONFIGURATION"; c_build="NEEDS_CONFIGURATION"; c_test="NEEDS_CONFIGURATION"
      fi
      ;;
  esac

  # --- risk triggers -------------------------------------------------------
  local high_risk secret_paths
  high_risk=".github/workflows/"
  # Searched rather than assumed at the root: a dry run against a real repository put its
  # migrations under scripts/migrations/, which a root-only check missed entirely.
  local found
  found="$(find "$root" -maxdepth 3 -type d \
             \( -name node_modules -o -name .git -o -name vendor -o -name target -o -name dist \) -prune -o \
             -type d \( -name migrations -o -name migrate -o -name auth -o -name billing \
                        -o -name payments -o -name terraform -o -name infra \) -print 2>/dev/null | sort)"
  while IFS= read -r d; do
    [ -n "$d" ] || continue
    high_risk="$high_risk, ${d#"$root"/}/"
  done <<< "$found"
  # Kept in step with the fallback list in kit/hooks/guard-secrets.sh — the guard reads
  # this key, so the two must not describe different things.
  secret_paths=".env, .env.*, .envrc, env.local, *.pem, *.key, *.p12, *.pfx, *.jks, *.keystore, *.p8, *.der, *.ppk, id_rsa, id_dsa, id_ecdsa, id_ed25519, *.asc, secring.gpg, credentials.json, service-account*.json, client_secret*.json, gcloud-key*.json, .npmrc, .pypirc, .netrc, .pgpass, .htpasswd, .git-credentials, .dockercfg, *.tfvars, *.tfstate, kubeconfig, *.kubeconfig, secrets.yaml, secrets.yml, vault.token"

  local profile; profile="$(profile_path "$root")"

  if [ -f "$profile" ] && [ "$migrate" -eq 1 ]; then
    heading "Profile"
    _init_migrate_profile "$profile" "$dry_run"
  elif [ -f "$profile" ] && [ "$force" -eq 0 ]; then
    heading "Profile"
    pass "profile-exists" "$profile left untouched (use --force to regenerate, --migrate to add missing keys)"
  elif [ "$dry_run" -eq 1 ]; then
    heading "Profile (dry run)"
    _init_write_profile /dev/stdout
  else
    mkdir -p "$(dirname "$profile")"
    _init_write_profile "$profile"
    heading "Profile"
    pass "profile-written" "$profile"
  fi

  # --- companion files, never overwritten ---------------------------------
  heading "Project files"
  _init_copy "$KIT_HOME/template/CLAUDE.md"                  "$root/CLAUDE.md"                       "$dry_run"
  _init_copy "$KIT_HOME/template/docs/decisions/README.md"   "$root/docs/decisions/README.md"        "$dry_run"
  _init_copy "$KIT_HOME/template/docs/decisions/0000-template.md" "$root/docs/decisions/0000-template.md" "$dry_run"
  _init_copy "$KIT_HOME/template/docs/design/README.md"      "$root/docs/design/README.md"           "$dry_run"
  _init_copy "$KIT_HOME/template/.claude/constraints.md"     "$root/.claude/constraints.md"          "$dry_run"
  local rule name
  for rule in "$KIT_HOME"/template/.claude/rules/*.md; do
    [ -e "$rule" ] || continue
    name="$(basename -- "$rule")"
    # A rule scoped to one CI system is noise in a project that does not use it — and it
    # was being copied everywhere, so a GitLab project received a file about GitHub
    # Actions paths that could never match anything.
    if [ "$name" = "github-actions.md" ] && [ "$ci" != "github-actions" ]; then
      info "skipped" ".claude/rules/$name — no GitHub Actions in this project"
      continue
    fi
    # Same reasoning: a frontend convention file in a Go service is noise a model still
    # has to skip past every time the paths happen to match.
    if [ "$name" = "frontend.md" ] && [ "$(detect_frontend "$root")" != "yes" ]; then
      info "skipped" ".claude/rules/$name — no component frontend detected"
      continue
    fi
    if [ "$name" = "ai-features.md" ] && [ "$(detect_ai "$root")" != "yes" ]; then
      info "skipped" ".claude/rules/$name — no LLM dependency detected"
      continue
    fi
    _init_copy "$rule" "$root/.claude/rules/$name" "$dry_run"
  done

  # Git hooks: the belt to the guards' braces. PreToolUse guards see only Claude's tool
  # calls; these fire for HUMAN commits and pushes too, and read the same profile.
  local hook
  for hook in "$KIT_HOME"/template/.githooks/*; do
    [ -e "$hook" ] || continue
    _init_copy "$hook" "$root/.githooks/$(basename -- "$hook")" "$dry_run"
    [ "$dry_run" -eq 1 ] || chmod +x "$root/.githooks/$(basename -- "$hook")" 2>/dev/null || true
  done
  if [ "$dry_run" -eq 0 ] && git -C "$root" rev-parse --git-dir >/dev/null 2>&1; then
    git -C "$root" config core.hooksPath .githooks
    pass "hooks-path" "core.hooksPath -> .githooks"
  fi
  # The anti-gaming guard is a copy rather than a symlink: it has to run inside CI,
  # where the engine is not installed, and it has to be versioned with the code it guards.
  _init_copy "$KIT_HOME/template/scripts/kit-ci-guards.sh" "$root/scripts/kit-ci-guards.sh" "$dry_run"
  [ "$dry_run" -eq 1 ] || chmod +x "$root/scripts/kit-ci-guards.sh" 2>/dev/null || true
  if [ "$ci" = "github-actions" ]; then
    _init_copy "$KIT_HOME/template/.github/workflows/kit-guards.yml" \
               "$root/.github/workflows/kit-guards.yml" "$dry_run"
    _init_copy "$KIT_HOME/template/.github/workflows/kit-release.yml" \
               "$root/.github/workflows/kit-release.yml" "$dry_run"
  else
    info "ci-guards" "workflows skipped — no GitHub Actions detected; script still installed"
    info "" "after creating CI, re-run 'kit init' to install the CI guard and release workflow"
  fi

  # --- what a human still has to decide ------------------------------------
  local unresolved
  unresolved="$(printf '%s\n' "$c_install" "$c_build" "$c_typecheck" "$c_lint" "$c_test" "$c_e2e" "$c_dev" \
                | grep -c NEEDS_CONFIGURATION || true)"
  heading "Assumptions"
  info "commands set to none" "$(printf '%s\n' "$c_build" "$c_typecheck" "$c_lint" "$c_test" "$c_e2e" "$c_dev" | grep -c '^none$' || true) — set them if your script names differ"
  if [ "$unresolved" -gt 0 ]; then
    fail "needs-configuration" "$unresolved value(s) — edit $profile, then run kit doctor"
  else
    pass "needs-configuration" "none"
  fi

  printf '\nNext: kit doctor\n'
  # Without this the command printed FAIL and exited 0, so `kit init || exit 1` in a
  # script saw success.
  kit_summary init
}

# _init_script <root> <runner> <candidate>... — a matching script key, else "none".
# "none" rather than NEEDS_CONFIGURATION because an enumerable runner that lacks the
# script is evidence the project does not have that step.
_init_script() {
  local found; found="$(first_script "$@")"
  [ -n "$found" ] && printf '%s\n' "$found" || printf 'none\n'
}

_init_e2e_or_none() {
  [ "$(detect_e2e "$1")" = "yes" ] && printf 'NEEDS_CONFIGURATION\n' || printf 'none\n'
}

# _init_copy <source> <destination> <dry_run> — never overwrites.
_init_copy() {
  local src="$1" dst="$2" dry="$3" label
  label="${dst#"$(repo_root)"/}"
  if [ -e "$dst" ]; then
    pass "kept" "$label"
    return 0
  fi
  if [ "$dry" -eq 1 ]; then
    info "would create" "$label"
    return 0
  fi
  mkdir -p "$(dirname -- "$dst")"
  cp "$src" "$dst"
  pass "created" "$label"
}

# Adding a key to the engine used to leave existing projects with no way to get it:
# init refuses to touch a profile that exists, and --force regenerates it from
# detection, discarding PRODUCT_GOALS, the testing policy and every other decision the
# owner made. Three live-run projects had to be migrated by hand before this existed.
#
# Additive by construction: a key already present is never rewritten, whatever its
# value. A key whose section is present is appended to that section's table; a key
# whose section is missing brings the section with it.
_init_migrate_profile() {
  local profile="$1" dry="$2" tmp added=0 stuck=0 key section
  tmp="$(mktemp)"
  _init_write_profile "$tmp"

  local have; have="$(profile_keys "$profile")"
  local missing=""
  while IFS= read -r key; do
    [ -n "$key" ] || continue
    printf '%s\n' "$have" | grep -Fxq "$key" || missing="$missing $key"
  done <<< "$(profile_keys "$tmp")"

  if [ -z "$missing" ]; then
    rm -f "$tmp"
    pass "profile-migrate" "nothing missing — every key this engine expects is present"
    return 0
  fi

  for key in $missing; do
    # Re-checked against the file each time, not against the list computed up front:
    # appending a missing section brings its other keys with it, and without this the
    # rest of that section would be inserted a second time as duplicate rows.
    profile_keys "$profile" | grep -Fxq "$key" && continue
    section="$(awk -v k="$key" '
      /^## / { s = substr($0, 4) }
      $0 ~ "^\\|[[:space:]]*" k "[[:space:]]*\\|" { print s; exit }
    ' "$tmp")"
    if [ "$dry" -eq 1 ]; then
      info "profile-migrate" "would add $key (section: ${section:-none})"
      added=$((added + 1))
      continue
    fi
    if _init_has_section "$profile" "$section"; then
      if ! _init_insert_row "$profile" "$tmp" "$section" "$key"; then
        # A section with a heading and no table has nowhere to put the row. Saying so
        # beats the alternative found in review: the row was dropped and the command
        # reported success, so re-running could never clear the doctor failure it was
        # run to clear.
        fail "profile-migrate" "$key belongs in '$section', which has a heading but no table — add the row by hand"
        stuck=$((stuck + 1))
        continue
      fi
    else
      _init_append_section "$profile" "$tmp" "$section"
    fi
    info "profile-migrate" "added $key to '${section}'"
    added=$((added + 1))
  done

  rm -f "$tmp"
  if [ "$dry" -eq 1 ]; then
    pass "profile-migrate" "$added key(s) would be added; no existing row would change"
  elif [ "$stuck" -gt 0 ]; then
    info "profile-migrate" "$added key(s) added, $stuck could not be placed"
  else
    pass "profile-migrate" "$added key(s) added; no existing row changed"
    info "" "a migrated key may read NEEDS_CONFIGURATION — that is doctor's way of asking you to decide"
  fi
  return 0
}

# Headings are matched ignoring trailing whitespace and CR, because a profile that has
# been through a Windows editor is still that project's profile. Matching bytes exactly
# appended a second copy of a section that was already there — found in review, with
# two `## Repository` headings and two PROJECT_NAME rows as the result.
_init_has_section() {
  awk -v sec="$2" '
    { line = $0; sub(/\r$/, "", line); sub(/[ \t]+$/, "", line) }
    line == "## " sec { found = 1; exit }
    END { exit !found }
  ' "$1"
}

# _init_insert_row <profile> <template> <section> <key> — put the template's row for
# <key> after the last table row of <section>. Non-zero when the section has no table
# to anchor to: the row would vanish, and a silent drop reported as success is worse
# than the missing key it was supposed to fix.
_init_insert_row() {
  local profile="$1" tmp="$2" section="$3" key="$4" row out
  row="$(awk -v k="$key" '$0 ~ "^\\|[[:space:]]*" k "[[:space:]]*\\|" { print; exit }' "$tmp")"
  [ -n "$row" ] || return 1
  out="$(mktemp)"
  awk -v sec="$section" -v row="$row" '
    function norm(s) { sub(/\r$/, "", s); sub(/[ \t]+$/, "", s); return s }
    { lines[NR] = $0; n = norm($0) }
    n == "## " sec { in_sec = 1; next }
    in_sec && /^\|/ { last = NR }
    in_sec && n ~ /^## / { in_sec = 0 }
    END {
      if (last == 0) exit 1
      for (i = 1; i <= NR; i++) {
        print lines[i]
        if (i == last) print row
      }
    }
  ' "$profile" > "$out" || { rm -f "$out"; return 1; }
  mv "$out" "$profile"
}

# _init_append_section <profile> <template> <section> — copy a whole missing section
# across, heading, prose and table together.
_init_append_section() {
  local profile="$1" tmp="$2" section="$3"
  _init_has_section "$profile" "$section" && return 0
  printf '\n' >> "$profile"
  awk -v sec="## $section" '
    $0 == sec { inb = 1 }
    inb && /^## / && $0 != sec { exit }
    inb { print }
  ' "$tmp" >> "$profile"
}

_init_write_profile() {
  cat > "$1" <<EOF
# Project Profile

Generated by \`kit init\`. Edit freely; \`kit doctor\` validates it.

This file is the single source of truth for everything the workflow skills need to know
about this project. No skill may restate policy that lives here — \`kit doctor\` fails if
one does, because duplicated policy is how a kit rots.

## Repository

| Key | Value |
|---|---|
| PROJECT_NAME | $name |
| MAIN_BRANCH | $branch |
| RUNNER | $runner |
| STACK | $stack |
| SOURCE_DIR | $source_dir |
| TEST_DIR | $test_dir |
| CI | $ci |
| DESIGN_DOCS | docs/design |
| CONSTRAINTS | .claude/constraints.md |
| READINESS | bootstrap |
| KIT_SOURCE | none |
| KIT_REF | none |

\`KIT_SOURCE\` and \`KIT_REF\` pin the engine this project vendored (ADR 0008). \`kit vendor\`
writes them; \`kit update\` reads them, so the version a project runs is visible in the
profile rather than only in \`.kit/MANIFEST\`.

\`CONSTRAINTS\` names the file holding what the owner decided; the design cycle quotes it
verbatim and no agent may edit it. \`READINESS\` is one of \`bootstrap\`,
\`implementation\`, \`deployment\`, \`production\` — a claim about this project, which
\`kit doctor\` then holds you to (tests must exist past bootstrap, a deploy path past
implementation, a 1.x tag for production).

## Commands

A value is a **script key** resolved through \`RUNNER\` (so \`build\` becomes \`$runner build\`),
or a literal command prefixed with \`raw:\`, or \`none\` when the step does not apply.
Naming the script rather than the command keeps CI and the skills invoking the same
name, so they cannot drift apart.

| Key | Script |
|---|---|
| INSTALL | $c_install |
| BUILD | $c_build |
| TYPECHECK | $c_typecheck |
| LINT | $c_lint |
| TEST_UNIT | $c_test |
| TEST_E2E | $c_e2e |
| DEV | $c_dev |

## Product

What this project is for. The design critic argues against this first, because a
technically flawless implementation of the wrong thing is the most expensive defect
available — and a purely technical review never finds it. Replace the placeholder;
"ship features" is not a goal.

| Key | Value |
|---|---|
| PRODUCT_GOALS | NEEDS_CONFIGURATION |

## Git

| Key | Value |
|---|---|
| BRANCH_PATTERN | type/short-description |
| COMMIT_FORMAT | conventional |
| PROTECTED_BRANCHES | $branch, master, production |
| MERGE_STRATEGY | squash |

## Risk Triggers

Single source of truth. A change touching any of these needs an explicit decision
before merge rather than an automatic one.

| Key | Value |
|---|---|
| HIGH_RISK_PATHS | $high_risk |
| SECRET_PATHS | $secret_paths |
| MONEY_SYMBOLS | price, amount, currency, payment, invoice, refund |
| SECURITY_SYMBOLS | auth, token, session, permission, password, csp, cors |
| DESTRUCTIVE_SQL | DROP, TRUNCATE, ALTER COLUMN, DELETE without WHERE, UPDATE without WHERE |

## Testing

| Key | Value |
|---|---|
| UNIT_REQUIRED_FOR | business logic, parsers, transformations, money arithmetic |
| INTEGRATION_REQUIRED_FOR | database access, external APIs, queues |
| E2E_REQUIRED_FOR | flows that are irreversible or publicly visible |
| DO_NOT_TEST | framework plumbing, trivial mappings, presentation-only markup |

## Lenses

Which of the design cycle's attack angles exist for this product, and the runner script
that grounds each. The catalog (work-issue skill, references/lenses.md) defines every
lens; this key selects from it. The value is comma-separated ids, each optionally with
a grounding script: "a11y=a11y-audit, seo=seo-check, ux-flows". A lens without a script
may only produce manual criteria and accepted-risk findings — grounding is a runner
script key so CI and the skills invoke the same name; a runner-less project adds a
wrapper script or accepts the manual-only lens. Project-specific lenses the catalog
lacks go in .claude/lenses.md, same format. "none" means this product deliberately has
no lenses.

| Key | Value |
|---|---|
| LENSES | NEEDS_CONFIGURATION |

## Agent Configuration

| Key | Value |
|---|---|
| MAX_DESIGN_ROUNDS | 3 |
| MAX_REVIEW_ROUNDS | 3 |
| MAX_ACTIVE_LENSES | 4 |
| PARALLEL_READ_AGENTS | 3 |
| ALLOW_PARALLEL_WRITES | false |
| CLAUDE_MD_MAX_LINES | 60 |
| UNUSED_ENGINE_ITEM_DAYS | 90 |
EOF
}
