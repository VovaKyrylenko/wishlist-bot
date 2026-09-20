# The lens catalog

A lens is a named attack angle for the design cycle: one way a change can be wrong that
a general pass tends to miss. The catalog exists because the kit serves radically
different products — a CLI library, a storefront, a landing page — and each cares about
different failure classes (owner decision, constraint C5).

Three levels keep a wide catalog from becoming a wide bill:

1. **Catalog** (this file) — every lens the kit knows, engine-side, loaded only when the
   design phase runs.
2. **Profile** — the `LENSES` key in `.claude/kit.md` declares which lenses exist for
   *this product* and the runner script that grounds each. A lens absent from the
   profile is never activated. A project-specific lens the catalog lacks goes in
   `.claude/lenses.md`, same block format as below; it is validated by the same doctor
   check and activated the same way.
3. **Triage** — per task, `issue-triage` activates the profile lenses whose Trigger
   fires, capped by `MAX_ACTIVE_LENSES`. How lens passes then run is defined in
   `design-phase.md` (Step L).

Rules that keep it honest:

- **Findings obey the evidence rules of `design-artifacts.md`** — nothing here restates
  them. A lens finding is an objection log entry tagged `lens: <id>`; the log's state
  machine is the same for every lens.
- **Grounding gates the strength of a claim.** A lens whose profile entry names a
  script (`a11y=a11y-audit`) is expected to run it or cite its output. A lens with no
  script may only propose `manual:` acceptance criteria, and its unverifiable claims
  end as `accepted-risk`, never `verified` — visible in residual risks instead of
  hidden in confident prose.
- **The catalog governs activation, not attention.** An adversary that notices a
  problem outside every active lens still records it, tagged with an ad-hoc lens name.
  Live runs produced exactly such findings before this catalog existed.
- **Every lens must pay for itself.** A lens that fires across runs without a single
  finding surviving to a terminal state is a deletion candidate for the profile — the
  journal is the evidence.
- Three always-on angles are deliberately **not** in this catalog, because they already
  run unconditionally elsewhere: product value (the design adversary argues product
  first, against `PRODUCT_GOALS`), design conformance (the "Design conformance" item of
  /review-diff), and observability (the "New surfaces are watched surfaces" item of
  /review-diff). Listing them here would duplicate policy.

Each lens below carries three required fields. Doctor fails a block that lacks one.

- **Attack** — the question this lens tries to answer destructively.
- **Trigger** — when triage may activate it. Triggers that name profile keys (in
  backticks) fire when the task matches that key.
- **Evidence** — what a grounded finding looks like; anything weaker lands as
  `accepted-risk` or a `manual:` criterion.

## Product and business

### conversion-funnel
- **Attack:** Where in this flow does the user give up? How many steps stand between
  intent and value, and which one is new?
- **Trigger:** a change to a public-facing flow where drop-off costs the product —
  signup, checkout, onboarding, any funnel named in `PRODUCT_GOALS`.
- **Evidence:** the step sequence before and after, with the friction points named;
  analytics for the existing funnel where available. Without data: the added steps
  listed as an `accepted-risk` with the assumption stated.

### growth-acquisition
- **Attack:** How does anyone find out this exists? Does the change move a retention or
  bounce metric anyone watches?
- **Trigger:** a new public page, entry point, or shareable surface.
- **Evidence:** the named metric and the event that measures it; a check that the
  event actually fires on the new surface.

### seo-discoverability
- **Attack:** Is it indexable? Does the change break URLs, metadata, or rendering that
  current rankings depend on?
- **Trigger:** changed public URLs, routing, meta tags, or a rendering-mode change on
  public pages.
- **Evidence:** a crawler or audit command's output; 301s covering every moved URL;
  canonical and structured data verified on the rendered page, not in the source.

### money-correctness
- **Attack:** Where does rounding lie? Who pays twice on a retry, and who pays zero on
  a race?
- **Trigger:** any match on `MONEY_SYMBOLS`.
- **Evidence:** amounts shown to stay in minor units end to end; an idempotency claim
  exercised by actually repeating the operation and quoting both results.

### legal-compliance
- **Attack:** What does this change collect, disclose, or license — and under whose
  rules? Consent, retention, and jurisdiction included.
- **Trigger:** new personal data, a new third-party processor, tracking, or content
  with licensing terms.
- **Evidence:** the specific regulation or license clause cited. What cannot be
  verified by citation escalates to the owner — an agent does not rule on legality.

### content-copy
- **Attack:** Does the text tell the user the truth, in the product's one voice? Will
  it survive translation?
- **Trigger:** new or changed user-facing strings.
- **Evidence:** the tone or terminology rule in `DESIGN_DOCS` it conforms to; for
  localised products, a check that no new string is hardcoded outside the i18n path.

### analytics-measurability
- **Attack:** How will anyone know this feature worked? If the success metric does not
  exist, the feature ships unfalsifiable.
- **Trigger:** any new feature justified by an expected behaviour change.
- **Evidence:** a criterion of the form "done when event X is visible in analytics",
  with the emitting call sited at file:line — or a `manual:` line naming where the
  observation will be recorded.

## User experience

### ux-flows
- **Attack:** Does every state exist? Empty, loading, error, double submit, back
  button, mid-flow refresh.
