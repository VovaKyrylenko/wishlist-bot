---
name: bootstrap-project
description: Turn an empty directory or a bare idea into a working, guarded project — interview, stack choice, scaffold, tooling, git and CI setup, releases, hosting options. Invoke for "new project", "start a project", "почни проєкт", or an empty repository.
---

# Bootstrap a project

Order matters: decisions first, scaffold second, enforcement before the first feature.
The goal is a repository where the rules are already load-bearing on day one, not a TODO
list of good intentions.

## 1. Interview — short, and written down

Ask, do not assume: what is this for and for whom; what does success look like;
constraints that are real (budget, deadline, platforms, team size). The answers become
`PRODUCT_GOALS` in the profile — the design critic will argue against them later, so
vagueness here costs quality forever. "Ship features" is not a goal.

**Four questions are not optional**, because each one silently decides architecture and
each was decided *by an agent* the first time this skill ran for real:

1. **The interaction model.** Who touches the artifact this product produces, and how — a
   snapshot one person sends and others read, something several people edit, or one
   person's private tool? Fragment-in-a-link and a shared server are not two
   implementations of one product; they are two products.
2. **The domain invariants.** The rules the product promises never to break, in the
   owner's words. Money exact to the minor unit, or rounded the way the local cash rules
   round? Timestamps in whose timezone? These define the core module's API, so deciding
   the stack before them inverts the dependency.
3. **Deployment and account constraints**, *with their knock-ons said out loud*: repository
   visibility, plan tier, where it may be hosted, what may not leave the machine. "Private
   repository" alone is a fact; "so the free static host everyone reaches for is
   unavailable, and so is branch protection on this plan" is the part that changes the
   answer.
4. **What is deliberately not in v1.** An explicit "not now" is a decision; an unasked
   question comes back as a blocker in the middle of the design cycle.

**Then ask the catalog's `open-question` entries that are in scope for this project** —
those are the questions the owner's own practices leave genuinely open, and bootstrap is
where they get answered. They are few by design; every other question the catalog has
already settled. Read them from `.kit/kit/tastes/catalog.md` and put each one's `Ask:` line
as written, rather than inventing your own phrasing for a question someone already
sharpened.

**Write the answers verbatim** into the file the profile's `CONSTRAINTS` key names, in the
shape that file describes: an id, the date, the owner's own words, the knock-ons. This is
the artifact the whole design cycle quotes; a paraphrase held only in the session is what
lost a constraint last time. Do not answer these four for the owner — every other question
in this skill you may decide yourself, and these are the ones you may not.

If the human explicitly delegates them anyway, the run continues, but two things are then
true and both belong at the top of the constraints file: every later "the owner decided"
carries a proxy-owner asterisk, and **the run is not evidence that this mechanism works** —
a constraint an agent wrote to answer an objection an agent raised has not been tested
against anybody's actual preferences. Say that in the hand-off report rather than leaving
the next reader to infer it.

## 2. Stack — proposed from the catalog, argued only where it does not fit

Read `.kit/kit/tastes/catalog.md`. It holds the owner's settled practices, each with the
reasoning behind it, and it exists so that a project does not re-derive answers its owner
made years ago. Re-running a full adversarial cycle to rediscover a preferred database is
the ceremony this catalog was written to end.

**Check each entry's scope before its kind.** Scope is an observable fact — is there a
package.json, is there a browser UI, is there a database — and an out-of-scope entry is
simply absent. It is not a deviation and never appears in a report. A `next` entry has
nothing to say to a Python service.

Then, for the in-scope entries:

- **`constant`** — apply it. No judgment is required and none should be performed; that is
  what the tier means.
- **`conditional`** — evaluate its stated condition against this project and record the
  answer. This is where the actual thinking lives.
- **`open-question`** — ask it in the interview above. These are the only questions the
  catalog forces.

