# Taste catalog

This is claude-kit's engine-level catalog of default project practices. Read it at bootstrap/onboarding time, and again whenever a technology or workflow decision comes up mid-project — it's the starting position, not a checklist to silently satisfy.

**How to use it.** Every entry below is a default-with-rationale, never a law. If an entry's rationale doesn't fit the project you're actually building, say so openly and propose the deviation — in the plan, in the PR, wherever the decision surfaces. Never silently comply with a default that doesn't fit, and never silently deviate from one that does; both defeat the point of writing this down.

**Two fields gate every entry, and they answer different questions.**

**`kind`** — how much *judgment* applying this entry takes:
- `constant` — the unconditional default. Apply it unless you've flagged and argued for an exception.
- `conditional` — applies once its stated **Condition** holds, judged per project. Off by default until the condition is met.
- `open-question` — no default; put the question in **Ask** to the owner at the relevant point (usually bootstrap) and record the answer.

**`scope`** — an *observable fact* about the project that decides whether the entry is even in play, before any judgment happens. This engine is vendored into projects of any stack — Node, Python, Go, whatever — so an entry has to declare what it needs to be relevant at all. Values: `any` (every project, whatever the stack), `node` (has `package.json`), `web` (ships a browser UI), `next` (uses Next.js), `db` (has a relational database), `monorepo` (a workspace with multiple deployable surfaces), `github` (hosted on GitHub, so its forge features are available). Check it by looking at the repo in front of you, not by judging — a project either has `package.json` or it doesn't.

**The rule for `scope: any`: it must not name a specific product, vendor, or language-specific tool.** `any` is reserved for entries with no such precondition — git/commit/release/naming/comment/documentation/repo-hygiene practices, mostly. An `any`-scoped entry that names one anyway (pnpm, Next.js, Zod, Postgres, …) is an instruction to build the wrong thing for every project outside that one product's stack, and it is mis-scoped — narrow the scope instead. The one exception: an entry whose actual subject is a general, stack-neutral practice may name a tool as an illustrative example, clearly marked ("e.g." / "for example") — though rewriting to avoid naming it at all is usually cleaner.

**Applicability first.** Before applying any entry, check its `scope` against the project in front of you. An out-of-scope entry is simply absent from that project — not a deviation, not something to flag, and not something that belongs in any report. Only entries whose scope matches get to the `kind`-driven judgment above.

**Nothing here is permanent.** Every entry carries a **Revisit** trigger — a fact or event that should prompt re-deciding it, not periodic re-litigation for its own sake. When you hit one, raise it.

**Promotion.** A pattern invented on a live project and deliberately reused a third time is a candidate for promotion into this catalog — propose it as a new entry rather than leaving it to survive as tribal knowledge in one repo.

IDs (T1, T2, …) are stable handles, assigned once and never reused or renumbered, even when an entry's content later changes.

---

## 2.1 nextjs-fullstack

#### T1 — Target Next.js 16.x, App Router only `constant` `next`
**Practice:** Bootstrap on the current Next.js 16.x line via `create-next-app@latest`, App Router exclusively, no Pages Router.
**Why:** 16.x is the actively patched major; App Router is where every current feature (Cache Components, Server Actions, streaming, `proxy.ts`) lands. Confirmed by the owner's own miss_zakarpattia (Next.js 16.3.0, App Router only).
**Revisit:** Next.js 17 ships and stabilizes; a 16.x release breaks the kit's scaffolded defaults.

#### T2 — `cacheComponents: true` as the default rendering model `constant` `next`
**Practice:** Set `cacheComponents: true` in every project's `next.config.ts`. Fetching is dynamic-by-default; opt reads into caching with `"use cache"` + `cacheLife()`/`cacheTag()`.
**Why:** Next.js's own stated direction since 16.0; fits the owner's preference for explicit boundaries; gives Partial Prerendering for free.
**Revisit:** `cacheComponents` graduates from flag to only-behavior; a documented correctness/perf regression surfaces.

#### T3 — `partialPrefetching: true` alongside cacheComponents `constant` `next`
**Practice:** Also set `partialPrefetching: true`; add `prefetch={true}` on links whose URL-specific content is worth resolving pre-click.
**Why:** Vercel's own Aug-2026 reference config for SPA-like "Instant Navigations" on top of Cache Components, near-zero added complexity.
**Revisit:** Flag graduates to default-on/removed; a rough edge surfaces (shipped with 16.3, no long track record yet).

#### T4 — Node.js is the only runtime — never scaffold `runtime = 'edge'` `constant` `next`
**Practice:** Never generate a route/page with `export const runtime = 'edge'`. All App Router code runs on Node.js (Fluid Compute) as of 16.3.
**Why:** Edge runtime for framework routes/pages was removed on Vercel, not merely discouraged; Fluid Compute already gives most of edge's latency benefit.
**Revisit:** A supported edge option for App Router routes returns; a project has a documented sub-25ms requirement only a raw Vercel Edge Function can meet.

#### T5 — `proxy.ts` (not `middleware.ts`), Node.js runtime `constant` `next`
**Practice:** Scaffold `proxy.ts` at the project root, export `proxy` not `middleware`, for locale routing, auth gates, redirects.
**Why:** Next.js 16 renamed the file to make the network-boundary role explicit; `middleware.ts` still works but is deprecated. next-intl already documents `proxy.ts`.
**Revisit:** `middleware.ts` is actually removed; the chosen i18n library lags on `proxy.ts` support.

#### T6 — Server Actions as the default mutation path; Route Handlers reserved for structural HTTP `constant` `next`
**Practice:** Server Actions are the default for every UI-originated mutation, with every input validated by a shared Zod schema at the action boundary (and the return shape validated where it crosses back to the client). Route Handlers (`app/api/**/route.ts`) are reserved for callers that structurally need HTTP: webhooks, cron jobs, streaming responses, third-party auth callbacks, and genuine external API consumers.
**Why:** Matches both the 2026 community default and the owner's own flagship project — miss_zakarpattia runs Server Actions as the default (13 `actions.ts` files) and reserves REST routes for the structural-HTTP categories only (11 `route.ts` files, all webhooks/cron/streaming/auth-callback). The owner's "REST API style" taste is honored by the shared-Zod-contract discipline — one schema package consumed by both sides — not by forcing every mutation through HTTP.
**Revisit:** A project ends up with zero external API consumers ever, making the Route Handler exception moot; Next.js gives Server Actions full cacheable-GET semantics, closing the remaining gap with REST.

#### T7 — Mutation-response cache pattern: `updateTag` / `refresh` / `revalidateTag` `constant` `next`
**Practice:** Tag cached reads with `cacheTag()`. Read-your-writes → `updateTag(tag)` in the Action/Route Handler. Uncached sibling nudge → `refresh()`. Background/webhook invalidation → `revalidateTag(tag, profile)` with an explicit `cacheLife` profile.
**Why:** Purpose-built Next.js 16 APIs demonstrated together in Vercel's own reference apps; avoids both over- and under-invalidation.
**Revisit:** Any of the three APIs change signature; a simpler unified API supersedes the split.

