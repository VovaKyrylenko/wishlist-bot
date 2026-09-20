# The design phase — orchestration protocol

The detail behind step 4 of `/work-issue`: a multi-agent cycle that runs **before** any
code. You are the **orchestrator**. You do not argue and you do not judge; you launch
roles as subagents, pass structured artifacts between them, and apply the stop rules.

Each role runs in **fresh context**. That is the point, not an implementation detail: a
critic that has watched the approach being defended has already absorbed the defence, and
a defender that wrote the code cannot read the diff without wanting it to be right. None
of these agents can edit files. You write the code, after the decision.

This file is loaded only when the design phase actually runs. Skip it for trivial work —
the triage step exists to say so.

The structures passed between the steps below — Constraints, Objection Log, Round Delta,
Decision Record — are specified in `design-artifacts.md`, next to this file. Read it
before running the cycle; the rules that keep the cycle honest live in the artifacts, not
in the personalities of the agents.

**Every prompt you send in this cycle starts with one line naming the role:**

```
ROLE: design-adversary
```

It costs a line and it is the only way the run can be measured afterwards — the transcript
records the model, the tokens and the timings, but nothing anywhere records what an agent
*was*. Without the line, `kit journal` has to guess from the prompt text, and in the first
rehearsal of this cycle it guessed wrong twice out of five, filing an adversary under
`approach-architect` because the prompt said "candidate" more often than it said its own
name.

## Step C — Constraints

Read the file the profile's `CONSTRAINTS` key names. **Every prompt in this cycle embeds
it verbatim**, under a heading that says agents may not change it.

There is no step where you summarise it. The orchestrator's paraphrase is where a
constraint gets lost, and it is lost silently: the architect cannot miss what it never
saw, so the candidate set comes back confident and built on something the owner already
ruled out.

If the file does not exist, the interview did not happen or was not written down. Stop and
write it — with the owner, not for them.

## Step T — Triage

Run `issue-triage` with the task. If the profile's `LENSES` key names any lenses, embed
their catalog entries in the triage prompt — run

```
kit lenses
```

and paste its output. It prints exactly the declared ids' entries and the cap, resolving
the catalog in either delivery mode, and exits non-zero naming any id that resolves
nowhere. Assemble it by hand and you will eventually hand the agent a lens the project
does not declare, or none at all; the agent itself must not go looking, because the
catalog's path differs by delivery mode.

The verdict is a route (`trivial` from an older triage reads as `none`). `blocked` is
**not** a route and never reaches this file — the premise did not hold and the work
stopped at step 4's report; if you are reading a `blocked` verdict here, something
carried it past the step that was supposed to stop it.

- `none` → skip the whole phase, return to step 5 of the skill.
- `lite` → run **the lite route** below — not the Steps S through R.
- `full` → **say which shape** (below), then continue.

On `lite` and `full`, create this branch's log at `docs/design/objections/<branch>.md`
and **record the verdict as a
`route:` block at its top** — route, research, autonomy, lenses, and the one-line why —
before anything else is written. The route a cycle took must be readable from its log
after the session is gone; `kit design-check` warns when a log has entries but no route
block. A checkpoint condition discovered later is appended to this block with a date,
never rewritten in.

## The two shapes of `full`

`full` was declared four times across this kit's live runs and its Steps A and R ran
zero times. Each run wrote the same deviation into its log: *there is no candidate set
to argue — the record already fixed the approach.* Four identical deviations are not
four lapses; they are a route description that does not match the work. The shapes below
name what actually happened, so the common one stops being a deviation and starts being
checkable.

**Open.** Nothing fixes the approach yet: the task is *how should this be built*, and
there are genuinely different answers. Steps S → A → D → R run exactly as written. This
is `/bootstrap-project`'s normal shape, and a work-issue task's shape when it reopens a
decision or makes one nobody has made.

**Bounded.** An ADR or decision record already fixes the approach, and this task builds
inside it. Then Step A has nothing to generate — a candidate set produced against a
settled decision is either a re-litigation of it or theatre — and Step R has nothing to
arbitrate. What `full` buys here over `lite` is not breadth of options but depth of
attack: Step S still runs when there is code to read, Step L runs every activated lens,
and Step D runs the adversarial half with the orchestrator answering as advocate, the
way the lite route already describes. Steps A and R do not run, and skipping them is
not a deviation.

