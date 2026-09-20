---
name: create-pr
description: Push the branch and open a pull request proactively once a unit of work is complete — body from acceptance criteria, watch CI, merge per the profile's strategy when green. Invoke when a branch answers its purpose, or when asked to open or merge a PR.
---

# Ship a branch

Open the pull request **when the branch answers its purpose**, not when someone asks.
A finished branch sitting unpushed is inventory; inventory rots.

Preconditions: the tree is clean, local checks pass, and for changes with a runtime
surface the verification evidence exists (`docs/verification/<branch>.md`).

## Procedure

1. `git push -u origin <branch>` — and push again with every subsequent commit.
2. Open the PR with the forge CLI (`gh` on GitHub). The **title is a conventional
   commit**: with squash it becomes the commit on the default branch and the input to
   release notes, so a sloppy title is a sloppy release line.
3. Body, short: what and why; the acceptance criteria as a checklist, **each carrying
   its auditor verdict** (PASS/FAIL/UNKNOWN — an UNKNOWN ships visible, never rounded
   up); a pointer to the verification evidence; risks knowingly accepted. Not a
   narrative. A criterion present in the route's source — the decision record on
   `full`, the objection log's restated set on `lite` — but absent here carries
   `dropped: <reason>` on its own line, the same discipline the record-to-ADR rule
   already enforces one stage earlier.
4. Watch the checks (`gh pr checks --watch`). Red CI is fixed on the branch — never by
   weakening the check; the anti-gaming guard fails that route anyway.
5. When green, merge per `MERGE_STRATEGY` from `.claude/kit.md` and delete the branch.
6. **Risk keys earn extra care, not extra questions.** When the diff touches
   `HIGH_RISK_PATHS`, `MONEY_SYMBOLS`, `SECURITY_SYMBOLS` or `DESTRUCTIVE_SQL`: the
   mechanical prerequisites from the rules must exist in the change itself — backup,
   written rollback, staging run — the review reads those lines twice, and then the
   merge **proceeds**. The hand-off report leads with what was risky and what protects
   it. The human reviews an outcome with a safety net, not a queue of approvals.

## Grounded and not

- **Grounded:** the push, the checks' status, the merge, the deleted branch — all
  observable forge state.
- **Judgement:** whether the branch truly answers its purpose, and whether a risky merge
  should wait. Say which risk key fired when you hold one back.
