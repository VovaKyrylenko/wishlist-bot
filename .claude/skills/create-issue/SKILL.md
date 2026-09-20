---
name: create-issue
description: Capture an idea, bug or out-of-scope finding as a well-formed issue instead of losing it or absorbing it into the current change. Invoke proactively when something worth doing later surfaces mid-work, or when asked to file an issue.
---

# File an issue

An issue exists so that later work needs **no clarifying conversation**: one issue = one
pull request = one line in a release note. If it cannot be described in one sentence at
that altitude, it is the wrong size.

## Size gate first

- **Too small** — a one-line fix, a copy change: just do it (on a branch). An issue here
  is ceremony.
- **Too big** — "redo the admin", "add payments": an epic with a checklist of child
  issues, each child passing this same gate.
- **Right size** — one shippable change, one sentence.

## When to file proactively

Mid-task discoveries that are real but out of scope: a TODO that turned out true, dead
code, a missing test noticed in passing, a risk observed but not addressed. Filing it is
the alternative to the two failure modes: silently widening the current change, or
silently forgetting.

## Shape

Title: the action, no bureaucratic prefixes ("Add CSV export for scores", not "We should
maybe consider…"). Label: `bug` or `enhancement`; `epic` for parents.

Body, three sections:

```
## Description
What and why — enough that a cold reader can start.

## Acceptance criteria
- [ ] 2-5 independently checkable "done when …" statements. Mandatory:
      without them the issue is a wish, not work.

## Context
file:line pointers, decisions already made, constraints.
```

Do not pre-assess risk here — that is judged against the actual diff when the work
happens, not against a guess at filing time.

## Grounded and not

- **Grounded:** the issue exists, has a label, and its criteria are checkable.
- **Judgement:** the size call, and whether a passing observation deserves an issue at
  all. When unsure, file it — a closed unnecessary issue costs one click; a forgotten
  real one costs a production incident.
