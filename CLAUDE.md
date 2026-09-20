# Project instructions

Read `.claude/kit.md` before doing repository work: commands, branch policy, risk triggers,
testing policy. Architecture is in `README.md`. Do not restate either here.

## Product voice

This is a Telegram bot for gift lists and its whole value is that anyone can use it. Every
string a user sees follows `.claude/rules/voice.md` (loaded when you touch `src/`, `api/`
or `docs/`): a banned-word vocabulary, one friendly tone, purple 💜 🟣 ✨ accents.

- One test for any new term: **would a grandmother understand it?** If not, replace it.
- All copy lives in `src/text.ts`; `src/features/*` holds no text literals.
- Success, error and undo are the `notice` line of the live screen, never a separate message.
- No jokes and no 💜 in errors and confirmations. Names appear only in the nominative case.

## Enforced

A guard blocks these before the tool call runs and says so.

- Committing on a protected branch (`main`); work on `type/short-description`.
- Staging a secret file or credential.
- An AI attribution trailer in a commit message: the author is the human.

Each has a deliberate escape hatch named in the message it prints. Hooks in `.githooks/`
re-run typecheck and lint on commit and push. In CI, deleting or skipping tests, lowering
a coverage threshold, `continue-on-error`, or editing workflows without `[ci-change]` fails.

## Commands

Never invent a command. Take it from `.claude/kit.md`, which names the script and lets the
runner resolve it, so CI and this session run the same thing.

## Ship, don't hoard

Work accumulates on a feature branch, never in the working tree: commit each coherent
unit with `/commit`, push with the first commit, open a PR with `/create-pr` when the
branch answers its purpose, and file out-of-scope ideas with `/create-issue`. Decide the
obvious yourself; a strategic question arrives at hand-off as a proposal with trade-offs.

## Workflow

`/work-issue` implements a task end to end · `/investigate-codebase` before touching
unfamiliar code · `/research` before adopting a dependency · `/verify-change` proves it
runs (`pnpm run verify:flows` drives the bot with synthetic updates against a staging
database) · `/review-diff` before merge · `/write-adr` for decisions · `/kit-doctor` when
the setup misbehaves.

## Compact Instructions

Preserve verbatim: the objective and its branch; unresolved blockers and accepted risks;
the exact failing command and its last output; verification evidence; decisions recorded
as ADRs. Discard file listings, passing output, and errors already fixed.
