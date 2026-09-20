---
name: verify-change
description: Prove a change actually works by running it and observing the result. Invoke after implementing anything with a runtime surface, before committing, or when asked to "check it works", "verify", "does this actually run". Not for diffs that only touch documentation or tests.
---

# Verify a change

Verification is **runtime observation**. You drive the software to the point where the
changed code executes and you record what you saw. Anything else is a claim.

The failure mode this exists to prevent is the model reporting success it never observed.
Controlled measurement puts this skill among the highest-impact things available; a
green test suite does not substitute for it, because the same model that wrote the code
usually wrote the test, and the test then encodes the bug as its expected value.

## Not verification

State plainly that these are insufficient, and do not report them as evidence:

- tests passing, including tests you just wrote;
- a clean type check, lint, or build;
- importing the changed function and calling it — that is a unit test you wrote just now;
- reading the diff and reasoning that it must work.

They are worth running. They are not proof. Run them first anyway, because there is no
point driving the app to observe a failure the compiler already knew about.

## Procedure

**1. Find the change.** `git diff` against the base branch is the ground truth, not the
issue text and not your memory of what you did. List the changed behaviours.

**2. Find the surface.** Where does a *user* meet this change — a CLI invocation, an HTTP
route, a screen, a queue message, a library entry point? If a change has no reachable
surface, say so and stop; that is a legitimate SKIP.

**3. Get a handle.** Start the thing. Take the command from `<DEV>` in `.claude/kit.md`;
never invent one. If starting it needs setup, record the setup, because next time it is
the expensive part. If the project already has a way to drive itself, reuse it.

**4. Drive it.** Take the shortest path that makes the changed code actually execute.
Prefer the accessibility tree or a text interface over screenshots — a screenshot through
a browser tool has been measured at over 200,000 tokens, which is more than the entire
context window, and it usually answers a question the text already answered. Capture to
disk and pull in an image only for a genuinely visual question.

**5. Push on it.** The happy path is the least informative run. Try the invalid input, the
missing permission, the empty result, the second submission, the value at the boundary.
For anything under `<MONEY_SYMBOLS>` or `<SECURITY_SYMBOLS>` in the profile, an error path
that has not been exercised is not verified.

**6. Capture.** Record the command, the observable output, and the verdict. Evidence is a
transcript, not an adjective.

## Where the evidence goes

Write it to `docs/verification/<branch>.md`, appending a block per verification run. A
report that lives only in a chat transcript disappears at the end of the session, which
means the next person — including you tomorrow — has no way to tell whether a change was
ever actually observed working. `kit doctor` notices when source has changed on a branch
and no artifact exists for it.

Keep it short. It is a record of what was observed, not a narrative.

## Report

```
VERDICT: PASS | FAIL | BLOCKED | SKIP
CLAIM:   what the change was supposed to do
METHOD:  how it was driven
STEPS:
  1. <command or action>
     -> <what was observed>
EVIDENCE: <output, response body, log line, path to a capture>
FINDINGS: anything surprising, including things outside the change
```

`BLOCKED` is an honest outcome — the environment would not start, credentials are missing,
the surface needs a device you do not have. Report it as BLOCKED rather than inferring PASS.

## Grounded and not

- **Grounded:** the commands run, their output, the verdict, and the reproduction steps.
  Another person can re-run them and get the same result.
- **Judgement:** whether the surface you chose is the one that matters, and whether the
  edge cases you picked are the risky ones. Say which you chose and why, so the judgement
  is reviewable rather than invisible.
