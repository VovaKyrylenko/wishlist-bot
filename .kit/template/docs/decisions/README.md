# Decisions

One file per decision that would otherwise be re-litigated. Numbered, dated, immutable.

A decision record is not documentation of how the system works — the code already says that,
and a description of the code goes stale invisibly. It records **why** a choice was made and
what was rejected, which stays true even after the code changes. When a decision stops being
right, write a new record that supersedes it rather than editing the old one; the history of
what you used to believe is the useful part.

Write one when:

- a choice constrains future work (a datastore, an auth model, a deployment target);
- an obvious-looking alternative was rejected for a non-obvious reason;
- a risk was accepted deliberately rather than solved.

Do not write one for a change that the diff already explains.

Copy `0000-template.md`, take the next number, fill it in. Keep it short — the value is in
the alternatives and the consequences, not in the prose.
