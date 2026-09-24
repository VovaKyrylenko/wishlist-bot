# Verification — fix/wall-detection (#20)

Date: 2026-09-24. Machine: the owner's Mac (home connection). Branch head at the time: eb638f1 (code), b31d517 (design log).

## Static checks

| Check | Result |
|---|---|
| `pnpm run typecheck` | clean |
| `pnpm run lint` | 0 errors, 55 warnings — the same count as `main` |
| `! grep -rq "WishlistBot" src api` | passes (after the review fix to a code comment) |
| `pnpm test` | 8 files, 193 tests passed (after the review fixes) |
| `pnpm run verify:scrape` | «Усі перевірки пройдено», including the new group «порожня сторінка — жодного виклику навіть з ключем»; no existing fixture moved |
| `pnpm run verify:flows` | **not run**: the harness refuses any database whose name lacks "staging" (scripts/flows/harness.ts:212), and the only database configured locally is `neondb`. It also never pastes a link (design log OBJ-5), so it could not exercise this change. |

## The tests bite (mutation run)

Each guard was removed or inverted in turn and `vitest run src/lib` re-run; the source was restored after each.

| Mutation | Tests failing |
|---|---|
| numbers guard in readPrice removed | 6 |
| `hasText` gate in suggestGiftCard removed | 2 |
| `cf-mitigated` sign removed | 2 |
| `x-amzn-waf-action` sign removed | 1 |
| 503 turned into a wall | 1 |
| empty-HTML rule removed | 2 |
| body not discarded on a non-2xx | 1 |
| the "blocked" log line removed | 1 |
| `WishlistBot/1.0` put back into the User-Agent | 1 |
| (after review) numbers from the markup ignored | 1 |
| (after review) body of a non-HTML 2xx not cancelled | 1 |
| (after review) page numbers read by a naive digit regex instead of parsePrice's reader | 4 |

## Live run against real shops (fetch layer only, model key unset)

`fetchLinkPreview` from this branch at eb638f1 (the header values are unchanged since — only a comment above them was reworded), one request per URL:

| URL | Result | Time |
|---|---|---|
| rozetka.com.ua product p547497342 | blocked, by cloudflare, 403 | 205 ms |
| makeup.com.ua product 969935 | blocked, by aws-waf, 202 | 125 ms |
| olx.ua home | blocked, by status, 403 | 120 ms |
| allo.ua Xiaomi Redmi Note 15 Pro | card «Xiaomi REDMI Note 15 Pro 8/256GB Black», 12 999 ₴ | 807 ms |
| answear.ua home | opens (card from markup, no product title — it is a home page) | 301 ms |
| answear.ua product (Puma Replicatch WILD Cow) | card «Puma Replicatch WILD Cow кросівки жіночі бежеві на…», 4 199 ₴, photo | 924 ms |
| watsons.ua home | opens (price from markup) | 553 ms |
| watsons.ua product (micellar water) | opens, price 305,99 ₴, no title from the markup alone — the model names it in production | 522 ms |

Before this change answear.ua and watsons.ua answered 403 to the `WishlistBot` User-Agent (research, 2026-09-23). Walls now take ~0.1-0.2 s to recognise instead of reaching the model or waiting on the budget.

Known edges, recorded rather than fixed:
- a non-HTML 2xx whose body is only whitespace is "failed", not "blocked" (hasNoBody checks for zero bytes; an HTML body is trimmed);
- the watsons.ua product page gives a price but no title from the markup alone, so without a model key the draft is `{ url }` and the person is asked for the name; with the production key the model names it — not checked here.

Not verified here: behaviour from a Vercel IP (production); the model step with a real key (unchanged by this branch except for the two new gates, which the unit tests pin).

## Acceptance audit (acceptance-auditor, one invocation per criterion, head d1af6fd)

