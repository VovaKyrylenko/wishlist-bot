---
name: research
description: Investigate a non-trivial question with web research — libraries, integrations, practices, new approaches. Invoke before adopting a dependency or an external service, when several approaches compete, or when asked to "дослідь", "research", "compare", "how do others do this". Produces a verdicts report with sources and dates, not a summary of vibes.
---

# Research

Research exists to change a decision. Name the decision first — "we will pick X or Y for
Z by criteria C" — and if no decision depends on the answer, stop: reading articles
without a decision attached is procrastination with citations.

## Method

**1. Sharpen the question.** One sentence, plus the 2-4 criteria that will actually
decide it (cost ceiling, maintenance burden, exit cost, must-run-locally…). Criteria
come from `PRODUCT_GOALS` and the project's constraints, not from the article you read
first.

**2. Sweep from several angles, in parallel.** Read-only research parallelises safely.
Give each angle a *different* search strategy — official docs; the GitHub issue tracker
(not the README); practitioner writeups; "X vs Y" comparisons; "X problems / migration
away from X". Angles that overlap waste both.

**3. Write findings to a file as you go** — `docs/research/<topic>.md`, first version
after the first few substantive findings, updated continuously. A crash, a sleep or a
limit must not destroy the work; a report that exists only at the end exists only if
the end is reached.

## Source hygiene — the part that separates research from search

- **Date every claim.** In this field a 14-month-old post describes a different product.
  Flag anything old enough to doubt, and say so in the report.
- **Trust order:** official docs and changelogs → the code and its tests → the issue
  tracker → independent practitioners with reproductions → vendor blogs → SEO listicles,
  which rank first and are worth nearest nothing. Most "best X in <year>" pages are
  machine-written filler; if a page has no failure modes and no numbers, it was not
  written by someone who used the thing.
- **Stars measure virality, not health.** A repository with 12k stars whose entire
  history is one day, a year ago, is dead. Read instead: last commit, the ratio of open
  issues to activity, whether maintainers answer, release cadence, download counts.
- **Vendor benchmarks are marketing until independently reproduced.** The same system
  has scored 58% and 84% on the same benchmark depending on who ran it. When a number is
  load-bearing, find who besides the vendor measured it — or measure it yourself.
- **Verify load-bearing claims against primary sources.** Fetch the doc, read the issue,
  check the changelog. An article's paraphrase of a limitation is a rumour about a fact
  that is one click away.

**4. Spike when it is cheap.** Twenty lines in a temp directory answer questions three
articles argue about. "It does not build against our stack" is a finding no amount of
reading produces.

## For integrations and paid services, additionally

- **Pricing cliffs**, not the entry price: the jump after the free tier is the real
  cost. A generous free tier followed by a $125/month floor is a trap for exactly your
  size of project.
- **Exit cost**: data export, protocol lock-in, how much code touches their SDK.
  Adoption is reversible in proportion to what leaving costs.
- **Deprecation record**: has this vendor already sunset a self-host path or an API
  version? Past behaviour is the only forecast worth having.
- **The boring essentials**: auth model, rate limits, data residency, what happens when
  they are down and whether your feature degrades or dies.

## Report — verdicts, not summaries

Every option gets exactly one verdict, and the criteria from step 1 decide it:

- **STEAL** — adopt, and what to adopt first;
- **INTERESTING BUT HEAVY** — real value, cost not justified *here*; name what would
  change that;
- **HYPE, SKIP** — and the evidence that earned the label.

Then: a recommendation with reasons, sources with dates for every claim, an explicit
freshness warning, and **what was not investigated** — a completeness claim is
unverifiable prose, a named gap is information.

If the research settles a decision that constrains future work, record it with
`/write-adr` citing the report. The report is the evidence; the ADR is the decision.

## Grounded and not

- **Grounded:** quotes, dates, version numbers, issue links, download counts, spike
  results. Another person can follow every citation.
- **Judgement:** the verdicts and the recommendation — which is why each must name the
  criterion it rests on, so it can be disagreed with rather than merely trusted.
