#!/usr/bin/env bash
# Blocks secrets from entering a commit.
#
# Three checks, because they catch three different mistakes:
#   git add <path>  — the explicit mistake, caught before anything is staged
#   git commit      — the blind mistake (`git add -A` swept something in), caught by
#                     inspecting what is actually staged
#   staged content  — the common mistake: a live key pasted into an ordinary source
#                     file, because the agent had it in context from an .env it read
#
# The third exists because a filename-only guard called "guard-secrets" promises more
# than it delivers: the most frequent real leak in agent-written code is not a file
# named .env, it is a key inside config.ts.

set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

kit_read_input
kit_escape_hatch KIT_ALLOW_SECRETS && exit 0

# Resolve the target repository against whichever subcommand is actually being guarded,
# so `git -C elsewhere status && git commit` is judged on the commit, not the status.
# Read by kit_target_repo in lib.sh, which this script sources.
# shellcheck disable=SC2034
if kit_is_git_subcommand commit; then KIT_GUARDED_SUBCOMMAND=commit; else KIT_GUARDED_SUBCOMMAND=add; fi
REPO="$(kit_target_repo)"

# The built-in list always applies. SECRET_PATHS from the project profile is added to
# it, never substituted for it.
#
# Union rather than replace, because the profile is an ordinary file: `Edit`ing it is not
# a Bash tool call, so no guard sees the change. If the profile could narrow the policy,
# one table row would be a silent, permanent kill switch — and the comment claiming that
# editing it is "a deliberate, reviewable act" would be the only thing standing in the
# way. A project may widen what counts as a secret; it may not quietly stop counting.
KIT_SECRET_PATTERNS='.env .env.* *.env .envrc env.local *.pem *.key *.p12 *.pfx *.jks *.keystore *.p8 *.der *.ppk
  id_rsa id_dsa id_ecdsa id_ed25519 *.asc secring.gpg
  credentials credentials.json secrets.json service-account*.json client_secret*.json gcloud-key*.json
  .npmrc .pypirc .netrc .pgpass .htpasswd .git-credentials .dockercfg
  *.tfvars *.tfvars.json *.tfstate kubeconfig *.kubeconfig secrets.yaml secrets.yml vault.token'
KIT_SECRET_PATTERNS="$KIT_SECRET_PATTERNS $(kit_profile_list SECRET_PATHS | awk '{ printf "%s ", $0 }')"

# `.env.example` and friends are explicitly allowed — they document the shape of the
# secrets rather than carrying them.
# True when this one command both stages and commits, so the index is not yet the truth.
kit_stages_in_place() {
  kit_is_git_subcommand add && return 0
  printf '%s' "$(kit_command_skeleton)" | grep -Eq 'commit[^|;&]*([[:space:]]-a[[:space:]]|[[:space:]]-a$|--all|[[:space:]]-am[[:space:]])'
}

is_secret_path() {
  local path="$1" base pattern rc=1
  base="${path##*/}"   # not basename: one fork per path made large adds slow
  case "$base" in
    *.example|*.sample|*.template|*.dist) return 1 ;;
  esac
  # `set -f` is load-bearing, not tidiness. Unquoted word splitting also performs
  # PATHNAME expansion, so any pattern that happened to match a file in the hook
  # process's own working directory was replaced by that filename — the wildcard
  # vanished, and the guard quietly stopped recognising the whole class. It degraded
  # precisely in repositories that contain secrets.
  set -f
  for pattern in $KIT_SECRET_PATTERNS; do
    # The pattern is meant to glob against the basename, so it must stay unquoted.
    # shellcheck disable=SC2254
    case "$base" in
      $pattern) rc=0; break ;;
    esac
  done
  set +f
  return $rc
}

# 1. Explicit paths on a `git add`.
if kit_is_git_subcommand add; then
  while IFS= read -r word; do
    [ -n "$word" ] || continue
    case "$word" in
      -*|git|add) continue ;;
    esac
    if is_secret_path "$word"; then
      kit_deny \
        "'$word' looks like a secret file and must never be committed." \
        "If it genuinely carries no secret, rename it to *.example. Bypass: KIT_ALLOW_SECRETS=1"
    fi
  done <<< "$(kit_command_words)"
fi

