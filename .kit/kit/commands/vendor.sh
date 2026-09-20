#!/usr/bin/env bash
# kit vendor / kit update / kit unvendor — put the engine inside the project (ADR 0008).
#
# Both sources — a git ref and a local checkout — are reduced to the same thing before
# anything is copied: a directory holding an engine tree. One copy path afterwards, so the
# ref case and the local case cannot drift into behaving differently.
#
# Nothing is ever written into the live `.kit/`. The new tree is staged beside it and moved
# into place with rename, because `.kit/bin/kit` may be the very script running (OBJ-3).

kit_cmd_vendor() {
  local source="" ref="" dry=0 adopt="" keep=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --source) source="${2:-}"; shift ;;
      --ref)    ref="${2:-}";    shift ;;
      --dry-run) dry=1 ;;
      --adopt)  adopt="$(_kit_vendor_mode_arg "${2:-}")"; [ "$adopt" = all ] || shift ;;
      --keep)   keep="$(_kit_vendor_mode_arg "${2:-}")";  [ "$keep" = all ] || shift ;;
      --help|-h) _kit_vendor_help vendor; return 0 ;;
      *) die "vendor: unknown option '$1'" ;;
    esac
    shift
  done
  _kit_vendor_run "$source" "$ref" "$dry" vendor 0 "$adopt" "$keep"
}

# A mode flag takes an optional list: bare means every colliding item, a following
# non-flag argument names the ones it applies to.
_kit_vendor_mode_arg() {
  case "${1:-}" in
    ""|-*) printf 'all\n' ;;
    *)     printf '%s\n' "$1" ;;
  esac
}

_kit_vendor_help() {
  printf 'kit %s [--source URL|PATH] [--ref REF] [--adopt [NAMES]] [--keep [NAMES]] [--dry-run]\n\n' "$1"
  printf '  Copies the engine into this project: skills and agents where Claude Code finds\n'
  printf '  them, internals under .kit/, and a MANIFEST that pins the source.\n\n'
  printf '  When a skill or agent of the same name is already the project'"'"'s own, the run\n'
  printf '  refuses and names every collision. Three ways forward:\n\n'
  printf '    --adopt          take the kit'"'"'s version; yours moves to <name>.pre-kit\n'
  printf '    --keep           keep yours; the kit never installs or updates its own\n'
  printf '    --keep a,b --adopt   mix — name the ones to keep, adopt the rest\n\n'
  printf '  A kept item is recorded in the MANIFEST and honoured by every later update,\n'
  printf '  so the choice is made once and stays visible to whoever reads the repository.\n'
}

kit_cmd_update() {
  local source="" ref="" dry=0 check=0 force=0 adopt="" keep=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --source) source="${2:-}"; shift ;;
      --ref)    ref="${2:-}";    shift ;;
      --check)  check=1 ;;
      --force)  force=1 ;;
      --adopt)  adopt="$(_kit_vendor_mode_arg "${2:-}")"; [ "$adopt" = all ] || shift ;;
      --keep)   keep="$(_kit_vendor_mode_arg "${2:-}")";  [ "$keep" = all ] || shift ;;
      --dry-run) dry=1 ;;
      --help|-h)
        _kit_vendor_help update
        printf '\n  --check changes nothing in this project (it may still populate the engine\n'
        printf '  cache under XDG_CACHE_HOME to resolve the ref). An update refuses when a\n'
        printf '  vendored file was edited locally; --force overwrites it.\n'
        return 0 ;;
      *) die "update: unknown option '$1'" ;;
    esac
    shift
  done
  [ "$check" -eq 1 ] && { _kit_vendor_check "$source" "$ref"; return $?; }

  # A keep decision is made once. Re-reading it from the manifest means an update does not
  # quietly re-install the thing the project asked it to leave alone — which is the whole
  # value of having recorded it.
  local root; root="$(repo_root)"
  if [ -z "$keep" ] && [ -f "$root/$KIT_MANIFEST_REL" ]; then
    keep="$(kit_manifest_kept "$root/$KIT_MANIFEST_REL" | paste -sd, - 2>/dev/null || true)"
  fi
  _kit_vendor_run "$source" "$ref" "$dry" update "$force" "$adopt" "$keep"
}

