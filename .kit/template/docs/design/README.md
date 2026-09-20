# Design docs

The project's design plan: the decisions that make screens, flows and modules feel like
one product instead of a collection of contributions. One file per surface — `ui.md`,
`backend.md`, `flows/<name>.md` — authored at bootstrap, consulted before any planning
or implementation that touches that surface, and enforced at review.

## What belongs here

**Decisions, not descriptions.** A description of the code goes stale invisibly; a
decision stays true until deliberately superseded. Write the primitive set to build
from, the interaction principles, the module boundaries, the error-handling policy —
and for each, one line of *why*, so the next reader can tell whether the reason still
holds.

## Two rules that keep these files honest

- **Never claim completeness.** "This is the whole set" was written in a real project's
  design guide while its most-used primitive was missing from the list — and nothing
  caught it, because a completeness claim is unverifiable prose. List what is decided;
  say nothing about what is not.
- **A diff that diverges updates the doc in the same change.** `/review-diff` checks
  conformance against these files: every deviation either gets fixed or becomes a doc
  update riding in the same pull request. That is the only mechanism that keeps a design
  doc from becoming documentation that lies — "later" never ships.
