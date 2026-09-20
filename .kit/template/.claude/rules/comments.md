---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
  - "**/*.py"
  - "**/*.go"
  - "**/*.rs"
  - "**/*.rb"
  - "**/*.java"
  - "**/*.sh"
  - "**/*.sql"
---

# Comments

Code carries comments — and they earn their lines or they go.

- **Always English**, plain and readable. The codebase has one language regardless of
  what language the chat happens in.
- **Explain why, never the obvious what.** `// increment counter` above `count++` is
  noise that trains readers to skip comments. The comment worth writing says what the
  code cannot: the constraint that forced this shape, the alternative that was rejected,
  the bug this line prevents, the invariant the next editor must not break.
- A workaround always says what it works around and when it can be removed.
- If the comment is needed to make the code comprehensible at all, first try renaming
  and extracting until it is not — then keep the comment for what remains.
- Delete comments the code has outgrown. A stale comment is worse than none: it is
  documentation that lies.