kit_cmd_unvendor() {
  local dry=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --dry-run) dry=1 ;;
      --help|-h) printf 'kit unvendor [--dry-run]\n\n  Removes the vendored engine and deregisters its guards.\n'; return 0 ;;
      *) die "unvendor: unknown option '$1'" ;;
    esac
    shift
  done

  local root; root="$(repo_root)"
  local man="$root/$KIT_MANIFEST_REL"
  [ -f "$man" ] || die "unvendor: no $KIT_MANIFEST_REL here — nothing was vendored into this project"

  heading "Removing the vendored engine"
  # Read the manifest ONCE, up front. The pruning pass below used to re-read it from disk
  # after `rm -rf .kit` had already deleted it, so it walked an empty list and every
  # vendored directory was left behind empty — invisible to the existing tests, which only
  # asserted the files were gone. An empty `.claude/skills/commit/` is not nothing: it
  # occupies the name, so `--adopt`'s restore then found the path "taken" and skipped it.
  local entries; entries="$(kit_manifest_entries "$man")"
  local _hash path
  while IFS="$(printf '\t')" read -r _hash path; do
    [ -n "$path" ] || continue
    if [ "$dry" -eq 1 ]; then info "would remove" "$path"; continue; fi
    rm -f "$root/$path"
  done <<< "$entries"
  if [ "$dry" -eq 0 ]; then
    # ${root:?} rather than $root: an empty root would make this `rm -rf /.kit`, and one
    # unset variable is not an acceptable distance from deleting a filesystem.
    rm -rf "${root:?}/$KIT_VENDOR_DIR"
    # Prune only the directories the manifest's own paths imply, deepest first. A blanket
    # `find .claude/skills -type d -empty -delete` also removed an empty skill directory
    # the user had created — the command's contract is to remove what it installed.
    # `|| true` on the whole thing, and `: ` to close the body: a `while` exits with the
    # status of its last command, so the final failing `rmdir` — the expected end of the
    # walk, once a directory still holds something — became the loop's status and `set -e`
    # aborted unvendor silently, before it ever deregistered the guards.
    printf '%s\n' "$entries" | cut -f2 | while IFS= read -r path; do
      [ -n "$path" ] || continue
      d="$root/$(dirname -- "$path")"
      while [ "$d" != "$root" ] && [ -d "$d" ]; do
        rmdir "$d" 2>/dev/null || break
        d="$(dirname -- "$d")"
      done
      :
    done || true
    pass "removed" "$KIT_VENDOR_DIR and the vendored skills and agents"
  fi

  # Put back what `--adopt` displaced. Without this the removal is only half a reversal:
  # the vendored skill goes (it is in the manifest), the project's own stays parked under
  # `.pre-kit`, and the project ends up with a name that resolves to nothing — silently,
  # months after the adoption, which is the worst moment to discover it.
  #
  # No bookkeeping file is needed: a `.pre-kit` sibling whose real name is now vacant IS
  # the record. A `.pre-kit` whose real name is still occupied belongs to something else
  # and is left alone.
  _kit_vendor_restore_adopted "$root" "$dry"

  heading "Deregistering guards"
  _kit_project_hooks_clear "$root" "$dry"

  kit_summary unvendor
}

