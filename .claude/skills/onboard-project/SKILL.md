---
name: onboard-project
description: Bring the kit to a project that already exists — read the code, draft what the product is for, ask only what the code cannot answer, and report where the repository differs from the kit's practices. Invoke after `kit setup` on an existing codebase, for "onboard this project", "підключи кіт", or when the profile's PRODUCT_GOALS is still unanswered in a repository that has real code.
---

# Onboard an existing project

Bootstrap's mirror image. There is no interview to build a product from — the product is
already there, and most of what a bootstrap would ask is answerable by reading. The job is
to arrive without wrecking anything, understand what this thing is for, and say plainly
where it and the kit disagree.

**The one rule that outranks the rest: onboarding does not rewrite the project it was
invited into.** Everything expensive leaves as an issue. Code changes go through
`/work-issue` afterwards, where the guards, the design cycle and the review apply. A tool
that reformats a repository on first contact is a tool nobody runs a second time.

## 0. If `kit setup` refused, decide what the kit may replace

An existing project usually already has skills and agents, and some will share a name with
the kit's. The run refuses rather than overwriting, and the choice is **per item**:

- `--adopt` takes the kit's version and parks theirs as `<name>.pre-kit`;
- `--keep` leaves theirs in place — and the kit then never updates it, which is why the
  decision is recorded in the manifest and repeated by `kit doctor` on every run;
- `--keep a,b --adopt` mixes the two, which is what a real project usually needs.

**This is a question for the owner, not a judgement call.** Read both versions before
asking: an agent of the same name may simply be an older copy of the kit's, in which case
adopting loses nothing — or it may be the one somebody tuned for this project, in which
case replacing it silently is exactly the harm the refusal exists to prevent. Say which you
found, then ask.

## 1. Reconnaissance

`codebase-scout`, read-only, several in parallel on different angles when the repository is
large: what the stack is, where things live, how data flows, what is already enforced
(hooks, CI, lint rules), what conventions the code actually follows as opposed to what its
documentation claims. Facts with `file:line` citations, no recommendations.

Read the git history too, and treat it as evidence rather than trivia: commit message
shape, branch names, whether releases exist, whether tests arrived with features or after
them. History says what a team does; documentation says what it meant to do.

## 2. Draft what this product is for

`PRODUCT_GOALS` is the one profile value no repository can be trusted to state and no
detector can guess, and the design critic argues against it in every later cycle — so a
vague draft here degrades every design decision this project will ever make.

Draft it from evidence: the README's own claim, the domain models, the route and screen
names, what the tests assert is important, who the deploy targets. Then **check the draft
against the code and say where they disagree.** A README promising a marketplace over a
codebase with one seller and no payments is the most useful thing you will find all run —
raise it, do not smooth it over. Contradictions between stated and actual purpose are
exactly what nobody in the project can see any more.

## 3. The gap report

Compare what the repository does against `.kit/kit/tastes/catalog.md`, and report **only
what you found violated**. Silence means compliant.

**First, check whether the catalog already knows this repository.** Grep the catalog for
this project's name. A catalog built from evidence cites the projects it was drawn from,
and if this is one of them, a large part of what you are about to "find" is what its
authors already knew when they wrote the rationale. That does not make the findings wrong,
but it makes them confirmation rather than discovery — and a hand-off that does not say so
reads as more novel than it is. On the first real run of this skill, 17 of 81 entries cited
the very repository being onboarded, and it was noticed by accident.

Both halves matter. Constants are **in scope** — a repository that never used conventional
commits or hardcodes every user-facing string fails constants, not conditionals, and those
are the violations most likely to exist in code written before the kit arrived. But listing
every entry would produce an eighty-row wall on first contact, and a report nobody reads
catches nothing.

**Check the scope first, but do not stop there.** Scope is a cheap first pass — a `next`
entry in a Python service is *absent*, not violated and not complied with. It will not
filter much: a dry run against a real repository found scope excluding barely a tenth of
the catalog, because most entries are in scope and the work is in judging them. Several
entries also carry a precondition narrower than their scope can express — "once the API has
an external consumer", "once shadcn is adopted". Read the entry's own **Practice** for that
precondition; an entry whose precondition does not hold is absent for the same reason a
mis-scoped one is.

Sort every finding into exactly one of **four** buckets, and put the bucket in the report,
because the bucket is the decision:

- **adopt now** — cheap, safe, no behaviour change: a README section, a `.gitignore` entry,
  conventional commits from this point on, a repo description. Do these in this change.
- **file as an issue** — real work with real risk: a package manager swap, extracting
  hardcoded strings, flat repository to workspace, adding a test layer that does not exist.
  One `/create-issue` per coherent migration, each carrying the taste id and what the
  repository does today. These do **not** become edits.
- **accept, with the reason** — this project's way stays. Four different things land here
  and the reason must say which: it is *better* than the catalog's answer; the catalog's
  **premise does not hold** in this environment (its rationale assumes a cost, a platform
  or a constraint this project does not have — different from "better", because the entry
  may be right everywhere else); it is *fine* for this project's shape; or it is *blocked
  by something outside the project's control* — a plan tier, a platform limit, a client
  constraint. All four are deviations; only the last is not a choice.

  **The first two are promotion proposals, and saying so is the step people skip.** Write
  them into `.claude/tastes.md` under Inventions as well as Deviations, in the shape a
  catalog entry takes, so `kit tastes promote` can see them. A deviation that beats the
  catalog and stays filed as a deviation teaches the catalog nothing.
