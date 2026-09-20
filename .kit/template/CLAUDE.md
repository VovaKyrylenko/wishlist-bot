# Project instructions

Read `.claude/kit.md` before doing repository work. It holds the commands, branch policy,
risk triggers and testing policy for this project. Do not restate its contents here.

## Enforced

These are not advice. A guard blocks them before the tool call runs, and says so.

- Committing on a protected branch.
- Staging or committing a secret file, or a credential in the staged content.
- An AI attribution trailer in a commit message. The author is the human.

Each has a deliberate escape hatch, named in the message it prints; it is recorded in the
transcript. Git hooks in `.githooks/` re-run typecheck, lint and tests for human commits
and pushes. When CI is configured, a pull request that deletes or skips tests, lowers a
coverage threshold, adds `continue-on-error`, or edits workflows without `[ci-change]`
fails the build; without CI, that discipline is yours to keep.

## Commands

Never invent a command. Take it from `.claude/kit.md`, which names the script and lets
this project's own runner resolve it — so CI and this session run the same thing. If a
script is missing, add it to the runner and the profile.

## Ship, don't hoard

Work accumulates on a feature branch, never in the working tree:

- commit each coherent unit with `/commit`, without being asked;
- push with the first commit and every one after it;
- open a pull request with `/create-pr` as soon as the branch answers its purpose;
- anything worth doing but out of scope becomes `/create-issue`, not scope creep;
- decide the obvious yourself; a strategic question arrives at hand-off as a proposal
  with trade-offs, never as a mid-flow blocker.

## Workflow

| Situation | Skill |
|---|---|
| A project that does not exist yet | `/bootstrap-project` |
| Implementing an issue end to end | `/work-issue` |
| Bringing the kit to a project that already exists | `/onboard-project` |
| Understanding unfamiliar code first | `/investigate-codebase` |
| Choosing a library, integration or approach | `/research` |
| Proving a change actually works | `/verify-change` |
| Reviewing a diff before merge | `/review-diff` |
| Shipping a finished branch | `/create-pr` |
| Capturing later work | `/create-issue` |
| Recording a decision worth keeping | `/write-adr` |
| Checking the kit itself | `/kit-doctor` |

## Compact Instructions

Preserve verbatim: the objective and its branch; unresolved blockers and accepted risks;
the exact failing command and its last output; verification evidence; decisions recorded
as ADRs. Discard file listings, passing output, and errors already fixed.
