#!/usr/bin/env bash
# Reading and writing the project profile (.claude/kit.md).
#
# The profile is markdown because its primary reader is a language model, and a model
# reads a table as well as it reads YAML. The few mechanical readers (this file,
# kit doctor, CI) share the one parser below so there is exactly one format to trust.

# profile_path <project_root>
profile_path() { printf '%s/.claude/kit.md\n' "$1"; }

# profile_get <profile_file> <KEY> — first match wins; empty when absent.
# Table rows look like:  | KEY | value |
profile_get() {
  [ -f "$1" ] || return 0
  awk -F'|' -v key="$2" '
    NF >= 3 {
      k = $2; v = $3
      gsub(/^[ \t]+|[ \t]+$/, "", k)
      gsub(/^[ \t]+|[ \t]+$/, "", v)
      if (k == key) { print v; found = 1; exit }
    }
    END { if (!found) exit 0 }
  ' "$1"
}

# profile_keys <profile_file> — every key defined, one per line.
# Skips separator rows (|---|---|) and header rows.
profile_keys() {
  [ -f "$1" ] || return 0
  awk -F'|' '
    NF >= 3 {
      k = $2
      gsub(/^[ \t]+|[ \t]+$/, "", k)
      if (k ~ /^[A-Z][A-Z0-9_]*$/) print k
    }
  ' "$1"
}

# profile_command <profile_file> <KEY> — resolves a command key to something runnable.
#
# A value is one of:
#   <script>              a key in the project's own runner, invoked as "$RUNNER <script>"
#   raw:<command>         a literal command, for stacks with no script runner
#   none                  deliberately not applicable
#   NEEDS_CONFIGURATION   unresolved; doctor fails on this
#
# Naming the script key rather than the command string is deliberate: the command
# itself stays in the project's runner, so CI and skills invoke the same name and
# cannot drift apart.
profile_command() {
  local file="$1" key="$2" value runner
  value="$(profile_get "$file" "$key")"
  case "$value" in
    ''|none|NEEDS_CONFIGURATION) printf '%s\n' "$value"; return 0 ;;
    raw:*) printf '%s\n' "${value#raw:}"; return 0 ;;
  esac
  runner="$(profile_get "$file" RUNNER)"
  case "$runner" in
    ''|none|NEEDS_CONFIGURATION) printf '%s\n' "$value"; return 0 ;;
  esac
  printf '%s %s\n' "$runner" "$value"
}

# profile_list <profile_file> <KEY> — a comma-separated value, one item per line.
profile_list() {
  profile_get "$1" "$2" | awk -F',' '
    {
      for (i = 1; i <= NF; i++) {
        v = $i
        gsub(/^[ \t]+|[ \t]+$/, "", v)
        gsub(/^`|`$/, "", v)
        if (v != "") print v
      }
    }'
}