- **cannot verify from code** — split this one when you report it, because the two halves
  need different people:
  - **outside the repository** — a hosting dashboard setting, a channel someone posts to, a
    habit. Someone has to open a settings page.
  - **evidence present but incomplete** — a dependency installed but not obviously used, a
    design decision whose motivating constraint was never written down. Someone has to
    write down a reason they already hold.

  **Neither may be silently omitted.** Silence means compliant everywhere else in this
  report, so an unverifiable entry left out reads as a pass it never earned. Each becomes a
  question for step 4, or a stated limit of this onboarding.

Two shapes that break the sort, and what to do:

- **An entry bundling several practices** gets split and each half judged separately, rather
  than forced into one bucket. A single verdict on a bundle hides whichever half disagrees.
- **Several entries that are only meaningfully judged together** go the other way: when one
  entry's mechanism is inert until another is adopted, they are one migration and one issue,
  however many ids they carry. Splitting a causal chain into separate issues files work
  nobody can start.
- **An entry whose evidence is partial** — a dependency installed but not obviously used —
  is `cannot verify from code`, not a pass. "Present" is not "in use".
- **An entry whose precondition lives in its `Why` rather than a `Condition` field** still
  has a precondition. A `constant` can be inapplicable: read the rationale, not just the
  labelled fields. Several entries on the first real run were absent-by-precondition, and
  scope alone would not have caught one of them.

A gap report with nothing in "accept" on a mature repository is a report that did not look
hard enough. Existing projects have reasons; the catalog is defaults, not verdicts.

## 4. Ask — once, for everything the previous steps could not settle

The questions come **after** the reading and the comparison, not before, and they come in
**one round**. Asked first, they are guesses about what will matter; asked last, they are
exactly the list of things nobody could work out. A dry run against a real repository
produced eight catalog entries that no amount of reading could settle — a hosting dashboard
setting, a chat channel, a habit — and they had nowhere to go because the questions had
already been collected.

The standing rule applies at full force: obvious questions are not questions. Do not ask
what stack this is, whether it has tests, or how it deploys — that was step 1.

What genuinely has to be asked:

- **Who this is for**, when the code serves several audiences and the priority between them
  is a decision rather than a fact.
- **What success looks like**, when nothing in the repository measures anything.
- **What is deliberately out of scope** — an absent feature and a rejected feature look
  identical in a codebase, and the difference decides whether adding it is progress.
- **Commercial or personal**, when the repository does not say. It decides whether releases
  need an announcement to someone outside the team.
- **Every contradiction step 2 found** between what the documentation claims and what the
  code does.
- **Every in-scope `open-question` in the catalog**, using its own `Ask:` line rather than
  your paraphrase of a question someone already sharpened.
- **Everything the gap report filed as `cannot verify from code`** that a person could
  answer in a sentence.

Write the answers **verbatim** into the file the profile's `CONSTRAINTS` key names, in that
file's own shape: an id, the date, the owner's words, and the knock-ons. A paraphrase held
only in the session is a constraint the next design cycle will not have.

If nobody is available to answer, continue — but every later "the owner decided" carries a
proxy-owner asterisk, and that belongs at the top of the constraints file and in the
hand-off, not in a reader's assumption.

## 5. Record

- **Answers** to `open-question` entries, and **deviations** with their reasons, into
  `.claude/tastes.md`. A deviation carries the taste id, the fingerprint of the entry as it
  reads today, what this project does instead, and why the rationale did not hold. Never
  retype a hash — a mistyped one warns forever and means nothing. For a handful of entries
  `kit tastes show <id>` prints the whole line to paste; for a report carrying a dozen
  deviations, `kit tastes list` prints every id with its fingerprint in one pass, which is
  the difference between a rule people follow and a rule they abandon halfway down the
  table.
- **`PRODUCT_GOALS`** and the testing policy keys into the profile. `UNIT_REQUIRED_FOR`,
  `INTEGRATION_REQUIRED_FOR`, `E2E_REQUIRED_FOR` and `DO_NOT_TEST` describe *what* is worth
  covering here — the risk-based policy the catalog carries instead of a coverage
  percentage. What deliberately stays untested is part of the strategy and belongs in the
  profile, not in an omission.
- **Risk paths and symbols** — `HIGH_RISK_PATHS`, `MONEY_SYMBOLS`, `SECURITY_SYMBOLS` — from
  what the scout actually found, not from the template's defaults.
- **`READINESS`** at what is true today, which for an existing project is usually
  `implementation` or higher. It is a claim doctor holds you to.

Then run `kit doctor` until it exits clean. Its failures are the remaining checklist.

## 6. Hand off

Report, in this order:

- what this product is for, in the draft you are leaving behind, and any contradiction
  between its documentation and its code — and when there is none, say that too: a README
  whose every claim traces to real code is a finding, not an absence of one;
- **whether the catalog cites this repository**, and if so, roughly how much of the gap
  report is confirmation rather than discovery;
- the gap report's three buckets, with counts, and the issues you filed;
- what you changed in this run (it should be small) and what you deliberately did not;
- accepted risks and open questions nobody answered, each with the assumption you proceeded
  under.

Strategic questions arrive here as proposals with trade-offs. This is the checkpoint they
were saved for.

## Grounded and not

- **Grounded:** the scout's facts and citations, `kit doctor` exiting clean, the issues
  filed, which taste entries a command can show are violated (commit message shape, a
  missing README, an absent test layer).
- **Judgement:** what the product is for, which bucket a gap belongs in, whether a deviation
  is better than the catalog's answer. These are proposals with reasons — never silent
  decisions, and never silent compliance either.
