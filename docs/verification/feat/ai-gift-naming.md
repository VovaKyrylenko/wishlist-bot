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