- **Trigger:** a new screen or interaction, or a changed navigation path.
- **Evidence:** the state list, and each state actually driven at runtime via
  /verify-change — a state that was never rendered is a claim, not a state.

### a11y
- **Attack:** Keyboard only, screen reader, contrast, focus order — which of these
  does the change break or forget?
- **Trigger:** any new interactive surface or visual component.
- **Evidence:** the grounding command's report (axe, pa11y or equivalent) on the
  changed surface; a keyboard-only walk recorded as a `manual:` criterion.

### responsive-touch
- **Attack:** What does this look like at 360px, and what happens under a finger
  instead of a cursor?
- **Trigger:** layout changes, new breakpoint-sensitive components, hover-dependent
  interactions.
- **Evidence:** the changed surface driven in a mobile viewport, captured in the
  verification artifact.

### perceived-performance
- **Attack:** What does the user see in the first two seconds? What jank did this
  change add?
- **Trigger:** new pages, heavy assets, added client-side dependencies on hot paths.
- **Evidence:** a measured number against a budget — bundle size, LCP, or the
  project's own performance command. A number, not an adjective.

### offline-degraded
- **Attack:** What happens when the network drops mid-action? Is half-done state
  recoverable?
- **Trigger:** long-running user actions, PWA or mobile contexts, anything advertised
  as offline-capable.
- **Evidence:** the interruption actually reproduced — connection cut at the decisive
  point — with the observed outcome quoted.

### i18n-locale
- **Attack:** Whose timezone, whose currency format, whose alphabet? What does a
  40-character German label do to this layout?
- **Trigger:** products with more than one locale in scope; any date, number or
  currency formatting in the change.
- **Evidence:** a counterexample driven under a concrete non-default locale; a
  measured live run found silent data loss under a legacy locale this way.

## Engineering

### security
- **Attack:** Who can call this without the right? What happens to input crafted to
  not be data?
- **Trigger:** any match on `SECURITY_SYMBOLS`; any new endpoint, permission check, or
  input surface.
- **Evidence:** a reproduced bypass or injection attempt with its output, or the
  grounding scanner's report. The review-stage line-by-line read still applies; this
  lens attacks the design before the code exists.

### privacy-data
- **Attack:** Which personal data flows into logs, analytics, or third parties that
  did not flow there before?
- **Trigger:** new data fields, new logging, new outbound integrations.
- **Evidence:** a search over the changed code's log and network calls for the named
  fields, with the hits (or their absence) quoted.

### data-migrations
- **Attack:** Is the rollback real? What happens to rows written by the old code while
  the deploy is in flight?
- **Trigger:** any schema change; any match on `DESTRUCTIVE_SQL`.
- **Evidence:** the migration run forward and back on a copy, output quoted;
  additive-only claims checked against the actual DDL.

### api-compat
- **Attack:** Which existing caller breaks? Is this change observable in any public
  contract — wire format, CLI flags, exported symbols?
- **Trigger:** changes to a public API, a serialization format, or a CLI surface.
- **Evidence:** the contract diff, the semver consequence stated, and the contract
  test that fails on the break.

### backend-performance
- **Attack:** What does this cost at 10x current load? Where is the query that runs
  once per item?
- **Trigger:** new database queries, loops over collections of unbounded size, new
  hot-path allocations.
- **Evidence:** an EXPLAIN or a measured benchmark, before and after, numbers quoted.

### reliability-failure
- **Attack:** Timeout, retry, partial failure, duplicate delivery — which of these
  turns this change into corruption or loss?
- **Trigger:** calls to external services, queues, background jobs, anything with a
  network hop inside a transaction.
- **Evidence:** the failure actually injected — process killed, dependency stubbed to
  fail — with the observed behaviour quoted. A measured live run found 99.3% silent
  data loss with exactly this method.

### concurrency
- **Attack:** Two users, two tabs, two processes — same instant. What breaks:
  uniqueness, a counter, an invariant?
- **Trigger:** shared mutable state, counters, uniqueness rules enforced in
  application code.
- **Evidence:** a reproduced race, or the constraint moved to where races cannot reach
  it (a database constraint), cited at file:line.

### dependencies
- **Attack:** Is this dependency worth its maintenance liability? What does the
  project inherit — license, transitive surface, upgrade cadence?
- **Trigger:** any new runtime or build dependency.
- **Evidence:** the do-it-ourselves alternative argued in one paragraph; last release
  date and license quoted. "We might need it" loses to "add it when we do".

### testability
- **Attack:** Can the thing that checks this change actually fail? A guard nobody has
  seen red is decoration.
- **Trigger:** any new test, guard, lint rule, or CI gate introduced by the change.
- **Evidence:** the negative fixture — the violation written, the check observed
  failing on it, then the fixture removed or kept as a test.

### ops-rollout
- **Attack:** How is this turned off without a deploy? Who finds out first when it
  misbehaves — a dashboard or a customer?
- **Trigger:** any match on `HIGH_RISK_PATHS`; releases that change behaviour for all
  users at once.
- **Evidence:** the kill switch or flag named and toggled once in a non-production
  environment; the rollback path stated in the PR body.

### infra-cost
- **Attack:** What does this cost per month at realistic traffic — and who approved
  that number?
- **Trigger:** new services, storage, queues, third-party metered APIs.
- **Evidence:** an estimate from current published prices, searched not recalled, with
  the arithmetic shown.