Shared transcripts, captured once: scratchpad/audit/{scrape-test,gift-card-test,gifts-test,grep,static,verify-scrape,verify-flows}.txt — scrape.test.ts 82/82, gift-card.test.ts 54/54, gifts.test.ts 6/6, full suite 194/194 exit 0, grep PASS, verify:scrape «Усі перевірки пройдено» exit 0, verify:flows refused `neondb` exit 1.

> CRITERION: readPrice accepts a model price for a page that states no priced amount only when that number appears on the page: the four near-empty pages -> no price; «Сукня 1200» -> 1 200; «розмір 44 1200» -> no price; an empty body with an og:description without a number -> no price.
> VERDICT: PASS
> EVIDENCE: gift-card-test.txt lines 62-63 (54/54); readAnswer -> readPrice at gift-card.ts:409/422; four near-empty pages gift-card.test.ts:384-387 asserting null (transcript 48-51); «Сукня 1200» :403 (transcript 55); «розмір 44 1200» :416 (transcript 58); og:description without a number :388 (transcript 52). Note: «44 1200» is null because the reader groups it as one number, as the test comment says.

> CRITERION: A response with `cf-mitigated: challenge`, a response with an `x-amzn-waf-action` header, a plain 403, and a 2xx with an empty body (incl. 204, any content-type) each come back from fetchLinkPreview as "blocked" carrying `by` and `status`; 404, 429 and 503 come back "failed"; a body that errors mid-read comes back "failed" (OBJ-8).
> VERDICT: PASS
> EVIDENCE: scrape-test.txt lines 87-88 (82/82); blocked cases scrape.test.ts:179-192 asserting exact { kind, host, by, status } (transcript 66-72: cloudflare 403, aws-waf 202, status 403, empty 200 html, whitespace+BOM 200, 204, empty text/plain 200); failed cases :194-202 (404/429/503, transcript 73-75); mid-read error :206-215 (transcript 77). Note: "any content-type" is sampled by text/html, text/plain and none (204); only 200 and 204 among empty 2xx.

> CRITERION: The model is not called when the fetched page has no visible text, even with a gateway key set; the markup rules alone decide the card.
> VERDICT: PASS
> EVIDENCE: scrape-test.txt line 84 (no-visible-text test) and 85 (control: a page with text makes exactly 1 gateway call, so the counter is live); scrape.test.ts:257-261 key set, empty #app, 0 gateway calls, card title «Крем для рук» from og:title; gate at gift-card.ts:349, hasText at :273 from visibleText (:224).

> CRITERION: Requests carry the Chrome header set (UA pinned to Chrome 154, no sec-fetch-*); WishlistBot is gone from the code.
> VERDICT: PASS
> EVIDENCE: grep.txt PASS, re-run at d1af6fd (exit 1, no match); scrape-test.txt 82/82 incl. "asks like a browser, not like a bot"; BROWSER_HEADERS scrape.ts:63-74 (Chrome/154 UA, sec-ch-ua v154, Accept, Accept-Language uk-UA, upgrade-insecure-requests, no sec-fetch-*), sent at :220; test scrape.test.ts:236-246 asserts /Chrome\/154\./, not /bot/i, no sec-fetch-*. Note: the other Chrome headers are confirmed by code read only; the test pins UA, Accept-Language and the absence of sec-fetch.

> CRITERION: Every early return in fetchHtml cancels the response body (OBJ-10), and each blocked result logs one line with host, `by` and status (OBJ-3).
> VERDICT: PASS
> EVIDENCE: scrape-test.txt 82/82 incl. four "releases the body of …" cases and "logs each wall once with the host, never the path". Early returns in fetchHtml (scrape.ts:208-257): 215 deadline (no body yet), 226 wall (discard 225), 232 3xx no Location (discard 231), 239 non-ok (discard 238), 248 non-HTML (hasNoBody cancels at 104), 252/253 HTML read to the end or cancelled at 271, 256 too many redirects (last body released at 231). Log: one console.info at scrape.ts:617, tested at scrape.test.ts:229. Notes: the empty-non-HTML blocked branch, the too-many-redirects exit and the log for aws-waf/status/empty are covered by code read, not by a test.

