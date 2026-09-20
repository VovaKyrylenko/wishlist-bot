#!/usr/bin/env bash
# The taste catalog: where it lives, how an entry is identified, and what a project may
# record against it.
#
# The catalog is ENGINE content, vendored like every other engine file and never copied
# into the project. A project records only its own answers, deviations and inventions in
# `.claude/tastes.md`. Copying the catalog per project would restate ~80 entries N times
# and drift on the first engine update — the duplicated-policy defect the whole kit was
# built to catch.

KIT_TASTES_REL="kit/tastes/catalog.md"
# shellcheck disable=SC2034  # read by _doctor_tastes in kit/commands/doctor.sh
KIT_PROJECT_TASTES_REL=".claude/tastes.md"

# The product names an `any`-scoped entry may not use. One list, because a check and its
# test drifting apart is how a rule quietly stops meaning what it says — which is the
# defect this whole kit was started to catch, found six times in one repository.
#
# `any` means no stack has been established, so naming a stack's tool there is an
# instruction to a project that cannot follow it. Anywhere else the names are the point:
# a taste catalog without them would say nothing.
KIT_TASTE_PRODUCTS='pnpm|npm |yarn|next\.?js|\bneon\b|drizzle|prisma|vercel|playwright|vitest|jest|cypress|tailwind|shadcn|turborepo|changeset|oxlint|biome|eslint|prettier|postgres|\breact\b|typescript|django|rails|supabase'

# taste_products_in <catalog> <id> — the banned names an entry uses, one per line.
#
# An explicitly marked example is allowed: a general practice sometimes needs one to be
# comprehensible, and forbidding that would push the catalog into vagueness to satisfy a
# grep.
# Finding nothing is the normal, good case, so it must not be an error: under `set -e` a
# grep with no match aborted the caller mid-section, and doctor printed a Tastes heading
# with one check under it and moved on as though the rest had passed.
taste_products_in() {
  taste_entry_body "$1" "$2" \
    | grep -viE 'e\.g\.|for example' \
    | { grep -oiE "$KIT_TASTE_PRODUCTS" || true; } | sort -u
}

# taste_catalog_file <root> — the vendored copy first, the engine checkout's own second.
#
# Vendored first, deliberately: a project pins an engine ref, so the catalog it was
# onboarded against is the one in its own tree. Reading the developer's checkout instead
# would judge a project against entries it has never seen.
taste_catalog_file() {
  local root="$1" c
  for c in "$root/.kit/$KIT_TASTES_REL" "$KIT_HOME/$KIT_TASTES_REL"; do
    [ -f "$c" ] && { printf '%s\n' "$c"; return 0; }
  done
  return 0
}

