# Reading shop pages behind anti-bot protection

**Decision this research must settle:** when a pasted shop link is blocked by an anti-bot
wall (Cloudflare Managed Challenge on Rozetka, 2026-09-23), which path produces the gift card
— a paid unlocker, a headless browser we run, a non-scraping data source, or an honest
fallback that asks the person — and in what order.

**Criteria** (from PRODUCT_GOALS, constraints C3/C4, ADR 0006):
1. **Share of real pasted links that end with a correct card** (name + price + photo), on the
   shops Ukrainians actually paste.
2. **Cost at our size** — a few hundred links a month, personal non-commercial project; must
   stay pocket change, with no pricing cliff that turns it into a monthly bill.
3. **Fits the runtime and the 8 s budget** — grammy bot on Vercel Functions (Node, Fluid
   Compute), whole lookup ≤ 8 s, "shop is slow" notice at 3 s.
4. **Maintenance and exit cost** — nothing that needs weekly babysitting against Cloudflare
   updates; leaving a vendor must be one `fetch` swap.
5. **Legal/ToS posture** acceptable for a personal bot (no credentials, no mass crawling).

Status: complete (2026-09-23). Recommendation needs the owner's decision before an ADR.

## Baseline (confirmed 2026-09-23)

- `fetchLinkPreview` (`src/lib/scrape.ts`) makes a plain Node `fetch` with
  `User-Agent: Mozilla/5.0 (compatible; WishlistBot/1.0; +https://t.me)`; any non-2xx returns
  `null` (`scrape.ts:163`) and the model step never runs.
- Rozetka product page, `robots.txt` and `xl-catalog-api.rozetka.com.ua` all answer **403**
  with Cloudflare's "Just a moment..." page, `_cf_chl_opt.cType: 'managed'` — a zone-wide
  Managed Challenge, not a path rule.
- When the lookup returns null, `src/features/gifts.ts:254` falls back to `{ url }`: the gift
  is saved as a bare link and the person is asked for a name. No card, no price, no photo.
- A photo is already a valid gift input (constraint C4; `src/features/entry.ts:140`), but it
  only becomes the gift's picture — nothing reads the photo.

## Measurement: how many popular Ukrainian shops block a plain fetch

Spike, 2026-09-23, run from the owner's Mac (residential connection; CloudFront answered from
its Warsaw POP). Same headers as `fetchHtml`. **Not measured from a Vercel function** — a
datacenter IP can only do worse than this, never better (see "Not investigated").

### What users actually paste (the database in `.env`, `WishlistItem.url`, aggregated by host)

34 saved links in total. 17 hosts, a long tail of small shops.

| Host | Links | Saved without price | Plain fetch |
|---|---|---|---|
| muziker.ua | 8 | 0 | 200 |
| **rozetka.com.ua** | **3** | **3** | **403, Cloudflare Managed Challenge** |
| instagram.com | 3 | 2 | 200, but product text sits behind a login wall — a different problem |
| unicoukraine.com | 3 | 0 | 200 |
| 14 other small shops (1-2 links each) | 17 | 1 (leman.in.ua) | all 200 |

So today the anti-bot wall costs **3 of 34 links (9 %)** — and costs them completely: every
Rozetka gift in the database was saved without a price. Rozetka is the country's largest
marketplace, so that share grows with every new user, not shrinks.

### 30 popular Ukrainian shops