#### T8 — Nested Suspense + skeleton loading; file-based error/not-found `constant` `next`
**Practice:** `error.tsx`/`not-found.tsx` per segment; `loading.tsx`/`<Suspense>` with content-sized skeletons, not spinners. Nest boundaries top-down (outer = content users expect first) rather than as siblings.
**Why:** Stable App Router file conventions; the nesting guidance is Vercel's own Aug-2026 demonstrated pattern for non-jittery streaming under Cache Components.
**Revisit:** Next.js ships a first-class layout-stable multi-boundary primitive.

#### T9 — Empty state as a shared UI component, not a file convention `conditional` `web`
**Condition:** Any route rendering a collection that can legitimately be empty under normal use.
**Practice:** Branch explicitly (`if (data.length === 0) return <EmptyState .../>`), backed by one shared `<EmptyState>` component.
**Why:** No Next.js file-system convention exists for this; without a deliberate default it gets reinvented per page.
**Revisit:** Next.js or shadcn/ui ships an official empty-state convention.

#### T10 — Client data libraries (SWR/TanStack Query) only for genuinely live reads `conditional` `next`
**Condition:** Feature needs live/polling/on-demand client-driven refetching (chat, notifications, live dashboards, search-as-you-type) — not the default for one-shot page loads.
**Practice:** Default all initial-load fetching to Server Components (`"use cache"` where appropriate). Preload in the Server Component and hydrate via `SWRConfig`/`HydrationBoundary` when the initial view needs the same data a client library will later own.
**Why:** Server Components already own most fetching efficiently under Cache Components; matches Vercel's own reference app's preload-then-hydrate line.
**Revisit:** A project's real-time surface count grows enough that a stack-wide client-data default becomes worth locking in.

#### T11 — View Transitions off by default, opt in per project `conditional` `web`
**Condition:** Owner explicitly wants app-like transition polish for this project.
**Practice:** Do not scaffold `<ViewTransition>`/transitionTypes into the default bootstrap; add it as opt-in polish once core flows are solid, not before.
**Why:** Real and documented (React 19.2), but adds non-trivial per-component wiring a bare-bones bootstrap shouldn't force on every project.
**Revisit:** Wiring cost drops to a single config flag; app-like polish becomes the norm for the kind of products the kit usually builds.

## 2.2 data-layer

#### T77 — Postgres on Neon as the default database `constant` `db`
**Practice:** Default every project's relational store to Postgres hosted on Neon, wired through the native Vercel integration (see T14/T53 for branching).
**Why:** Matches the owner's stated infrastructure taste and every reference project; Neon's branch-per-preview model (T14) and pooled connection story (T15) only pay off when Neon is the actual default, not an afterthought.
**Revisit:** A project's workload needs a non-relational or non-Postgres store instead (that's an addition alongside this default, not a replacement of it, unless Postgres itself is wrong for the job).

#### T12 — ORM: Drizzle, drizzle-kit for schema introspection only `constant` `db`
**Practice:** Default the Postgres/Neon data layer to Drizzle ORM — node-postgres dialect for pooled Node routes, neon-http/neon-serverless for any Edge routes, one shared TS schema. drizzle-kit is used to view/introspect the schema, never to run migrations (see T13).
**Why:** No codegen step to forget across a pnpm monorepo; smaller/binary-free runtime; Zod already covers runtime validation, closing most of Prisma's remaining DX edge. Prisma 7 (Rust-free, GA 2025-11-19) is a genuinely close runner-up — see T16.
**Revisit:** Prisma's ergonomics/Studio become a hard requirement; relational writes get deep enough that hand-written Drizzle mutations dominate dev time.

#### T13 — Own timestamped migration runner, not drizzle-kit's migrate flow `constant` `db`
**Practice:** Generalize miss_zakarpattia's runner: `scripts/migrate.mjs` reads timestamped `up(sql)` migration files and applies them in order against a `schema_migrations` ledger table. Drizzle stays the ORM (T12); drizzle-kit's own `generate`/`migrate`/`push` commands are never the migration path.
**Why:** drizzle-kit `push` false-positives on unique constraints with an interactive prompt — unsuitable for CI/automation. The owner's own flagship project deliberately built around this exact problem; the audit calls the pattern "worth generalizing beyond Drizzle."
**Revisit:** drizzle-kit ships a genuinely CI-safe, non-interactive migrate flow that matches the ledger-table model.

#### T14 — Neon branching: native Vercel-Neon preview integration `constant` `db`
**Practice:** Enable Neon's native Vercel Previews integration — copy-on-write branch per preview deploy, connection string auto-injected, branch deleted on PR close/merge. Don't hand-roll a GitHub Actions branching workflow unless custom lifecycle control is needed.
**Why:** Isolated, realistic preview DBs with zero extra CI, given Neon (T77) and Vercel (T76) are already the defaults.
**Revisit:** A project needs deterministic/anonymized seed data instead of a production fork; Neon changes preview-branching pricing/tier gating.

#### T15 — Connection strategy: pooled `pg` for Node, Neon HTTP driver for Edge `conditional` `db`
**Condition:** Decided per route based on the Next.js runtime chosen — moot everywhere once T4 (no edge runtime) is accepted as-is.
**Practice:** node-postgres against Neon's pooled connection string (PgBouncer, port 6432) + `attachDatabasePool` from `@vercel/functions` for standard Node functions. Reserve the unpooled/direct string for migrations, `pg_dump`/`pg_restore`, `LISTEN/NOTIFY`, session state.
**Why:** Neon's managed PgBouncer pool + Fluid Compute's warm-instance reuse make TCP pooling viable again for Node functions.
**Revisit:** Fluid Compute's warm-instance model changes; Neon changes pool limits.

#### T16 — Prisma 7 (Rust-free) as the conditional alternative to Drizzle `conditional` `db`
**Condition:** Deep/complex nested relational writes where Prisma's generated nested-mutation types materially save time, or a non-solo team wants Prisma Studio.
**Practice:** Switch that project's data layer to Prisma 7 (driver adapters, Neon Rust-free engine support — verify GA status before relying on it).
**Why:** Prisma 7's Rust-free architecture neutralizes the old "too heavy for serverless" objection; remaining reasons to prefer it are DX, not performance.
**Revisit:** Prisma's Neon Rust-free support graduates Preview→GA; Drizzle ships equivalent nested-mutation ergonomics; team grows from solo to multi-developer.

#### T17 — Kysely reserved for SQL-heavy/analytical services only `conditional` `db`
**Condition:** A service is SQL-heavy/analytical by nature and the team is SQL-fluent enough that a query-builder's transparency outweighs no schema-diff automation.
**Practice:** Use Kysely + kysely-codegen + hand-written migrations for that one service, not project-wide.
**Why:** Thinnest possible abstraction, pairs well with disciplined expand-contract SQL, but the manual overhead costs more solo-dev time than it buys for typical CRUD apps.
**Revisit:** Kysely ships an official schema-diff tool; a recurring pattern shows Drizzle's abstraction genuinely blocking necessary raw SQL.

## 2.3 api-contracts

