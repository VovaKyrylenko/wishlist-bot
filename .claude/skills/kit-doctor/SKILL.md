---
name: kit-doctor
description: Check that this project's kit setup is internally consistent — profile keys resolve, no duplicated policy, no dead skill references, context budget respected. Invoke when something in the workflow behaves oddly, after editing .claude/kit.md, or when asked to check the kit.
---

# Check the kit

Run `kit doctor`. It is mechanical: every finding names a file and a condition, and exits
non-zero if anything failed. `kit doctor --fix` repairs what can be repaired without a
decision, and refuses the rest.

This exists because every kit accumulates dead references and duplicated policy. The
surveyed frameworks all build the read and write paths and skip the loop that keeps them
honest — which is why they rot into a collection of broken links that still *look*
authoritative.

## Reading the findings

- **no-unresolved-values** — `NEEDS_CONFIGURATION` is still in the profile. Decide the
  value or set it to `none`. This is a failure rather than a warning on purpose: an
  unfinished profile silently degrades every skill that reads it.
- **command keys** — a script named in the profile does not exist in the project's runner.
  Either the script was renamed, or the profile guessed wrong at `kit init` time.
- **duplicated-policy** — a risk list from `.claude/kit.md` has been restated somewhere
  else. Two copies will diverge; delete the copy and reference the profile.
- **profile-reference** — a skill uses `<KEY>` that the profile does not define.
- **skill-reference** — a `/skill` is mentioned that does not exist. This is the exact
  defect that leaves a workflow pointing at something deleted months ago.
- **claude-md-size** — over budget. Long instruction files measurably reduce adherence,
  and the rules at the bottom go first. Move detail into a skill or a path-scoped rule;
  both load only when relevant.
- **unused-engine-items** — a skill has not been explicitly invoked within the window.
  Treat it as a prompt to delete. The model gets more capable, and a customisation that
  earned its place a year ago may now be doing nothing but occupying context. Note this
  only sees invocations you typed yourself, so it under-counts.

## After fixing

Re-run until clean. If a finding is wrong, that is a defect in the check — fix the check
rather than adding an exception, or the exceptions become the thing nobody trusts.

## Grounded and not

- **Grounded:** every finding. Each one names a file and a condition a program checked,
  and the command exits non-zero when any of them failed.
- **Judgement:** what to do about a finding — which unused skill to actually delete, what
  to cut from an oversized `CLAUDE.md`, whether a duplicated policy should move or go.
  `--fix` deliberately refuses these and says so rather than guessing.