# 2 and 3. What is actually staged, by name and by content.
if kit_is_git_subcommand commit; then
  case "$(kit_command_skeleton)" in
    *--dry-run*) exit 0 ;;
  esac

  # Not a repository at all: there is nothing to guard, so allow. But if it IS a
  # repository and reading the index fails, deny — an error must not read as "clean".
  git -C "$REPO" rev-parse --git-dir >/dev/null 2>&1 || exit 0

  if ! staged="$(git -C "$REPO" diff --cached --name-only 2>/dev/null)"; then
    kit_deny \
      "could not read the staged changes in '$REPO', so nothing was checked for secrets." \
      "This is a fault in the environment, not in your change. Bypass once with KIT_ALLOW_SECRETS=1."
  fi
  # `git add -A && git commit -m x` is the single most common idiom an agent emits, and it
  # defeated this guard completely: PreToolUse runs BEFORE the command, so at hook time
  # nothing is staged and the index check inspected an empty set. When the same command
  # stages and commits, look at what WOULD be staged.
  if kit_stages_in_place; then
    staged="$staged
$(git -C "$REPO" -c core.quotePath=false status --porcelain -uall 2>/dev/null | sed -E 's/^.{3}//; s/^.* -> //; s/^"//; s/"$//' || true)"
  fi

  while IFS= read -r path; do
    [ -n "$path" ] || continue
    if is_secret_path "$path"; then
      kit_deny \
        "'$path' would be included in this commit and looks like a secret file." \
        "Add it to .gitignore, or unstage it if it is already staged. Bypass: KIT_ALLOW_SECRETS=1"
    fi
  done <<< "$staged"

  # Content: only shapes that are unambiguous on sight. A noisy content scan gets the
  # whole guard switched off, so entropy heuristics and generic "password=" are out.
  # `-e` is required, not cosmetic: the first alternative starts with `-----`, so without
  # it grep reads the pattern as options, errors, and the guard silently ALLOWS. A guard
  # that fails open is worse than no guard, because it is trusted.
  secret_shapes='-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-ant-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{35}'
  # A line carrying `kit:allow-secret` is exempt. Test fixtures, documentation and this
  # guard's own test suite legitimately contain credential-shaped strings, and without a
  # per-line exemption the only way past is the whole-command bypass — which would train
  # people to reach for it routinely, and that is how a guard stops meaning anything.
  # Content of everything that will be in the commit — the index, plus the working tree
  # when the same command stages it. Files whose NAME says "this documents the shape of a
  # secret" are exempt here as well as in the name check: AKIAIOSFODNN7EXAMPLE is AWS's
  # own published placeholder, and blocking a .env.example that contains it is the kind of
  # false positive that gets a guard switched off.
  hitfile="$(mktemp)"
  set +e
  {
    git -C "$REPO" diff --cached -U0 2>/dev/null | grep -E '^\+'
    if kit_stages_in_place; then
      git -C "$REPO" -c core.quotePath=false status --porcelain -uall 2>/dev/null | sed -E 's/^.{3}//; s/^.* -> //; s/^"//; s/"$//' \
        | while IFS= read -r f; do
            [ -n "$f" ] || continue
            case "$(basename -- "$f")" in *.example|*.sample|*.template|*.dist) continue ;; esac
            [ -f "$REPO/$f" ] || continue
            [ "$(wc -c < "$REPO/$f" 2>/dev/null || echo 0)" -lt 1000000 ] || continue
            grep -Iq . "$REPO/$f" 2>/dev/null && cat "$REPO/$f" 2>/dev/null
          done
    fi
  # Named placeholders only, not any line containing the word "example" — that broader
  # filter would hide a real key on a line that happened to say "example".
  } | grep -v 'kit:allow-secret' \
    | grep -viE 'AKIAIOSFODNN7EXAMPLE|ASIAIOSFODNN7EXAMPLE|wJalrXUtnFEMI/K7MDENG|AIzaSyExample|ghp_1234567890' \
    | grep -Eom1 -e "$secret_shapes" > "$hitfile" 2>/dev/null
  grep_status=$?
  hit="$(cat "$hitfile" 2>/dev/null)"
  rm -f "$hitfile"
  set -e
  if [ "$grep_status" -ge 2 ]; then
    kit_deny \
      "the secret content scan could not run (grep exited $grep_status), so nothing was checked." \
      "This is a fault in the guard, not in your change. Bypass once with KIT_ALLOW_SECRETS=1 and report it."
  fi
  if [ -n "$hit" ]; then
    kit_deny \
      "a credential appears in the staged changes (matched a ${hit:0:8}… pattern)." \
      "Remove it, rotate the key — it is compromised the moment it is written down — and read it from the environment instead. Bypass: KIT_ALLOW_SECRETS=1"
  fi
fi

exit 0