#### T18 — Zod v4 as the schema-validation baseline `constant` `node`
**Practice:** Plain `zod` (v4 classic/full build) in the shared contract package, server and client. `zod/v4-mini` is not the default.
**Why:** Stable current production default (14x faster string parsing, 57% smaller core); ecosystem (zod-openapi, RHF resolvers, Prisma) has converged on it. `mini` only if a measured bundle-size problem appears. Confirmed by miss_zakarpattia's `lib/validations/`.
**Revisit:** Zod v5 ships stable; a specific client's bundle budget is measurably blown.

#### T19 — One shared, runtime Zod schema layer — package in a monorepo, module in a flat repo `constant` `node`
**Practice:** Every project has a single source of truth for Zod schemas, imported as *runtime code* (not just types) by both the mutation boundary and any client code that needs to validate the same shape — never redeclare validation on either side. In the monorepo bundle (T45), this is `packages/contracts`. In a flat single-app project, it collapses to a plain `lib/schemas/` (or `lib/validations/`) module, one file per domain, multiple narrow schemas per write context — the exact pattern miss_zakarpattia already uses.
**Why:** The client needs to *run* the validator, not just borrow its inferred type, which only runtime code provides; the package-vs-module boundary is a mechanical consequence of T45's monorepo condition, not a separate decision.
**Revisit:** Frontend and backend are ever deployed/versioned independently.

#### T20 — OpenAPI generation: zod-openapi (or zod-to-openapi), never hand-written `constant` `node`
**Practice:** Generate the OpenAPI document from the shared Zod schemas with `zod-openapi` (primary) or `@asteasolutions/zod-to-openapi` (equally valid — pick one, don't mix).
**Why:** Both actively maintained and Zod-v4-native as of Aug 2026; docs generated from the same source of truth as validation, can't drift.
**Revisit:** Either package goes >12 months without a release; Zod v5 breaks both peer ranges simultaneously.

#### T21 — Typed client: openapi-typescript + openapi-fetch, not ts-rest (yet) `constant` `node`
**Practice:** Generate client types from the OpenAPI doc with `openapi-typescript`, call the API via `openapi-fetch`. Do not adopt ts-rest despite its closer contract-first fit — its stable channel is 17.5+ months stale and still pinned to `zod ^3`, with Zod v4 support stuck in RC for over a year.
**Why:** `openapi-fetch`/`openapi-typescript` have a healthy ~6-month release cadence and no Zod-version mismatch.
**Revisit:** ts-rest ships a stable release with a `zod ^4` peer dependency — re-evaluate immediately, it remains the better design fit.

#### T22 — Error envelope: RFC 9457 Problem Details `constant` `node`
**Practice:** All API errors as `application/problem+json` (`type`, `title`, `status`, `detail`, `instance`); Zod's `treeifyError`/`.issues` carried as a custom `errors` extension-member on the same envelope.
**Why:** Current IETF standard (obsoletes RFC 7807); one parseable envelope across every endpoint instead of a bespoke shape per project. Zod's issue output maps directly onto the extension mechanism.
**Revisit:** A successor RFC obsoletes 9457; a specific client requires a different shape.

#### T23 — API versioning: URL-path, only once external consumers exist `conditional` `next`
**Condition:** The route is consumed by a third party outside the owner's own atomic deploy (public API, partner integration, independently-released mobile client).
**Practice:** `/api/v1/...` with `Deprecation`/`Sunset` headers once external consumers exist. Internal Next.js BFF routes consumed only by the co-deployed frontend skip versioning entirely — rely on the shared Zod contract package (T19) + build failures to force sync.
**Why:** URL-path versioning is the 2026 consensus safe default once consumers can't be coordinated with; adding `/v1` to an internal-only BFF is overhead with no safety benefit.
**Revisit:** An internal-only route gains an external consumer; frontend/BFF deploys decouple.

## 2.4 ui-system

#### T24 — Tailwind v4, CSS-first config `constant` `web`
**Practice:** Tailwind v4.x, theme via `@theme` in the shared stylesheet, no `tailwind.config.js`.
**Why:** v4 is the only actively developed major (no v5 timeline); CSS-first config is a hard requirement for the shadcn/ui monorepo pattern. Confirmed by miss_zakarpattia.
**Revisit:** A Tailwind v5 release/RC lands; a config-file model change is announced.

#### T25 — shadcn/ui monorepo layout: `apps/*` + `packages/ui` `conditional` `monorepo`
**Condition:** Monorepo bundle is active (T45). In a flat single-app project, primitives live in `components/ui/` directly, no separate package.
**Practice:** Base components in `packages/ui/src/components`, one shared `packages/ui/src/styles/globals.css`, each app its own `components.json`, cross-workspace alias `@workspace/ui/components`.
**Why:** The CLI's own documented, CLI-enforced pattern — maps directly onto the pnpm+Turborepo shape with no adaptation, once that shape applies.
**Revisit:** shadcn/ui changes the official monorepo doc/CLI routing; a non-Turborepo monorepo tool is adopted.

#### T26 — Base UI as the default primitive layer for new projects `constant` `web`
**Practice:** Bootstrap new projects with shadcn/ui's Base UI primitive base (`shadcn init` default since July 2026), not Radix. Existing projects on Radix are not force-migrated; Radix stays a safe per-component fallback.
**Why:** shadcn/ui itself switched its default based on 2:1 community adoption, built by the same engineers who built Radix — low-risk for greenfield work, accepted as the kit's default primitive.
**Revisit:** Base UI shows regressions/abandoned-component gaps vs. Radix in practice; shadcn/ui reverses the default again; a project needs a Radix-only component.

#### T27 — Visual signature is decided per project, not fixed by the kit `open-question` `web`
**Practice:** The kit does not fix a named shadcn style, shape, spacing/density, or color palette as a cross-project signature. The owner designs the visual language separately for each project, the same way any other product design choice gets made.
**Why:** A kit-wide fixed aesthetic was considered and explicitly rejected — the owner's projects don't share a visual family on purpose. What the kit *does* standardize is the mechanism, not the look — see T28.
**Ask:** What style, mood, and density fit this specific project? (Decide fresh — don't inherit a prior project's answer.)
**Revisit:** Owner states a recurring aesthetic preference across enough projects that a soft starting point (not a hard default) would save real time.

#### T28 — What the kit standardizes regardless of aesthetic: tokens, theming, dark mode, a11y floor `constant` `web`
**Practice:** Every project gets: one file that's the single source of truth for design tokens (colors, radius, spacing scale), a working light/dark theming setup (T29), and an accessibility floor (contrast, focus-visible states — T30) — independent of whatever named style or color palette T27 lands on for that project.
**Why:** These are mechanism, not aesthetic — the part of "visual signature" that's actually worth being consistent about across projects, since it's invisible to the user and expensive to redo per project.
**Revisit:** shadcn/ui restructures its token/theming architecture in a way that breaks this separation.

#### T29 — Dark mode: next-themes, class strategy, provider wraps `<body>` `constant` `next`
**Practice:** `next-themes` with `attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange`; ThemeProvider wraps `{children}` inside `<body>`; `<html>` keeps `suppressHydrationWarning`.
**Why:** shadcn/ui's own official Next.js App Router pattern; avoids flash-of-wrong-theme without a manual inline script.
**Revisit:** shadcn/ui changes its official doc to a different strategy; next-themes becomes unmaintained.

#### T30 — Fix the focus-ring contrast gap; enable Oxlint's jsx_a11y rules `constant` `web`
**Practice:** In the shared token file, replace shadcn's stock `focus-visible:ring-1 ring-ring/50` with `focus-visible:ring-2 focus-visible:ring-ring` (full opacity) for WCAG 2.2 SC 1.4.11. Enable Oxlint's built-in `jsx_a11y/*` rules in the standard lint config (T81).
**Why:** The `/50`-opacity ring is a mathematically checkable, widely-reported contrast failure, cheap to patch once at the shared-token level.
**Revisit:** shadcn/ui fixes the ring opacity upstream; Oxlint reaches full jsx-a11y-x parity or a gap blocks a real component; WCAG version changes the requirement.

#### T31 — Private shadcn registry as the cross-project signature-distribution mechanism `constant` `web`
**Practice:** Maintain the kit's own shadcn registry (a `registry.json`-described repo, no server required) bundling the chosen primitive base, a11y-patched tokens, font/spacing scale — never a fixed style/color, per T27. Seed each new project via `npx shadcn add <kit-registry-url>` at bootstrap — vendored snapshot, not a live runtime dependency.
**Why:** shadcn/ui's own documented distribution mechanism for exactly this problem; vendoring-at-bootstrap matches the kit's existing "vendor the engine into each project" philosophy.
**Revisit:** shadcn/ui's registry format changes in a breaking way; the kit's vendoring philosophy changes.

#### T32 — Public vs. private hosting for the kit's own registry `open-question` `web`
**Practice:** Decide whether the kit's shadcn registry repo (T31) is public (forkable, consistent with an MIT-by-default stance) or private.
**Why:** Infra/publishing decision outside what research can verify — depends on whether the design system itself should be a public artifact.
**Ask:** Should the kit's shadcn registry repo be public or private?
**Revisit:** Owner states a preference on open-sourcing internal tooling.

## 2.5 testing-strategy

#### T33 — Vitest config: root `test.projects` array, not `vitest.workspace.ts` `constant` `monorepo`
**Practice:** Every monorepo gets a root `vitest.config.ts` using `test.projects`, never a separate workspace file. Factor shared config into a `@repo/vitest-config` package each package's own config imports from (root-level `projects` can't `extend`).
**Why:** Vitest deprecated the standalone workspace file starting 3.2, folded into `projects`; building on the deprecated primitive creates a forced migration for no benefit today.
**Revisit:** Vitest ships the actual removal of `workspace`; the projects/extends interaction changes so root-level extends works again.