> CRITERION: A blocked or failed lookup keeps today's behaviour in the bot: the draft is `{ url }` and the person is asked for the name.
> VERDICT: UNKNOWN (first audit, superseded below)
> EVIDENCE: gifts-test.txt 6/6 — draftFromLookup gives { url } for blocked and failed (gifts.test.ts:94-100; gifts.ts:264-266, same as main:gifts.ts:254). The name question (gifts.ts:307-313, identical to main:298-304) had no test; the check could only fail on the draft half.

> CRITERION: typecheck, lint and the unit suite are green.
> VERDICT: PASS
> EVIDENCE: static-2.txt at cd37d9a: exit=0 for the && chain (line 406); tsc --noEmit silent; biome 0 errors, 55 warnings, 2 infos (lines 366-368; the same count as main); vitest 8 files, 196 tests passed (lines 380-381).

> CRITERION: A blocked or failed lookup keeps today's behaviour in the bot: the draft is `{ url }` and the person is asked for the name.
> VERDICT: PASS (supersedes the UNKNOWN above, after test cd37d9a)
> EVIDENCE: gifts-test-2.txt at cd37d9a 8/8: draftFromLookup gives { url } for a wall and a failed lookup (gifts.test.ts:106-111); the real startGiftFromInput, with a blocked and a failed lookup, calls startDraft with exactly { wishlistId, url } and asks "draft.title" with t.gift.scrapeFailed, replace: true (lines 127-149). startGiftFromInput and the ask branch match main line for line (main:277-307 vs head:286-316). Unproven by these mocks: that a real wall yields `blocked` (covered by C1), the question's rendering and back button, the database write, the slow-lookup timer.

> CRITERION: The scrape fixture battery passes, including a new check that a gateway key with an empty-text context makes zero network calls (OBJ-6).
> VERDICT: PASS
> EVIDENCE: verify-scrape.txt at d1af6fd exit=0, every group OK incl. «порожня сторінка — жодного виклику навіть з ключем» (відповіді немає / мережі немає), «Усі перевірки пройдено»; `git diff d1af6fd cd37d9a --stat` touches only the verification doc and gifts.test.ts, so the run holds at head. run.ts:510-522 sets a fixture key, counts fetch calls, asserts 0; the gate is gift-card.ts:349; the no-key check (run.ts:495) sets hasText: true so it cannot pass through the empty-page gate. Note: "removing the gate fails the check" judged by code read here; the earlier mutation run in this doc showed the hasText gate removal failing tests.

> CRITERION: verify:flows is green (it never pastes a link, so it guards against regressions elsewhere only).
> VERDICT: UNKNOWN
> EVIDENCE: verify-flows.txt at d1af6fd: `refusing to run against database "neondb"` at assertStaging (harness.ts:213) from reset (harness.ts:221) from run (core.ts:22), exit=1 — no flow ran. The refusal precedes any write: assertStaging only reads `select current_database()` (harness.ts:208-218); the first write (reservation.deleteMany, :222) comes after it. Changes since d1af6fd touch only the verification doc and gifts.test.ts. Carried as accepted-risk OBJ-5; a staging DATABASE_URL is needed for a verdict.

> CRITERION: answear.ua and watsons.ua open with the final header set: one home page and one product page each, recorded (OBJ-4).
> VERDICT: PASS
> EVIDENCE: "Live run against real shops" rows for answear home (opens), answear product (card, 4 199 ₴, photo), watsons home (opens), watsons product (opens, 305,99 ₴); `git diff eb638f1 cd37d9a -- src/lib/scrape.ts` changes only the doc comment above BROWSER_HEADERS, no header key or value. Note: the watsons product page has no title without the model; the criterion only requires that it opens.

**Audit summary (head cd37d9a): 9 PASS, 0 FAIL, 1 UNKNOWN** — the UNKNOWN is verify:flows (no staging database; accepted-risk OBJ-5). Supersedes the first C5 block (UNKNOWN -> PASS after cd37d9a).

