---
name: commit
description: Create a conventional commit. Invoke when asked to commit, or proactively once a logically complete unit of work is finished and in a working state. Groups related changes, picks type and scope, never adds AI attribution.
---

# Commit

Format and branch policy come from `.claude/kit.md` (`COMMIT_FORMAT`, `BRANCH_PATTERN`,
`PROTECTED_BRANCHES`). Do not restate them here or in any other file.

```
<type>(<scope>): <short description>
```

Types: `feat`, `fix`, `perf`, `refactor`, `chore`, `docs`, `test`, `style`, `build`, `ci`.
Scope: take an existing one from `git log`; invent a new one only when nothing fits, and
omit it for a genuinely global change.

Description: imperative, lower case, no trailing period, roughly 60 characters or fewer.

## Simplicity

**Subject line only.** A body is for when the *why* is not recoverable from the diff — a
non-obvious constraint, a rejected alternative, a bug that looked like something else. If
the reason is substantial enough to explain at length, it is an ADR, not a commit body.

No emoji. No attribution trailer of any kind — a guard blocks those before git sees them,
and the author of the commit is the human.

## When

Commit proactively, without being asked, when:

- a logically complete unit of work is finished and the tree is in a working state;
- you are about to switch to unrelated work — commit the current thing first;
- you find uncommitted changes worth keeping, yours or left over.

Hold off when the work is half-done, the build is broken, the user asked to review first,
or the diff contains something that should never be committed.

Unrelated changes are not a reason to wait. They are a reason to make several commits.

## Procedure

1. `git status` and `git diff` — understand what is actually there before describing it.
2. Split by concern. One commit is one coherent change; stage with explicit paths.
3. `git add <paths>` — never a blind `git add -A`, which sweeps in whatever else is lying
   around. If a guard blocks the commit, read what it says; it is describing a real rule,
   not an obstacle to route around.
4. `git commit -m "<type>(<scope>): <description>"`.
5. Show `git log --oneline -n <count>`.

## Grounded and not

- **Grounded:** what is staged, what the guards allow, whether the tree builds.
- **Judgement:** where to draw the boundary between commits, and which scope is right.
