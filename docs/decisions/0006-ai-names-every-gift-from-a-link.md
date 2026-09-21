# 0006: A model reads the whole gift card off the page; the code checks its answer

Status: accepted
Date: 2026-09-21

## Context

The bot reads a pasted shop page with fixed rules (JSON-LD → microdata → OpenGraph → visible
DOM). When a shop publishes real product markup the rules are exact and free. When it does not,
they do not degrade — they confidently pick the wrong text. A list the owner looked at on
2026-09-21 showed `Головна` twice (a home-page `<title>`), `Інтернет магазин кави` (the shop's
name) and two `… в Instagram: "…"` captions. A guest reading that list cannot tell what any of
those gifts is, which defeats the product's whole purpose (issue #16).

Writing more heuristics was the obvious alternative and it is a losing game: every new shop
invents a new way to be unhelpful, and a heuristic that decides "this title is junk" has to be
right about titles in any language.

The constraints that shaped the choice: the lookup already has an 8 s budget with a "shop is
slow" notice at 3 s (`src/features/gifts.ts`); the user base is small, so a few hundred links a
month; and ADR 0001 already calls the Vercel AI Gateway from this repository — the project is
not adopting a vendor here, it is reusing one.

Evidence: `docs/research/ai-link-naming.md` (2026-09-21), including measurements against the
live gateway.

## Decision

Every link lookup asks a model to read the page and fill the whole card — name, which price is
today's price, one or two sentences of description, and which photo is the product.

- **The rules go first and supply facts.** `parseLinkPreview` still extracts title, price,
  currency, image and shop from markup. Those facts are handed to the model as facts.
- **The model chooses among candidates, it does not invent.** `buildPageContext`
  (`src/lib/gift-card.ts`) gives it: the markup facts; every price on the page with the words
  around it (so it can tell `3 999 ₴` struck through from `2 222 ₴` today and from
  `222 ₴/міс` in credit); up to ten images that are not thumbnails, the markup's own image
  first; and **the whole visible text of the page**, capped at 60 000 characters.
- **The code checks the answer.** A price is accepted only if that amount appears among the
  amounts the page itself states, and only through `parsePrice`/`isPlausibleAmount`/`formatPrice`.
  A photo is accepted only as an index into the list we showed. The currency is taken from the
  page whenever the page wrote a different one next to that amount, so a page priced in ₴ can
  never become a card priced in `$`. The name is cut to
  `MAX_TITLE_LENGTH`; the description is stripped of hashtags and emoji, cut to 300 characters
  at a sentence end, and dropped if it is too short to be a sentence.
- **The description becomes the gift's comment** on the draft screen, where the owner can
  rewrite or clear it before saving.
- Model `google/gemini-3.5-flash-lite` through the Vercel AI Gateway, called with plain `fetch`
  on the OpenAI-compatible endpoint with `response_format: { type: "json_schema", strict: true }`,
  authenticated with `AI_GATEWAY_API_KEY` — the same client shape and secret as
  `scripts/release/notes.ts` (ADR 0001). No new runtime dependency.
- Page text is passed as data inside a delimiter, with a system instruction saying it is data.
- **One budget covers the whole lookup.** `fetchLinkPreview` sets an 8 s deadline; every
  redirect hop and the model call share what is left of it, and the model is skipped rather
  than called with under a second to spare.
- When the model is slow, fails, or no key is configured, the card is the rule-based one —
  except when its title is a generic page name, the shop name or a social wrapper, where the
  user is asked to type a name instead. The whole lookup stays inside the existing 8 s budget.

## Alternatives considered

- **Let the markup's price always win, and ask the model only for the name** (the first shape
  of this decision, 2026-09-21). Simpler, and wrong twice over: markup is often absent, and on
  the pages where it exists the page still shows an old price, a credit instalment and a
  neighbour's price — deciding between those is reading, which is what the model is for. The
  check against the page's own amounts keeps the safety that rule gave.
- **Send a window of text around the `<h1>` instead of the whole page.** Cheaper (~4 000
  tokens against ~13 000) and the first implementation of this decision. It needs an anchor,
  and every anchor broke on real markup: a multi-line `<h1>` does not match the
  whitespace-collapsed text, and themes that wrap the title in `<header>` lose it completely —
  both verified. Falling back to "the first N characters" put us back in the failure below.
  The whole text answered identically on every page measured, so the complexity bought nothing.