| Result | Shops | Count |
|---|---|---|
| **Open; product card from markup** (name + price + photo; ktc's price wrong, see below) | allo, epicentrk, prom, citrus, ktc, jabko, antoshka | 7 |
| **Open; home page is real content, product page not tested** | foxtrot, moyo, eldorado, telemart, bi, hotline, zakaz | 7 |
| **Cloudflare challenge** (`403`, header `cf-mitigated: challenge`) | rozetka, comfy, kasta, brain, yakaboo, book-ye, intertop, notino, eva | 9 |
| **Other WAF** | makeup (AWS WAF, `202` + `x-amzn-waf-action: challenge`, empty body), olx (CloudFront `403`), watsons (Akamai `403`), answear (`403`, unidentified) | 4 |
| Unreachable from here (timeout / connection failed) | lcwaikiki, fua, budinokigrashok | 3 |

**13 of 30 (43 %) block a plain fetch**, 9 of them with Cloudflare. For the blocked shops the
wall was seen on the home page (and, where checked, `robots.txt`); their product pages were not
fetched separately, except Rozetka's and makeup's. Allo, Epicentr, Prom,
Citrus, Foxtrot — the other big names — are open.

### Side findings from the spike (bugs, independent of the decision)

1. **A challenge answered with `2xx` reaches the model.** makeup.com.ua answers `202` with an
   empty body; `fetchHtml` treats any `res.ok` as a page (`scrape.ts:163`). The model then sees
   only the URL, and `readPrice` accepts an unchecked price when the page states none
   ("there the model's reading is all we have", `gift-card.ts:412`). An empty challenge page is
   exactly where that rule should not apply.
2. **Challenge detection is cheap and documented:** Cloudflare sets `cf-mitigated: challenge`
   on every challenge response; AWS WAF sets `x-amzn-waf-action: challenge`. The bot can tell
   "the shop is hiding from bots" from "the page does not exist" without parsing HTML.
3. **Rules-only prices can be wildly wrong** (ktc.ua: JBL Clip 5 at `139 ₴`, a laptop at
   `3 233 ₴`; not checked whether that is an instalment or a neighbouring product). The model step (ADR 0006) exists for this; worth
   adding ktc.ua to the model's fixtures.

## Options

Swept 2026-09-23 from three angles in parallel (running a browser / being a verified bot; paid
unlockers; non-scraping sources and law). The raw sweep notes were not kept; every
load-bearing claim is repeated here with its source and date.

### A. Run a browser ourselves

- **Cloudflare Browser Rendering (now "Browser Run")** is transparent by design: "Browser Run
  requests are always identified as bot traffic by Cloudflare"
  ([FAQ](https://developers.cloudflare.com/browser-run/faq/), updated 2026-07-17); it adds
  signed headers that cannot be removed
  ([automatic headers](https://developers.cloudflare.com/browser-run/reference/automatic-request-headers/), 2026-06-16).
  Cheap (10 min/day free, $0.09/h, [pricing](https://developers.cloudflare.com/browser-run/pricing/), 2026-04-21) and useless against a Managed Challenge.
- **Chromium inside a Vercel Function** (`@sparticuz/chromium` v153, 2026-09-11, maintained)
  runs, but cold start alone is 3-6 s ([#79](https://github.com/Sparticuz/chromium/issues/79),
  2023 — old, re-measure before trusting), before the page and the challenge. Open bug on Fluid
  Compute: concurrent requests can launch a half-unpacked Chromium and wedge the instance
  ([#507](https://github.com/Sparticuz/chromium/issues/507), 2026-07-25).
- **Vercel Sandbox**: our volume fits the Hobby allowance (5 CPU-h, 420 GB-h/month,
  [pricing](https://vercel.com/docs/sandbox/pricing), 2026-09-10), but egress is dynamic AWS
  datacenter IPs.
- **Datacenter IPs are what fails, not the browser.** FlareSolverr fails only from AWS EC2 and
  works from a home IP ([#1741](https://github.com/FlareSolverr/FlareSolverr/issues/1741),
  2026-07); Camoufox: "Clean IP passes; every proxy fails"
  ([#686](https://github.com/daijro/camoufox/issues/686), 2026-07); patchright fails in Docker,
  passes locally ([#224](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright/issues/224),
  2026-07). `puppeteer-extra-plugin-stealth` is abandoned (last commit 2023-03-01).

### B. Paid unlocker as a fallback

Pricing pages read 2026-09-23. "$/1k" is the effective
price of a JS-rendered request through protected proxies on the first plan that allows it.

| Service | Free | First paid step | $/1k protected | Pay-as-you-go | Independent success evidence |
|---|---|---|---|---|---|
| Bright Data Web Unlocker | 5 000 req/month, recurring **(unverified, see below)** | PAYG | 1.50 (2.50 "premium domains") | yes | AIMultiple 2026-09: 95 %, ~4 s |
| Zyte API | $5 one-off | PAYG, no minimum | 1.01-16.08 by site difficulty | yes | Proxyway 2025-10: 93 %, fastest; AIMultiple: 93 %, ~13 s |
| Apify Web Fetch | $5/month recurring | $19 | 1.00-1.50 | yes | vendor only: 91 % |
| ZenRows | 200 protected pages/month | $16 | 8.89 | top-ups | Proxyway: 70 % |
| ScrapingBee | 1k credits one-off | $19 | 6.33 (stealth 19) | no | Proxyway: 84 % |
| ScraperAPI | 1k/month | $49 | 12-37 | from $475 only | Proxyway: 69 % |
| Scrapfly | 1k one-off | $30 | ~4.50 | from $100 | own benchmark only (scrapeway.com is Scrapfly's) |
| Firecrawl | 1k/month | $16 | 3.20 (16 with JSON) | top-ups | Proxyway: 34 %, last |
| Oxylabs Web Unblocker | 1 GB one-off | $75/month | ~10-30 (per GB) | no | Proxyway: 86 % |

Dropped: Browserless (assemble browser + proxy + captcha yourself), Microlink (proxies from
$49/month, no Cloudflare claim), Apify actors in general (start too slowly for 8 s).

Source quality, stated plainly:
- **Bright Data's own site did not load** for the agent, nor for me (browser navigation to
  brightdata.com and docs.brightdata.com refused, 2026-09-23). The 5 000/month free tier and
  $1.50/1k come from search snippets of their docs and proxyfacts.com (2026-09-17). **This is
  the load-bearing number of the recommendation and must be confirmed on signup.**
- Proxyway's comparison is 2025-10 (~11 months, at the edge of fresh) and lives on affiliate
  links; AIMultiple sells benchmarking; scrapeway.com belongs to Scrapfly. No benchmark tested
  Rozetka specifically.
- **One live data point:** a key-less request to Jina Reader (`r.jina.ai`) returned the Rozetka
  product's name, price and photo — in **8.7 s**, over our whole budget. Jina states it does not
  bypass site protection, so this is luck, not a service.

Risks for the two front-runners: Bright Data's p95 latency reported up to ~41 s, so the 8 s
budget will sometimes win; passing our own headers or cookies makes failed requests billable.
Zyte prices Rozetka only after the first requests; AIMultiple measured ~13 s average.

### C. Become a recognised bot

- **Verified Bots** needs either IPs "solely used by" the service (impossible on shared Vercel
  egress) or **Web Bot Auth** request signing
  ([policy](https://developers.cloudflare.com/bots/concepts/bot/verified-bots/policy/),
  2026-07-01). No traffic threshold is stated; Web Bot Auth is realistic for a hobby project
  (publish a key directory, sign requests, submit a form —
  [docs](https://developers.cloudflare.com/bots/reference/bot-verification/web-bot-auth/),
  2026-07-01); the standard is still an IETF draft (-05, 2026-03).
- **It would not open Rozetka.** Verified bots skip Cloudflare's *managed bot settings*; a
  site's own WAF rule with a Managed Challenge catches them unless the owner adds an exception
  ([WAF use case](https://developers.cloudflare.com/waf/custom-rules/use-cases/challenge-bad-bots/),
  2026-04-28). Rozetka challenges even `robots.txt`, which looks like a blanket custom rule.
- Link-preview bots (TelegramBot, Slackbot) sit in the "Page Preview" category and get through
  only on the same condition. Spoofing their User-Agent fails (verification is by IP/rDNS or
  signature) and is not an option we take.
- Direction of travel is stricter: from 2026-09-15 new zones block agentic traffic on
  ad-bearing pages by default ([changelog](https://developers.cloudflare.com/changelog/post/2026-07-01-ai-traffic-options/)).

### D. Telegram's own link preview

- **Bot API: no.** Bot API 10.3 (2026-08-24) gives a bot only `Message.link_preview_options` —
  the preview's *settings*, not its title, description or photo
  ([Bot API](https://core.telegram.org/bots/api)).
- **MTProto preview methods: no.** `messages.getWebPagePreview` and `messages.getWebPage` both
  say "Only users can use this method"
  ([1](https://core.telegram.org/method/messages.getWebPagePreview),
  [2](https://core.telegram.org/method/messages.getWebPage)).
- **Indirect path, unverified:** `messages.getMessages` is open to bots, and an MTProto message
  with a preview carries `messageMediaWebPage{webpage{title, description, photo}}`. A bot
  logged in over MTProto (GramJS with the bot token) *might* read the preview Telegram built
  for the user's own message. Unknowns: whether bots get the full object, the
  `webPagePending` delay, an MTProto session inside a serverless function, and — first of all —
  whether TelegramBot gets through Rozetka at all (it is a verified "Page Preview" bot, which a
  custom WAF rule still catches, see C).

### E. Shop programmes, aggregators, search engines

- **Affiliate feeds / seller APIs: dead end.** `affiliates.rozetka.com.ua` no longer resolves
  (DNS, 2026-09-23); Rozetka is not in Admitad's product-feed catalogue
  ([admitad](https://www.admitad.com/store/product-feed/), 2026-09-23); feeds are whole-catalogue
  files after advertiser approval, not "product by URL"; seller APIs cover the seller's own goods.
- **Aggregators: dead end.** hotline.ua's API is for shops managing bids
  ([docs](https://hotline.ua/ua/about/api_auctions/)); its user agreement bans automated
  collection; price.ua and ek.ua publish no API.
- **Google Custom Search: closed** to new customers, off on 2027-01-01
  ([docs](https://developers.google.com/custom-search/v1/overview), 2026-02-18). **Bing Search
  API: retired** 2025-08-11
  ([Microsoft](https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement)).
- **Independent search APIs are open and cheap** (pricing pages 2026-09-23):

  | API | Free | After |
  |---|---|---|
  | [Brave Search API](https://brave.com/search/api/) | $5 credit **every month** (~1 000 queries) | $5/1k |
  | [Serper](https://serper.dev) (Google results) | 2 500 queries, one-off | $1/1k |
  | [SerpApi](https://serpapi.com/pricing) | 250/month | $25/1k |

- **One hand test, 2026-09-23:** Brave web search for `rozetka 547497342` (our failing link).
  First result: «Настільна гра Бункер УКРАЇНСЬКОЮ / Bunker + правила українською», snippet
  `Код: 547497342 · Є в наявності · 1 499₴ · 799₴`, indexed 2026-06-22. The **name is right**
  (the URL slug only says «настільні ігри без бренду», a category); **the price is ambiguous**
  (old and sale price side by side) **and three months old**. No photo in the text result —
  an image query would be a second call. One query, by hand in the web UI, not the API.
- Search engines crawl Rozetka with its permission (robots.txt allows `*` on product pages);
  the bot never touches the shop.

### F. A screenshot the person sends, read by a model

- A photo is already a valid gift (constraint C4). Today it only becomes the picture.
- Cost: `gemini-3.1-flash-lite` $0.25/$1.50 per 1M tokens, 1 120 tokens per image at default
  resolution ([pricing](https://ai.google.dev/gemini-api/docs/pricing), 2026-09-22;
  [media resolution](https://ai.google.dev/gemini-api/docs/media-resolution), 2026-09-18) —
  **≈ $0.0006 per screenshot**, cents a month, through the same AI Gateway as ADR 0006.
- Quality: no published evaluation of "shop screenshot → name + price". Nearest: GlotOCR
  ([arXiv 2604.12978](https://arxiv.org/html/2604.12978), 2026-04), 3 % character error on
  Cyrillic — synthetic text, not phone screenshots. Expected failure is the same one ADR 0006
  already fights: old vs sale vs per-month price.
- Works for **every** wall, including Instagram's login wall (3 of 34 real links).
- Costs the person one extra step, so it is a fallback, never the first path.

### G. Legal and terms

Practical reading by the research agent, **not legal advice**; sources 2026-09-23.

- Rozetka's user agreement (Wayback 2026-08-05) has **no clause against bots or parsing**; its
  robots.txt allows every user-agent on product pages and has no AI/TDM opt-out.
- Law of Ukraine No. 2811-IX "On Copyright and Related Rights"
  ([text](https://zakon.rada.gov.ua/laws/show/2811-20), edition 2026-07-31): Art. 53(2)(5)
  makes "unauthorised circumvention of a technological protection measure" an infringement;
  Art. 26(2) lets a lawful user take insubstantial parts of a database; Art. 26(4) forbids
  systematic extraction of insubstantial parts.
- EU case law (all older than 12 months, still leading): CJEU C-762/19 CV-Online (2021) needs a
  substantial part and harm to the maker's investment — one product per paste is neither;
  BGH I ZR 224/12 (2014) allows scraping of freely accessible data **as long as no technical
  protection is circumvented**. No UA/EU judgment found that treats a Cloudflare challenge as a
  protection measure — so that question is open, not settled in our favour.
- The line, stated plainly: a plain GET of a page the shop serves us, search APIs, and a
  screenshot the person sends are clean. **Solving the challenge** — our own stealth browser or
  an "unlocker" whose product is solving it — is the one step that turns "a user's link" into
  "we defeated the shop's protection".

## Verdicts

Criteria numbers refer to the list at the top.

| Option | Verdict | Deciding criteria |
|---|---|---|
| Detect the wall and stop feeding it to the model | **STEAL — first** | 1: fixes a live bug (makeup `202`); 2-5: free, no vendor |
| Search API by product ID (Brave first) as the automatic fallback | **STEAL — second, after a 20-link spike** | 1: the one test named the product right; 2: recurring free tier covers us; 3: 1-2 s per call (vendor claim, not measured); 4: one `fetch`; 5: clean. Price accuracy unproven |
| Screenshot → model | **STEAL — third** | 1: covers every wall incl. Instagram; 2: ≈ $0.0006; 5: clean. Costs the person a step |
| Paid unlocker (Bright Data / Zyte) | **INTERESTING BUT HEAVY** | 1: highest reach (90-95 % in third-party tests); 2: fits a free tier; but 3: p95 far over 8 s, 5: it is challenge-solving by proxy. Changes if a shop grants permission, or a lawyer says a Cloudflare challenge is not a protection measure for facts |
| Web Bot Auth / Verified Bots | **INTERESTING BUT HEAVY** | 5: the honest direction; but 1: does not open Rozetka's custom rule. Changes if big shops start exempting signed agents |
| Telegram preview via MTProto `getMessages` | **INTERESTING BUT HEAVY** | 3-4: MTProto session in a function; 1: unknown. Killed outright if a hand-pasted Rozetka link shows no preview in Telegram |
| Own headless browser (Vercel Function / Sandbox, stealth libs) | **SKIP** | 1: datacenter IPs fail (#1741, #686, #224); 3: 3-6 s cold start; 4: arms race, #507; 5: circumvention |
| Cloudflare Browser Run | **SKIP** | "always identified as bot traffic" |
| Jina Reader | **SKIP** | worked once in 8.7 s (> budget); vendor says it does not bypass protection — luck, not a service |
| Affiliate feeds, seller APIs, aggregators, Google CSE, Bing | **SKIP** | not available (dead domain, no per-URL lookup, closed, retired) |
| URL slug as a name | **SKIP** | our failing link's slug is a category, not a product |

## Recommendation

A plain fetch already reaches the long tail our users actually paste: of 34 saved links, 28 are
small shops that answer `200` (27 saved with a price), 3 are Instagram (a login wall, a different
problem) and 3 are Rozetka (all without a price). Among the 30 big shops, the 7 open ones we
tested all returned a card from markup alone (ktc.ua with a wrong rules-only price, which the
model step exists to fix). The wall is real but narrow — 13 of 30 big shops, led by Rozetka — so
the fix should be narrow too, and must not cross the circumvention line for a personal project.

1. **Tell a wall from a missing page** (`cf-mitigated: challenge`, `x-amzn-waf-action`,
   `403`/`429`/`503` from a WAF, `2xx` with an empty body). A wall is its own outcome: the model
   is never called on an empty page, and `readPrice` never accepts an unchecked price when the
   page text is empty. Free, and it closes the makeup.com.ua bug today.
2. **On a wall, ask a search API** for the product ID or URL and hand the result title and
   snippet to the *existing* ADR 0006 model step as the "page" — its price check then works
   against the snippet's own prices. Brave first (the free credit recurs monthly; the hand test
   was on its index), Serper as the second source. Before adopting: a 20-link spike across
   Rozetka, Comfy, Kasta, Brain measuring name / price / photo, and a rule for stale prices
   (the snippet can be months old — probably show the price as «приблизно» or drop it).
3. **If search misses too, ask honestly** — one `notice` line, no 💜, in `src/text.ts`, e.g.
   «Магазин не пускає мене подивитись 😕 Напиши назву — або надішли знімок екрана з товаром»
   (draft; "скриншот" fails the grandmother test). The picture goes through a vision call to
   fill name and price.
4. **Do not** run our own stealth browser or pay an unlocker to solve challenges.

Before any of this: paste one Rozetka link into a Telegram chat by hand (1 minute). If a full
preview appears, the MTProto path (D) earns a 30-minute experiment; if not, it is closed.

This settles a direction that constrains future work, so once the owner agrees it becomes an
ADR citing this report (`/write-adr`).

## Not investigated

**Freshness warning:** everything here was read or measured on 2026-09-23. Anti-bot settings
change without notice — a shop that is open today can close tomorrow, and the reverse. Treat
the 43 % as a snapshot.

- **Measurement from Vercel's IPs.** All probes ran from the owner's Mac. Production can only
  do worse. (Indirect comfort: 27 of the 28 small-shop links in the database carry a price,
  which suggests production reached those shops — though a person may have typed some prices.)
- **Whether the database in `.env` is production.** The 34 links look like real use; not
  confirmed.
- **Search-API accuracy at scale.** One hand query in Brave's web UI, not the API; no photo
  query; no stale-price rule tested.
- **Vision accuracy.** No screenshot was tested: there is no gateway key locally, and pulling
  the production key was refused by this session's permission guard.
- **Telegram's preview of Rozetka links.** Needs a person in a Telegram chat.
- **Bright Data pricing at the source** — their site was unreachable for us; figures come from
  search snippets and proxyfacts.com (2026-09-17).
- **Product pages of 7 "open" shops** (foxtrot, moyo, eldorado, telemart, bi, hotline, zakaz)
  and the 3 unreachable ones.
- **Legal:** no Ukrainian court decisions on anti-bot circumvention were searched; EUR-Lex was
  blocked, so DSM Art. 4 was checked through quotations.
- **Instagram's login wall** — a separate problem, only touched by the screenshot path.
