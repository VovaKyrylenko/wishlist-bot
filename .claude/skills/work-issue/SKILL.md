---
name: work-issue
description: Take a task from statement to a verified, committed change — clarify, investigate, design if the risk warrants it, implement, verify at runtime, review, commit. Invoke when asked to work on an issue or implement something concrete. Orchestrates other skills rather than restating them.
---

# Work an issue

This skill decides *what happens next*. The detail lives in the skills it calls, and the
project facts live in `.claude/kit.md`. If you find yourself explaining how to commit or
how to verify here, that belongs in `/commit` or `/verify-change`.

Read `.claude/kit.md` first — every command, branch name and risk trigger below comes
from it.

## 1. Understand the task

Restate it as **acceptance criteria**: 2-5 statements of the form "done when …", each one
independently checkable. Write them yourself from the task and the context; for a task
that has an issue, take them from the issue and mark the ones you invented.

Resolve ambiguity with the **most defensible assumption and keep going** — record it as
`ASSUMED: …` so the hand-off report surfaces every call you made. A question is justified
only when every reading of the task would produce worthless work; that bar is high on
purpose, and it is checked once, here — not rediscovered mid-flow.

## 2. Branch

Branch per `BRANCH_PATTERN`, from an up-to-date `MAIN_BRANCH`. Never work on a protected
branch — a guard will stop you, and being stopped mid-task is worse than starting right.

## 3. Investigate

Run `/investigate-codebase` unless you already know this area first-hand. Cheap, and it is
where reuse blindness gets caught.

When the triage verdict (step 4) names a **Research** domain, launch `/research` on it in
parallel with the investigation — they are independent reads — and hold the adversary
pass until the research brief lands. A design argued from a brief found the
product-level blocker in a live run; one argued from model memory cannot.

**Read the design docs** (`DESIGN_DOCS` in the profile) for every surface the task
touches — they are part of the brief, not optional context. A plan drawn without them
reinvents a primitive the project already standardised, and the review will send it back.

## 4. Design, as much as the route warrants

Run `issue-triage`. Its verdict is a **route** — `none`, `lite` or `full`, plus
research, autonomy and lens knobs (a `trivial` verdict from an older triage reads as
`none`).

**`VERDICT: blocked` stops here** — the triage found the task's premise does not hold.
The repository contradicts what the task describes, so there is nothing to implement and
no route to take: report what was checked, what was found instead, and the readings the
owner could mean. Writing code against a description the code disagrees with is the one
thing worse than asking. `blocked` is deliberately not `none`: a later reader can tell a
copy fix from a task nobody could act on.

**Put the triage's `Owner questions:` to the owner now — all of them, in one message,
before anything argues about the answers.** Each with its readings and the one you would
take absent a reply. This is the cheapest step in the whole skill and the one a live run
skipped at the highest cost: it collected four owner-class questions into an ESCALATION
section *after the arbiter ruled*, a full cycle argued about a shape the owner then
reversed on sight, and most of that argument was spent on a design that no longer existed.

If nobody answers, take your stated readings and continue — do not stall. Record each as
an assumption in the constraints file, and say in the hand-off that they were assumed.

**Then show the thing, if it has a face.** A change with a visible surface gets the
cheapest possible rendering — a screenshot, a staging deploy, a page in a browser — put in
front of the owner **before** the design cycle, not after it. People reverse on seeing,
not on reading: the same live run got its reversal the moment the owner looked at staging,
and every objection raised before that moment about the reversed shape was wasted. A
throwaway render that costs ten minutes is cheaper than a cycle that argues the wrong
thing for an evening. Skip it only when there is nothing to look at.

On `lite` and `full`, first restate step 1's acceptance criteria in `check:`/`manual:`
form — before any adversary sees the plan — then **read `references/design-phase.md` and
follow the route's section**:

- **`none`** — straight to step 5; a design step here is ceremony for a copy fix.
- **`lite`** — the lite route: your plan and criteria, lens passes, one adversary pass,
  the objection log with a route header, terminal states ruled by the fresh-context
  review. Step 3's investigation is lite's scout — it does not run a second one.
- **`full`** — the full cycle: scout → approaches → lens passes → adversary ⇄ advocate
  → arbiter, with the objection log you maintain.

The lens catalog lives in `references/lenses.md`; which lenses exist for this project is
the profile's `LENSES` key, and triage activates per task on both design routes.

**Autonomy**: on `autonomous` (the default), the pre-code report is informational and
work continues without waiting. On `checkpoint`, it blocks for the owner. A checkpoint
condition discovered after triage — an ESCALATION, an owner-class decision, an
irreversible or public action — flips the route to `checkpoint` mid-flight; append the
flip to the log's route block with a date rather than rewriting it.

Two things from that protocol are worth knowing before you open it, because they are what
make the difference between a design phase and a performance of one:

- The exit condition is **not that the critic ran out of objections** — agreement can be
  premature conformity. It is that every blocker and major is `resolved` with a concrete
  mechanism or explicitly `accepted-risk`. If one is still open at `MAX_DESIGN_ROUNDS`,
  the arbiter picks the most defensible candidate anyway, records the disagreement and
  the road back, and work continues — the hand-off report leads with it. A stalled
  process costs more than a reversible call.
- The critic argues **product first**: whether this is worth building at all, measured
  against `PRODUCT_GOALS`, before anything technical.

