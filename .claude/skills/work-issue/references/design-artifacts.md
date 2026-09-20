# The design cycle's artifacts

Four structures the roles pass between them. They are **artifacts, not prose**: the
orchestrator copies them forward unchanged, and a missing field is a defect rather than a
stylistic choice.

The reason they are written down at all: in the first live run of this kit, a constraint
the owner had stated in the interview never reached the architect's prompt, and the whole
candidate set was built on a hosting option that constraint had already ruled out. The
adversary happened to catch it. Nothing in the process was watching — because the contract
between two steps was a paragraph the orchestrator rewrote from memory each time.

## 1. Constraints — the file, not the retelling

Lives at the path the profile's `CONSTRAINTS` key names (`.claude/constraints.md` by
default). Written from the interview, **owned by the human**.

```markdown
# Constraints

Verbatim answers from the owner. Agents may not change these; only the owner does.

- **C1** (interview, 2026-08-01) — The GitHub repository is private. Owner is on the Free plan.
  Knock-ons: GitHub Pages needs a public repo on Free; branch protection is unavailable on a
  private Free repo.
- **C2** (interview, 2026-08-01) — Money is exact to the kopeck; settlement is by card transfer.
  Knock-ons: cash rounding rules do not apply to v1.
```

Rules that make it worth having:

- **Every design-cycle prompt embeds this file verbatim.** Not summarised, not
  paraphrased, not "the relevant parts" — the orchestrator's paraphrase is exactly the
  step that lost the constraint last time.
- **An agent may not close an objection by changing a constraint.** Proposing that the
  owner reconsider one is allowed and useful; doing it silently inside a mechanism is the
  failure this rule exists to prevent. State it as an escalation instead.
- **Knock-ons are part of the answer.** An answer whose consequences nobody wrote down is
  how "private repo" and "deploy on GitHub Pages" survived in the same plan.
- A constraint discovered mid-cycle (the owner says something new, or a fact turns out to
  be binding) is **appended with its own id and date**, and the cycle restarts the current
  round with the updated file. Constraints never change silently between rounds.

## 2. Objection Log — a file, with an explicit state machine

**Lives at `docs/design/objections/<branch>.md` — one log per branch, the way
verification artifacts already work — and the orchestrator writes it after every step.**
`kit design-check` finds it without being told; a repository still carrying the old
fixed-path `docs/design/objections.md` keeps validating until its next cycle. The path is
per-branch because a fixed one collides: two branches that each ran a cycle conflict on
every merge, in the file whose whole purpose is to survive being carried forward.
Not in the session, not retyped into the next prompt: `kit design-check` reads this file,
and so does `kit doctor`. The second live run kept the log only inside its prompts, and
two delta passes each invented their own mapping from ids to items — the second one said
so in its output. Three objections never reached a terminal state under their own id.

One entry per objection, carried across rounds. The id never changes.

```
[OBJ-14] candidate: B | lens: hosting | severity: major | status: verified
CLAIM:      GitHub Pages needs a public repo on the Free plan; C1 says private.
EVIDENCE:   https://docs.github.com/get-started/learning-about-github/githubs-products
SCENARIO:   Deploy pipeline is written, then has nowhere to deploy to.
BAR:        A host that serves a private repo on a free tier, named and verified.
HISTORY:    r1 open (adversary) -> r1 proposed (advocate: Cloudflare Pages)
            -> r1d verified (delta-adversary: confirmed against Cloudflare docs)
```

**The first line is the machine-readable part** — `[OBJ-n]`, `severity:`, `status:` and
`lens:`. Everything else is for humans.

`lens:` is optional and, when present, is **a lens id from the catalog** (`kit lenses
--ids`) or from this project's `.claude/lenses.md` — never a free-text label for the
angle you took. `kit journal --lenses` counts findings per lens to decide which lenses
earn their place in a profile, and a tag naming no lens is a finding it cannot attribute:
the first tally over this repository's own logs found ten of twelve tags were labels like
`who-writes` or `review-pass`, which is a denominator that cannot be computed. A full
pass's own finding carries no `lens:` at all — that is correct and counted separately.
`kit design-check` warns on a tag that resolves nowhere. `kit design-check` fails on a duplicated id, a status
outside the state machine, an entry with no `CLAIM`, and a terminal state with no
`HISTORY`; run it after each round rather than at the end, when a desync is expensive to
untangle.

**When the cycle ships with something non-terminal**, the override is part of the file and
carries three fields, because those are what a later reader needs to judge the call:

```
convergence: override
items: OBJ-3, OBJ-4
verdict: "This is not ready for an arbiter" — design-adversary, delta pass round 2
accepted-by: owner, 2026-08-02 — carried as implementation-level open items, filed as #2-#5
```

An override is a legitimate, recorded act. An unrecorded one is the defect: it leaves a
record claiming a convergence that never happened, and the next post-mortem has to
reconstruct the truth from an agent's prose.

**The states, and who may set them:**

