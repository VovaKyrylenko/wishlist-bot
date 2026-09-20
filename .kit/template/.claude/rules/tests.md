---
paths:
  - "**/*.test.*"
  - "**/*.spec.*"
  - "**/test_*.py"
  - "**/tests/**"
  - "**/e2e/**"
---

# Working on tests

What deserves which kind of test is decided by `UNIT_REQUIRED_FOR`,
`INTEGRATION_REQUIRED_FOR`, `E2E_REQUIRED_FOR` and `DO_NOT_TEST` in `.claude/kit.md`. Read
them there; they are not repeated here, because two copies of a policy diverge.

This file is about how to change a test once you are in one.

- **Never weaken a test to make it pass.** If the expectation is still correct and the test
  is red, that is a bug in the code. Deleting an assertion, loosening a matcher, adding a
  skip, or widening a tolerance to reach green is the failure mode this rule exists for.
- **A flaky test is not fixed by a retry.** Remove the cause: wait for an observable state
  or a completed response, never for a duration. Retries are legitimate for environment
  setup — a cold database, a starting server — and illegitimate for behavioural assertions.
- **Assert on behaviour, not on structure.** Prefer roles and accessible names over CSS
  selectors, public API over internals, returned values over call counts.
- **A property is stronger than an example** for anything with arithmetic, parsing, or a
  round trip. The same model that wrote the code will happily write an example test that
  encodes the same bug; a property states what must be true regardless of implementation.
- **An assertion about the absence of something must observe where that something would
  appear.** A test that claims "no crash", "no warning" or "no stack trace" and reads only
  stdout passes while the trace prints on stderr — the second live run shipped exactly
  that, and `npm test` printed an unhandled `EPIPE` dump directly above its own `ok`. Name
  the stream, capture it, assert on it. The same rule kills the assertion that accepts two
  outcomes it exists to distinguish (`/status=141|status=0/`): if both branches pass, the
  test is documentation.
- **A guard ships with the fixture that proves it bites.** Write the violation, watch the
  guard reject it, then keep the fixture as a test. A rule nobody has seen fail is a rule
  nobody has tested, and guards fail silently in exactly one direction: the one where they
  permit everything.
- When a test documents a deliberate boundary — something knowingly untested, or a known
  false alarm — say so in the test file, next to the boundary.
