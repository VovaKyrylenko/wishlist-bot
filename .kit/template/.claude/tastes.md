# Tastes — this project's answers, deviations and inventions

The catalog of default practices lives in the engine, at `.kit/kit/tastes/catalog.md`, and
is **not** copied here. Sixty-odd entries restated per project is the duplicated-policy
defect this kit exists to catch, and it would drift the moment the engine moved.

This file holds only what is specific to this project. Three sections, and each stays short
by design — a long one means the catalog is wrong for this project, which is worth saying
out loud rather than absorbing entry by entry.

**An out-of-scope entry belongs nowhere here.** Scope is an observable fact, not a
judgement: a `next` entry in a Python service is absent, not deviated from.

## Answers

The catalog's in-scope `open-question` entries, answered. The owner's words, not a summary
of them.

- **T00** (asked 2026-01-01) — <the question, one line>
  <the answer, in the owner's own words>

## Deviations

Where this project does something the catalog says otherwise about. A deviation is a
decision with a reason, not an apology — and the reason is what a later reader needs, since
the catalog's own rationale is what the deviation had to defeat.

`fingerprint` is the short hash `kit doctor` prints for that entry as it reads today. It
exists because ids are stable while the text under them is not: an engine update can
rewrite the entry this deviation argues with, and without a fingerprint nothing would ever
notice. Doctor warns on a mismatch — re-read the entry, then either restate the deviation
or drop it.

- **T00** `fingerprint: 0000000` — <what this project does instead>
  **Why the rationale did not hold here:** <the catalog's reasoning, and what defeats it in
  this project specifically>

## Inventions

Something this project does that the catalog has no entry for at all. These are the
candidates for promotion: an approach that proves itself on a third project has earned a
catalog entry, and nothing can notice the repetition unless the first two wrote it down.

Describe the practice and why it was needed here — the same shape a catalog entry takes, so
promoting it is a move rather than a rewrite.

- **<short name>** — <the practice>
  **Why:** <what problem it solves, and what it cost>