| state | meaning | who sets it |
|---|---|---|
| `open` | raised, unanswered | adversary |
| `proposed` | the advocate has offered a mechanism | advocate |
| `verified` | the mechanism holds, and its load-bearing facts were checked | delta-adversary; on a lite route, the fresh-context review pass |
| `accepted-risk` | the problem remains, and is taken deliberately, with bounds | advocate proposes; delta-adversary or the lite review pass confirms |
| `rejected` | the objection is wrong, refuted with evidence | advocate proposes; delta-adversary or the lite review pass confirms |

The lite review pass earns the delta-adversary's promotion right by meeting the same
two preconditions that made the delta-adversary trustworthy: **fresh context** (it had
no part in producing the answers it judges) and **it must run things** (a ruling with no
command or reproduction behind it is not a ruling). It receives the full objection log,
never a summary authored by the advocate.

`verified`, `accepted-risk` and `rejected` are terminal. `proposed` is **not** — a round
that ends with a `blocker` still in `proposed` has not converged.

**Why the advocate cannot promote its own answer:** it is the one role in the cycle whose
job is for the answer to be good enough. In the first live run it marked all sixteen
objections `resolved`, including two that were deliberate deferrals and one whose
load-bearing fact it had not checked at all. Nothing was dishonest; the role simply has no
incentive to be the last word, so it should not be.

On a **lite route** the orchestrator itself plays advocate — that is the route's
structural deviation, recorded by the `route:` block at the top of the log rather than
re-argued each time. The prohibition above survives unchanged: the orchestrator's
answers land as `proposed`, and only the fresh-context review pass moves them further.

**The evidence rule:** for `blocker` and `major`, promotion to `verified` requires a
citation for every load-bearing fact in the mechanism — a URL, a `file:line`, or a command
and its output. No citation is not a veto: the honest fallback is `accepted-risk` naming
the unverified claim, which then appears in the decision record's residual risks where a
human can see it. Minor objections and notes need no citation; a cycle that demands
footnotes for everything gets skipped wholesale.

A load-bearing fact is one where, if it turned out false, the mechanism would collapse —
"Cloudflare Pages deploys from a private repo on the free tier" is load-bearing;
"Cloudflare has a nice dashboard" is not.

## 3. Round Delta — what the round actually introduced

Built by the **orchestrator** after the advocate's turn, from the diff between the log
before and after. This is the input to the delta round, and the reason the second round is
cheap.

```
## Round Delta — round 1

New load-bearing claims:
- [D1] "Cloudflare Pages free tier deploys from a private GitHub repo" — supports OBJ-14
  (blocker chain) — evidence: none given
- [D2] "vite-plugin-pwa precache satisfies offline reload" — supports OBJ-06 (major) —
  evidence: none given

New decisions or mechanisms:
- [D3] Interaction model fixed as snapshot-share, recipient gets read view + "Edit a copy"
  (this is a product decision, not present in any candidate)

New dependencies or services:
- [D4] Cloudflare Pages (hosting), vite-plugin-pwa, fast-check

Unchanged: candidates A/B/C, all other objections.
```

If the delta is empty — the advocate introduced no new fact, mechanism, service or
decision — there is nothing to attack and the delta round is skipped. Say so explicitly in
the log; "skipped because empty" is a finding, "skipped" alone is a gap.

## 4. Decision Record — a file, with criteria a program can check

The arbiter's output, **saved verbatim to `docs/design/decision-record.md` before anyone
writes the ADR**. The ADR is a retelling of it, and the retelling is where criteria go
missing — fifteen became seven in the second live run, and the two that mattered most were
the guards nobody could have noticed were gone. `kit doctor` compares the counts and fails
on an unexplained gap; a criterion that genuinely should not ship is dropped on its own
line in the ADR (`dropped: <criterion> — <reason>`).

Its acceptance criteria are the contract for everything downstream, so each one carries
how it is checked:

```markdown
## Acceptance criteria

- [ ] The money core imports nothing from React or the DOM.
      check: npm run lint:boundaries
- [ ] Property tests pass at numRuns 10000.
      check: npm run test -- src/money
- [ ] The app survives an offline reload on a real iPhone.
      manual: run it on the device; record model and iOS version in the PR body
```

- `check:` is a command that **fails when the criterion is violated**. A command that
  cannot fail is not a check — if `npm run lint` would pass whether or not the boundary
  rule exists, then the criterion needs a negative fixture, not a nicer sentence.
- `manual:` is for what no command can observe. It names the action *and* where the
  evidence is recorded, because an unrecorded manual check did not happen.
- Every criterion has exactly one of the two. A criterion with neither is a wish;
  `acceptance-auditor` returns `UNKNOWN` for it, and `kit doctor` says so.

Do not reshape a criterion to make it easy to check. A weaker criterion with a green
command is the failure mode that "100% coverage proves the money is right" belongs to —
the metric replaced the goal, and the process kept reporting success.

**Two criteria may not share one `check:`.** Whichever is violated, the command says the
same thing, so neither can be ruled on separately — and `check: <the whole test suite>`
repeated three times is the shape this takes in practice. `kit doctor` warns on it. Give
each criterion its own script or its own named test.

**A guard's own negative fixture is part of the criterion.** "The CLI survives a closed
pipe" is met by a test that watches **stderr as well as stdout** and fails when the
forbidden output appears; the second live run shipped one that read stdout only and passed
while printing the crash trace it forbade. If the criterion is about the absence of
something, name where that something would appear.