#### T34 — Turborepo caching: package-level Vitest config for CI, root `projects` for local DX `constant` `monorepo`
**Practice:** Each testable package gets its own `vitest.config.ts` so `turbo run test` caches per-package. `test` task: `dependsOn: ["^test"]`, `outputs: ["coverage/blob/**"]`; separate uncached `test:watch` with `cache: false, persistent: true`. Root `projects` reserved for local multi-package watch mode only, never CI.
**Why:** Turborepo's own docs recommend this hybrid — root-level `projects` mode makes any single-package change a cache miss for everything, the opposite of what caching exists for.
**Revisit:** Turborepo/Vitest ship a first-party integration reconciling project-mode caching with per-package granularity; monorepo package count stays small enough that blast radius stops mattering.

#### T35 — Risk-based coverage via Vitest glob-keyed thresholds `constant` `node`
**Practice:** Reject a repo-wide coverage percentage. Set a low/no repo-wide floor, layer high explicit thresholds onto path globs touching money/auth/data-mutation, using Vitest's native `coverage.thresholds` glob-key config with `perFile: true`. Globs are a per-project judgment call (T40); the mechanism is fixed.
**Why:** A real first-party Vitest feature that makes "enough not to hurt the product" a checkable CI gate instead of an unenforced policy sentence. This formalizes the qualitative Tier1/2/3 e2e-coverage policy miss_zakarpattia already runs by hand ("if this silently breaks on casting day, how bad is it") — the audit calls that policy "worth generalizing," and this is the mechanism that generalizes it.
**Revisit:** Vitest changes glob threshold semantics; a project's risk paths don't cleanly separate by directory glob.

#### T36 — Coverage provider: v8, not Istanbul `constant` `node`
**Practice:** Use Vitest's default `v8` coverage provider; switch to `@vitest/coverage-istanbul` only for a concrete compliance requirement or an unresolved V8-specific accuracy edge case.
**Why:** Since Vitest 3.2, v8 uses AST-based remapping and matches Istanbul's accuracy while running 2-3x faster with zero extra dependencies.
**Revisit:** A real V8-provider accuracy bug surfaces; a compliance requirement mandates Istanbul-format instrumentation.