_kit_vendor_restore_adopted() { # <root> <dry>
  local root="$1" dry="$2" p target restored=0
  for p in "$root"/.claude/skills/*.pre-kit "$root"/.claude/agents/*.pre-kit; do
    [ -e "$p" ] || continue
    target="${p%.pre-kit}"
    [ -e "$target" ] && continue
    if [ "$dry" -eq 1 ]; then
      info "would restore" "${target#"$root"/}"
    else
      mv "$p" "$target"
      pass "restored" "${target#"$root"/} — the skill --adopt moved aside"
    fi
    restored=$((restored + 1))
  done
  [ "$restored" -eq 0 ] && return 0 || return 0
}

# --- the shared path ---------------------------------------------------------

# _kit_vendor_conflicts <root> <stage> <adopt> — refuse to overwrite a skill we did not write.
#
# Vendoring wrote `.claude/skills/<name>/` unconditionally, so a project that already had a
# skill of that name lost it with no message. That lands hardest on an existing project —
# exactly the case onboarding exists for — and it is the same silent-overwrite defect this
# kit refuses to tolerate elsewhere.
#
# "Ours" means recorded in the manifest of a previous vendor. Anything else that occupies a
# destination path is the project's own work, and the kit does not get to delete it.
# Namespacing the skills instead (`/kit:commit`) was rejected in ADR 0001 for an ergonomic
# cost paid daily; a refusal costs nothing except on the rare run that actually collides.
# _kit_vendor_matches <spec> <unit> — is this unit named by a mode spec?
#
# `all` covers everything; otherwise the spec is a comma-separated list of names, matched
# against the unit's basename so a person can write `--keep commit` rather than
# `--keep .claude/skills/commit`.
_kit_vendor_matches() {
  local spec="$1" unit="$2" base name
  [ -n "$spec" ] || return 1
  [ "$spec" = all ] && return 0
  base="$(basename -- "$unit")"
  local IFS=,
  for name in $spec; do
    [ -n "$name" ] || continue
    name="${name# }"; name="${name% }"
    [ "$name" = "$base" ] && return 0
    [ "$name.md" = "$base" ] && return 0
    [ "$name" = "$unit" ] && return 0
  done
  return 1
}

# Set by _kit_vendor_conflicts: the units this run left to the project, newline separated.
KIT_VENDOR_KEPT=""

_kit_vendor_conflicts() {
  local root="$1" stage="$2" adopt="$3" dry="${4:-0}" keep="${5:-}"
  local man="$root/$KIT_MANIFEST_REL" ours="" conflicts="" d f rel
  KIT_VENDOR_KEPT=""

  [ -f "$man" ] && ours="$(kit_manifest_entries "$man" | cut -f2)"

  for d in .claude/skills .claude/agents; do
    [ -d "$stage/$d" ] || continue
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      rel="$d/${f#./}"
      [ -e "$root/$rel" ] || continue
      printf '%s\n' "$ours" | grep -qxF "$rel" && continue
      conflicts="$conflicts$rel"$'\n'
    done <<< "$(cd "$stage/$d" && find . -type f)"
  done

  conflicts="$(printf '%s' "$conflicts" | grep -v '^$' || true)"
  [ -n "$conflicts" ] || return 0

  # Report and adopt at the unit a person thinks in: a skill is its directory, an agent is
  # its file. Backing up five files of one skill individually would technically preserve
  # the bytes and lose the skill.
  local units; units="$(printf '%s\n' "$conflicts" | sed -E 's#^(\.claude/skills/[^/]+)/.*#\1#' | sort -u)"

  # Three modes, decided per unit so a project can take the kit's agents and keep its own
  # two skills — which is what the first real onboarding actually needed and could not say.
  local to_keep="" to_adopt="" unresolved=""
  while IFS= read -r rel; do
    [ -n "$rel" ] || continue
    if _kit_vendor_matches "$keep" "$rel"; then to_keep="$to_keep$rel"$'\n'
    elif _kit_vendor_matches "$adopt" "$rel"; then to_adopt="$to_adopt$rel"$'\n'
    else unresolved="$unresolved$rel"$'\n'
    fi
  done <<< "$units"

  if [ -n "$(printf '%s' "$unresolved" | grep -v '^$' || true)" ]; then
    heading "Conflicts"
    while IFS= read -r rel; do
      [ -n "$rel" ] && fail "exists" "$rel — this project's own, not the kit's"
    done <<< "$unresolved"
    info "" "the kit will not overwrite what it did not write"
    info "" "keep yours:    --keep            (all of them, the kit skips its versions)"
    info "" "take the kit's: --adopt           (yours move aside to <name>.pre-kit)"
    info "" "mix:            --keep commit,work-issue --adopt"
    return 1
  fi

  # A kept unit is simply not installed. It is recorded in the manifest, because the cost
  # is real and delayed: `kit update` will never touch it again, so an unrecorded keep is a
  # divergence nobody is told about until it matters.
  if [ -n "$(printf '%s' "$to_keep" | grep -v '^$' || true)" ]; then
    heading "Keeping the project's own"
    while IFS= read -r rel; do
      [ -n "$rel" ] || continue
      # ${stage:?} rather than $stage: an unset one would make this `rm -rf /<path>`, and
      # one empty variable is not an acceptable distance from deleting somebody's tree.
      if [ "$dry" -eq 0 ]; then rm -rf "${stage:?}/$rel"; fi
      KIT_VENDOR_KEPT="$KIT_VENDOR_KEPT$rel"$'\n'
      pass "kept" "$rel — the kit will not install or update its own version"
    done <<< "$to_keep"
  fi

  [ -n "$(printf '%s' "$to_adopt" | grep -v '^$' || true)" ] || return 0
  units="$to_adopt"

  # An existing `.pre-kit` is a previous adoption's backup, and overwriting it would
  # destroy the project's original while the message said "moved aside" — the one thing
  # this whole path exists to prevent. Refuse instead; the kit does not delete what it did
  # not write, and that includes what it moved.
  local occupied=""
  while IFS= read -r rel; do
    [ -n "$rel" ] && [ -e "$root/$rel.pre-kit" ] && occupied="$occupied $rel.pre-kit"
  done <<< "$units"
  if [ -n "$occupied" ]; then
    heading "Conflicts"
    fail "backup exists" "$occupied"
    info "" "--adopt would overwrite a backup from an earlier adoption"
    info "" "keep it: rename or remove it yourself, then re-run"
    return 1
  fi

  heading "Adopting"
  while IFS= read -r rel; do
    [ -n "$rel" ] || continue
    if [ "$dry" -eq 1 ]; then
      info "would move aside" "$rel -> $rel.pre-kit"
      continue
    fi
    mv "$root/$rel" "$root/$rel.pre-kit"
    pass "moved aside" "$rel -> $rel.pre-kit"
  done <<< "$units"
  return 0
}

# _kit_vendor_run <source> <ref> <dry> <mode> [force]
_kit_vendor_run() {
  local source="$1" ref="$2" dry="$3" mode="$4" force="${5:-0}" adopt="${6:-}" keep="${7:-}"
  local root; root="$(repo_root)"

  # The engine checkout manages itself through its own kit/ tree. Vendoring it into
  # itself would nest a copy inside the original and hash the wrong tree (OBJ-5).
  if [ "$(cd -P "$root" && pwd)" = "$(cd -P "$KIT_HOME" && pwd)" ]; then
    die "vendor: this IS the engine checkout — it uses kit/ directly and must not vendor into itself"
  fi

  # Precedence: the flag, then a human-set override in the profile, then what this project
  # already vendored. The manifest is the record of the pin; the profile keys are optional.
  local profile; profile="$(profile_path "$root" 2>/dev/null || true)"
  [ -n "$source" ] || source="$(_kit_vendor_profile_value "$profile" KIT_SOURCE)"
  [ -n "$ref" ]    || ref="$(_kit_vendor_profile_value "$profile" KIT_REF)"
  if [ -f "$root/$KIT_MANIFEST_REL" ]; then
    [ -n "$source" ] || source="$(kit_manifest_field "$root/$KIT_MANIFEST_REL" source)"
    [ -n "$ref" ]    || ref="$(kit_manifest_field "$root/$KIT_MANIFEST_REL" ref)"
    case "$ref" in working-tree) ref="" ;; esac   # not a resolvable ref, only a marker
  fi

  heading "Resolving the engine"
  _kit_vendor_engine_root "$source" "$ref" || die "vendor: $KIT_VENDOR_ERROR"
  local eng="$KIT_VENDOR_ENGINE" commit="$KIT_VENDOR_COMMIT"
  source="$KIT_VENDOR_SOURCE"; ref="$KIT_VENDOR_REF"
  pass "source" "$source"
  pass "ref" "$ref${commit:+ ($(printf '%.12s' "$commit"))}"

  # An update must not silently discard a local edit — including a guard someone
  # weakened, which is the whole point of the intact check (OBJ-2).
  if [ "$mode" = update ] && [ -f "$root/$KIT_MANIFEST_REL" ] && [ "$force" -eq 0 ]; then
    local dirty; dirty="$(kit_manifest_diff "$root" "$root/$KIT_MANIFEST_REL" | awk -F'\t' '$1 == "modified" { print $2 }')"
    if [ -n "$dirty" ]; then
      heading "Local modifications"
      # A here-string, not a pipe: `fail` increments KIT_FAILURES, and a pipeline runs its
      # right-hand side in a subshell, so the increments were discarded and the command
      # printed FAIL while exiting 0 — a refusal that reported success.
      while IFS= read -r p; do fail "modified" "$p"; done <<< "$dirty"
      info "" "these differ from the manifest and would be overwritten"
      info "" "keep them: revert them first, or re-run with --force to discard them"
      kit_summary update
      return 1
    fi
  fi

  heading "Staging"
  local stage="$root/.kit.staging"
  rm -rf "$stage"
  mkdir -p "$stage"
  # A staging tree left behind on a failure would be vendored by the next run's find.
  # shellcheck disable=SC2064  # $stage is expanded now on purpose: the trap must not
  # depend on a variable a later function could reassign.
  trap "rm -rf '$stage'" EXIT

  local src dest copied=0
  while IFS="$(printf '\t')" read -r src dest; do
    [ -n "$dest" ] || continue
    mkdir -p "$stage/$(dirname -- "$dest")"
    cp "$src" "$stage/$dest"
    # The engine is shell scripts; a hook that arrives non-executable is a guard that
    # silently never fires.
    [ -x "$src" ] && chmod +x "$stage/$dest"
    copied=$((copied + 1))
  done < <(kit_vendor_pairs "$eng")
  mkdir -p "$stage/$KIT_VENDOR_DIR"
  pass "staged" "$copied file(s)"

  # Conflicts are resolved BEFORE the manifest is written, because resolving them changes
  # what the manifest must say: a kept item is deleted from the staging tree, and the
  # manifest has to record both that it is not there and that the project asked for it.
  # Writing the manifest first recorded files the install would never place.
  #
  # It also runs before `--dry-run` reports success: a run that would destroy the project's
  # own skill must say so in a rehearsal too, or the flag reports a clean install for an
  # operation that is not clean.
  if ! _kit_vendor_conflicts "$root" "$stage" "$adopt" "$dry" "$keep"; then
    rm -rf "$stage"; trap - EXIT
    kit_summary "$mode"
    return 1
  fi
  kit_manifest_write "$stage" "$eng" "$source" "$ref" "$commit" "$KIT_VENDOR_KEPT"

  if [ "$dry" -eq 1 ]; then
    info "would install" "into $root"
    rm -rf "$stage"; trap - EXIT
    kit_summary "$mode"
    return $?
  fi

  heading "Installing"
  # Remove what the previous manifest recorded but this one no longer carries, or a skill
  # deleted upstream lingers forever and `kit doctor` keeps finding a dead reference.
  if [ -f "$root/$KIT_MANIFEST_REL" ]; then
    local oldp
    while IFS="$(printf '\t')" read -r _h oldp; do
      [ -n "$oldp" ] || continue
      [ -e "$stage/$oldp" ] || rm -f "$root/$oldp"
    done < <(kit_manifest_entries "$root/$KIT_MANIFEST_REL")
  fi

  # Rename, never write-in-place: `.kit/bin/kit` may be this very process (OBJ-3).
  if [ -d "$root/$KIT_VENDOR_DIR" ]; then
    rm -rf "$root/$KIT_VENDOR_DIR.old"
    mv "$root/$KIT_VENDOR_DIR" "$root/$KIT_VENDOR_DIR.old"
  fi
  mv "$stage/$KIT_VENDOR_DIR" "$root/$KIT_VENDOR_DIR"
  rm -rf "$root/$KIT_VENDOR_DIR.old"

  # The discovered trees are ordinary files; copy them over.
  local d
  for d in .claude/skills .claude/agents; do
    [ -d "$stage/$d" ] || continue
    mkdir -p "$root/$d"
    (cd "$stage/$d" && find . -type f -print0) | while IFS= read -r -d '' f; do
      mkdir -p "$root/$d/$(dirname -- "$f")"
      cp "$stage/$d/$f" "$root/$d/$f"
    done
  done
  rm -rf "$stage"; trap - EXIT
  pass "installed" "$copied file(s) and $KIT_MANIFEST_REL"

  heading "Registering guards"
  _kit_project_hooks_register "$root" 0

  _kit_vendor_ignore_entries "$root"

  kit_summary "$mode"
}

# _kit_vendor_check <source> <ref> — report, change nothing.
_kit_vendor_check() {
  local source="$1" ref="$2"
  local root; root="$(repo_root)"
  local man="$root/$KIT_MANIFEST_REL"
  [ -f "$man" ] || die "update --check: no $KIT_MANIFEST_REL here — run 'kit vendor' first"

  local profile; profile="$(profile_path "$root" 2>/dev/null || true)"
  [ -n "$source" ] || source="$(kit_manifest_field "$man" source)"
  [ -n "$ref" ]    || ref="$(_kit_vendor_profile_value "$profile" KIT_REF)"
  [ -n "$ref" ]    || ref="$(kit_manifest_field "$man" ref)"

  heading "Vendored"
  local have_commit; have_commit="$(kit_manifest_field "$man" commit)"
  pass "vendored-ref" "$(kit_manifest_field "$man" ref)${have_commit:+ ($(printf '%.12s' "$have_commit"))}"

  heading "Integrity"
  _kit_vendor_report_integrity "$root" "$man"

  heading "Available"
  if _kit_vendor_engine_root "$source" "$ref"; then
    if [ -n "$KIT_VENDOR_COMMIT" ] && [ "$KIT_VENDOR_COMMIT" = "$have_commit" ]; then
      pass "up-to-date" "$KIT_VENDOR_REF is what this project already carries"
    else
      warn "update-available" "$KIT_VENDOR_REF ($(printf '%.12s' "${KIT_VENDOR_COMMIT:-unknown}")) differs from the vendored commit"
      info "" "apply it: kit update"
    fi
  else
    warn "source-unreachable" "$KIT_VENDOR_ERROR — reporting the local state only"
  fi

  kit_summary "update --check"
}

# _kit_vendor_report_integrity <root> <manifest> — shared by check and doctor.
_kit_vendor_report_integrity() {
  local root="$1" man="$2" problems state path
  problems="$(kit_manifest_diff "$root" "$man")"
  if [ -z "$problems" ]; then
    pass "vendored-intact" "$(kit_manifest_entries "$man" | grep -c . ) file(s) match the manifest"
    return 0
  fi
  while IFS="$(printf '\t')" read -r state path; do
    [ -n "$path" ] || continue
    fail "vendored-intact" "$state: $path"
  done <<< "$problems"
  info "" "restore the engine: kit update --force"
  return 1
}

# --- source resolution -------------------------------------------------------

# _kit_vendor_engine_root <source> <ref>
#
# Sets KIT_VENDOR_ENGINE/SOURCE/REF/COMMIT and returns 0, or sets KIT_VENDOR_ERROR and
# returns 1. It reports failure rather than calling `die` because `update --check` must
# survive an unreachable source and still report the local state.
_kit_vendor_engine_root() {
  local source="$1" ref="$2"
  KIT_VENDOR_ENGINE=""; KIT_VENDOR_ERROR=""

  # No source configured: fall back to the checkout this CLI runs from, and report its
  # remote rather than its path, so the manifest records something another machine can use.
  if [ -z "$source" ]; then
    source="$(git -C "$KIT_HOME" remote get-url origin 2>/dev/null || true)"
    [ -n "$source" ] || source="$KIT_HOME"
  fi

  # A local checkout with no ref means "whatever is in the working tree" — the case for
  # developing the engine itself.
  if [ -d "$source" ] && [ -d "$source/kit/skills" ] && [ -z "$ref" ]; then
    KIT_VENDOR_SOURCE="$source"
    KIT_VENDOR_REF="working-tree"
    KIT_VENDOR_COMMIT="$(git -C "$source" rev-parse HEAD 2>/dev/null || true)"
    KIT_VENDOR_ENGINE="$source"
    return 0
  fi

  # A local checkout WITH a ref resolves that ref in that repository. Taking the working
  # tree instead and recording the requested ref anyway is how `--ref no-such-ref` once
  # exited 0 and wrote a manifest naming a ref that had never existed — a record that lies
  # about what it contains, which is worse than a refusal.
  if [ -d "$source" ] && [ -d "$source/kit/skills" ]; then
    local lcommit
    lcommit="$(git -C "$source" rev-parse --verify --quiet "$ref^{commit}" 2>/dev/null || true)"
    if [ -z "$lcommit" ]; then
      KIT_VENDOR_ERROR="ref '$ref' does not exist in $source"
      return 1
    fi
    local lout; lout="${TMPDIR:-/tmp}/kit-engine-$$-$(printf '%.12s' "$lcommit")"
    rm -rf "$lout"; mkdir -p "$lout"
    if ! git -C "$source" archive "$lcommit" | tar -x -C "$lout"; then
      KIT_VENDOR_ERROR="could not extract $ref from $source"
      return 1
    fi
    KIT_VENDOR_SOURCE="$source"
    KIT_VENDOR_REF="$ref"
    KIT_VENDOR_COMMIT="$lcommit"
    KIT_VENDOR_ENGINE="$lout"
    return 0
  fi

  # A git source is cached, not re-cloned: an update should cost a fetch, and a machine
  # with several vendored projects shares one copy.
  local cache_root="${XDG_CACHE_HOME:-$HOME/.cache}/claude-kit/repos"
  local key; key="$(printf '%s' "$source" | tr -c 'A-Za-z0-9._-' '-')"
  local cache="$cache_root/$key"
  mkdir -p "$cache_root"
  if [ ! -d "$cache" ]; then
    if ! git clone --quiet --bare "$source" "$cache" 2>/dev/null; then
      rm -rf "$cache"   # a failed clone leaves a partial directory that looks cached
      KIT_VENDOR_ERROR="cannot clone '$source' — pass --source with a reachable URL or a local checkout path"
      return 1
    fi
  fi
  git -C "$cache" fetch --quiet --force origin \
      '+refs/heads/*:refs/heads/*' '+refs/tags/*:refs/tags/*' 2>/dev/null || true

  [ -n "$ref" ] || ref="$(git -C "$cache" symbolic-ref --short HEAD 2>/dev/null || echo main)"
  local commit
  commit="$(git -C "$cache" rev-parse --verify --quiet "$ref^{commit}" 2>/dev/null || true)"
  if [ -z "$commit" ]; then
    KIT_VENDOR_ERROR="ref '$ref' does not exist in $source"
    return 1
  fi

  local out; out="${TMPDIR:-/tmp}/kit-engine-$$-$(printf '%.12s' "$commit")"
  rm -rf "$out"; mkdir -p "$out"
  if ! git -C "$cache" archive "$commit" | tar -x -C "$out"; then
    KIT_VENDOR_ERROR="could not extract $ref from $source"
    return 1
  fi

  KIT_VENDOR_SOURCE="$source"
  KIT_VENDOR_REF="$ref"
  KIT_VENDOR_COMMIT="$commit"
  KIT_VENDOR_ENGINE="$out"
}

_kit_vendor_profile_value() { # <profile-path> <key>
  [ -n "$1" ] && [ -f "$1" ] || return 0
  local v; v="$(profile_get "$1" "$2" 2>/dev/null || true)"
  case "$v" in NEEDS_CONFIGURATION|none|"") return 0 ;; *) printf '%s\n' "$v" ;; esac
}

# The host project's own formatters must leave the vendored engine alone.
#
# Found the hard way: vendoring into a project whose CI runs `prettier --check .` turned a
# green pipeline red on 17 engine files, and "fixing" it by reformatting them would have
# rewritten bytes the manifest pins — `vendored-intact` would fail on the next `kit doctor`
# and every `kit update` would fight the formatter. The engine is third-party code that
# happens to live in the tree; it is ignored, not reformatted.
#
# The ignore file is written when it already exists OR when package.json shows the project
# actually runs that tool. Requiring the file to pre-exist was too narrow and left a real
# project broken: it ran `prettier --check .` in CI with no `.prettierignore` at all, so
# there was nothing to append to and the vendored engine failed its pipeline. A project
# with no sign of the tool is still left alone — that would be the kit choosing a
# toolchain for it.
_kit_vendor_ignore_entries() { # <root>
  local root="$1" f tool added=0 touched="" flat=""
  for f in .prettierignore .eslintignore .stylelintignore; do
    tool="${f#.}"; tool="${tool%ignore}"

    # ESLint 9 dropped `.eslintignore` for flat config and only prints a warning when one
    # exists — so writing it looked like it worked and ignored nothing. Found on the first
    # real onboarding, whose `eslint --no-warn-ignored .kit/bin/kit` still linted the
    # vendored engine. A flat config's `ignores` is JavaScript, and editing somebody's
    # config file by pattern is how a tool corrupts a build it does not understand; the
    # kit prints the entry to paste instead of guessing at their syntax.
    if [ "$tool" = eslint ]; then
      flat=""
      local c
      for c in eslint.config.js eslint.config.mjs eslint.config.cjs eslint.config.ts eslint.config.mts; do
        [ -f "$root/$c" ] && { flat="$c"; break; }
      done
      if [ -n "$flat" ]; then
        warn "eslint-ignores" "$flat is flat config — .eslintignore is not read by ESLint 9"
        info "" "add to its ignores: \".kit/**\", \".claude/skills/**\", \".claude/agents/**\""
        continue
      fi
    fi

    if [ ! -f "$root/$f" ]; then
      [ -f "$root/package.json" ] || continue
      grep -q "$tool" "$root/package.json" 2>/dev/null || continue
    fi
    local missing=""
    local entry
    for entry in ".kit/" ".claude/skills/" ".claude/agents/"; do
      grep -qxF "$entry" "$root/$f" 2>/dev/null || missing="$missing$entry"$'\n'
    done
    [ -n "$missing" ] || continue
    {
      printf '\n# The vendored claude-kit engine. Its bytes are pinned by .kit/MANIFEST;\n'
      printf '# reformatting them breaks `kit doctor` (vendored-intact).\n'
      printf '%s' "$missing"
    } >> "$root/$f"
    added=$((added + 1))
    touched="$touched $f"
  done
  if [ "$added" -gt 0 ]; then
    pass "formatter-ignores" "vendored paths added to$touched"
  else
    info "formatter-ignores" "nothing to update"
  fi
}

# There is deliberately NO profile writer here. `kit vendor` used to record KIT_SOURCE and
# KIT_REF into .claude/kit.md, and it broke a real project's `prettier --check`: the
# profile's table was formatter-aligned and the appended rows were not, so the formatter
# wanted the whole table rewritten — on a file that had passed for months. Chasing column
# widths would re-break on the next value that is one character wider.
#
# The pin lives in .kit/MANIFEST, which is the file that has to carry it anyway. The
# profile's KIT_SOURCE / KIT_REF stay readable as a human-set OVERRIDE, and are consulted
# first below; the kit never writes them.

# --- project-level hook registration ----------------------------------------

# Guards move from ~/.claude/settings.json to the project's own, addressed through
# ${CLAUDE_PROJECT_DIR} so they resolve in any clone. Exec form (`args`) is what the hook
# documentation prescribes for a command carrying a path placeholder.
_kit_project_hooks_register() { # <root> <dry>
  local root="$1" dry="$2" guard name cmd
  local settings="$root/.claude/settings.json"
  [ "$dry" -eq 1 ] || mkdir -p "$root/.claude"
  [ -f "$settings" ] || { [ "$dry" -eq 1 ] || printf '{}\n' > "$settings"; }
  if [ -f "$settings" ] && ! jq empty "$settings" >/dev/null 2>&1; then
    fail "guards-registered" "$settings is not valid JSON — fix it, then re-run"
    return 1
  fi

  local registered=0
  for guard in "$root/$KIT_VENDOR_DIR"/kit/hooks/guard-*.sh; do
    [ -e "$guard" ] || continue
    name="$(basename -- "$guard")"
    cmd="\${CLAUDE_PROJECT_DIR}/$KIT_VENDOR_DIR/kit/hooks/$name"
    if [ "$dry" -eq 1 ]; then info "would register" "$name"; continue; fi
    local tmp; tmp="$(mktemp)"
    if jq --arg c "$cmd" '
          .hooks //= {} | .hooks.PreToolUse //= [] |
          if ([.hooks.PreToolUse[]?.hooks[]?.command] | index($c)) then .
          else .hooks.PreToolUse += [{ matcher: "Bash", hooks: [{ type: "command", command: $c, args: [] }] }]
          end
        ' "$settings" > "$tmp" 2>/dev/null && [ -s "$tmp" ]; then
      mv "$tmp" "$settings"; registered=$((registered + 1))
    else
      rm -f "$tmp"; fail "guards-registered" "$name — could not update $settings"
      return 1
    fi
  done
  [ "$dry" -eq 1 ] || pass "guards-registered" "$registered guard(s) in .claude/settings.json"
}

_kit_project_hooks_clear() { # <root> <dry>
  local root="$1" dry="$2"
  local settings="$root/.claude/settings.json"
  [ -f "$settings" ] || { info "guards-removed" "no .claude/settings.json"; return 0; }
  if [ "$dry" -eq 1 ]; then info "would deregister" "the vendored guards"; return 0; fi
  local tmp; tmp="$(mktemp)"
  if jq '
        def is_kit: (.command // "") | test("/\\.kit/kit/hooks/guard-[a-z-]+\\.sh$");
        if .hooks.PreToolUse then
          .hooks.PreToolUse = [ .hooks.PreToolUse[] | .hooks = [ .hooks[]? | select(is_kit | not) ] | select((.hooks | length) > 0) ]
          | if (.hooks.PreToolUse | length) == 0 then del(.hooks.PreToolUse) else . end
        else . end
        | if (.hooks | type) == "object" and (.hooks | length) == 0 then del(.hooks) else . end
      ' "$settings" > "$tmp" 2>/dev/null && [ -s "$tmp" ]; then
    mv "$tmp" "$settings"
    # An empty object is the file `kit vendor` created and nothing else wrote to. Leaving
    # it behind is not "as it was before" — the same test `kit uninstall` applies.
    if [ "$(jq -S -c . "$settings" 2>/dev/null || echo x)" = "{}" ]; then
      rm -f "$settings"
      rmdir "$root/.claude" 2>/dev/null || true
      pass "guards-removed" "settings.json held nothing else and was removed"
    else
      pass "guards-removed" "settings.json cleaned"
    fi
  else
    rm -f "$tmp"; fail "guards-removed" "could not rewrite $settings"
  fi
}