# taste_entries <catalog> — emits "<id>\t<kind>\t<scope>\t<title>" per entry.
#
# The heading carries all four, so one parse serves every caller and none of them can
# disagree about what an entry is:
#   #### T12 — Drizzle ORM `constant` `db`
taste_entries() {
  [ -f "$1" ] || return 0
  awk '
    /^####[[:space:]]+T[0-9]+[[:space:]]/ {
      line = $0
      match(line, /T[0-9]+/); id = substr(line, RSTART, RLENGTH)
      kind = ""; scope = ""; ki = 0; si = 0
      # split on ` yields alternating outside/inside; inside fields are even indices.
      n = split(line, parts, "`")
      # Scan from the END for the two tag fields, rather than matching every code span on
      # the line. Matching everywhere deleted a legitimate title word: an entry titled
      # "Never rename the `constant` binding" lost `constant` from its title, silently,
      # and the house style of this catalog puts config keys in code spans routinely.
      for (i = n - (n % 2 == 1 ? 1 : 0); i >= 2; i -= 2) {
        if (si == 0 && parts[i] ~ /^(any|node|web|next|db|monorepo|github)$/) { scope = parts[i]; si = i; continue }
        if (si != 0 && ki == 0 && parts[i] ~ /^(constant|conditional|open-question)$/) { kind = parts[i]; ki = i; break }
      }
      # Rebuild the title by dropping only the tag fields. Taking parts[1] alone would
      # truncate every title that itself contains code — and half of them do, since the
      # subject is often a config key. The em-dash separator is stripped by class rather
      # than by a byte range, which is not portable across awk implementations.
      title = ""
      for (i = 1; i <= n; i++) {
        if (i == ki || i == si) continue
        if (i % 2 == 1) { title = title parts[i]; continue }
        title = title "`" parts[i] "`"
      }
      sub(/^####[[:space:]]+T[0-9]+[[:space:]]*/, "", title)
      sub(/^[^[:alnum:]`]+[[:space:]]*/, "", title)
      gsub(/[[:space:]]+/, " ", title)
      sub(/[[:space:]]+$/, "", title)
      printf "%s\t%s\t%s\t%s\n", id, kind, scope, title
    }
  ' "$1"
}

# taste_entry_body <catalog> <id> — the entry's text, heading included, for fingerprinting.
taste_entry_body() {
  [ -f "$1" ] || return 0
  awk -v want="$2" '
    /^####[[:space:]]+T[0-9]+[[:space:]]/ {
      match($0, /T[0-9]+/)
      inentry = (substr($0, RSTART, RLENGTH) == want)
    }
    inentry { print }
  ' "$1"
}

# taste_fingerprint <catalog> <id> — the short hash a deviation records.
#
# Seven hex characters, the same length git uses for an abbreviated object: long enough
# that an accidental collision is not a practical concern for a file of this size, short
# enough that a person will actually copy it into a markdown bullet.
taste_fingerprint() {
  local body; body="$(taste_entry_body "$1" "$2")"
  [ -n "$body" ] || return 0
  # Whitespace-insensitive on purpose: re-wrapping a paragraph is not a change to the
  # taste, and a fingerprint that trips on reflow would cry wolf until nobody re-read it.
  printf '%s' "$body" | tr -s '[:space:]' ' ' | kit_sha256 /dev/stdin | cut -c1-7
}

# taste_project_refs <project-tastes-file> — emits "<id>\t<fingerprint-or-empty>\t<section>".
#
# Section is answers|deviations|inventions, so a caller can hold each to its own rule: a
# deviation needs a fingerprint, an answer does not.
taste_project_refs() {
  [ -f "$1" ] || return 0
  awk '
    /^##[[:space:]]+[Aa]nswers/     { section = "answers";    next }
    /^##[[:space:]]+[Dd]eviations/  { section = "deviations"; next }
    /^##[[:space:]]+[Ii]nventions/  { section = "inventions"; next }
    # Any OTHER second-level heading ends the section. Without this the tracker was
    # sticky in both directions: a bullet under "## Notes" was filed as a deviation and
    # warned about, and a heading typo ("## Deviation") dropped every deviation under it
    # while doctor reported the Tastes section clean — a check passing on the one file it
    # exists to read.
    /^##[[:space:]]/ { section = ""; next }
    /^[[:space:]]*-[[:space:]]+\*\*T[0-9]+\*\*/ {
      # A taste id outside any recognised section is reported as `unfiled`, never skipped.
      # Dropping it silently made a heading typo — "## Deviation" for "## Deviations" —
      # hide every deviation beneath it while doctor printed a clean Tastes section, which
      # is the one failure a checker of this file must not have.
      match($0, /T[0-9]+/); id = substr($0, RSTART, RLENGTH)
      # The placeholder id the template ships with is not a reference to anything.
      if (id == "T00") next
      fp = ""
      if (match($0, /fingerprint:[[:space:]]*[0-9a-f]+/)) {
        fp = substr($0, RSTART, RLENGTH)
        sub(/fingerprint:[[:space:]]*/, "", fp)
      }
      printf "%s\t%s\t%s\n", id, fp, (section == "" ? "unfiled" : section)
    }
  ' "$1"
}