#### T37 — Test layer split follows the async-Server-Component boundary `conditional` `next`
**Condition:** Any Next.js project (the owner's default frontend/BFF choice).
**Practice:** Vitest + RTL (jsdom) owns Server Actions as plain functions, Zod schemas, utility logic, synchronous Server Components, Client Components. Playwright E2E owns async Server Components, auth flows, anything depending on cookies/middleware/the router, and full journeys.
**Why:** Not a taste preference — Next.js's own docs state Vitest currently cannot render async Server Components and recommend E2E for them instead. This closes a real gap: miss_zakarpattia has no unit-test layer at all today (Playwright only), which the audit flags directly.
**Revisit:** Next.js docs report Vitest gaining async Server Component support.

#### T38 — Component testing: Vitest Browser Mode over standalone Playwright CT `conditional` `web`
**Condition:** A project needs real-browser component tests (real layout/CSS/events) beyond what jsdom + RTL validates — e.g. shadcn/ui components with complex interaction/visual state. Skipping component-level browser testing entirely (Vitest+RTL for logic, Playwright E2E for critical flows) is a genuinely close alternative for simple components.
**Practice:** Reach for Vitest 4's Browser Mode (stable) with the Playwright provider rather than standalone Playwright Component Testing — one test runner/API surface for both jsdom and real-browser component tests.
**Why:** Playwright CT runs the test in Node and the component in-browser over a message channel, awkward for component-level assertions; Vitest Browser Mode runs the whole test in-browser with the same APIs already used for unit tests.
**Revisit:** Playwright CT reworks its Node/browser split; Vitest Browser Mode regresses.

#### T39 — Playwright CI cost control: shard + cache browsers + trace-on-retry-only `constant` `web`
**Practice:** Split the suite with native `--shard=i/n`; cache Playwright's browser binaries between runs; `reporter: process.env.CI ? 'blob' : 'html'`; merge job runs `playwright merge-reports`; record trace/video only on failure or retry.
**Why:** All first-party Playwright primitives; published benchmarks show this combination cutting a 2,000-test suite's CI bill from ~$200/mo to <$60/mo while staying under 8 minutes. Consistent with miss_zakarpattia's own e2e job (its own concurrency group to avoid shared-staging-DB collisions — a related, deliberate cost/safety concern).
**Revisit:** Playwright ships a materially different sharding/reporting mechanism; a small suite runs in under ~3 minutes unsharded, making the complexity not worth it.

#### T40 — Exact risk-path globs per project (money/auth/data-mutation) `open-question` `node`
**Practice:** At bootstrap, identify and record which path globs count as "money", "auth", and "data-mutation" for that project's `coverage.thresholds` config (T35).
**Why:** The mechanism (T35) is a verified constant; the globs are project-specific judgment, same spirit as the kit's existing `UNIT_REQUIRED_FOR` keys.
**Ask:** Which paths in this project touch money, auth, or data mutation directly enough to need a high, enforced coverage floor?
**Revisit:** N/A — inherently per-project, revisited at every bootstrap.

## 2.6 monorepo-tooling

#### T70 — pnpm as the package manager, in every project regardless of monorepo `constant` `node`
**Practice:** Use pnpm for every project — flat single-app repos included. This is independent of whether the monorepo bundle (T45) is active.
**Why:** Matches the owner's stated tooling taste; pnpm's workspace/catalog features (T51) only matter once a monorepo exists, but the package manager choice itself doesn't wait for that. Note: miss_zakarpattia itself still runs npm — its pnpm adoption is recommended going forward, not confirmed by that repo's current state.
**Revisit:** pnpm has a hard compatibility break with a tool the stack depends on.

#### T81 — Linter: Oxlint, with a narrow ESLint fallback for Next.js-specific rules `constant` `node`
**Practice:** Oxlint is the default linter for every project. Where a Next.js-specific rule has no Oxlint equivalent yet (i.e. an `eslint-config-next` rule), fall back to plain ESLint for that specific rule only — a narrow, documented exception per rule, never a general "ESLint as the real linter" fallback.
**Why:** Oxlint is confirmed as the direction; miss_zakarpattia's current ESLint-9 setup reflects a project that predates this decision, not a counter-example against it. The fallback stays narrow because Oxlint's own coverage is the point — a blanket fallback would quietly re-adopt ESLint as the default.
**Revisit:** Oxlint ships full `eslint-config-next` parity (the fallback becomes unnecessary); Oxlint stalls badly enough that the fallback needs to widen.

#### T41 — Turborepo version: pin to latest 2.x `conditional` `monorepo`
**Condition:** Monorepo bundle is active (T45).
**Practice:** Pin to latest Turborepo 2.x (2.10.10 as of 2026-08-19; no 3.0 exists yet).
**Why:** Still the current major; 2.7-2.10 added composable config, stable turbo query, big perf gains.
**Revisit:** Turborepo 3.0 ships.

#### T42 — turbo.json task/caching discipline `conditional` `monorepo`
**Condition:** Monorepo bundle is active (T45).
**Practice:** Always declare `outputs` on cacheable tasks; explicit `inputs` for tight invalidation; `globalDependencies`/`env`/`globalEnv` for env-sensitive cache keys; tasks defined in each package, root turbo.json as orchestration only; keep tasks deterministic.
**Why:** Vercel's own official best-practice guidance — undeclared outputs silently never cache; non-deterministic tasks break the whole caching model.
**Revisit:** Vercel materially changes the turbo.json schema.

#### T43 — Vercel Remote Cache from the day the bundle activates `conditional` `monorepo`
**Condition:** Monorepo bundle is active (T45).
**Practice:** `turbo login && turbo link` at project bootstrap, immediately — not deferred.
**Why:** Free on all plans regardless of hosting choice — exactly the "remote cache set up from day one" the owner wants, once there's a Turborepo to cache.
**Revisit:** Vercel changes remote-cache pricing/free-tier terms.

#### T44 — Remote cache HMAC signature `conditional` `monorepo`
**Condition:** Monorepo bundle is active (T45) AND the project has CI or a second collaborator — not required for pure solo local dev.
**Practice:** Set `remoteCache.signature: true` in turbo.json with a `TURBO_REMOTE_CACHE_SIGNATURE_KEY` CI secret.
**Why:** Verifies cache artifact integrity/authenticity; low cost, matters once artifacts are shared beyond one trusted machine.
**Revisit:** N/A — re-evaluate per project when CI is added.

#### T45 — Monorepo skeleton: `apps/web` + `packages/{ui,config,schemas,db}` `conditional` `node`
**Condition:** A second real deployable surface exists or is clearly imminent. A single app stays a flat repo — do not scaffold `apps/`/`packages/` speculatively for a solo one-app project.
**Practice:** When the condition holds: `apps/web` (Next.js App Router + `app/api/**/route.ts` + `proxy.ts`), `packages/ui`, `packages/typescript-config`, `packages/lint-config` (Oxlint-based, T81), `packages/contracts` (T19), `packages/db`. Namespace `@repo/*`. A flat repo can be promoted into this shape later without a rewrite — moving app code into `apps/web`, extracting shared bits into `packages/*`, adding root `package.json` workspaces + `turbo.json`, switching CI to `turbo run`. That promotion is mechanical grunt work, not a logic rewrite; budget roughly a day for a small app.
**Why:** miss_zakarpattia — the owner's best-evidenced project — is a single flat app with no workspaces, and the audit is explicit: "don't force apps/packages where there's only one app." Matches Vercel's own official Turborepo+Next.js template once the condition is actually met.
**Revisit:** A project needs a second deployable app from day one (skip the promotion path, start in this shape); the schemas-package pattern proves awkward (e.g. circular imports).

#### T46 — Extra shared packages beyond the standard set `open-question` `monorepo`
**Practice:** Once the monorepo bundle (T45) is active, decide per project whether it needs packages beyond the standard trio in T45 — this question is moot for a flat repo.
**Why:** A single-frontend BFF project usually doesn't need extra boundaries beyond `contracts`/`db`; only add more when a second real consumer (mobile app, external API client) actually exists.
**Ask:** Beyond `ui`/`typescript-config`/`lint-config`/`contracts`/`db`, does this project need another shared package, and why?
**Revisit:** Project gains a second consumer of its API/schema.

#### T47 — Changesets ⟷ conventional commits ⟷ squash merge, when changesets applies `conditional` `monorepo`
**Condition:** Same condition as T48 — at least one workspace package is independently published outside the monorepo.
**Practice:** Run changesets untouched alongside conventional-commit (T72) squash-merge (T63) PRs — they read `.changeset/*.md` files in the diff, not commit history, so there's no conflict. Standard `changesets/action` two-PR flow (merge → "Version Packages" PR → merge that → publish). CI fails a PR touching a publishable package with no changeset file.
**Why:** Changesets and Conventional Commits solve different problems and never interact structurally; the two-PR flow keeps a deliberate release gate for published packages.
**Revisit:** `changesets/action` adds a genuinely different single-merge auto-publish default.

#### T48 — Changesets only once a package is independently published `conditional` `monorepo`
**Condition:** At least one `packages/*` is independently versioned/published outside the monorepo (e.g. to npm). Otherwise, the app-level release is handled by the commit-driven mechanism in T66 — changesets is not the default release path for the common one-deployed-app case.
**Practice:** Adopt changesets (T47) only when the condition holds; don't scaffold it speculatively at bootstrap.
**Why:** Changesets exists to manage independent package versioning/changelogs; a single-app repo has no such boundary and the flow becomes ceremony without payoff. The owner's own commit-driven pattern (T66) is the stronger default for the project shape most of the owner's work actually takes.
**Revisit:** Project adds a package meant for external reuse/publishing.

#### T49 — Node.js version pinning: mise, not Volta or engines+Corepack `constant` `node`
**Practice:** Use mise (`mise.toml`, committed) to pin the Node runtime, in every project regardless of monorepo. Keep a plain `engines` field in package.json as advisory documentation only, not the enforcement mechanism. fnm is a close alternative for Node-only projects but narrower than mise.
**Why:** Volta is end-of-maintenance since Nov 2025; Corepack is being removed from Node core starting Node 25, gone by Node 26 LTS (~Oct/Nov 2026), making engines+corepack a dead end. mise is ~10x faster than asdf, reads `.nvmrc`/`.tool-versions` natively. Confirms a real gap: miss_zakarpattia has no `.nvmrc`/`engines` today, only CI pins Node 22 — the audit flags this as a cheap fix worth always shipping.
**Revisit:** Node.js v26 ships as LTS with Corepack fully gone (confirms urgency); mise maintenance stalls.

#### T50 — pnpm version pinning via `packageManager`, decoupled from Corepack `constant` `node`
**Practice:** Install pnpm via its standalone install script initially; pin the exact version via the `packageManager` field (pnpm 10+'s `manage-package-manager-versions` honors this without Corepack). Applies regardless of monorepo — see T70.
**Why:** pnpm has deliberately decoupled its own version management from Corepack ahead of Corepack's removal from Node core — the durable 2026+ path.
**Revisit:** pnpm changes the `manage-package-manager-versions` default or deprecates the `packageManager` mechanism.

#### T51 — pnpm catalog for dependency alignment `conditional` `monorepo`
**Condition:** Monorepo bundle is active (T45) — a catalog only makes sense once 2+ workspace packages share a dependency.
**Practice:** `pnpm-workspace.yaml` `catalog:` for every dependency shared by 2+ workspace packages (typescript, react, zod, tailwind, vitest, playwright, lint tooling). Enable `catalogMode: strict` (pnpm 10.12+). Named `catalogs:` only when two coexisting major versions of the same dependency genuinely need to be split.
**Why:** Solves version drift across packages without syncpack or manual grep-and-fix; strict mode enforces rather than just advises.
**Revisit:** pnpm changes or deprecates the catalog mechanism.

## 2.7 vercel-platform

#### T76 — Vercel as the default hosting platform `constant` `web`
**Practice:** Deploy every project to Vercel by default. All of T52-T58 below assume this; treat them as the standard operating posture, not per-project opt-ins.
**Why:** Matches the owner's stated hosting taste and every reference project; Next.js's own platform-specific features (Fluid Compute, Cache Components, preview protection) are built around Vercel specifically.
**Revisit:** A project has a hard requirement Vercel can't meet (data residency, self-hosting mandate).

#### T52 — Env vars: Vercel Dashboard as source of truth + `vercel env pull` + `.env.example` `constant` `web`
**Practice:** Never hand-author secrets locally. Set every env var via the Vercel Dashboard / `vercel env add`, scoped per environment. Bootstrap/refresh local dev with `vercel env pull .env.local --yes`. Commit `.env.example` with blank/placeholder values; a bootstrap script diffs it against `.env.local`. Hand-added local-only vars live in `.env.development.local` (loaded after `.env.local`) since `vercel env pull` overwrites its whole target file.
**Why:** The documented, zero-friction Vercel-native workflow; pairs with a startup Zod schema to catch a missing/misnamed var at boot instead of first request.
**Revisit:** Vercel changes `vercel env pull` to merge instead of overwrite; a project needs a secrets manager beyond Vercel's own.

#### T53 — Preview DB branching: Neon branch-per-preview integration `conditional` `db`
**Condition:** Project has a Postgres/Neon database (T77) and preview deployments matter.
**Practice:** Install the Neon x Vercel preview integration — copy-on-write branch per preview, connection string auto-injected, migrations run as a build step. Prefer the Neon-managed integration flavor (billing stays in Neon) over Vercel-native/Marketplace, unless single-invoice billing is specifically wanted.
**Why:** Turns every PR preview into a realistic, isolated environment for free — zero manual seeding, automatic teardown.
**Revisit:** A project handles real PII and copy-on-write previews would leak it without anonymization; Vercel-native billing/DX gap closes enough to flip the default.

#### T54 — Observability: Speed Insights + Web Analytics always on; Sentry once there are real users `conditional` `web`
**Condition:** Sentry — add once past disposable-prototype stage and traffic/users exist worth alerting on. Speed Insights/Analytics — always, unconditionally.
**Practice:** Enable Vercel Speed Insights and Web Analytics on every project from day one (near-zero setup, no separate account). Add Sentry before real traffic, not necessarily day one.
**Why:** Vercel's telemetry and Sentry solve disjoint problems (Core Web Vitals/pageviews vs. "what broke"); splitting free-vs-setup-cost matches "scale-ready, not gold-plated."
**Revisit:** Vercel ships first-party error tracking closing the Sentry gap; error volume outgrows Sentry's free tier.

#### T55 — Fluid Compute: leave the platform default alone `constant` `web`
**Practice:** Do not disable Fluid Compute or write functions assuming legacy per-invocation billing. It's already the default (Active CPU time billing, I/O-wait free) as of 2026.
**Why:** "Do not fight the platform default" — prevents an agent from pinning an old runtime config or reasoning about cost with outdated per-invocation assumptions.
**Revisit:** Vercel changes the default compute model; a specific workload (long-lived websockets, heavy CPU-bound compute) is shown to perform worse under Fluid Compute.

#### T56 — Spend Management: notifications always on; hard auto-pause per project `conditional` `web`
**Condition:** Auto-pause — ask whenever a project has a real audience (a silent multi-hour outage from a missed notification can be worse than the overage it prevents); a purely internal/low-stakes project can reasonably default to auto-pause.
**Practice:** Enable Spend Management with a budget and 50/75/100% notifications (web+email, SMS at 100%) on every Pro-plan team from day one — free, only ever informs. Do NOT enable "pause production at 100%" by default.
**Why:** Pausing is non-instant, team-wide (all projects), requires manual per-project resume — a real footgun for a solo dev running one production app.
**Revisit:** Vercel adds granular (per-project) or auto-resuming pause behavior; a project's traffic pattern makes runaway spend a bigger risk than downtime.

#### T57 — WAF and DDoS mitigation: leave platform defaults on `constant` `web`
**Practice:** Rely on Vercel's baseline WAF and unlimited DDoS mitigation, free on every plan including Hobby, WAF-mitigated traffic itself free of bandwidth cost as of May 2026. No project-level action required; add custom rules only when a specific abuse pattern shows up.
**Why:** True zero-cost, zero-setup default — documents that nothing further needs doing, preventing both under- and over-engineering.
**Revisit:** A project observes real abusive traffic; Vercel changes what's in the free tier.

#### T58 — Deployment Protection: Standard + Vercel Auth default; "All Deployments" conditional `conditional` `web`
**Condition:** "All Deployments" scope only for internal-tool/pre-launch/staging-style projects, never a project whose production is meant to be public.
**Practice:** Team-level default: Standard Protection (all preview/generated URLs) with Vercel Authentication — zero cost, one-time setting.
**Why:** The documented recommended default; already keeps preview URLs (often half-finished features, env-derived data) out of search engines and drive-by traffic.
**Revisit:** A client/project has a compliance requirement (IP allowlist, SSO-gated access) forcing Trusted IPs/Passport onto the table.

## 2.8 i18n

#### T59 — i18n library choice: asked per project, not scaffolded by default `open-question` `next`
**Practice:** Do not scaffold next-intl (or any i18n library) into every project by default. Ask locale count at bootstrap; if the product ships one locale, ask whether a library is warranted at all — i18n libraries sometimes cause friction with Next.js's caching/RSC model, and a single-locale product may not need one.
**Why:** miss_zakarpattia is Ukrainian-only by explicit, stated product decision, with no i18n library — a defensible product call, not a gap. next-intl (T61) is the right choice *if* a library is warranted, but that's a separate question from whether one is needed.
**Ask:** How many locales does this product need at launch, and — given i18n libraries can fight Next.js's caching model — is a library warranted at all, or is single-locale-no-library the right call here?
**Revisit:** A project's translated client bundle becomes a *measured* perf problem under whatever library gets chosen.

#### T69 — Extract UI copy and validation messages into a constants/keys module, regardless of i18n library `constant` `web`
**Practice:** Every project — single-locale or not, with or without an i18n library (T59) — keeps JSX copy and Zod validation-error messages out of inline string literals. Route them through a flat constants/keys module (`lib/strings.ts` or equivalent; becomes the message catalog directly if a library is adopted). Enforce with the lint rule in T60.
**Why:** This is the audit's single clearest, most concrete finding: miss_zakarpattia has no i18n library (a defensible call) but *also* no string extraction anywhere — validation messages and JSX copy are raw inline literals scattered across ~13 files, with no constants module at all. That's a violation of the owner's own separately-stated taste ("texts in variables/keys"), independent of the library question, and cheap to prevent with one rule from day one.
**Revisit:** N/A — this is the fix for a gap already found in production; keep it as a baseline.

#### T60 — Hardcoded-JSX-text lint rule as the enforcement mechanism `constant` `web`
**Practice:** Add a framework-agnostic hardcoded-string JSX lint rule (candidate: `eslint-plugin-no-hardcoded-strings` — catches JSX text, string literals in JSX expressions, hardcoded `placeholder`/`alt`/`title`/`aria-label`) as a CI/build-time gate enforcing T69. Load under Oxlint's ESLint-plugin-compatibility layer first; fall back to plain ESLint for just this rule if that layer fails to load cleanly (see T81's fallback policy).
**Why:** No i18n library ships its own hardcoded-text rule; keeping enforcement library-agnostic means it survives an i18n-library change and applies even when T59 lands on "no library."
**Revisit:** Oxlint's plugin layer graduates to stable; next-intl ships an official rule; the chosen plugin goes unmaintained.

#### T61 — Message key naming: nested feature/page namespaces, purpose-driven stable keys `conditional` `next`
**Condition:** Project adopts next-intl (per T59).
**Practice:** next-intl's native nested-namespace structure (`HomePage.title`, `Nav.cancel`), a shared `Common` namespace for cross-cutting strings. Keys are purpose-driven and stable (`welcomingMessage`, not the literal copy). Avoid nesting beyond ~2 levels.
**Why:** Flat dotted keys break next-intl's namespace resolution — a functional constraint, not a style preference. Stable keys decouple copy edits from code changes.
**Revisit:** next-intl changes namespace resolution to support flat keys; a project's catalog grows large enough that 2-level nesting visibly breaks down.

#### T62 — Missing/unused-key CI check beyond next-intl's own tooling `open-question` `next`
**Practice:** Only relevant once a project adopts next-intl (T59). Do not rely on `useExtracted` (experimental as of 4.5) as the sole enforcement mechanism — it lowers friction for moving literals into keys but doesn't replace the lint-time gate (T60). Decide per project whether to add a supplementary CI check for missing/unused translation keys.
**Why:** next-intl has no official built-in CLI for missing/unused keys yet; the value of a supplementary check scales with how many locales are actually shipped.
**Ask:** Do you want a CI check for missing/unused translation keys on this project, and does it justify the setup given the current locale count?
**Revisit:** `useExtracted` stabilizes; next-intl ships an official missing/unused-key CLI; a project actually ships more than one locale in production.

## 2.9 repo-identity

#### T63 — GitHub repository rulesets on main, not classic branch protection `constant` `github`
**Practice:** Govern the default branch with a GitHub repository ruleset: require PR before merge, linear history/squash-only, block force-push, block branch deletion. Combine with "Allow squash merging" only (disable merge/rebase merging) and "Automatically delete head branches" on.
**Why:** GitHub is actively migrating repos from classic branch protection to rulesets (2026-08-11 changelog ships a one-click migration tool). Squash-only enforced platform-side is what makes Conventional Commits (T72) produce a clean, parseable main-branch history.
**Revisit:** GitHub deprecates/changes ruleset vs. branch-protection semantics; owner adopts merge queues/stacked PRs; a project needs merge commits preserved (documented exception).

#### T72 — Conventional Commits as the commit-message standard `constant` `any`
**Practice:** Every commit message follows Conventional Commits (`type(scope): subject`, e.g. `feat(auth): add magic-link login`). This is the input the commit-driven release mechanism (T66) computes versions and changelogs from — there is no separate changelog to hand-maintain in the common case.
**Why:** Owner's settled taste; also a hard dependency of T66's release automation and T63's squash-merge-produces-clean-history goal.
**Revisit:** N/A — foundational; revisit only if the release mechanism it feeds (T66) changes to something that doesn't need parseable commit history.

#### T73 — Branch naming: `type/short-description` `constant` `any`
**Practice:** Every branch is named `type/short-description` (e.g. `feat/magic-link`, `fix/stale-session-token`), mirroring the Conventional Commits type vocabulary (T72).
**Why:** Owner's settled taste; keeps branch names scannable in `git branch`/PR lists and consistent with the commit-type vocabulary already in use.
**Revisit:** N/A — foundational naming convention.

#### T64 — README minimum-viable structure `constant` `any`
**Practice:** Every repo ships: title + one-sentence description, Quick Start (install+run under a screen), a Usage example, License (explicit, not implied — see T80 for the default license itself), a Contributing pointer. Roughly 800-1500 words; deep material pushed to `/docs`. Badges are polish, not the minimum. README drift is a bug, not cosmetic — any change altering install/run/usage includes a README check.
**Why:** Cross-source convergence on the recurring floor for a README that actually onboards someone. Confirmed strongly: the audit rates miss_zakarpattia's README as "reference template quality" — functional badges, a stack table, an explicit prod-vs-staging warning, every claim linked to the file that implements it.
**Revisit:** Owner starts publishing for open-source growth (richer elements earn their place); a purely internal/private project can shrink Quick Start/Usage but keeps License and the one-liner.

#### T79 — Repo baseline: a clear name and a one-line description, on every repo `constant` `any`
**Practice:** Every repo — public or private — gets a clear, specific name (not `project-2` or a working title left over from bootstrap) and a one-line repository description that says what it is, in whatever field the forge provides. This is the floor; T68 layers topics and a social preview image on top of it for public/discoverable repos specifically.
**Why:** Basic repo hygiene that costs nothing and pays off the first time anyone (including future-you) has to find the right repo in a list of many.
**Revisit:** N/A — baseline hygiene, not a technical decision that ages.

#### T80 — MIT license by default `constant` `any`
**Practice:** Every new repo gets a `LICENSE` file (MIT) and, at bootstrap, a matching license declaration in whatever manifest the stack uses (e.g. `"license": "MIT"` in `package.json` for a Node project), unless the project has a specific reason not to (client work under a different agreement, a deliberately proprietary product).
**Why:** Owner's settled default; MIT is the permissive, low-friction choice that matches an otherwise-open posture (public registry in T31/T32, discoverability in T68).
**Revisit:** A specific project needs a different license (client contract terms, proprietary product decision) — document the exception at bootstrap, don't silently default to MIT anyway.

#### T65 — Issue templates: 3 YAML forms + triage label `constant` `github`
**Practice:** Exactly three YAML issue-form templates in `.github/ISSUE_TEMPLATE/`: Bug Report, Enhancement/Feature Request, Documentation — GitHub's YAML issue-forms syntax, not legacy Markdown. Each auto-applies its category label via `labels:`; every new issue also gets a `triage` label.
**Why:** A dated (2026-04-23) source lands on this trio as "small enough to maintain, broad enough to cover what most repos actually receive" — matches the mobile-engine, don't over-template philosophy. Confirmed by miss_zakarpattia's existing structured YAML templates.
**Revisit:** Issue volume grows enough that a fourth template or a priority-label taxonomy earns its place.

#### T66 — Commit-driven release automation as the default release mechanism `constant` `any`
**Practice:** For the common case (one deployed app, nothing independently published), compute the version and changelog straight from Conventional Commits (T72) — no separate version-declaration files. On release: post a human-readable announcement to a chat channel (the owner's preferred messaging platform, e.g. Telegram), with route-derived links (deep-linking to the actual page/feature, not a generic diff link); skip creating a release entirely when nothing user-facing changed; make the computed changelog previewable inside the PR before merge. Releases are tracked on every project, not just the ones that feel release-worthy.
**Why:** The commits already carry the information, so a second place to declare a version is a second place for it to disagree with the first. The owner's own flagship pipeline runs exactly this, fully automatically, and the audit rates it above the generic alternative. The tool-based exception path in T47/T48 applies only once a package is independently published — that is the exception, not the default.
**Revisit:** A project's release cadence or audience changes enough that the chat announcement stops being the right channel; the exception-path mechanism in T47/T48 changes its release-creation behavior for that case.

#### T67 — Client release announcements: post verbatim, no autonomous AI paraphrase `conditional` `any`
**Condition:** Project is commercial / has a paying client with a dedicated chat channel expecting release visibility.
**Practice:** On release, post the changelog body verbatim to the client's chat — the plumbing is whatever the CI provides — e.g. a chat webhook action, or a direct Bot-API `curl` call. Never insert a fully autonomous LLM-paraphrase step between the changelog and the client channel — a friendlier rewrite, if wanted, is a draft for the owner to review and forward manually.
**Why:** A human-authored (or commit-computed, per T66) changelog is already client-legible; a second AI-summarization hop adds hallucination/mis-scoping risk without much benefit. Teams that get into trouble are the ones that let AI output go out without human review.
**Revisit:** Owner wants an AI-paraphrase layer badly enough to accept a review gate (promote to a documented opt-in, not a default); a client explicitly asks for a non-technical summary.

#### T68 — Repo topics and social preview for public/discoverable repos `conditional` `github`
**Condition:** Project is public/open-source (MIT-licensed per T80, meant to be discoverable), not a private client repo. (The name and description themselves are unconditional — see T79.)
**Practice:** 6-10 GitHub topics covering domain+stack, a custom social-preview image (≥640x320px, ideally 1280x640px, <1MB).
**Why:** Multiple 2026 sources converge on this as the baseline for a repo's public identity/discoverability — explicitly a growth/discovery concern that a private repo gains nothing from.
**Revisit:** GitHub changes how topics feed search/AI discoverability; owner decides private client repos should also get consistent branding for internal handoff.

## 2.10 code-conventions

#### T71 — TypeScript on every project, no plain JavaScript `constant` `node`
**Practice:** Every project — app code, scripts, config files where the tool supports it — is TypeScript. No `.js` source files by default; `tsconfig.json` with `strict: true`.
**Why:** Owner's settled taste; matches the shared-Zod-schema discipline elsewhere in the catalog (T18/T19), which depends on TypeScript inference to be worth the runtime validation.
**Revisit:** A specific tool in the stack has no meaningful TypeScript story (rare, and should be named explicitly when it happens, not used to quietly erode the default).

#### T74 — Naming conventions: kebab-case files, camelCase variables `constant` `node`
**Practice:** File and directory names are kebab-case (`user-profile.tsx`, `lib/db-client.ts`). Variables, functions, and object keys are camelCase (`userProfile`, `fetchUserById`). Component names stay PascalCase per React convention (that's not in tension with kebab-case filenames).
**Why:** Owner's settled taste; consistent, greppable naming across every project instead of each repo drifting to whatever its bootstrap tool defaulted to.
**Revisit:** N/A — stable convention, no external dependency to outgrow.

#### T75 — Language discipline: all technical artifacts in English `constant` `any`
**Practice:** Code, comments, commit messages, config files (including `.env.example`), docs, and ADRs are English, unconditionally — regardless of the product's UI language or locale (i18n is a separate concern, see T59/T69). Comments explain *why* — a constraint, a rejected alternative, a prevented bug — never the obvious *what*; a stale comment is worse than none.
**Why:** Owner's settled taste, stated explicitly for chat vs. technical text. The audit found Ukrainian comments in miss_zakarpattia's `.env.example` — a concrete instance of this rule being worth stating rather than assumed.
**Revisit:** N/A — foundational discipline, not a technology choice that ages.

#### T78 — Money as integers `conditional` `any`
**Condition:** Weak preference, not a strict rule — apply when it doesn't fight the domain or an external API's own representation.
**Practice:** Represent monetary amounts as integers (smallest currency unit, e.g. cents) rather than floats, when the project's own data model and any payment-provider API it talks to both support it cleanly.
**Why:** Avoids float rounding error by construction; owner holds this as a real but weak preference, not something to force against a provider's own float-based API.
**Revisit:** A specific integration's own data model makes integer cents awkward enough that a documented exception is clearly the better call.
