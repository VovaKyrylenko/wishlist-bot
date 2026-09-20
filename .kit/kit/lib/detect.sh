#!/usr/bin/env bash
# Stack detection.
#
# Everything here reads the repository and reports what it finds. It never asks, and
# it never guesses silently: a command it cannot resolve becomes NEEDS_CONFIGURATION
# so that `kit doctor` fails until a human decides. `none` is only emitted when the
# repository gives positive evidence that the thing does not apply.

# --- runner -----------------------------------------------------------------

# detect_runner <root> — how this project invokes its own scripts, or "none".
detect_runner() {
  local root="$1"
  if [ -f "$root/package.json" ]; then
    local pm
    pm="$(node_package_manager "$root")"
    case "$pm" in
      yarn) printf 'yarn\n' ;;   # `yarn build`, no `run`
      *)    printf '%s run\n' "$pm" ;;
    esac
    return 0
  fi
  [ -f "$root/justfile" ] || [ -f "$root/Justfile" ] && { printf 'just\n'; return 0; }
  [ -f "$root/Makefile" ] && { printf 'make\n'; return 0; }
  printf 'none\n'
}

# node_package_manager <root> — from the packageManager field, then lockfiles.
node_package_manager() {
  local root="$1" declared=""
  if [ -f "$root/package.json" ] && command -v jq >/dev/null 2>&1; then
    declared="$(jq -r '.packageManager // empty' "$root/package.json" 2>/dev/null | cut -d@ -f1)"
  fi
  if [ -n "$declared" ]; then printf '%s\n' "$declared"; return 0; fi
  [ -f "$root/pnpm-lock.yaml" ] && { printf 'pnpm\n'; return 0; }
  [ -f "$root/yarn.lock" ]      && { printf 'yarn\n'; return 0; }
  [ -f "$root/bun.lockb" ] || [ -f "$root/bun.lock" ] && { printf 'bun\n'; return 0; }
  printf 'npm\n'
}

# --- stack ------------------------------------------------------------------

# detect_stack <root> — one word, used only to pick command candidates.
detect_stack() {
  local root="$1"
  [ -f "$root/package.json" ]   && { printf 'node\n';   return 0; }
  [ -f "$root/go.mod" ]         && { printf 'go\n';     return 0; }
  [ -f "$root/Cargo.toml" ]     && { printf 'rust\n';   return 0; }
  [ -f "$root/pyproject.toml" ] || [ -f "$root/requirements.txt" ] || [ -f "$root/setup.py" ] \
                                && { printf 'python\n'; return 0; }
  [ -f "$root/Gemfile" ]        && { printf 'ruby\n';   return 0; }
  printf 'generic\n'
}

# --- script lookup ----------------------------------------------------------

# script_exists <root> <runner> <script-key>
script_exists() {
  local root="$1" runner="$2" key="$3"
  case "$runner" in
    npm*|pnpm*|yarn*|bun*)
      [ -f "$root/package.json" ] || return 1
      command -v jq >/dev/null 2>&1 || return 1
      jq -e --arg k "$key" '.scripts[$k] // empty | select(. != "")' "$root/package.json" >/dev/null 2>&1
      ;;
    make)
      [ -f "$root/Makefile" ] || return 1
      grep -Eq "^${key}[[:space:]]*:" "$root/Makefile"
      ;;
    just)
      local f="$root/justfile"; [ -f "$f" ] || f="$root/Justfile"; [ -f "$f" ] || return 1
      grep -Eq "^${key}([[:space:]]|:)" "$f"
      ;;
    *) return 1 ;;
  esac
}

# first_script <root> <runner> <candidate>... — first candidate that exists, else empty.
first_script() {
  local root="$1" runner="$2"; shift 2
  local candidate
  for candidate in "$@"; do
    if script_exists "$root" "$runner" "$candidate"; then printf '%s\n' "$candidate"; return 0; fi
  done
  return 0
}

# --- helpers ----------------------------------------------------------------

# has_dep <root> <name> — dependency named anywhere in the manifest.
has_dep() {
  local root="$1" name="$2"
  for f in package.json pyproject.toml requirements.txt requirements-dev.txt Cargo.toml go.mod Gemfile; do
    [ -f "$root/$f" ] || continue
    grep -Fq "$name" "$root/$f" && return 0
  done
  return 1
}

