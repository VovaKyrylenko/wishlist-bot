---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.vue"
  - "**/*.svelte"
---

# Frontend conventions

**Before a new screen, component or flow: read `docs/design/ui.md`.** Reusing a
documented primitive beats inventing a sibling, and the review checks conformance.

- **Files are kebab-case**: `user-card.tsx`, `use-cart-total.ts`. One component per file,
  named after it. Consistency here is what makes `grep` and imports predictable.
- **Extract logic out of components.** Anything that computes — pricing, validation,
  formatting, date math — lives as a plain function in its own file, imported by the
  component. Plain functions are tested without rendering anything; components then only
  need tests for wiring and states.
- **Every user-facing state exists**: loading, empty, error, and the happy path. A
  component that only renders success is half-finished, and the missing half is the one
  users meet at the worst time.
- **The server does the heavy lifting when there is a server.** Data shaping, filtering,
  totals — done where the data lives; the client renders. Client-side recomputation of
  server truths is a source of drift.
- Prefer the platform: semantic elements, real buttons and labels, keyboard reachability.
  Accessibility retrofitted later costs triple.
- **The smallest interaction that answers one question.** A row that opens a sheet asking
  exactly one thing beats a form with explanatory paragraphs; UI text that explains the
  UI is a design smell — redesign the interaction instead of captioning it.
- **Layout constants come from one place.** One container width, gutters from a single
  component or token — never re-declared per page. Two sources of layout truth drift
  within a week.