Two rules keep the second shape from becoming a way to skip work:

1. **A bounded `full` names the record it is bounded by**, by path, in the route block:
   `full (bounded by docs/design/decision-record.md §2)`. A `full` that cannot name one
   is open, and Steps A and R run.
2. **The bound is attackable.** If the adversary's finding is that the record itself is
   wrong, that is an escalation to the owner — a checkpoint — not a licence to redesign
   here. The bound is what makes the shape cheap; quietly widening it is how a bounded
   cycle silently becomes an unreviewed open one.

Everything else — Step C, the constraints, the log, the artifacts, `kit design-check`,
the review pass at step 8 — is identical across both shapes.

## The lite route

One adversarial look at a concrete plan, for tasks that are functional but bounded. The
live precedent is this repository's own lens-catalog cycle: plan → one full adversary
pass → implementation with fixtures → fresh-context review ruling terminal states →
converged log, with zero debate rounds. Codified:

1. **Constraints apply unchanged** — Step C: the file is embedded verbatim in every
   prompt of the route.
2. **The plan and the criteria come first.** The orchestrator writes the concrete plan
   and the acceptance criteria in `check:`/`manual:` form. Step 3's investigation is
   the route's scout; it does not run a second one.
3. **One `design-adversary` full pass** over the plan, criteria and constraints — the
   first-round quota applies. Lens passes per Step L run alongside it, exactly as they
   would alongside round one of the full cycle. When triage named a Research domain,
   this pass waits for the research brief and receives it.
4. **The orchestrator answers as advocate.** That deviation is structural to the route
   and is recorded by the route block itself; answers land as `proposed`, and the
   orchestrator may not set terminal states — the state machine is unchanged.
5. **A blocker is answered and re-checked before implementation begins.** Apply the
   mechanism, then hand the updated log back to the objection's author to confirm the
   BAR is met — its confirmation goes into the HISTORY, while the terminal state still
   comes from the review pass, which is the only ruler this route has. An open blocker
   is the one thing this route does not carry into code; majors and below may be
   answered by mechanisms that ship in the diff with their fixtures. (As first
   written this rule demanded pre-implementation *convergence*, which the route's own
   state machine makes impossible — the first live lite run hit that within an hour.)
6. **Terminal states are ruled by the review pass** — a `design-adversary` in its
   **review-pass mode** (defined in that agent's file, which owns the ruler's
   contract), run at step 8 of the skill in fresh context. It receives the **full
   objection log** — one page in a lite cycle by construction — plus the committed
   diff, and must run things. There is no delta pass on this route: a delta authored
   by the same party whose answers it audits is not an audit.
7. **`kit design-check` converges before hand-off.** The override stays available, but
   a lite override's `verdict:` quotes the reviewer, never the advocate — the party
   that wants to ship does not get to certify that shipping is safe.

Rules 5 and 7's second half are discipline, not enforcement — a program checks the
converged log, nothing checks *when* it converged or who a quote belongs to. The ADR
records that boundary; the next post-mortem audits lite logs against it.

Skip the rest of this file on `lite` — Steps S, A, D and R belong to the full cycle.
The artifacts (`design-artifacts.md`) bind both routes.

## Step S — Scout

Run `codebase-scout`. For a broad task run two or three in parallel across *different*
angles — by symbol, by entry point, by data model — then merge the briefs. Reads
parallelise safely because nothing has to be mutually consistent yet.

You get a Codebase Brief: facts with `file:line`, no judgments. Do not add conclusions of
your own; the anchoring you introduce here is invisible for the rest of the cycle.

## Step A — Architect

**Open shape only.** A bounded `full` skips this step and says so in its route block; see
the two shapes above.

Run `approach-architect` with the Brief — plus the research brief when it has already
landed; the architect may run in parallel with `/research`, but the adversary never
does. You get a Candidate Set — two or three genuinely
different approaches plus a tentative favourite.

## Step L — Lens passes, alongside round one

For each lens the triage verdict activated, run one `design-adversary` with the
Constraints, the Brief, the Candidate Set and **that lens's catalog entry** — nothing
else from the catalog. Lens passes are read-only and independent: launch them in
parallel with round one's full adversary pass, and merge before the advocate's turn.

Three rules differ from the main pass, and each exists because of a specific failure:

