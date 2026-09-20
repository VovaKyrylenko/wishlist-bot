---
name: investigate-codebase
description: Gather facts about unfamiliar code before changing it — where things live, how data flows, what precedents and constraints exist. Invoke before implementing anything non-trivial in code you have not read, or when asked "how does X work here", "where is Y handled".
---

# Investigate before changing

Produce a **Codebase Brief**: facts with citations, no recommendations. The separation is
the point. A judgement smuggled into reconnaissance anchors every later decision before
anyone has argued for it.

## How

Search rather than index. The codebase is its own index: `grep` and `glob` see what is
there now, while an embedding built last week sees what was there last week, and chunking
routinely separates a call from its definition.

For a broad question, run several read-only searches in parallel — they cannot conflict
because nothing is being written. Give each one a different angle rather than the same
question twice: by symbol, by route or entry point, by data model, by test. Then read
only the files the searches actually implicate.

Serialize anything that writes. Parallel writers each resolve the same ambiguity
differently and the results cannot be merged afterwards.

## What the brief contains

```
SCOPE:        the question this brief answers
ENTRY POINTS: where execution reaches this area        (file:line)
DATA FLOW:    what calls what, what is persisted where (file:line)
PRECEDENTS:   existing solutions to the same shape of problem, to copy rather than reinvent
TESTS:        what covers this today, and what does not
CONSTRAINTS:  things that will break if ignored — from the code, and from
              HIGH_RISK_PATHS / SECURITY_SYMBOLS / MONEY_SYMBOLS in .claude/kit.md
UNKNOWNS:     what you could not determine, stated as a question
```

Every claim carries a `file:line`. A claim without one is a guess, and should be listed
under UNKNOWNS instead.

**Precedents deserve real effort.** Re-implementing a utility that already exists three
directories away is one of the characteristic failure modes of agent-written changes, and
it is invisible in review because the new code looks fine on its own.

**Memory is a hypothesis.** If you recall something about this project, check it against
the live code before relying on it, and mark each recalled fact as checked or unchecked.

## Grounded and not

- **Grounded:** every `file:line`, every command output, the list of tests that exist.
- **Judgement:** which parts of the codebase are relevant at all. State the scope you
  chose so a reader can tell you looked in the wrong place.
