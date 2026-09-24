route: bounded full (bounded by docs/design/flows/link-reading.md "Phases" §1, on branch docs/scraper-bot-protection-research, PR #21 — architect and arbiter skipped as the protocol allows for a bounded shape)
research: none — docs/research/scraper-bot-protection.md (PR #21) already records the wall signatures and measurements
autonomy: autonomous
lenses: reliability-failure (external calls: the shop fetch and the model call)
why: part (c) changes when a model price is accepted, and that price becomes priceAmount/priceCurrency (MONEY_SYMBOLS); without that hit the triage would be lite. Issue: #20.
owner questions (asked by triage, answered by assumption, 2026-09-24 — owner not asked mid-flow per the project's autonomy rule):
  ASSUMED 1: "empty page text" means no visible text after stripping tags (the same test (b) uses), not only an empty response body.
  ASSUMED 2: a page with text but no price of its own (a caption, a photo post) keeps today's behaviour — the model's price is accepted unchecked there.
  ASSUMED 3: browser headers keep Accept-Language uk-UA first.

protocol deviation, stated plainly: round 1 prompts handed the Constraints by path (.claude/constraints.md, "read it in full first; every entry is binding") instead of pasting the text; the plan was handed as a file (scratchpad/plan-wall-detection.md), repeated below under "Plan (round 1)".

# Plan (round 1)

1. fetchHtml returns { kind: "page" } | { kind: "blocked", by } | null. Before redirects and before !res.ok: `cf-mitigated: challenge` -> blocked/cloudflare; `x-amzn-waf-action` present -> blocked/aws-waf; 403, 429, 503 -> blocked/status; 3xx follows as today; other non-2xx -> failed; non-HTML -> failed; 2xx with an empty or whitespace-only body -> blocked/empty. Blocked responses cancel their body.
2. fetchLinkPreview returns { kind: "card", preview } | { kind: "blocked", finalUrl, by } | { kind: "failed" }.
3. PageContext gains hasText; suggestGiftCard returns null without a gateway call when !hasText.
4. readPrice accepts an unchecked model price (no prices on the page) only when hasText.
5. The Chrome header set measured on 2026-09-23 replaces the WishlistBot User-Agent.
6. gifts.ts buildDraftFromUrl: any non-card result -> { url }, exactly as today.
7. Fixture tests for each wall, the headers, no gateway call on an empty page, and both readPrice branches.
8. verify:scrape re-run; moved fixture expectations are examined.

# Acceptance criteria (restated after round 1)

- [ ] A response with `cf-mitigated: challenge`, a response with an `x-amzn-waf-action` header, a plain 403, and a 2xx with an empty body (incl. 204, any content-type) each come back from fetchLinkPreview as "blocked" carrying `by` and `status`; 404, 429 and 503 come back "failed"; a body that errors mid-read comes back "failed" (OBJ-8).
      check: pnpm test -- src/lib/scrape.test.ts
- [ ] The model is not called when the fetched page has no visible text, even with a gateway key set; the markup rules alone decide the card.
      check: pnpm test -- src/lib/scrape.test.ts
- [ ] readPrice accepts a model price for a page that states no priced amount only when that number appears on the page: the four near-empty pages -> no price; «Сукня 1200» -> 1 200; «розмір 44 1200» -> no price; an empty body with an og:description without a number -> no price.
      check: pnpm test -- src/lib/gift-card.test.ts
- [ ] Requests carry the Chrome header set (UA pinned to Chrome 154, no sec-fetch-*); WishlistBot is gone from the code.
      check: ! grep -rq "WishlistBot" src api && pnpm test -- src/lib/scrape.test.ts
- [ ] A blocked or failed lookup keeps today's behaviour in the bot: the draft is `{ url }` and the person is asked for the name.
      check: pnpm test -- src/features/gifts.test.ts
- [ ] Every early return in fetchHtml cancels the response body (OBJ-10), and each blocked result logs one line with host, `by` and status (OBJ-3).
      check: pnpm test -- src/lib/scrape.test.ts
- [ ] typecheck, lint and the unit suite are green.
      check: pnpm run typecheck && pnpm run lint && pnpm test
- [ ] The scrape fixture battery passes, including a new check that a gateway key with an empty-text context makes zero network calls (OBJ-6).
      check: pnpm run verify:scrape
- [ ] verify:flows is green (it never pastes a link, so it guards against regressions elsewhere only).
      check: pnpm run verify:flows
- [ ] answear.ua and watsons.ua open with the final header set: one home page and one product page each, recorded (OBJ-4).
      manual: re-measure before merge; results in docs/verification/fix/wall-detection.md

# Objections

[OBJ-1] severity: major | status: verified
CLAIM:      The invented-price fix covers only pages with zero text; a page with one line («Завантаження…», a cookie banner) still gets an unchecked model price.
EVIDENCE:   gift-card.ts:412-413; scratchpad/price.ts: "", og-only, «Завантаження…», cookie-only body -> all `1 299 ₴` from a model answer of 1299 that appears nowhere on the page.
SCENARIO:   App-style shop page with one loading line -> hasText=true, no page prices -> invented price on the gift.
BAR:        Accept an unchecked model price only if its digits appear on the page, or the owner accepts the risk in writing.
HISTORY:    r1 open (adversary) -> r1 proposed (advocate: when the page states no priced amount, the model's amount is accepted only if the same number appears among the plain numbers of the page's visible text or of the markup's title/description — a new `numbers` set on PageContext built with the existing NUMBER_TOKEN grammar ("1 299", "1299", "1299.00" all read as 1299). Empty text -> empty set -> rejected, which also satisfies the bound's line. A caption «Сукня 1200» keeps its price, so ASSUMED 2 is narrowed, not reversed: a page with text but no price keeps a model price only when the page itself wrote that number. Tests: the four pages from price.ts -> null; «Сукня 1200» -> 1 200.)
            -> r1d verified (delta-adversary: scratchpad/d1.ts — 1299 rejected on all four near-empty pages; «Сукня 1200» and «Сукня 1 200» keep 1200. Conditions carried into the build: a «розмір 44 1200» -> null fixture (the grammar joins the numbers; errs to no price), and criterion 3 tested with an empty body plus an og:description with no number. Residual, noted: a real-but-wrong number on a price-less page (256 from "8/256", a year, a phone) can still be accepted — narrower than today, where any number is.)

[OBJ-2] severity: major | status: verified
CLAIM:      Plain 403/429/503 marked "blocked" goes beyond the bound's three signs; phase 2 will boot the paid browser on it.
EVIDENCE:   Bound phase 1 "Done" names cf-mitigated, x-amzn-waf-action, 2xx-empty only; with Chrome headers the only header-less 403 left is olx (probe.mjs, 23 home pages); no 429/503 wall was ever measured.
SCENARIO:   Shop in maintenance (503) or rate-limiting (429) -> blocked -> phase 2 boots sandboxes against a site that is down.
BAR:        429/503 stay failed; the 403 rule dropped or kept with olx as its named evidence; a 503 -> failed test.
HISTORY:    r1 open (adversary) -> r1 proposed (advocate: 429 and 503 stay "failed" with a test each. A plain 403 stays "blocked", by "status", with its evidence named in the code comment: olx.ua answers a header-less CloudFront 403 to every bot header set and opened in a real browser from both the home IP (research §H) and Vercel (§I). The blocked variant carries `status`, so phase 2 can still decide per status. This widens the bound by one named case; the bound doc's "403·429·503 from a WAF" line is corrected to "403" in PR #21 in the same round.)
            -> r1d verified (delta-adversary: olx.ua 403 CloudFront 919 bytes today with the bot UA and with Chrome 154/140; research §H/§I olx 200 in a real browser from home and from Vercel. 429/503 stay failed; status travels on blocked.)

[OBJ-3] severity: minor | status: verified
CLAIM:      "blocked" has no consumer and no log line; nobody can see how often it happens.
EVIDENCE:   Plan §6; scrape.ts:524-527 logs only on throw; research had to query the database by hand.
SCENARIO:   Phase 2's cost decision has no data on which hosts wall us.
BAR:        One log line per blocked result with host and `by`, tested.
HISTORY:    r1 open (adversary) -> r1 proposed (advocate: `console.info("scrape: blocked", host, by, status)` in fetchLinkPreview — host only, never the full URL or query string, so no personal data reaches the logs; a test spies on console.info.)
            -> r1d verified (delta-adversary: one console.info, host only, spied by a test.)

[OBJ-4] severity: minor | status: verified
CLAIM:      Node's fetch rewrites sec-fetch-mode to "cors"; a stubbed-fetch test asserts a header that never goes out.
EVIDENCE:   scratchpad/hdr.mjs (Node 22.22.1): sent `navigate`, server received `cors` next to `sec-fetch-dest: document`.
SCENARIO:   Test green while an inconsistent header pair ships.
BAR:        Drop sec-fetch-mode, or assert against what a local server received.
HISTORY:    r1 open (adversary) -> r1 proposed (advocate: drop the whole sec-fetch-* group — we cannot send it faithfully — and keep User-Agent, Accept, Accept-Language, sec-ch-ua*, upgrade-insecure-requests. Because this departs from the measured set, answear.ua and watsons.ua are re-measured with the final set before merge and the result recorded in docs/verification; if either stops opening, the set is revisited. The unit test asserts only headers fetch does not rewrite (User-Agent, Accept-Language).)
            -> r1d verified (delta-adversary: scratchpad/d3.mjs without sec-fetch-* — answear.ua 200 369 KB, watsons.ua 200 476 KB, with Chrome 154 and 140, home IP, home pages. Condition: the pre-merge re-measure adds one product page per shop and is recorded.)

[OBJ-5] severity: minor | status: proposed
CLAIM:      Criteria drop the bound's verify:flows item; the grep can pass with the UA moved; no test at buildDraftFromUrl; content-type check precedes the empty-body rule.
EVIDENCE:   Bound phase 1 "Done"; criterion 4's grep is scrape.ts only; gifts.ts:253-254 untested; plan §1 order.
SCENARIO:   All green while the UA ships from another file or an empty 2xx walks the old path.
BAR:        Run verify:flows; grep all of src/ and api/; a unit test for the caller; make the empty-body rule and criterion 1 agree.
HISTORY:    r1 open (adversary) -> r1 proposed (advocate: (a) verify:flows is run and recorded, with the note that it never pastes a link; (b) criterion 4's grep covers src/ and api/; (c) the caller's mapping moves into an exported pure helper `draftFromLookup(url, result)` in gifts.ts with a unit test that a blocked and a failed result both give `{ url }`; (d) a 2xx with Content-Length 0 or an empty stream is "blocked/empty" whatever its content-type; a non-HTML 2xx with a body stays "failed".)
            -> r1d verified (delta-adversary: blocked and failed both map to { url } and the name question, gifts.ts:298, C4 holds. Condition for D9: read the first chunk before cancelling a non-HTML 2xx; a 204 comes out blocked/empty.)
            -> review-ledger reopened (part (a) "verify:flows is run and recorded" did not happen: the harness refuses any database without "staging" in its name, scripts/flows/harness.ts:212, and only `neondb` is configured locally)
            -> advocate proposes accepted-risk (bound: verify:flows never pastes a link, scripts/flows/core.ts:174; the only change in gifts.ts is the draftFromLookup extraction, pinned by src/features/gifts.test.ts; the criterion ships as UNKNOWN, not green) — pending confirmation by the review pass

[OBJ-6] severity: minor | status: verified
CLAIM:      With hasText gating the model, verify:scrape's "no key -> no call" check passes for the wrong reason.
EVIDENCE:   scripts/scrape/run.ts:487 builds a context by hand; tsconfig includes scripts.
SCENARIO:   The `!key` guard is deleted and the check stays green.
BAR:        The fixture sets hasText true; a separate check: key set, no text -> zero calls.
HISTORY:    r1 open (adversary) -> r1 proposed (advocate: exactly the BAR — the existing check gets hasText: true and a text; a new check sets a fake key with an empty-text context and asserts zero fetch calls.)
            -> r1d verified (delta-adversary: conditional on the verify:scrape criterion; the spy must wrap the global fetch the model call uses.)

[OBJ-7] severity: note | status: accepted-risk
CLAIM:      The pinned UA says Chrome/140 and ages every month.
EVIDENCE:   Plan §5 vs research §H/§I (Chrome 153-154).
SCENARIO:   Unknown.
BAR:        A comment on when and why it was pinned, or accept the risk.
HISTORY:    r1 open (adversary) -> r1 proposed (advocate: accepted-risk with a bound — the UA is pinned to the current stable major (154, the Chrome the sandbox installed on 2026-09-23) if the re-measure in OBJ-4 opens answear and watsons with it, else to 140 as measured; a one-line comment names the date and the reason to bump it.)
            -> r1d accepted-risk (delta-adversary: Chrome 154 opened both shops today, so the UA is pinned to 154 with a dated comment; an aged UA shows up as a new 403 = blocked, not a silent break.)

[OBJ-8] severity: minor | lens: reliability-failure | status: accepted-risk
CLAIM:      A wall that never finishes its body (whitespace tarpit, reset mid-read) ends as "failed", not "blocked".
EVIDENCE:   scratchpad/inj/cancel.mts: whitespace every 100 ms -> TimeoutError at 2003 ms; run.mts: 202 reset after 3 bytes -> null in 104 ms.
SCENARIO:   Phase 3 sends such a link down «Не зміг відкрити» instead of the sandbox.
BAR:        Classify as blocked, or record the choice as accepted; pin it with a fixture either way.
HISTORY:    r1 open (lens) -> r1 proposed (advocate: accepted-risk for phase 1 — the one real wall of this shape (makeup 202) carries x-amzn-waf-action and is caught by header first; the phase-1 person sees the same outcome either way. Pinned by a "body errors mid-read -> failed" fixture; revisited in phase 3, where the routing is decided.)
            -> r1d accepted-risk (delta-adversary: phase 1 gives failed and blocked the same outcome; makeup's 202 is caught by header first; pinned by a mid-read error fixture; phase 3 revisits.)

[OBJ-9] severity: minor | lens: reliability-failure | status: verified
CLAIM:      A plain 503/429 becomes "blocked" and LinkLookup drops `status`.
EVIDENCE:   Plan §1-2; flow doc line 34 "from a WAF".
SCENARIO:   A shop in maintenance gets 6 sandbox boots in phase 3.
BAR:        Carry status, or keep 503 failed; pin with a fixture.
HISTORY:    r1 open (lens) -> r1 proposed (advocate: closed by the OBJ-2 mechanism — 429/503 stay failed, blocked carries status; the 503 fixture pins it.)
            -> r1d verified (delta-adversary: closed by the OBJ-2 mechanism, 503 fixture.)

[OBJ-10] severity: minor | lens: reliability-failure | status: verified
CLAIM:      Only blocked responses cancel their body; 404/410/5xx still return without cancel and hold the socket until the abort timer.
EVIDENCE:   scratchpad/inj/cancel.mts: without cancel the socket closed at 3006 ms (3 s signal); with cancel at 226 ms.
SCENARIO:   A large 404 page holds a socket on a warm instance for the rest of the budget.
BAR:        Cancel on every early return.
HISTORY:    r1 open (lens) -> r1 proposed (advocate: one `discard(res)` helper called on every early return in fetchHtml — non-2xx, non-HTML, blocked — before returning.)
            -> r1d verified (delta-adversary: the defect is real at scrape.ts:163 and also at :156, a 3xx with no Location; discard(res) covers both and runs before the new blocked returns.)

note (not an objection, lens pass): a page whose body keeps trickling past the deadline loses a card whose <title> arrived in the first chunk (run.mts `dribble` -> null at 8005 ms). Pre-existing, not made worse here; filed as a separate issue.

Round 1 delta: reviewed (scratchpad/delta-r1.md, D1-D13); no new blocker or major raised. Converged.

# Review pass (step 8), 2026-09-24

Two fresh-context reviewers, different angles (risk key MONEY_SYMBOLS fired): ledger (log first, then diff) and fresh eyes (diff only, review-diff checklist, not shown the log).

Ledger findings:
- REVIEW-L1 (major): criterion 4's own check failed — "WishlistBot" survived in a code comment (scrape.ts:54). Fixed: comment reworded; `! grep -rq "WishlistBot" src api` now passes.
- REVIEW-L2 (major): OBJ-5 was ruled verified while verify:flows never ran. Reopened above; proposed accepted-risk.
- REVIEW-L3 (minor): no test for cancelling a non-HTML 2xx body. Fixed: "a non-HTML file" row in the release test; removing the cancel in hasNoBody now fails 1 test.
- REVIEW-L4 (minor): no test for a price found only in the markup. Fixed: og:description «Сукня 1200» test; ignoring markup numbers now fails 1 test.
- REVIEW-L5 (note): UA test tightened to Chrome/154; a whitespace-only non-HTML 2xx is "failed" (hasNoBody checks for zero bytes) and the watsons product page has a price but no rules-only title (with no model key the draft is { url }) — both recorded in docs/verification.

Fresh-eyes findings (no blocker, no major):
- REVIEW-F1 (minor): the page-number reader was a second grammar that disagreed with parsePrice ("Ціна: 1.299" rejected a correct 1299). Fixed: `amountsIn` in src/lib/price.ts reuses parsePrice's own findNumbers + parseAmount; tests for "1.299" and "1,299"; a naive reader mutation fails 4 tests. Space-joined numbers ("44 1200", "15 499") still read as one and drop the price — the safe side, pinned by a test.
- REVIEW-F2 (minor): the BROWSER_HEADERS comment cites docs/research/scraper-bot-protection.md, which lands with PR #21. Handled by merge order: PR #21 merges first (stated in this PR's body).
- REVIEW-F3 (note, pre-existing): a page with no currency still takes the model's currency unchecked ("Сукня 1200" answered as USD). Out of scope; filed as a separate issue.
- REVIEW-F4 (note): makeup.com.ua sends ~2 KB of challenge script to a browser-like request, so the header — not the empty body — catches it. Fixed: the aws-waf fixture now has a non-empty body.

