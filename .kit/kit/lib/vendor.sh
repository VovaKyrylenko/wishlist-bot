#!/usr/bin/env bash
# Vendoring: what gets copied into a project, where it lands, and how tampering is caught.
#
# The layout is split by WHO READS IT, which is a constraint rather than a preference
# (ADR 0008, OBJ-1). Claude Code discovers project skills only at
# `.claude/skills/<name>/SKILL.md` and project agents only at `.claude/agents/`, so those
# two trees cannot be moved. Everything else is engine internals nobody else reads, and
# lives under `.kit/`.
#
# `.kit/` mirrors the engine checkout's own shape (`.kit/bin/kit`, `.kit/kit/lib/...`)
# because `bin/kit` derives KIT_HOME as the parent of its own directory. Preserving that
# shape means the vendored CLI is byte-identical to the engine's — no patching, so no
# second code path that could drift.

KIT_VENDOR_DIR=".kit"
KIT_MANIFEST_REL=".kit/MANIFEST"

# Results of the last _kit_vendor_engine_root call.
#
# These are globals rather than printed output because the resolver returns FIVE values
# and its callers need all of them. An earlier version printed the engine path and set the
# rest as globals; every caller invoked it as `eng="$(...)"`, so the assignments happened
# inside a command-substitution subshell and every field arrived empty at the caller —
# which the first live run printed as a blank `PASS source`.
# shellcheck disable=SC2034  # written and read across files: set by
# _kit_vendor_engine_root in kit/commands/vendor.sh, read by its callers and by doctor.
KIT_VENDOR_ENGINE=""
# shellcheck disable=SC2034
KIT_VENDOR_SOURCE=""
# shellcheck disable=SC2034
KIT_VENDOR_REF=""
# shellcheck disable=SC2034
KIT_VENDOR_COMMIT=""
# shellcheck disable=SC2034
KIT_VENDOR_ERROR=""

# kit_sha256 <file> — the hash alone, no filename.
#
# Three implementations because there is no portable one: macOS ships `shasum`, most
# Linux distributions ship `sha256sum`, and a stripped container may have only openssl.
# A kit that cannot hash cannot verify, so the absence is fatal rather than skipped.
kit_sha256() {
  local f="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$f" | cut -d' ' -f1
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$f" | cut -d' ' -f1
  elif command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 "$f" | awk '{print $NF}'
  else
    die "no sha256 tool found (looked for sha256sum, shasum, openssl) — the manifest cannot be written or verified"
  fi
}

