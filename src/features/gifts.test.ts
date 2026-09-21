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

import { applyGiftAnswer } from "./gifts.js";

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
