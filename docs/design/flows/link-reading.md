# Flow: reading a pasted shop link

Decisions for how a pasted link becomes a gift card when the shop may hide from bots. The
evidence behind every number here is `docs/research/scraper-bot-protection.md` (2026-09-23).
This file extends F2/F3 in `docs/FLOWS.md` and ADR 0006 (the model reads the page, the code
checks it). It supersedes nothing: the plain-fetch path stays exactly as it is for every shop
that lets us in.

## Principles

1. **The person never waits for a shop.** Whatever the bot knows, it shows at once; anything
   slow happens after the reply and edits the same screen. Why: a walled read takes 8-25 s, and
   the live-screen design already edits in place instead of stacking messages.
2. **Cheapest layer first, the person last.** Plain fetch → a real browser in Vercel Sandbox →
   (later) a search API → the person. The person is the only layer that never fails. That is what
   "every case closed" means — no automatic method opens every shop (Comfy refused all 15 Vercel
   addresses tried).
3. **What the person typed always wins.** A background result fills only empty fields and never
   replaces a value the person entered. Why: a price that silently changes under someone's finger
   is worse than no price.
4. **The background never takes over the screen the person moved to.** It edits a screen only
   while that screen is still the one it started from; otherwise it quietly updates the draft.
5. **The model never sees an empty or challenge page** (#20). A wall is its own outcome, not an
   empty page with a URL in it.

## The flow

```
link arrives (F3)
 └─ screen: «🔎 Дивлюся, що там…»                                   t = 0
    └─ L0 plain fetch, browser headers, ≤ 8 s budget (as today)
       ├─ page read → ADR 0006 model → draft card                   ~1-4 s   DONE
       ├─ not a page (404, not HTML, bad address) → «Не зміг відкрити…», ask the name   DONE
       └─ WALL (cf-mitigated / x-amzn-waf-action / a plain 403 / 2xx with an empty body; 429 and 503 are "failed")
          ├─ draft saved: url, store (host); readingSince = now
          ├─ screen (same message): «Магазин не пускає одразу — дивлюся уважніше…»
          │   + the name question armed (draft.title), so typing a name works at once
          ├─ webhook answers Telegram; the rest runs under waitUntil
          └─ BACKGROUND, total cap 40 s
             ├─ L1 wave 1: 3 fresh sandboxes in parallel (fra1, cdg1, lhr1), windowed Chrome,
             │   a challenged page gets 3 s, first page read wins            ~8-12 s
             ├─ L1 wave 2 (only if all 3 refused): 3 more sandboxes           +8-12 s
             ├─ L2 search API by product id (phase 4, needs a key)            +1-2 s
             └─ merge (rules below) → edit the screen if it is still ours
                ├─ something found → draft card (or list choice)
                └─ nothing → «Цей магазин не пускає мене подивитись 😕 Напиши назву…»
```

A photo or a plain name never enters this flow (F3 steps 5 and 8 are unchanged).

## Merge and race rules

The draft carries two new fields: `readingSince` (the token of the running background read)
and `screenMessageId` (the message that currently shows this draft — the waiting screen, the
name question or the card).

| While the background reads, the person… | When the background finishes |
|---|---|
| does nothing | fill every empty field, clear the name question if a name was found, re-render the card in the same message |
| types a name | the name is saved and the card appears at once, with the line «🔎 Ще дочитую сторінку — ціна й фото з'являться тут»; the background later fills price, photo, store, comment only, and re-renders that card if it is still the live screen |
| taps «✅ Додати» | the gift is saved as it is; the background finds no draft and drops its result |
| pastes another link / starts another gift | a link is never taken as the answer to the name question (today it is — `applyGiftAnswer` saves any text as the title, `src/features/gifts.ts:430`); it starts a new gift, `startDraft` resets `readingSince`, and the old read sees a different token and drops its result |
| navigates elsewhere | the draft is updated silently; «Продовжити» later shows the filled card |

A read is "ours" only while `draft.readingSince` still equals the token it started with. It
edits a screen only while `user.screenMessageId === draft.screenMessageId`.

## Page reader (L1)

- **Where:** Vercel Sandbox, the project's own OIDC auth, no machine of ours.
- **What runs:** Google Chrome with a window on an Xvfb display, driven by Playwright. Headless
  Chrome is out: it passed 0 of 5 Cloudflare shops from anywhere.
- **Waves:** 3 sandboxes started in parallel. The first one to read the page wins; a second wave
  only if all three were refused. Measured: Rozetka read in the first wave 4 of 4 times.
- **Fail fast:** a `cf-mitigated: challenge` page never cleared later in any run, so it gets 3 s.
  An AWS WAF `202` gets the long wait, because it does clear.
- **Output:** the rendered HTML, read back with `readFileToBuffer`, goes through the existing
  `parseLinkPreview` → `buildPageContext` → `suggestGiftCard` → `applyGiftCard` path unchanged.
- **Snapshots:** one persistent, named builder sandbox per region — `page-reader-fra1`,
  `page-reader-cdg1`, `page-reader-lhr1` (the cleanest addresses in the rotation run). Its
  snapshots are the reader's image, found with `Snapshot.list({ name })`, newest first — so no
  database table and no migration. Measured 2026-09-24: deleting a named sandbox makes its
  snapshots unfindable by name, so the builders are never deleted, only stopped.
  Snapshots are created with no expiry and the builder keeps its last two
  (`keepLastSnapshots`); the hourly cron rebuilds at most one region per run when its newest
  snapshot is missing or older than 7 days (resume the builder, upgrade Chrome, snapshot). A
  broken cron therefore ages the image instead of deleting it. ~1 GB per snapshot, ~6 GB total.
- **Reader sandboxes are disposable:** `persistent: false`, deleted after every read. Measured
  2026-09-24: a sandbox is persistent by default and a persistent sandbox snapshots its disk on
  stop — the spikes left 39 stopped sandboxes and 38 GB of snapshots behind before this was
  caught and cleaned up.
- **Off switch:** `PAGE_READER=off` skips L1 entirely; the person layer still works.

## Texts (draft, final wording in `src/text.ts`)

- Waiting on a wall: «🔎 Магазин не пускає одразу — дивлюся уважніше, це до пів хвилини.» + an
  empty line + «Можеш не чекати: напиши назву сам, а фото й ціну я додам, щойно побачу.»
- On the card while reading: «🔎 Ще дочитую сторінку — ціна й фото з'являться тут.»
- Nothing found: «Цей магазин не пускає мене подивитись 😕» + an empty line + «Напиши назву
  подарунка — посилання я вже зберіг.»

No 💜 in any of them (a wait and a failure are not warm moments); 🔎 is the functional icon the
flow already uses.

## Phases — each is one pull request, each has a checkable "done"

1. **Wall detection and browser headers** (#20).
   - Done when `cf-mitigated: challenge`, `x-amzn-waf-action`, a plain `403` (olx.ua's CloudFront
     wall) and a `2xx` with an empty body each come back as "blocked", with a fixture test each,
     and `429`/`503` stay "failed" — a shop that is down must not boot the browser (design log
     `docs/design/objections/fix/wall-detection.md`, OBJ-2).
   - Done when the model is never called on an empty page, and a model price for a page that
     states no priced amount is accepted only when that number appears on the page (OBJ-1).
   - Done when requests carry browser headers instead of `WishlistBot` (no `sec-fetch-*`: Node's
     fetch rewrites them, OBJ-4).
   - Done when typecheck, lint, unit tests and `verify:flows` are green.
2. **Page reader** (#25). `readWalledPage(url)` in `src/lib/page-reader.ts`, the named builders
   and their snapshots, the cron rebuild and the off switch.
   - Done when, called from a deployed preview, it reads the Rozetka test product in at least
     3 of 4 tries within 30 s.
   - Done when a missing or week-old snapshot is rebuilt by the cron without a person.
   - Done when a read leaves no sandbox and no snapshot behind.
3. **Background fill.** `readingSince` / `screenMessageId` on the draft, the merge rules, the
   texts, and `waitUntil` in the link path.
   - Done when `verify:flows` covers the five rows of the race table.
   - Done when a link sent in answer to a draft text question (except the link question
     itself, `draft.url`) starts a new gift instead of becoming that field's value.
4. **Search API layer.** Needs the owner to register a Brave Search API key.
   - Done when a walled link the browser could not open still gets a name.
5. **Reading a screenshot.** A photo sent as a gift gets its name and price read by a vision
   call. This is the person layer with less typing.

## Open, decided in the phase that meets them

- Real Sandbox cost on Pro. Watch the usage page for the first two weeks, then decide whether a
  per-person daily cap is needed.
- Sandbox concurrency limits on Pro. Six parallel boots per link are fine for us, but not
  verified under bursts.
- Whether a saved gift should be patched when the background finishes after «✅ Додати». Not in
  v1: the card says it is still reading.