# kit_vendor_pairs <engine-root> — emits "<source-abs>\t<dest-rel>" for every file vendored.
#
# One function feeds both the writer and the verifier, so the two cannot disagree about
# what the vendored set is. A file listed here and missing there is the class of bug that
# makes an integrity check quietly pass over the thing it was meant to protect.
kit_vendor_pairs() {
  local eng="$1" f rel name

  # Discovered by Claude Code — paths fixed by the tool.
  for f in "$eng"/kit/skills/*/; do
    [ -d "$f" ] || continue
    name="$(basename -- "${f%/}")"
    while IFS= read -r sub; do
      [ -n "$sub" ] || continue
      rel="${sub#"$f"}"
      printf '%s\t%s\n' "$sub" ".claude/skills/$name/$rel"
    done < <(find "$f" -type f | sort)
  done
  for f in "$eng"/kit/agents/*.md; do
    [ -e "$f" ] || continue
    printf '%s\t%s\n' "$f" ".claude/agents/$(basename -- "$f")"
  done

  # Engine internals — mirroring the checkout's shape so bin/kit resolves KIT_HOME.
  printf '%s\t%s\n' "$eng/bin/kit" "$KIT_VENDOR_DIR/bin/kit"
  local d
  # `kit/tastes` is engine internals rather than a discovered path: the skills read it by
  # its vendored location, and the CLI checks it. Leaving it out shipped two skills whose
  # first instruction was to read a file the project did not have.
  for d in kit/lib kit/commands kit/hooks kit/tastes template; do
    [ -d "$eng/$d" ] || continue
    while IFS= read -r sub; do
      [ -n "$sub" ] || continue
      rel="${sub#"$eng"/}"
      printf '%s\t%s\n' "$sub" "$KIT_VENDOR_DIR/$rel"
    done < <(find "$eng/$d" -type f ! -name '.DS_Store' | sort)
  done
}

# kit_manifest_write <staging-root> <engine-root> <source> <ref> <commit> [kept-paths]
#
# Deliberately carries no timestamp. `kit vendor` run twice on the same ref must produce a
# byte-identical manifest, or every re-run shows up as a diff and the signal that something
# actually changed is lost in the noise.
#
# `kept` records the items this project asked the kit NOT to install, one per line. It
# belongs in the manifest rather than in anybody's memory: a kept skill is a skill
# `kit update` will never touch again, and an unrecorded one is a silent divergence — the
# exact failure the manifest exists to make impossible for the files it does carry.
kit_manifest_write() {
  local stage="$1" eng="$2" source="$3" ref="$4" commit="$5" kept="${6:-}" dest hash keptp
  {
    printf '# .kit/MANIFEST — written by `kit vendor`; `kit doctor` verifies it.\n'
    printf '# Editing a vendored file without updating its hash here fails `vendored-intact`.\n'
    printf 'source\t%s\n' "$source"
    printf 'ref\t%s\n' "$ref"
    printf 'commit\t%s\n' "$commit"
    printf 'engine-version\t%s\n' "${KIT_VERSION:-unknown}"
    while IFS= read -r keptp; do
      [ -n "$keptp" ] && printf 'kept\t%s\n' "$keptp"
    done <<< "$kept"
    printf '\n'
    while IFS="$(printf '\t')" read -r _src dest; do
      [ -n "$dest" ] || continue
      # A kept item was removed from the staging tree, so it is not in this manifest: the
      # body records what the install actually placed, and hashing a path the kit
      # deliberately never wrote would make `vendored-intact` hunt for a missing file
      # forever.
      [ -f "$stage/$dest" ] || continue
      hash="$(kit_sha256 "$stage/$dest")"
      printf '%s\t%s\n' "$hash" "$dest"
    done < <(kit_vendor_pairs "$eng")
  } > "$stage/$KIT_MANIFEST_REL"
}

# kit_manifest_field <manifest> <key> — a header value, empty when absent.
kit_manifest_field() {
  awk -F'\t' -v k="$2" '$1 == k { print $2; exit }' "$1" 2>/dev/null
}

# kit_manifest_entries <manifest> — the "<hash>\t<path>" body, header and comments stripped.
kit_manifest_entries() {
  awk -F'\t' '
    /^#/ { next }
    NF != 2 { next }
    $1 == "source" || $1 == "ref" || $1 == "commit" || $1 == "engine-version" { next }
    # `kept` is a decision, not a vendored file: verifying or pruning it as one would look
    # for a path the kit deliberately never wrote.
    $1 == "kept" { next }
    { print }
  ' "$1" 2>/dev/null
}

# kit_manifest_diff <project-root> <manifest> — emits "<state>\t<path>" per problem file.
#
# States: `modified` (present, hash differs), `missing` (recorded, absent on disk).
# Prints nothing and returns 0 when the vendored tree matches the manifest exactly.
kit_manifest_diff() {
  local root="$1" man="$2" hash path have
  while IFS="$(printf '\t')" read -r hash path; do
    [ -n "$path" ] || continue
    if [ ! -f "$root/$path" ]; then
      printf 'missing\t%s\n' "$path"
      continue
    fi
    have="$(kit_sha256 "$root/$path")"
    [ "$have" = "$hash" ] || printf 'modified\t%s\n' "$path"
  done < <(kit_manifest_entries "$man")
}

# kit_manifest_kept <manifest> — the paths this project keeps as its own, one per line.
kit_manifest_kept() {
  awk -F'\t' '$1 == "kept" { print $2 }' "$1" 2>/dev/null
}
