# Verification — fix/wall-detection (#20)

Date: 2026-09-24. Machine: the owner's Mac (home connection). Branch head at the time: eb638f1 (code), b31d517 (design log).

## Static checks

| Check | Result |
|---|---|
| `pnpm run typecheck` | clean |
| `pnpm run lint` | 0 errors, 55 warnings — the same count as `main` (two new empty-block warnings in the new tests were fixed) |
| `pnpm test` | 8 files, 189 tests passed |
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

## Live run against real shops (fetch layer only, model key unset)

`fetchLinkPreview` from this branch, one request per URL:

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

Not verified here: behaviour from a Vercel IP (production); the model step with a real key (unchanged by this branch except for the two new gates, which the unit tests pin).