- **Give the model the page text and trust its answer.** Measured and rejected: fed the first
  12 000 characters of a live Allo page, `gemini-3.5-flash-lite` and `gpt-5.4-mini` both
  returned `6 999 ₴` for a tablet that costs `8 999 ₴` — a number printed nowhere on the page.
  The truncation had cut the price block away. Facts + candidates + text around the `<h1>` fixed
  it for three models at once.
- **AI only as a fallback, when the rules return nothing.** Cheaper, and it was the first shape
  of issue #16. It fails on the actual failure mode: the rules returned `Головна` — a non-empty,
  confidently wrong answer. Making it work needs a "is this name junk?" classifier, which is the
  heuristic problem again, in a harder form.
- **More parsing heuristics, no model.** Free and predictable, but each rule covers one shop's
  mistake, and the Instagram case (product hidden inside a caption) is not reachable by any
  rule over markup.
- **The `ai` SDK (v7) with Zod.** Used for the spikes and pleasant: `Output.object()`, built-in
  `timeout` and `maxRetries`, gateway model-fallback. Rejected here for two runtime
  dependencies in a webhook function plus a Node ≥ 22 `engines` bump, when a raw POST gets the
  same schema-constrained JSON (verified against both candidate models). Worth revisiting if
  streaming, tool calls or automatic multi-model failover are ever needed.
- **`anthropic/claude-haiku-4.5`.** Best detail retention of the three tested and the only one
  with `zdr: all`, but 3× the price and up to 3.3 s — too slow for a budget that already spends
  seconds on the shop itself. Reconsider if the cheap model starts producing thin names.
- **`openai/gpt-5.4-nano`.** Equally correct in the spike and slightly cheaper; kept as the
  documented switch if Gemini's quality or availability disappoints. A per-request automatic
  failover was rejected: a second model call does not fit the 8 s budget.

## Consequences

- Gift names stop being a lottery of what a shop happens to put in `<title>`, which is what
  makes a shared list readable by someone who did not paste the link.
- Every link now costs a model call (~13 000 input tokens on a real page, ~$0.004) and about
  two seconds end to end — the model itself answers in ~1.2 s even on a 35 KB prompt. The 3 s "shop is slow" notice absorbs it; the budget's headroom
  shrinks. At 500 links a month that is well under a dollar.
- Gifts arrive with a description the owner did not write. It lands in the comment, which is
  visible and editable on the draft screen before saving — but a guest will read whatever the
  owner leaves there.
- The bot gains a runtime dependency on an external service. Degradation is designed
  (rule-based name, or ask the user), but a gateway outage makes naming worse than today for
  pages whose rule-based title is junk.
- **Accepted risk:** the model can be wrong in a plausible way — the right-looking name,
  description or photo for the wrong item on a page that lists several. The price is the one
  field with an independent check (it must exist on the page); name, description and photo rest
  on the model's reading and on the owner glancing at the draft. The user sees the name on the draft
  screen before saving and can edit it; nothing is posted anywhere without them.
- **Accepted risk:** pasted pages are untrusted text going into a prompt. Two injection attempts
  were ignored by both candidate models in the spike, and the JSON schema plus our own
  truncation bound the blast radius to "a wrong name in a draft the user can edit". This is
  mitigation, not proof.
- Page content (public shop pages) is sent to a third party. Catalogue flags for the chosen
  model: `no_training: all`, `zdr: some`. No personal data is sent: only the page text.
- A new secret, `AI_GATEWAY_API_KEY`, must exist in the Vercel project — CI already uses one
  for releases.

## Acceptance criteria

- [ ] The four real failures from issue #16 are asserted and each yields a recognisable product
      name; pages with clean markup keep the names they have today.
      check: `pnpm test` (`src/lib/gift-card.test.ts`) and `pnpm run verify:scrape`
- [ ] A price the page does not state is dropped, a photo index outside the offered list is
      dropped, and a currency the page did not write next to that amount is replaced by the
      page's own.
      check: `pnpm test`
- [ ] The whole lookup, fetch plus model, stays inside one 8 s budget.
      check: `pnpm test`
- [ ] With no `AI_GATEWAY_API_KEY` set, link lookup still works and no request is made; a gateway
      failure leaves the user with the rule-based card.
      check: `pnpm test`
- [ ] On a live shop page with a struck-through old price, the card shows today's price, the
      product photo and a readable description, inside the 8 s budget.
      manual: run the lookup against the live gateway → evidence: `docs/verification/feat/ai-gift-naming.md`

## Supersedes

## Superseded by
