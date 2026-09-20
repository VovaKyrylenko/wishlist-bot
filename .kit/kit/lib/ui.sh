#!/usr/bin/env bash
# Output helpers shared by every kit command.
#
# Findings are printed in one fixed shape so that both a human and a model can read
# them, and so that a caller can grep for FAIL without parsing prose:
#
#   PASS  <check>  <detail>
#   WARN  <check>  <detail>
#   FAIL  <check>  <detail>

KIT_FAILURES=0
KIT_WARNINGS=0
KIT_CHECKS=0

kit_color() {
  [ -t 1 ] || return 1
  [ "${NO_COLOR:-}" = "" ] || return 1
  return 0
}

_kit_paint() { # _kit_paint <code> <text>
  if kit_color; then printf '\033[%sm%s\033[0m' "$1" "$2"; else printf '%s' "$2"; fi
}

pass() { KIT_CHECKS=$((KIT_CHECKS + 1)); printf '%s  %-28s %s\n' "$(_kit_paint 32 PASS)" "$1" "${2:-}"; }
warn() { KIT_CHECKS=$((KIT_CHECKS + 1)); KIT_WARNINGS=$((KIT_WARNINGS + 1)); printf '%s  %-28s %s\n' "$(_kit_paint 33 WARN)" "$1" "${2:-}"; }
fail() { KIT_CHECKS=$((KIT_CHECKS + 1)); KIT_FAILURES=$((KIT_FAILURES + 1)); printf '%s  %-28s %s\n' "$(_kit_paint 31 FAIL)" "$1" "${2:-}"; }
info() { printf '      %-28s %s\n' "$1" "${2:-}"; }

die() { printf 'kit: %s\n' "$1" >&2; exit "${2:-1}"; }

heading() { printf '\n%s\n' "$(_kit_paint 1 "$1")"; }

# kit_reset_counters — start a fresh tally.
#
# For a command that runs several sub-commands in one process: the counters are global and
# cumulative, so without a reset between phases the second phase's summary reports the
# first phase's findings as its own.
kit_reset_counters() {
  KIT_CHECKS=0
  KIT_FAILURES=0
  # shellcheck disable=SC2034  # read by warn() above; a caller that only passes and fails
  # still needs it zeroed, or the next summary inherits the previous phase's warnings.
  KIT_WARNINGS=0
}

# kit_summary <label> — prints the tally and returns non-zero when anything failed.
kit_summary() {
  printf '\n%s: %d checks, %d failed, %d warnings\n' \
    "${1:-summary}" "$KIT_CHECKS" "$KIT_FAILURES" "$KIT_WARNINGS"
  [ "$KIT_FAILURES" -eq 0 ]
}

# repo_root [dir] — the git top level, or the directory itself when not a repository.
repo_root() {
  local d="${1:-$PWD}"
  git -C "$d" rev-parse --show-toplevel 2>/dev/null || printf '%s\n' "$d"
}