**The design cycle runs when, and only when, the catalog does not fit.** An interview
answer that a taste's rationale cannot accommodate is a real disagreement and gets the full
protocol from `/work-issue`'s `references/design-phase.md`, scout skipped (there is no
codebase — the interview answers are the brief), objection log at `route: full` with
"bootstrap stack decision" as its why. Bootstrap's route blocks carry only route and why;
the research, autonomy and lens lines come from a triage verdict, and there is none here.

Every prompt in that cycle embeds the constraints file verbatim, starting with the
architect's. A candidate set built without them looks confident and can rest on something
the owner already ruled out.

- When the field is genuinely unfamiliar — a domain the catalog has no entry for — run
  `/research` first. The candidate set should rest on sources and dates, not on what the
  model happens to remember.
- `approach-architect`: two or three approaches that genuinely differ, with the catalog's
  answer as one of them so the incumbent is argued for rather than assumed.
- `design-adversary`: attacks against `PRODUCT_GOALS` and the interview constraints first.
- `design-arbiter` → the human picks → `/write-adr`.

**Silence in both directions is the failure.** Applying a taste whose rationale plainly does
not fit this project is as wrong as ignoring one that does; the catalog says so itself, and
neither leaves a trace anyone can review. When a taste does not fit, say which one, which
interview answer it collides with, and what you propose instead — then record it as a
deviation in `.claude/tastes.md`.

**You may propose that an entry belongs in a different tier; you may not move it.** An
agent quietly reading "always" as "usually" is indistinguishable, in the file, from the
owner deciding it. Proposals go in the hand-off.

## 3. Scaffold

Use the stack's own generator; never hand-roll what it does better. Then `git init`.

**The first commit lands on the default branch deliberately**: prefix it with
`KIT_ALLOW_PROTECTED_BRANCH=1` — an empty repository has nothing to protect yet, and
this is the one routine, legitimate use of that hatch. Everything after this commit goes
through feature branches; the guard enforces it.

**Keep that commit as small as the hatch it uses.** The generator's output and nothing
else — no profile, no rules, no workflows. Everything you author afterwards is work that
deserves a diff someone can read, and the first pull request of a project is the cheapest
one to review. A whole bootstrap landed directly on the default branch is a review that
never happened, on the commit that decides the shape of everything after it.

Create the remote (forge CLI) and push. Note honestly whether branch protection is
available on this plan; when it is not, the guards and CI are the protection.

**Read this project's own commit rules before you write its first commits** — the profile
and `CLAUDE.md` you just installed apply to you. The first live run failed CI on the
`[ci-change]` token that the guard it had installed minutes earlier requires, then spent a
force-push fixing it. Prefer a follow-up commit to an amend once a branch is pushed: a
force-push is invisible in review and costs a CI cycle to discover.

## 4. Tooling — the slots are fixed, the fillings are argued

The **base is non-negotiable**: slots for format, lint, typecheck, test and CI exist in
every project. Which tool fills each slot is a per-project decision, and it goes through
a short adversarial round (one `design-adversary` pass over your proposed set is enough —
this is a smaller decision than the stack):

**Its objections go into the same branch's log under `docs/design/objections/`**, with their own ids, and
they converge like any other; the log's `route:` block for this round says `route: lite`
with "bootstrap tooling round" as its why — it is the lite shape, one adversarial pass
over a bounded decision. This round has now been skipped in both live runs — once
recorded as a deviation, once not recorded at all — and a step whose absence leaves no
trace is a step that will keep being skipped. In the log, its absence is visible.

- One tool covering two slots beats two tools when it is good enough — a combined
  formatter-linter instead of a formatter plus a separate linter is often the right call.
- **Empty is a legitimate filling, argued and recorded** — a throwaway script may not
  earn a linter. The profile then says `none` on purpose, which is different from
  forgetting: doctor treats `none` as a decision and `NEEDS_CONFIGURATION` as debt.
- The same discipline for libraries: every dependency is a maintenance liability someone
  argued for. "We might need it" loses to "add it when we do"; a base the project will
  certainly need (validation, data access, testing) goes in now, speculation does not.

