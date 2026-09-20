---
name: write-adr
description: Record an architectural decision in docs/decisions so it is not re-litigated later. Invoke after choosing between real alternatives, after accepting a risk deliberately, or when asked to write an ADR or document a decision.
---

# Write a decision record

An ADR captures **why**, not what. What the system does is already in the code, and a
written description of the code goes stale invisibly. Why a path was taken — and which
paths were rejected, for what reason — stays true even after the code moves, which is what
makes this the one form of project memory that does not rot.

## When

Write one when a choice constrains future work, when an obvious-looking alternative was
rejected for a non-obvious reason, or when a risk was accepted rather than solved.

Do not write one for a change the diff already explains. An ADR per commit is ceremony,
and ceremony trains people to skip the directory entirely.

## How

1. Read `docs/decisions/` — the decision may already exist, in which case you are writing
   a superseding record, not a new one.
2. Take the next number. Copy `0000-template.md`.
3. Fill it in, shortest useful form:
   - **Context** — what forced a decision, including constraints of time, money or taste.
   - **Decision** — stated so a reader can check whether today's code still follows it.
   - **Alternatives considered** — each real option and the specific reason it lost. An
     alternative dismissed without a reason gets proposed again next quarter.
   - **Consequences** — what becomes easy, what becomes hard, what must be revisited if an
     assumption changes. Risks accepted deliberately belong here; an accepted risk that is
     not written down becomes a surprise.
   - **Acceptance criteria**, when the record comes out of a design cycle — each one with
     the `check:` command that fails if it is violated, or a `manual:` line naming the
     action and where its evidence is recorded. A criterion with neither is a wish: the
     auditor cannot rule on it, `kit doctor` reports it, and the decision quietly stops
     being enforced by anything.
4. Never edit an accepted record to reflect a new decision. Write a new one, set
   `Superseded by` on the old and `Supersedes` on the new. The history of what you used to
   believe is the part that teaches.

## Grounded and not

- **Grounded:** the number, the date, the status field, the links between records.
- **Judgement:** all of the content. This is a judgement artifact by design, which is
  exactly why it must record the alternatives — that is what makes the judgement auditable
  later instead of merely asserted.