- **No id numbering.** A lens pass emits objection blocks *without* `OBJ-n` ids; you
  assign the next free id at merge, quoting each claim's first line. Parallel passes
  numbering themselves collide, and a renumbered id is the invented-mapping defect the
  log format exists to prevent. `kit design-check` fails an id that is not `OBJ-<digits>`.
- **No forced objection.** The round-one quota applies to the main pass only. A lens
  pass that finds nothing real reports `NOTHING FOUND`, listing what it examined — that
  is a first-class result, not a failure to perform. A quota here would manufacture one
  weak major per activated lens and bill the whole cycle for closing them.
- **Grounding bounds the claim.** A lens whose profile entry names a script runs it or
  cites its output. A lens with no script proposes `manual:` criteria, and what it
  cannot verify lands as `accepted-risk` — per the evidence rules in
  `design-artifacts.md`, which lens findings obey like any other entry.

Merged lens objections are tagged `lens: <id>` and enter the current round's log before
the advocate sees it. From there the state machine makes no distinction.

## Step D — Debate, capped at `MAX_DESIGN_ROUNDS`

You maintain the **Objection Log**: the single source of truth for the cycle. Each round
is a fresh spawn of both roles, handed the current log.

The log is a **file** at `docs/design/objections/<branch>.md`. Create it before round one and
write it after every step below — not at the end, and never only inside the prompts. Two
delta passes in the second live run each invented their own mapping from ids to items,
because the log they were handed was prose rather than a document they could read.

For each round:

1. `design-adversary` — given the Brief, the Candidate Set, the log, and the research
   brief when triage named a Research domain — an adversary arguing from a brief found
   a live run's product-level blocker; one arguing from memory cannot. It adds
   objections, each with evidence, a severity and what would close it, and rules on the
   Advocate's previous responses. On round one it may not approve anything.
2. **Write the new objections into the log** and run `kit design-check` — it fails on a
   duplicated id, a missing claim, or a status outside the state machine, which is cheap
   to fix now and expensive to untangle two rounds later.
3. `design-advocate` — same context plus the new objections. It answers every open item
   with a mechanism and a proposed status, and may switch the favourite. Its answers land
   as `proposed`; it cannot mark its own work terminal. Give it the ids **with the first
   line of each claim**, so a permuted id is visible rather than plausible.
4. **You build the Round Delta** — every new load-bearing claim, mechanism, decision,
   service and dependency the advocate introduced. Mechanical work: it is the difference
   between the log before and after.
5. **Delta round** — `design-adversary`, fresh context, handed *only* the Constraints, the
   Round Delta and the objections it touches. It promotes each item to `verified`,
   `accepted-risk` or `rejected`, or sends it back to `open` with what is still missing.
   Skip this step only when the delta is genuinely empty, and record that it was empty.
   **Give it a budget** — tool calls and output — sized against the full pass it follows.
   The delta round was meant to cost a page instead of an argument; measured, the second
   live run's two delta passes were the *most* expensive steps of the cycle (51 and 40 tool
   calls against the full pass's 24). An unbudgeted delta round is why the round after it
   gets skipped. Hand it slices of any long reference document, not the document.
6. Update the log with all three outputs, then run `kit design-check` again.

The delta round is short by construction — it reads one page, not the whole argument. That
is the point: the reason to skip a second round has always been cost, so make the second
round cheap rather than optional.

**The convergence test — a command, not a judgement call:**

> Converged ⇔ every `blocker` and `major` in the log is in a **terminal** state
> (`verified`, `accepted-risk`, `rejected`) *and* the last round's delta was reviewed (or
> was empty) *and* that review raised no new blocker or major.

```
kit design-check
```

It exits non-zero and names the blocking ids until the first clause holds; the last two
are yours to confirm. **Convergence is not something you declare.** The second live run
declared it while a delta pass had just written "this is not ready for an arbiter" and two
majors were still `open`, and the record restated the rule as "no blocker left open" —
which is how a weakened rule becomes the documented one. The rule is blockers *and*
majors.

Otherwise, another round — the cap is `MAX_DESIGN_ROUNDS`, and stopping below the cap
because the next round looks expensive is the decision this whole file exists to prevent.

**If you ship anyway, override in writing.** Carrying a non-terminal major into the
arbiter is legitimate when the item is implementation-level and tracked; hiding that you
did is not. Append to the log:

```
convergence: override
items: OBJ-3, OBJ-4
verdict: "<the delta pass's own words, quoted>" — design-adversary, delta pass round <n>
accepted-by: <who> — <why these are safe to carry, and where they are tracked>
```

`kit design-check` then passes with a warning that names the carried items, so the next
reader sees a decision instead of a claim of convergence.

An item sitting in `proposed` does not count, however convincing it reads. That state
means one role with a stake in the answer has offered one — which is the beginning of the
check, not the end of it.

Why "they agreed" is not the criterion: **agreement can be premature conformity.** The
terminal state is *closed evidence*, not peace between two debaters — which is also why
the verdict goes to an independent arbiter rather than to whoever spoke last. And why the
absence of new objections proves nothing unless someone was actually asked to look for
them: in the first live run every objection was marked closed after one round, while three
new load-bearing decisions had entered the design unexamined.

**At the cap with an open blocker:** the arbiter still decides — it picks the most
defensible candidate, writes the disagreement and the alternative into the record so
reversing later is cheap, and work continues. The disagreement leads the hand-off
report; it does not interrupt the flow. A design question that survived three argued
rounds is a close call between viable options, and close calls are cheap to reverse —
a stalled process is not.

## Step R — Arbiter

**Open shape only.** A bounded `full` has no candidate set to arbitrate: the record it
named is already its decision record, and everything the list below feeds off — criteria,
accepted risks, risk keys — comes from the log and that record instead. It skips this
step and says so in its route block.

Run `design-arbiter` with the Brief, the Candidate Set and the final log. You get a Design
Decision Record. **Save it verbatim to `docs/design/decision-record.md` before you write
anything derived from it** — the ADR is a retelling, and `kit doctor` compares the two so
that a criterion lost in the retelling is a failing check rather than a discovery someone
makes a month later.

The record feeds the rest of the work, and this is what stops the phase being theatre:

- chosen approach and implementation notes → the code you are about to write;
- acceptance criteria, each with its `check:` command or `manual:` evidence line → the
  pull request body, and `acceptance-auditor` at the end;
- every `accepted-risk` in the log, including any claim that could not be verified →
  residual risks, where a human can still overrule them;
- risk keys and effort → the pre-merge audit and how hard the review should be;
- an ESCALATION section → stop, and ask.

**Persist it.** Run `/write-adr` when the decision constrains future work. A design phase
whose output lives only in the session has produced nothing durable, and the next person
to touch this area — probably you, in three months — will re-litigate it from scratch.

## Report before coding

Give the human a short summary: the chosen approach and one line of why, what was
rejected, residual risks. On `checkpoint` autonomy this report **blocks** — it is the
owner's decision point, while changing direction is still cheap. On `autonomous` (the
default) it is informational: post it and continue, because a stalled process costs
more than a reversible call. The route block records which mode this cycle ran under,
so the choice is auditable rather than remembered.

**A checkpoint is one stop, and it carries a decision.** It is not a series of
"shall I continue?" — that question has a standing answer, and asking it repeatedly
spends the attention the real decision needed. Everything the owner has to rule on goes
into the one report, each item with its options and your recommendation. After they
answer, the run goes to the end: verified, reviewed, committed, handed off. It does not
come back for permission to do what it was already asked to do.

Two consequences worth stating, because both were violated by a live run:

- **A checkpoint that produces no decision was not a checkpoint.** If the report has
  nothing the owner must choose between, it is informational — post it and keep going,
  whatever the autonomy knob says.
- **A question discovered late is asked late, not saved up.** Ask it where it is found,
  in one message, and continue on your stated reading if nobody answers. Batching
  questions until the end is how a cycle argues for an evening about a shape the owner
  would have corrected in a sentence.

## Keeping it honest

**All roles run on the same model unless you deliberately choose otherwise.** No `model:`
is pinned in these agent files on purpose: a critic on a stronger model than the defender
it argues against is a thumb on the scale, and the debate will look rigorous while
systematically favouring objections. If you want asymmetry, choose it knowingly.

**Do not scale the process for its own sake.** One scout is enough for a narrow task.
Independent evidence says a panel of similar reviewers underperforms its own best member,
because their outputs get averaged — diversity has to come from genuinely different
vantage points, not from more instances. The quality of the disagreement matters; its
volume does not.
