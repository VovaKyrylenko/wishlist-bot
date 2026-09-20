---
paths:
  - "**/migrations/**"
  - "**/migrate/**"
  - "**/*.sql"
---

# Schema changes

- **Name migrations by UTC timestamp**, not by sequence number. Sequential numbers collide
  the moment two branches add a migration in parallel, and agent-driven work makes that
  the normal case rather than the rare one.
- **Idempotent.** Re-running a migration must be safe; the runner may retry.
- **Never infer the live schema from the migration files alone.** Read the actual database
  before writing a migration that depends on current state — files record intent, the
  database records reality, and they drift.

## Two-phase by default: expand, then contract

During any deploy there is a moment when old code runs against the new schema, or new
code against the old. The schema must serve both — which is why removal is never part of
the change that adds the replacement.

1. **Expand** — additive only: new tables, new columns that are nullable or defaulted.
   Ships with code that can read both shapes. This release is trivially reversible.
2. **Migrate the data** — backfill, then verify with counts, not with confidence: rows
   written vs rows expected, and a spot-check query recorded in the verification
   artifact.
3. **Contract** — remove the old shape in a **separate, later release**, only after
   nothing has read it in production long enough to trust. Where usage is measurable,
   measure; where it is not, say how long you waited and why that is enough.

## Before anything destructive

A change matching `DESTRUCTIVE_SQL` in `.claude/kit.md` does not merge on the automatic
path. The checklist, in order, every time:

- **Backup first, restore-tested in principle** — a snapshot or dump restored into a
  fresh branch or instance, never over the live database. A backup nobody could restore
  is a ritual, not a backup.
- **A written way back** — the inverse migration or the restore procedure, named in the
  change itself, not improvised during the incident.
- **Staging first** — the same migration, run by the same runner, against staging before
  production. Same mechanism, not a hand-typed approximation of it.
- **A separate release** — destructive steps never ride along inside a feature change;
  when something goes wrong, the diff must contain one suspect.
- **The checklist is the gate, not a waiting human.** When every item above exists in
  the change itself, the merge proceeds — and the hand-off report leads with the
  destructive step, its backup and its way back. An incomplete checklist is what blocks;
  a human's absence is not.
