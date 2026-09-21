# 0006: Every gift parsed from a link is named by a model, called with plain fetch

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

Every link lookup asks a model for the gift's name, not only the ones the rules failed on.

- The rules still run first and still own what they are exact about: price and currency from
  structured markup, the image, the shop name. The model is asked for the **name**, and for a
  price only as a fallback when the markup had none.
- Model `google/gemini-3.5-flash-lite` through the Vercel AI Gateway. Measured on the four
  cases above: every one named correctly, 0.7-1.2 s, ~$0.0004 per link (~$0.20/month at 500
  links; the gateway adds no markup).
- Called with plain `fetch` on the gateway's OpenAI-compatible endpoint with
  `response_format: { type: "json_schema", strict: true }`, authenticated with
  `AI_GATEWAY_API_KEY` — the same client shape and the same secret name as
  `scripts/release/notes.ts` (ADR 0001). No new runtime dependency.
- The model's output is never trusted as-is: the name is trimmed and truncated to
  `MAX_TITLE_LENGTH`, and any price goes through `parsePrice`/`isPlausibleAmount`/`formatPrice`
  exactly like every other source.
- Page text is passed as data inside a delimiter, with a system instruction saying it is data.
  Only stripped visible text is sent, capped in size.
- When the model is slow, fails, or no key is configured, the lookup falls back to the
  rule-based name — except when that name is obviously not a product, where the user is asked
  to type a name instead. The whole lookup stays inside the existing 8 s budget.

## Alternatives considered

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
- Every link now costs a model call (~1 000 input tokens on a real page) and roughly one
  second. The 3 s "shop is slow" notice absorbs it; the budget's headroom shrinks.
- The bot gains a runtime dependency on an external service. Degradation is designed
  (rule-based name, or ask the user), but a gateway outage makes naming worse than today for
  pages whose rule-based title is junk.
- **Accepted risk:** the model can be wrong in a plausible way — a name that reads fine but
  describes the wrong item on a page with several products. The user sees the name on the draft
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
      check: `pnpm test` (`src/lib/gift-name.test.ts`) and `pnpm run verify:scrape`
- [ ] With no `AI_GATEWAY_API_KEY` set, link lookup still works and no request is made.
      check: `pnpm test`
- [ ] A gateway failure leaves the user with today's behaviour rather than an error.
      check: `pnpm test`
- [ ] A real link pasted into the bot produces a named gift within the 8 s budget.
      manual: run the lookup against the live gateway → evidence: `docs/verification/feat/ai-gift-naming.md`

## Supersedes

## Superseded by
