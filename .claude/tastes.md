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

> Proxy answers (2026-09-20): no owner was available during onboarding, so these are read
> from the code, not the owner's words. Confirm or replace them.

- **T40** (asked 2026-09-20) — Which paths touch money, auth, or data mutation directly enough to need a high, enforced coverage floor?
  Proxy answer. Money: none — prices are scraped display text and are never summed or charged. Auth: `src/lib/access.ts` (who may see or edit a list), `api/webhook.ts` (WEBHOOK_SECRET check), `src/lib/deeplink.ts` (share links). Data mutation: `src/features/promises.ts` (promise / release / bought) and `src/features/lists.ts` (co-authors, completion, deletion).

## Deviations

- **T12** `fingerprint: 6760d10` — Prisma 7 with the Neon driver adapter instead of Drizzle.
  **Why the rationale did not hold here:** the entry argues Drizzle avoids "a codegen step to forget across a pnpm monorepo". This is a flat single-app repo, and `prisma generate` already runs in `postinstall` and `vercel-build`, so nothing can be forgotten. T16 names Prisma 7 a close runner-up, and a rewrite of a working data layer buys no user-visible value.

- **T18** `fingerprint: 64ee6a6` — no Zod; input is parsed by hand (`src/lib/price.ts`, `src/lib/scrape.ts`, callback data in `src/lib/keyboards.ts`).
  **Why the rationale did not hold here:** the entry's purpose is one runtime schema shared by client and server. A Telegram bot has no client code to share a validator with, and its inputs are chat text and scraped HTML, where a lenient parser is required (constraint C4: input is always valid). Environment variables are the one place a schema would pay off; that stays open as a small issue, not a deviation.

- **T19** `fingerprint: 8fa5bde` — no shared schema module, for the same reason as T18.
  **Why the rationale did not hold here:** its own Why says "the client needs to run the validator"; there is no client.

- **T78** `fingerprint: 3487ee2` — `priceAmount` is a `Float` in `prisma/schema.prisma`.
  **Why the rationale did not hold here:** integers avoid rounding error in arithmetic, and nothing in the code adds, multiplies or charges a price; it is a number read off a shop page and printed back. Revisit when anything sums prices or a payment provider appears.

- **T81** `fingerprint: 78f14df` — Biome 2.x, lint only (formatter and import sorting off), instead of the catalog's Oxlint.
  **Why the rationale did not hold here:** it is the owner's choice (issue #7, 2026-09-20) and **no reason was given, none is invented here**. The catalog's own Why (Oxlint is the direction; a narrow ESLint fallback for Next.js-specific rules) says nothing against Biome, and this project has no Next.js. Owner: state the reason here, or revert to the catalog default.

## Inventions

- **Synthetic-update harness behind a staging-only guard** — `scripts/flows/` drives the real bot with fake Telegram updates, intercepts every outgoing API call so nothing reaches a chat, and `assertStaging()` refuses to run unless the database name contains "staging".
  **Why:** a bot has no browser to drive, so the usual E2E layer does not exist, yet its flows (promise, release, undo, surprise mode) are the irreversible, publicly visible ones. Prisma writes `public.` into every query, so only a separate database can fence a run off; the guard makes the dangerous mistake impossible instead of documented.

- **Vocabulary table plus grandmother test as a copy rule** — `CLAUDE.md` bans a list of words with a replacement and a reason each, and settles every new term with one question ("зрозуміє бабуся?").
  **Why:** a tone guide drifts; a banned-word table with reasons can be checked. Candidate for a catalog entry alongside T69/T60 once a second project does it.
