#!/usr/bin/env bash
# Blocks AI attribution trailers in commit messages.
#
# Scope note: this can only inspect a message passed on the command line (-m/--message).
# A message written in an editor or supplied with -F is invisible here. That is an
# accepted limitation — agents pass -m, which is the case that matters.

set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

kit_read_input

kit_is_git_subcommand commit || exit 0
kit_escape_hatch KIT_ALLOW_AI_ATTRIBUTION && exit 0

# The rule is "no AI attribution", not "no co-authorship". Replaying 200 real commits
# through an earlier version of this guard (`kit eval guards`) showed it blocking three
# commits that credited a human co-author — a false positive that would have got the
# whole guard switched off. So an attribution line only counts when the party credited
# is a machine.
# `\bai\b` was here and had to go: "explain co-authored-by trailers for AI tools" is an
# ordinary commit message, and a guard that blocks it gets uninstalled the same day.
ai='(claude|anthropic|copilot|chatgpt|openai|gpt-[0-9]|codex|cursor|devin|windsurf|gemini|\bllm\b)'

# 1. An attribution trailer naming a model or vendor.
if printf '%s' "$KIT_CMD" | grep -Eiq "(co-authored-by|co-created with|generated with|authored by)[^\"']*${ai}"; then
  kit_deny \
    "the commit message credits an AI as author or co-author — the author is the human." \
    "Remove that line and commit again. Deliberate bypass: prefix with KIT_ALLOW_AI_ATTRIBUTION=1"
fi

# 2. Markers that are unambiguous on their own.
#
# Deliberately NOT matched: the bare words "claude" or "anthropic" outside an attribution
# line, and a bare robot emoji. They appear in legitimate subjects ("feat(ai): switch
# anthropic model", "fix(ui): 🤖 emoji picker category"); the emoji only counts as
# attribution when it sits next to a generated-by phrase, which is the shape tools emit.
if printf '%s' "$KIT_CMD" | grep -Eiq 'noreply@anthropic\.com|🤖[[:space:]]*(generated|co-authored|created)|(generated|co-authored|created)[^\n]*🤖'; then
  kit_deny \
    "the commit message carries an AI attribution marker." \
    "Remove it and commit again. Deliberate bypass: prefix with KIT_ALLOW_AI_ATTRIBUTION=1"
fi

exit 0