**The tooling has to actually implement the decision record.** A scaffold arrives with its
own defaults, and they are rarely the tools the record named — the first live run chose
its stack with a criterion requiring an ESLint rule, kept the generator's different
linter, and nobody compared the two. For every acceptance criterion the record states as a
mechanism (a lint rule, a coverage threshold, a type-level guarantee):

- name the command that enforces it, and put that command in the criterion's `check:`;
- **prove it can fail** — write the violation the rule exists to catch, watch the command
  reject it, then delete the fixture (or keep it as a test, which is better);
- if the shipped tool cannot express the mechanism, either swap the tool or amend the
  record. What you may not do is leave the record naming one thing and the repository
  doing another, because everything downstream trusts the record.

A rule nobody has seen fail is a rule nobody has tested, and boundary rules fail silently
in exactly one direction: the direction where they permit everything.

Whatever wins: exposed as **runner scripts** so the profile can name them and CI can
call the same names.
- **Coverage is decided by risk, not by a percentage.** Fill the profile's
  `UNIT_REQUIRED_FOR`, `INTEGRATION_REQUIRED_FOR`, `E2E_REQUIRED_FOR` and `DO_NOT_TEST`
  from what this product can actually lose, taking the risk classes from the profile's own
  trigger keys rather than restating them here. A single global number says nothing about
  which half of the code it covered, and it is met most cheaply by testing the half that
  did not need it. What deliberately stays untested is part of the strategy and belongs in
  the profile, where the review can see it.
- Git hooks: `kit init` installs `.githooks/` (pre-commit runs typecheck+lint, pre-push
  runs tests) and points `core.hooksPath` at it — these catch **human** commits, which
  the Claude-level guards never see.
- CI: create the pipeline invoking the same script names. Then **re-run `kit init`** —
  the CI anti-gaming guard and the release workflow are installed only once CI exists,
  and init is idempotent.

## 4b. The design plan — before the first feature, not after the tenth

Author `docs/design/ui.md` and `docs/design/backend.md` from the interview and the stack
decision. **Decisions, not descriptions**: the primitive set to build from, interaction
principles (the smallest interaction that answers one question; every state exists),
layout tokens and where they live; module boundaries, error-handling policy, where logic
runs. One line of *why* per decision.

These files are load-bearing, not aspirational: `/work-issue` reads them at planning,
the design adversary attacks proposals against them, and `/review-diff` fails a diff
that diverges without updating them in the same change. Write only what is actually
decided — an empty section is honest, a speculative one becomes a lie the review then
enforces.

## 5. Profile and doctor

`kit setup` — init, vendor and doctor in one, ending by naming what to run next. The
engine is copied into the project and pinned to a ref (ADR 0008), and `.kit/` plus the
vendored `.claude/` go into the same commit as the tooling. A project whose engine is not
committed is a project whose guards do not exist for anyone who clones it, which is the
failure the vendored model was adopted to remove.

**Pin to a ref a clone can resolve.** `--source <a URL> --ref <a branch or tag>`. Vendoring
from a local checkout records that machine's absolute path and `working-tree`, which
resolves nowhere else — and then the whole point of vendoring holds only on the laptop it
was set up on.

**When a name collides, the run refuses and asks you to choose.** A scaffold or a template
may already have brought a skill or agent of a name the kit also uses. Three modes, and the
choice is per item, not per project:

- `--adopt` — take the kit's version; theirs moves aside to `<name>.pre-kit`, and
  `kit unvendor` puts it back.
- `--keep` — theirs stays; the kit never installs its own version, **and never updates it
  either**. That cost is the reason the choice is recorded in the manifest rather than
  taken on trust: `kit doctor` names every kept item on every run.
- `--keep a,b --adopt` — mix. This is the common shape on a real project: the kit's agents
  are worth taking, and one or two skills carry something local that is not ready to lose.

Ask before choosing. A skill somebody wrote for this project is not obviously worse than
the kit's, and replacing it silently is the failure the refusal exists to prevent.

Then fill what detection cannot know: `PRODUCT_GOALS`, the testing policy
(`UNIT_REQUIRED_FOR` / `E2E_REQUIRED_FOR` / `DO_NOT_TEST` — what deliberately stays
untested is part of the strategy), domain risk paths and symbols. Run `kit doctor`
until it exits clean; its failures are the setup checklist.

