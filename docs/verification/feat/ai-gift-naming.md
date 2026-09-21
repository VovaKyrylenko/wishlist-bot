# Verification — feat/ai-gift-naming

## Run 1 — fixtures for the four failures of #16 (2026-09-21)

VERDICT: PASS
CLAIM:   The four real failures from issue #16 are named correctly when the model answers, are
         not shown at all when it does not, and pages with clean markup are untouched.
METHOD:  `pnpm test` (`src/lib/gift-name.test.ts`, 24 cases) and `pnpm run verify:scrape` — offline,
         with the model's answer injected as a value.
STEPS:
  1. Page titled `Головна`, product only in prose
     -> with a model answer: `Свічка соєва «Лаванда», 250 мл`; without: `null` (the user is asked to type a name).
  2. Page whose whole title is the shop (`Інтернет магазин кави`)
     -> with a model answer: `Кава в зернах Ефіопія Іргачеффе, 500 г`; without: `null`.
  3. Instagram wrapper (`УКРАЇНСЬКИЙ БРЕНД ОДЯГУ в Instagram: "…"`)
     -> with a model answer: `Кейп з тканини букле`; without: `null`.
  4. Control, clean Rozetka markup, no model
     -> `Навушники Sony WH-1000XM6 Black`, `12 999 ₴` — exactly today's result.
  5. Price arbitration: markup price beats the model's; the model's price is used only when
     markup had none; `0` and a phone-number-sized amount are dropped.
  6. Model answer hygiene: ```json fences, quotes around the whole name, non-JSON, empty name.
  7. No `AI_GATEWAY_API_KEY` in the environment, `globalThis.fetch` replaced by a throwing stub
     -> `suggestGiftName` returned `null` and the stub was called **0** times.
EVIDENCE: `Test Files 8 passed (8)` · `Tests 141 passed (141)`; `Усі перевірки пройдено` for the
          fixture harness.
FINDINGS: Two fixtures failed on first run and found two real defects:
  - `SOCIAL_WRAPPER` used `\b` before a Cyrillic preposition. JavaScript word boundaries only
    know `[A-Za-z0-9_]`, so `\bв Instagram:` never matched and the Instagram title would have
    been shown whenever the model was silent. Fixed.
  - My assumption that `0.0001` is an implausible amount was wrong: `isPlausibleAmount` accepts
    anything `> 0`. The fixture was wrong, not the code; it now asserts what the shared rule
    actually promises (`0` and absurdly large amounts are dropped).

## Run 2 — the whole path against the live gateway (2026-09-21)

VERDICT: PASS (partial — see the gap)
CLAIM:   `fetchLinkPreview` fetches a real page, strips it, calls the real AI Gateway and merges
         the answer, inside the time budget.
METHOD:  Ran `fetchLinkPreview` and then the three steps separately on `https://goodwine.ua`,
         authenticating with a freshly pulled `VERCEL_OIDC_TOKEN` passed as `AI_GATEWAY_API_KEY`
         (the gateway accepts either as a bearer token).
STEPS:
  1. `fetchLinkPreview("https://goodwine.ua")`
     -> 1 254 ms end to end, including the model call.
  2. Step by step on the same page
     -> 46 KB of HTML stripped to 2 534 characters; the model answered in 1 137 ms with
     `{"name":null,"price":null}` — correct, that page is a shop front, not a product.
  3. Merge
     -> the rules' title survived, because the model saying "no product" does not by itself make
     a non-generic title unusable.
EVIDENCE: `stripped=2534 chars` · `model : 1137ms {"name":null,"price":null}`.
FINDINGS: ~1.1 s for the model on a real page, well inside the 3 s "shop is slow" notice and the
8 s budget. Cost at that size is ~$0.0004 per link.

## Gap — not verified

No live page whose rule-based title is junk was tested end to end: Rozetka answers `403` to our
fetch, Instagram needs a login, and the shops that do answer publish honest titles. Those four
cases are covered by fixtures (run 1) and, on reconstructed page text, by the spikes in
`docs/research/ai-link-naming.md`. The first real proof will be a user pasting such a link.

`pnpm run verify:flows` was not run: it needs a staging database, and this change does not touch
the conversation flow — only what `fetchLinkPreview` returns.

## Run 3 — the whole card, on live shop pages (2026-09-21)

VERDICT: PASS
CLAIM:   On a real product page the card shows today's price, the product photo and a readable
         description, and a price the page never states is refused.
METHOD:  `fetchLinkPreview` against live pages through the live AI Gateway (`VERCEL_OIDC_TOKEN`
         passed as `AI_GATEWAY_API_KEY`), plus `pnpm test` and `pnpm run verify:scrape` offline.
STEPS:
  1. `allo.ua` tablet — page shows `9 499 ₴` struck through, `-500 ₴`, `8 999 ₴`, `375 ₴/міс`
     -> `Планшет Xiaomi Redmi Pad 2 WiFi 4/128GB Graphite Gray`, `8 999 ₴`, the 710×600 product
     photo, "Планшет обладнаний 11-дюймовим 2,5K-дисплеєм…", 1 858 ms.
  2. `allo.ua` air fryer — page shows `3 999 ₴`, `-1 777 ₴`, `2 222 ₴`, `222 ₴/міс`, and other
     offers "від 4 199 ₴"
     -> `Мультипіч Xiaomi Air Fryer Essential 6L`, `2 222 ₴`, product photo, two sentences,
     2 018 ms.
  3. `goodwine.ua` (a shop front, not a product)
     -> name from markup kept, no price, no description, 1 141 ms.
  4. Offline: a model answer of `6 999 ₴` against a page stating 9 499 / 8 999 / 375
     -> refused, card keeps the markup price.
EVIDENCE: `Test Files 8 passed (8)` · `Tests 150 passed (150)`; `Усі перевірки пройдено`.
FINDINGS: Three defects, each found by running the thing rather than by reading it:
  - The first image filter rejected any `WxH` in a URL, so Allo's real `/710x600/` photo was
    thrown out with the `/60x72/` thumbnails and the model picked an editorial "Rich_Review"
    image instead. Now only sides under 200 px are dropped.
  - `cheerio.text()` glues neighbouring blocks: `<div>9 499 ₴</div><div>8 999 ₴</div>` became
    `9 499 ₴8 999 ₴`. Tags are replaced with spaces before the text is read.
  - The price scanner read `Redmi Pad 2` + `9 499 ₴` as `29 499 ₴`, because grouped thousands
    were matched loosely. Groups must now look like groups.
