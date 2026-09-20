---
paths:
  - ".github/workflows/**"
---

# CI workflows

CI is the thing that decides whether a change is allowed to merge, so weakening it is not a
refactor — it is a change to the project's standards. The anti-gaming guard fails the build
when a pull request edits this directory without the flag described in `kit-guards.yml`.

- Do not add `continue-on-error` to make a job stop failing. Fix the job or delete it
  deliberately.
- Do not narrow a trigger (`on:`, `paths:`, `if:`) so that a check stops running on the
  change that made it fail.
- Do not replace a command with a weaker one — a subset of tests, a lint with fewer rules,
  a build without type checking.
- Invoke commands by the script names in `.claude/kit.md`, so CI and local runs execute the
  same thing.
- Pin third-party actions to a commit SHA, not a moving tag.
