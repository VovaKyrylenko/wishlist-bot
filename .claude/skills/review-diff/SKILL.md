---
name: review-diff
description: Review a diff adversarially before merging — correctness, reuse, risk, and the specific ways agent-written changes fail. Invoke before opening or merging a pull request, or when asked to review changes.
---

# Review a diff

Review in a **fresh context**. If you wrote the code, you already believe it works, and
you will read the diff looking for confirmation. Start a new session, or hand this to a
subagent that has not seen the implementation conversation. Where the harness allows it,
use a different model family than the one that wrote the code — a model reviewing itself
prefers its own output.

**One adversary, not a panel.** Self-organising teams of reviewers underperform their own
best member — measured losses reach 41% — because their outputs get averaged. Diversity
must come from a different vantage point, not from more instances of the same one. If you
want more than one pass, give each a distinct angle rather than a copy of the brief.

**It has to run things.** Critique without an external signal degrades results; the judge
that reliably works is the one that executes something. Check out the branch, run the
commands from `.claude/kit.md`, reproduce the finding. A finding with no reproduction is
demoted to a note, not reported as a defect.

## What to look for, in order

1. **CI gaming.** Does the diff delete a test, add a skip or `.only`, lower a threshold,
   add `continue-on-error`, or narrow a CI trigger? Reaching green by weakening the gate
   is the highest-severity finding available, and it is invisible if you only read the
   application code. The CI guard checks this mechanically; you check what it cannot.
2. **Hallucinated correctness.** Off-by-one, an unhandled boundary, a permission check
   that is missing rather than wrong. These pass tests, because the tests came from the
   same understanding.
3. **Reuse blindness.** Was something re-implemented that already exists? Search before
   accepting a new helper, a new formatter, a new date routine.
4. **Risk triggers.** Anything matching `HIGH_RISK_PATHS`, `MONEY_SYMBOLS`,
   `SECURITY_SYMBOLS` or `DESTRUCTIVE_SQL` from `.claude/kit.md` gets read line by line,
   not skimmed. For money specifically: amounts stay in **minor units** end to end and
   render through the project's **single** formatting function — ad-hoc formatting and
   mixed units are rounding and hydration bugs on a delay timer.
5. **Scope.** An oversized unfocused diff correlates with the author losing the plot.
   Say so; it is a finding about the change, not about the person.
6. **New surfaces are watched surfaces.** A new route, screen or endpoint gets registered
   in the project's monitoring or healthcheck **in this same change**, not as a follow-up.
   A surface nobody watches fails silently, and "later" never ships.
7. **Design conformance.** Read the docs under `DESIGN_DOCS` for every surface the diff
   touches, then hold the diff against them: a new primitive where a documented one
   exists, an interaction pattern the ui doc rejects, a module boundary the backend doc
   draws elsewhere. A deviation is a `major` finding **quoting the doc line it breaks** —
   unless the diff updates that doc in the same change, which is the legitimate way to
   diverge. Code and doc leaving the review in disagreement is the one outcome this stage
   exists to prevent.

## Reporting

Every finding:

```
CLAIM:      one sentence, what is wrong
EVIDENCE:   file:line, plus the command that reproduces it
SCENARIO:   concrete input or state -> wrong output or failure
SEVERITY:   blocker | major | minor | note
RESOLUTION: what would close it
```

Precision is the scarce resource, not volume. A review that reports twenty findings of
which six are real is worse than one that reports six, because the reader stops trusting
the list. Demote anything you could not reproduce.

Do not emit a numeric quality score. Frontier models scoring the same code against the
same rubric agree at roughly chance level; a 1-5 score is noise wearing a number's
clothes. Binary judgements against a stated criterion, each with evidence, are reliable.

## Grounded and not

- **Grounded:** reproductions, command output, whether the branch builds and passes.
- **Judgement:** severity, and whether the scope is too large. Both are arguable, so
  state the reason rather than the verdict alone.