Write `.claude/tastes.md` in the same commit: the answers to the catalog's in-scope
`open-question` entries, any deviation you made and why the taste's rationale did not hold
here, and anything this project does that the catalog has no entry for. That last section
is how the catalog learns — an approach invented here and reused on two more projects has
earned an entry, and nothing will notice it unless it was written down the first time.

`READINESS` starts at `bootstrap` and is a claim doctor holds you to, so move it only when
the thing it claims is true: `implementation` once tests exist, `deployment` once
something can deploy, `production` when real people depend on it. It gates nothing — a
`bootstrap` project still releases, because releasing early is how the release machinery
gets tested at all — but it is what makes "ready" mean something later, and it belongs in
the hand-off report rather than in a reader's assumption.

Re-run `kit init` after anything detection reads changes — adding CI is the usual one. The
profile is the single source of truth only while it is true.

## 6. Releases and versioning

The release workflow computes semver from conventional commits on every merge to the
default branch — `feat:` bumps minor, a `!` or `BREAKING CHANGE` bumps major, the rest
patch — tags, and publishes a release with generated notes. Squash-merge makes the PR
title the commit, the commit the release line; that is why titles must be conventional.
No changeset files: the commits already carry the information, and a second place to
declare a version is a second place for it to be wrong. A project that publishes
independent packages is the exception, and the catalog says so under its own entry.

**The announcement is part of the release, not an extension of it** — that is the
owner's own practice, and the catalog carries it. The bar it has to meet:
**user-facing and grounded in the actual diff** — name the screens that changed, one
block per change, walkthrough tone, zero marketing clichés, and skip the announcement
entirely when nothing user-facing changed. Route-derived links so a reader can go
straight to what moved. Give it a dry-run command that prints exactly what will be sent
and run it in the pull request, because an announcement is otherwise an artifact that
exists only at release time and nobody reviews until the audience already has it.

Where it is sent is an `open-question` — a commercial project usually has a client
channel, a personal one usually has nobody to notify. Ask, do not assume.

## 7. Hosting

The catalog carries a default platform for projects in its scope, with the reasoning; use
it unless something in the interview collides with that reasoning — a data-residency
constraint, a budget, a runtime the platform does not host. Then it is a real
disagreement, and it goes through the cycle like any other.

When you do compare: **search for current pricing, never recall it.** Prices move, and a
confidently wrong number is worse than an admitted gap. Present two or three options
matched to the stack and the interview's budget, with a recommendation and why. Deploying
is the owner's decision, not a default.

## 7b. Prove it runs

Before the pull request, run `/verify-change` and leave the artifact in
`docs/verification/`. Neither live run produced one, and both reported success from a
green pipeline — which is the specific substitution this kit exists to prevent: a passing
suite is evidence that the tests pass, and the claim being made is that the thing works.
For a bootstrap the surface is small and so is the evidence: the CLI or the dev server
started, the one command a stranger would run, the output pasted.

## 8. Hand off

Report: decisions made (and their ADRs), what is now enforced by a program, what remains
discipline, the readiness state you are leaving behind, and the one-line commands to run
the project. Strategic questions arrive here as proposals with trade-offs — this is the
checkpoint they were saved for.

Run `kit journal` and keep its output with the run. It is the only record of what the
bootstrap actually cost — which agents ran, on which model, for how many tokens, and how
long each step took — and none of that is recoverable once the session is gone. A process
nobody can measure is a process nobody can improve; the first live run of this skill had
to be reconstructed by hand from transcripts because there was no such record.

Then take the first real task through the normal flow — on a branch.

## Grounded and not

- **Grounded:** the scaffold builds, doctor exits clean, the hooks fire, CI runs, the
  first release tags. Each is a command with observable output.
- **Judgement:** the stack, the coverage number, the hosting pick, the testing policy.
  These are the owner's calls — propose with reasons, never silently decide.
