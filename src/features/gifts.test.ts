import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MyContext } from "../context.js";
import type { Pending } from "../lib/pending.js";
import { t } from "../text.js";

// Boundary (deliberate): this proves applyGiftAnswer reports the truth about a
// draft write instead of always claiming success — it does not prove the real
// Prisma call throws under any particular condition, only that when the write
// comes back empty-handed the notice says so instead of "Оновлено".

const state = vi.hoisted(() => ({
  user: { id: "me", previousSeenAt: new Date() } as unknown,
  draftUpdateResult: null as unknown,
  clearPendingCalls: 0,
}));

vi.mock("../db.js", () => ({ prisma: {} }));

vi.mock("../lib/users.js", () => ({ currentUser: async () => state.user }));

vi.mock("../lib/pending.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/pending.js")>();
  return { ...actual, clearPending: async () => { state.clearPendingCalls++; } };
});

vi.mock("../lib/drafts.js", () => ({
  getDraft: async () => null,
  updateDraft: async () => state.draftUpdateResult,
  dropDraft: async () => undefined,
  startDraft: vi.fn(async () => undefined),
}));

const renderScreenSpy = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../lib/screen.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/screen.js")>();
  return { ...actual, renderScreen: renderScreenSpy, ack: async () => undefined };
});

const renderHomeSpy = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("./home.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./home.js")>();
  return { ...actual, renderHome: renderHomeSpy };
});

const lookup = vi.hoisted(() => ({ fetchLinkPreview: vi.fn() }));
vi.mock("../lib/scrape.js", () => lookup);

const askSpy = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../lib/prompt.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/prompt.js")>();
  return { ...actual, ask: askSpy };
});

import { startDraft } from "../lib/drafts.js";
import { applyGiftAnswer, draftFromLookup, startGiftFromInput } from "./gifts.js";

function fakeCtx(text: string): MyContext {
  return { message: { text }, callbackQuery: undefined } as unknown as MyContext;
}

describe("applyGiftAnswer — editing a draft field", () => {
  beforeEach(() => {
    renderScreenSpy.mockClear();
    renderHomeSpy.mockClear();
    state.clearPendingCalls = 0;
  });

  it("reports the real outcome when the draft write lands", async () => {
    state.draftUpdateResult = { id: "d1", title: "New name" };
    const pending: Pending = { action: "draft.title" };

    const handled = await applyGiftAnswer(fakeCtx("New name"), pending);

    expect(handled).toBe(true);
    // getDraft is mocked to null, so renderDraft falls through to renderHome —
    // the honest failure/success signal is the notice it was given either way.
    expect(renderHomeSpy).toHaveBeenCalledWith(expect.anything(), 0, { notice: t.gift.updated });
  });

  it("does not claim success when the draft write comes back empty", async () => {
    state.draftUpdateResult = null;
    const pending: Pending = { action: "draft.title" };

    const handled = await applyGiftAnswer(fakeCtx("New name"), pending);

    expect(handled).toBe(true);
    expect(renderHomeSpy).toHaveBeenCalledWith(expect.anything(), 0, { notice: t.common.draftGone });
  });
});

describe("draftFromLookup — what a pasted link leaves in the draft", () => {
  const URL_ = "https://rozetka.com.ua/ua/p547497342/";
  const preview = {
    title: "Настільна гра Бункер",
    imageUrl: "https://img.example/1.jpg",
    price: "799 ₴",
    priceAmount: 799,
    priceCurrency: "UAH",
    store: "rozetka.com.ua",
    description: "Гра для компанії.",
  };

  // A wall and a dead link both keep the link and ask for the name (C4: the bot
  // never goes silent); only the card path fills anything in.
  it.each([
    ["a wall", { kind: "blocked", host: "rozetka.com.ua", by: "cloudflare", status: 403 } as const],
    ["a failed lookup", { kind: "failed" } as const],
    ["a card with no name", { kind: "card", preview: { ...preview, title: null } } as const],
  ])("keeps only the link for %s", (_name, result) => {
    expect(draftFromLookup(URL_, result)).toEqual({ url: URL_ });
  });

  it("fills the draft from a card", () => {
    expect(draftFromLookup(URL_, { kind: "card", preview })).toEqual({
      url: URL_,
      title: "Настільна гра Бункер",
      imageUrl: "https://img.example/1.jpg",
      price: "799 ₴",
      priceAmount: 799,
      priceCurrency: "UAH",
      store: "rozetka.com.ua",
      comment: "Гра для компанії.",
    });
  });
});

describe("a pasted link the scraper could not read — what the person sees", () => {
  const LINK = "https://rozetka.com.ua/ua/p547497342/";

  beforeEach(() => {
    askSpy.mockClear();
    vi.mocked(startDraft).mockClear();
  });

  // The whole path, not just the mapping: a wall and a dead link must both end
  // on the name question, with the link already kept (C4: never a dead end).
  it.each([
    ["a wall", { kind: "blocked", host: "rozetka.com.ua", by: "cloudflare", status: 403 }],
    ["a failed lookup", { kind: "failed" }],
  ])("keeps the link and asks for the name after %s", async (_name, result) => {
    lookup.fetchLinkPreview.mockResolvedValue(result);
    await startGiftFromInput(fakeCtx(LINK), { url: LINK }, "list-1");
    expect(startDraft).toHaveBeenCalledWith("me", { wishlistId: "list-1", url: LINK });
    expect(askSpy).toHaveBeenCalledWith(
      expect.anything(),
      "draft.title",
      expect.objectContaining({ text: t.gift.scrapeFailed, replace: true }),
    );
  });
});
