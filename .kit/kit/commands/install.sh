#!/usr/bin/env bash
# kit install / kit uninstall — make the CLI reachable, and undo the old delivery model.
#
# Since ADR 0008 the engine is vendored per project (`kit vendor`), so installing puts
# `kit` on PATH and nothing else. `kit uninstall` still knows how to dismantle the
# superseded symlink model of ADR 0001, because that is the migration path off it and a
# machine set up the old way has to be able to get clean.
# Every operation is idempotent; running install twice changes nothing.

# Read at file scope, so an unset HOME killed even `kit install --help` with a raw
# "unbound variable" from bash rather than a message anyone could act on.
[ -n "${HOME:-}" ] || die "install: HOME is not set — the CLI is linked into \$HOME/.local/bin"

KIT_SETTINGS="$HOME/.claude/settings.json"
KIT_PRE_INSTALL_BACKUP="$HOME/.claude/settings.json.kit-pre-install"

kit_cmd_install() {
  local dry=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --dry-run) dry=1 ;;
      --help|-h) printf 'kit install [--dry-run]\n'; return 0 ;;
      *) die "install: unknown option '$1'" ;;
    esac
    shift
  done

  heading "Command line"
  _kit_link_bin "$dry"

  # Under ADR 0008 the engine goes into each project with `kit vendor`, so installing is
  # only about reaching the CLI. Anything this machine still has under ~/.claude is from
  # the superseded symlink model, and leaving it there means every project loads the
  # machine's engine on top of its own pinned copy — the silent version skew the vendored
  # model exists to remove.
  heading "Previous installation"
  local legacy=0 link target
  for link in "$HOME"/.claude/skills/* "$HOME"/.claude/agents/*; do
    [ -L "$link" ] || continue
    target="$(readlink -- "$link")"
    case "$target" in */kit/skills/*|*/kit/agents/*) legacy=$((legacy + 1)) ;; esac
  done
  local hooked=0
  if [ -f "$KIT_SETTINGS" ]; then
    # An unparseable settings file is a FAIL, not a shrug: this check cannot tell whether
    # guards from the old model are still registered, so reporting a clean install would
    # be reporting a conclusion that was never reached.
    if ! jq empty "$KIT_SETTINGS" >/dev/null 2>&1; then
      fail "legacy-install" "${KIT_SETTINGS#"$HOME"/} is not valid JSON — cannot tell whether old guards remain"
      info "" "fix the JSON, then re-run 'kit install'"
      heading "Next"
      info "per project" "kit init && kit vendor"
      kit_summary install
      return
    fi
    hooked="$(jq '[.hooks.PreToolUse[]?.hooks[]? | select((.command // "") | test("/kit/hooks/guard-[a-z-]+\\.sh$"))] | length' \
                "$KIT_SETTINGS" 2>/dev/null || echo 0)"
  fi
  if [ "$legacy" -eq 0 ] && [ "$hooked" -eq 0 ]; then
    pass "no-legacy-install" "nothing left from the symlink delivery model"
  else
    warn "legacy-install" "$legacy symlink(s) and $hooked guard(s) remain from the pre-vendoring model"
    info "" "remove them: kit uninstall — then run 'kit vendor' inside each project"
  fi

  heading "Next"
  info "per project" "kit init && kit vendor"

  kit_summary install
}

kit_cmd_uninstall() {
  local dry=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --dry-run) dry=1 ;;
      --help|-h) printf 'kit uninstall [--dry-run]\n'; return 0 ;;
      *) die "uninstall: unknown option '$1'" ;;
    esac
    shift
  done

  heading "Unlinking engine"
  local link target
  for link in "$HOME"/.claude/skills/* "$HOME"/.claude/agents/* "$HOME"/.local/bin/kit; do
    [ -L "$link" ] || continue
    target="$(readlink -- "$link")"
    # Dangling links are removed too. Matching only the CURRENT $KIT_HOME meant that
    # moving or renaming the checkout made every link and hook entry unremovable — while
    # uninstall still reported success.
    case "$target" in
      "$KIT_HOME"/*)
        if [ "$dry" -eq 1 ]; then info "would remove" "${link#"$HOME"/}"
        else rm -f "$link"; pass "removed" "${link#"$HOME"/}"; fi
        ;;
      *)
        if [ ! -e "$link" ] && case "$target" in */kit/skills/*|*/kit/agents/*|*/bin/kit) true ;; *) false ;; esac; then
          if [ "$dry" -eq 1 ]; then info "would remove (dangling)" "${link#"$HOME"/}"
          else rm -f "$link"; pass "removed dangling" "${link#"$HOME"/}"; fi
        fi
        ;;
    esac
  done

  heading "Deregistering guards"
  if [ -f "$KIT_SETTINGS" ]; then
    if [ "$dry" -eq 1 ]; then
      info "would rewrite" "$KIT_SETTINGS"
    elif ! jq empty "$KIT_SETTINGS" >/dev/null 2>&1; then
      fail "guards-removed" "$KIT_SETTINGS is not valid JSON — left untouched"
    else
      local tmp; tmp="$(mktemp)"
      # Removes this checkout's entries AND any entry whose script no longer exists,
      # which is what a moved checkout leaves behind.
      if jq --arg home "$KIT_HOME" '
            def is_kit_hook: (.command // "") as $c
              | ($c | startswith($home))
                or ((($c | test("/kit/hooks/guard-[a-z-]+\\.sh$")) // false));
            if .hooks.PreToolUse then
              .hooks.PreToolUse = [
                .hooks.PreToolUse[]
                | .hooks = [ .hooks[]? | select(is_kit_hook | not) ]
                | select((.hooks | length) > 0)
              ]
              | if (.hooks.PreToolUse | length) == 0 then del(.hooks.PreToolUse) else . end
            else . end
            | if (.hooks | type) == "object" and (.hooks | length) == 0 then del(.hooks) else . end
          ' "$KIT_SETTINGS" > "$tmp" 2>/dev/null && [ -s "$tmp" ]; then
        mv "$tmp" "$KIT_SETTINGS"
        pass "guards-removed" "settings.json cleaned"
      else
        rm -f "$tmp"
        fail "guards-removed" "could not rewrite $KIT_SETTINGS"
      fi
    fi
  fi

  if [ -f "$KIT_ABSENT_MARKER" ]; then
    if [ "$dry" -eq 1 ]; then
      info "would remove" "the settings file the installer created"
    else
      # It only existed because install created it. Leaving an empty file behind is not
      # "byte-identical to before".
      if [ "$(jq -S -c . "$KIT_SETTINGS" 2>/dev/null || echo x)" = "{}" ]; then
        rm -f "$KIT_SETTINGS"
        pass "settings-restored" "removed the settings file the installer created"
      else
        warn "settings-restored" "$KIT_SETTINGS now has content of your own — kept"
      fi
      rm -f "$KIT_ABSENT_MARKER"
      rmdir "$HOME/.claude/skills" "$HOME/.claude/agents" 2>/dev/null || true
    fi
  elif [ -f "$KIT_PRE_INSTALL_BACKUP" ]; then
    if [ "$(jq -S . "$KIT_SETTINGS" 2>/dev/null)" = "$(jq -S . "$KIT_PRE_INSTALL_BACKUP" 2>/dev/null)" ]; then
      # Restore the original bytes, not an equivalent document. jq rewrites whitespace and
      # key order, so "semantically identical" left a file that differs at character 2 —
      # and the criterion says byte-identical.
      if [ "$dry" -eq 1 ]; then
        info "would restore" "the original settings file byte for byte"
      else
        cp "$KIT_PRE_INSTALL_BACKUP" "$KIT_SETTINGS"
        rm -f "$KIT_PRE_INSTALL_BACKUP"
        pass "settings-restored" "byte-identical to the pre-install file; backup removed"
      fi
    else
      warn "settings-restored" "differs from the pre-install state — compare with ${KIT_PRE_INSTALL_BACKUP#"$HOME"/}, then delete it"
    fi
  fi

  # Directories the installer created and nobody else used.
  [ "$dry" -eq 1 ] || rmdir "$HOME/.claude/skills" "$HOME/.claude/agents" 2>/dev/null || true

  kit_summary uninstall
}

_kit_link() { # _kit_link <source> <link> <dry>
  local src="$1" link="$2" dry="$3" label="${2#"$HOME"/}"
  if [ -L "$link" ]; then
    if [ "$(readlink -- "$link")" = "$src" ]; then pass "linked" "$label"; return 0; fi
    if [ "$dry" -eq 1 ]; then info "would relink" "$label"; return 0; fi
    rm -f "$link"
  elif [ -e "$link" ]; then
    fail "occupied" "$label exists and is not a kit symlink — left untouched"
    return 0
  fi
  if [ "$dry" -eq 1 ]; then info "would link" "$label"; return 0; fi
  # -n is load-bearing: without it, `ln -s dir existing-symlink-to-that-dir` descends
  # through the symlink and creates a self-referencing link INSIDE the skill directory.
  # Seven of those ended up committed to this repository before it was noticed.
  ln -sfn "$src" "$link"
  pass "linked" "$label"
}

KIT_ABSENT_MARKER="$HOME/.claude/.kit-settings-were-absent"

# The pre-install markers stay: `kit uninstall` still restores a machine that was set up
# under the superseded symlink model, and that restore is the migration path off it.
_kit_link_bin() {
  local dry="$1" dir="$HOME/.local/bin"
  [ "$dry" -eq 1 ] || mkdir -p "$dir"
  _kit_link "$KIT_HOME/bin/kit" "$dir/kit" "$dry"
  case ":$PATH:" in
    *":$dir:"*) pass "on-path" "$dir" ;;
    *) warn "on-path" "$dir is not on PATH — add it, or call $KIT_HOME/bin/kit directly" ;;
  esac
}