A design phase that produces no durable artifact produces nothing. Record the outcome with
`/write-adr` when the decision constrains future work.

## 5. Implement

One writer, unless `ALLOW_PARALLEL_WRITES` says otherwise. Up to `PARALLEL_READ_AGENTS`
agents may read, search and review at once; they may not edit the same branch, because each
silently resolves ambiguity its own way and the results will not merge.

Follow the decision from step 4. If the code reveals a fact that breaks it, go back and
revisit it — do not improvise a third thing quietly.

Build within the design docs. Where the right implementation genuinely diverges from
them, **update the doc in the same change** — that is the documented contract, and the
review checks it.

Commit as you go with `/commit`.

## 6. Check

Run, in this order, taking the commands from `.claude/kit.md`:
`TYPECHECK`, `LINT`, `BUILD`, `TEST_UNIT`, and `TEST_E2E` when the change touches a flow
under `E2E_REQUIRED_FOR`. Stop at the first failure and fix it. Never make a check pass by
weakening it.

## 7. Verify

Run `/verify-change`. Static checks say the code is well formed; this says it does what it
was supposed to do. A task is not done until there is evidence, and "the tests pass" is
not evidence.

## 8. Review

**`kit diff-shape` first — it costs one command and the passes below cost an evening.**
It splits the branch's additions into code, tests, docs and configuration and names the
largest files. A live run shipped a pull request of 62,920 lines: 854 of code, 742 of
tests, and 41,391 of an unrelated documentation directory that was sitting untracked when
somebody ran `git add -A`. Thirty-nine objections, four adversary lens passes and a
dedicated review pass all missed it, because each was reading the diff through the
question it had been asked. Nobody asked the cheapest question there is.

It fails on a shape, not on a judgement — non-code dwarfing code by more than tenfold —
so read the largest additions it prints and answer one question per file: does this belong
to **this** change? A deliberate documentation drop passes with a raised
`KIT_DIFF_SHAPE_RATIO`; a passenger gets removed from the branch.

Run `/review-diff` in a fresh context.

**Then the review pass — on every route that produced an objection log, `lite` and
`full` alike.** Run `design-adversary` in its **review-pass mode**, in fresh context,
handed the constraints, the *full* log and the committed diff. This is not optional and
not a lite-route speciality: across this kit's live runs it caught the orchestrator's own
work about half the times it ran, including a verification artifact whose scope claim was
false, an objection whose HISTORY said a change had landed when the edit had matched
nothing, and a commit that silently reverted a guard. Every one of those reads correct to
the party that wrote it, which is exactly why the party that wrote it cannot be the one
who checks.

On `full`, the review pass does not replace the delta pass — the delta pass rules terminal
states during the cycle, the review pass audits whether what was ruled `verified` is what
actually shipped. The two answer different questions and the second is the only one asked
against the diff.

**On a risk-key hit, run two — with different angles, never two copies.** A second
reviewer given the same brief as the first mostly agrees with it; a panel of copies
underperforms its best member. So:

- **Ledger** — the log against the diff. Every mechanism ruled `verified`: is it in the
  diff, and does the evidence cited for it exist and still say what was claimed? This one
  reads the log first.
- **Fresh eyes** — the diff on its own terms, through the risk key's own concern,
  *without* reading the log first. Its value is that it is not anchored by the framing
  the cycle already agreed on; hand it the log only after it has reported, to fold its
  findings in.

Fix what they find, then re-run steps 6 and 7 for anything you changed. Cap at
`MAX_REVIEW_ROUNDS` cycles. Everything sound ships; a
genuine correctness blocker that survives the cap is the one thing that holds its piece
back — and it arrives at hand-off as a described problem **with a proposed fix**, never
as an open question in the middle of the flow.

## 9. Audit, then hand off

**The audit.** On `lite` and `full`, run `acceptance-auditor` — one invocation per
criterion, handing each criterion **verbatim in the prompt** from the route's source
(lite: the set restated at step 4 in the objection log; full: the decision record). The
agent never searches for its input. On `none` the audit is skipped, and the report says
so — the step-1 criteria still appear there with plain status.

Rules that keep the audit honest:

- When several criteria name the same `check:` command, capture one transcript of that
  command in this step and hand it to each invocation — judgement stays per-criterion,
  the command does not re-run per criterion.
- **You append the auditor's blocks** — each quoted with its `CRITERION:` line — and the
  summary line to `docs/verification/<branch>.md`. An unrecorded audit did not happen,
  and the appender is you, not a passive voice.
- A **FAIL** loops back to steps 5–8 — and the loop-back **re-runs the audit over all
  criteria**, because the fix may regress what already passed; the new block names the
  summary it supersedes. A second FAIL on the same criterion does not loop again: it
  ships as an honest partial with the FAIL stated. An **UNKNOWN** ships as UNKNOWN —
  visible, never rounded up.

**The report**: what changed, each criterion **with its auditor verdict**, the
verification evidence, risks accepted, and anything you deliberately left undone. If a
criterion is unmet, say so plainly — a completion report that overstates is worse than an
honest partial one, because it removes the human's chance to catch it.

## Grounded and not

- **Grounded:** the checks, the verification evidence, the review reproductions.
- **Judgement:** whether the design phase was warranted, where the change boundary sits,
  and whether an accepted risk is acceptable. These are the places to think, and to say
  out loud what you decided.