# has_any_file <root> <glob>... — any match, without enabling globstar.
has_any_file() {
  local root="$1"; shift
  local g
  for g in "$@"; do
    # shellcheck disable=SC2086
    if compgen -G "$root/$g" >/dev/null 2>&1; then return 0; fi
  done
  return 1
}

# detect_e2e <root> — "yes" when an end-to-end framework is configured, else "no".
detect_e2e() {
  local root="$1"
  if has_any_file "$root" 'playwright.config.*' 'cypress.config.*' 'cypress.json' 'wdio.conf.*' \
                          'e2e/*' 'tests/e2e/*'; then printf 'yes\n'; return 0; fi
  has_dep "$root" playwright && { printf 'yes\n'; return 0; }
  has_dep "$root" cypress    && { printf 'yes\n'; return 0; }
  has_dep "$root" selenium   && { printf 'yes\n'; return 0; }
  printf 'no\n'
}

# first_existing_dir <root> <name>... — first directory that exists, relative.
first_existing_dir() {
  local root="$1"; shift
  local d
  for d in "$@"; do
    [ -d "$root/$d" ] && { printf '%s\n' "$d"; return 0; }
  done
  return 0
}

# detect_frontend <root> — "yes" when a component-based frontend is present.
detect_frontend() {
  local root="$1"
  has_dep "$root" react   && { printf 'yes\n'; return 0; }
  has_dep "$root" vue     && { printf 'yes\n'; return 0; }
  has_dep "$root" svelte  && { printf 'yes\n'; return 0; }
  has_any_file "$root" 'src/*.tsx' 'app/*.tsx' 'src/*.vue' 'src/*.svelte' \
    && { printf 'yes\n'; return 0; }
  printf 'no\n'
}

# detect_ai <root> — "yes" when the project talks to an LLM.
detect_ai() {
  local root="$1" dep
  for dep in "@ai-sdk" openai anthropic langchain "generative-ai" ollama; do
    has_dep "$root" "$dep" && { printf 'yes\n'; return 0; }
  done
  printf 'no\n'
}

# detect_main_branch <root>
#
# Falling back to the checked-out branch is wrong and was a real defect: running
# `kit init` from a feature branch permanently recorded that feature branch as the
# trunk. Prefer what the remote says, then an actual trunk-shaped branch that exists,
# and only then the current one.
detect_main_branch() {
  local root="$1" b candidate
  b="$(git -C "$root" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || true)"
  b="${b#origin/}"
  [ -n "$b" ] && { printf '%s\n' "$b"; return 0; }

  for candidate in main master trunk develop; do
    if git -C "$root" rev-parse --verify --quiet "refs/heads/$candidate" >/dev/null 2>&1 \
    || git -C "$root" rev-parse --verify --quiet "refs/remotes/origin/$candidate" >/dev/null 2>&1; then
      printf '%s\n' "$candidate"; return 0
    fi
  done

  b="$(git -C "$root" symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
  [ -n "$b" ] && { printf '%s\n' "$b"; return 0; }
  printf 'main\n'
}

# detect_project_name <root>
detect_project_name() {
  local root="$1" name=""
  if [ -f "$root/package.json" ] && command -v jq >/dev/null 2>&1; then
    name="$(jq -r '.name // empty' "$root/package.json" 2>/dev/null)"
  fi
  [ -z "$name" ] && [ -f "$root/go.mod" ] && \
    name="$(awk '/^module /{ n = split($2, p, "/"); print p[n]; exit }' "$root/go.mod")"
  [ -z "$name" ] && [ -f "$root/Cargo.toml" ] && \
    name="$(awk -F'"' '/^name[[:space:]]*=/{ print $2; exit }' "$root/Cargo.toml")"
  [ -z "$name" ] && name="$(basename -- "$root")"
  printf '%s\n' "$name"
}

# detect_ci <root>
detect_ci() {
  local root="$1"
  has_any_file "$root" '.github/workflows/*.yml' '.github/workflows/*.yaml' && { printf 'github-actions\n'; return 0; }
  [ -f "$root/.gitlab-ci.yml" ] && { printf 'gitlab-ci\n'; return 0; }
  [ -f "$root/.circleci/config.yml" ] && { printf 'circleci\n'; return 0; }
  printf 'none\n'
}
