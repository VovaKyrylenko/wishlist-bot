// A gift: its screen, its editing, and the draft it is born in.
//
// Adding a gift is the core loop of the product, so it has no form. Whatever
// the user sends — a shop link, a photo, three words — becomes a preview card
// they can fix *before* anything is saved, and tapping "Додати" is the only
// commitment. Nothing here is a conversation: an unanswered question is just a
// note on the user row, so a person can wander off mid-way and come back to
// "Ти не закінчив додавати «…». Продовжити?".

import { InlineKeyboard, type Bot } from "grammy";
import type { MyContext } from "../context.js";
import { prisma } from "../db.js";
import { currentUser } from "../lib/users.js";
import { fetchLinkPreview } from "../lib/scrape.js";
import { computeAvailability, holdingReservations } from "../lib/availability.js";
import { escapeHtml, PRIORITY_NAME } from "../lib/format.js";
import { clearPending, type Pending } from "../lib/pending.js";
import { ask, MAX_ANSWER_LENGTH } from "../lib/prompt.js";
import { dropDraft, getDraft, startDraft, updateDraft, type DraftFields } from "../lib/drafts.js";
import { notifyGuestGiftRemoved, notifyGuestGiftRestored } from "../lib/notify.js";
import {
  ack,
  block,
  blocks,
  nudgeLiveScreen,
  renderScreen,
  replaceLiveScreen,
  truncate,
} from "../lib/screen.js";
import { renderHome, withUndo, type ScreenOptions } from "./home.js";
import { renderList, requireList } from "./lists.js";
import type { Draft } from "../../generated/prisma/client.js";
import type { Priority } from "../../generated/prisma/enums.js";
import { t } from "../text.js";

const MAX_TITLE_LENGTH = 200;
/** Long enough to undo a mistap, short enough that "повернути" stays honest. */
const UNDO_WINDOW_MS = 5 * 60 * 1000;
/** After this many gifts the list is worth showing off, so sharing leads. */
const READY_TO_SHARE_AT = 3;
/** How long a shop may take before the user deserves an explanation. */
const SLOW_SCRAPE_MS = 3000;

type GiftField = "title" | "price" | "url" | "store" | "comment" | "photo" | "quantity";

/** Fields where "порожньо" is a value a person might actually want. */
const CLEARABLE = new Set<GiftField>(["price", "url", "store", "comment"]);

// ── S4 · Мій подарунок ─────────────────────────────────────────────────────

export async function renderGift(
  ctx: MyContext,
  giftId: string,
  page = 0,
  options: ScreenOptions = {},
) {
  const gift = await prisma.wishlistItem.findUnique({
    where: { id: giftId },
    include: { wishlist: true, reservations: { where: holdingReservations } },
  });
  if (!gift || gift.status !== "ACTIVE") {
    await renderHome(ctx, 0, { notice: t.common.giftGone });
    return;
  }
  const access = await requireList(ctx, gift.wishlistId);
  if (!access) return;

  const surprise = gift.wishlist.privacyMode === "SURPRISE";
  const availability = computeAvailability(gift.quantity, gift.reservations);
  const finished = gift.wishlist.status === "ARCHIVED";

  const siblings = await prisma.wishlistItem.findMany({
    where: { wishlistId: gift.wishlistId, status: "ACTIVE" },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  const index = siblings.findIndex((s) => s.id === gift.id);

  const kb = new InlineKeyboard();
  if (gift.url) kb.url(t.buttons.whereToBuy, gift.url).row();
  if (!finished) {
    kb.text(t.buttons.edit, `it:edit:${gift.id}`).row();
    if (siblings.length > 1) {
      const order = kb.row();
      if (index > 0) order.text(t.buttons.moveUp, `it:up:${gift.id}:${page}`);
      if (index >= 0 && index < siblings.length - 1) {
        order.text(t.buttons.moveDown, `it:down:${gift.id}:${page}`);
      }
      // Nudging a gift up one slot at a time meant nineteen taps to promote
      // the twentieth, so the common case gets its own button.
      if (index > 1) kb.row().text(t.buttons.moveTop, `it:top:${gift.id}:${page}`);
    }
    // Destructive last, never next to "✏️" (§15.3).
    kb.row().text(t.buttons.deleteGift, `it:del:${gift.id}:${page}`);
  }
  kb.row().text(t.buttons.back, `wl:open:${gift.wishlistId}:${page}`);

  await renderScreen(ctx, {
    photo: gift.imageUrl,
    keyboard: withUndo(kb, options),
    text: blocks(
      options.notice ?? null,
      t.gift.path(escapeHtml(truncate(gift.wishlist.title, 40)), escapeHtml(gift.title)),
      block(
        [gift.price, gift.store].filter((v): v is string => v !== null).map(escapeHtml).join(" · ") || null,
        gift.comment ? t.gift.commentLine(escapeHtml(gift.comment)) : null,
      ),
      block(
        gift.quantity > 1 ? t.gift.quantityLine(gift.quantity) : null,
        // "Хочу" is the default nobody chose, so saying it on every screen is
        // noise; the two ends of the scale are the ones worth stating.
        gift.priority !== "NORMAL" ? t.gift.priorityLine(PRIORITY_NAME[gift.priority]) : null,
        // The surprise contract covers counts, not just names: "заброньовано
        // 1 з 1" gives the game away exactly as thoroughly.
        !surprise && availability.reserved > 0
          ? t.gift.takenNote(availability.reserved, availability.needed)
          : null,
      ),
    ),
  });
}

/**
 * The same field menu serves a draft and a saved gift — everything editable
 * before the gift exists stays editable after, which is what keeps "додай
 * зараз, поправиш потім" an honest promise.
 */
function editMenu(
  data: (field: string) => string,
  back: string,
  extra: { removePhoto: string | null },
): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text(t.buttons.fieldTitle, data("title"))
    .text(t.buttons.fieldPrice, data("price"))
    .row()
    .text(t.buttons.fieldPhoto, data("photo"))
    .text(t.buttons.fieldUrl, data("url"))
    .row()
    .text(t.buttons.fieldStore, data("store"))
    .text(t.buttons.fieldComment, data("comment"))
    .row()
    .text(t.buttons.fieldQuantity, data("quantity"))
    .text(t.buttons.fieldPriority, data("priority"))
    .row();
  if (extra.removePhoto) kb.text(t.buttons.removePhoto, extra.removePhoto).row();
  return kb.text(t.buttons.back, back);
}

const FIELD_PROMPT: Record<GiftField, string> = {
  title: t.gift.askTitle,
  price: t.gift.askPrice,
  url: t.gift.askUrl,
  store: t.gift.askStore,
  comment: t.gift.askComment,
  photo: t.gift.askPhoto,
  quantity: t.gift.askQuantity,
};

// ── Чернетка: превʼю-картка ────────────────────────────────────────────────

/** Renders the card the user edits before anything is committed. */
export async function renderDraft(
  ctx: MyContext,
  options: ScreenOptions & { replace?: boolean } = {},
) {
  const user = await currentUser(ctx);
  const draft = await getDraft(user.id);
  if (!draft) {
    await renderHome(ctx, 0, options);
    return;
  }

  // A gift with no home yet — the user pasted a link with several lists open.
  if (!draft.wishlistId) {
    await renderListChoice(ctx, options);
    return;
  }

  const wishlist = await prisma.wishlist.findUnique({ where: { id: draft.wishlistId } });
  if (!wishlist) {
    await dropDraft(user.id);
    await renderHome(ctx, 0, { notice: t.common.listGone });
    return;
  }

  const screen = {
    photo: draft.imageUrl,
    keyboard: new InlineKeyboard()
      .text(t.buttons.save, "dr:save")
      .row()
      .text(t.buttons.editSomething, "dr:edit")
      .row()
      .text(t.buttons.cancel, "dr:cancel"),
    text: blocks(
      options.notice ?? null,
      t.gift.previewHeader(escapeHtml(truncate(wishlist.title, 40))),
      draft.title ? `<b>${escapeHtml(draft.title)}</b>` : t.gift.previewNoTitle,
      block(
        draft.price ? t.gift.previewLine(t.buttons.fieldPrice, escapeHtml(draft.price)) : null,
        draft.store ? t.gift.previewLine(t.buttons.fieldStore, escapeHtml(draft.store)) : null,
        draft.comment ? t.gift.commentLine(escapeHtml(draft.comment)) : null,
        draft.quantity > 1 ? t.gift.quantityLine(draft.quantity) : null,
        draft.priority !== "NORMAL"
          ? t.gift.previewLine(t.buttons.fieldPriority, PRIORITY_NAME[draft.priority])
          : null,
      ),
      t.gift.previewHint,
    ),
  };

  if (options.replace) await replaceLiveScreen(ctx, screen);
  else await renderScreen(ctx, screen);
}

/** F3 — a gift arrived but the user keeps several lists, so ask which one. */
async function renderListChoice(ctx: MyContext, options: ScreenOptions = {}) {
  const user = await currentUser(ctx);
  const wishlists = await prisma.wishlist.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ ownerId: user.id }, { editors: { some: { userId: user.id } } }],
    },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  const kb = new InlineKeyboard();
  for (const wl of wishlists) kb.text(truncate(wl.title, 30), `dr:to:${wl.id}`).row();
  kb.text(t.buttons.newList, "wl:new").row();
  kb.text(t.buttons.cancel, "dr:cancel");

  await renderScreen(ctx, {
    text: blocks(options.notice ?? null, t.gift.smartAskWhichList),
    keyboard: kb,
  });
}

/**
 * The one slow thing the product does. Three seconds in, the screen stops
 * pretending it is nearly done and says the shop is slow; at eight the scraper
 * gives up and the user is offered the way out that always works — type a name.
 */
async function buildDraftFromUrl(ctx: MyContext, url: string): Promise<DraftFields> {
  await renderScreen(ctx, { text: t.gift.lookingUp });

  const slowTimer = setTimeout(() => {
    void nudgeLiveScreen(ctx, t.gift.lookingUpSlow);
  }, SLOW_SCRAPE_MS);

  try {
    const preview = await fetchLinkPreview(url);
    if (!preview?.title) return { url };
    return {
      url,
      title: truncate(preview.title, MAX_TITLE_LENGTH),
      imageUrl: preview.imageUrl,
      price: preview.price,
      store: preview.store,
    };
  } finally {
    clearTimeout(slowTimer);
  }
}

/**
 * Anything the user sends that means "add a gift", from anywhere. `wishlistId`
 * is known when the input came from a list screen and has to be chosen when it
 * did not — which is the only difference between the two paths.
 */
export async function startGiftFromInput(
  ctx: MyContext,
  input: { url?: string; photoFileId?: string; text?: string },
  wishlistId: string | null,
): Promise<void> {
  const user = await currentUser(ctx);
  await clearPending(ctx, user.id);

  let fields: DraftFields = { wishlistId };
  if (input.url) {
    fields = { ...fields, ...(await buildDraftFromUrl(ctx, input.url)) };
  } else if (input.photoFileId) {
    fields = { ...fields, imageUrl: input.photoFileId, title: input.text ?? null };
  } else if (input.text) {
    fields = { ...fields, title: truncate(input.text, MAX_TITLE_LENGTH) };
  }

  await startDraft(user.id, fields);

  // A link the scraper could not read, or a bare photo: one question stands
  // between here and a saved gift, and it asks for the only thing missing.
  if (!fields.title) {
    await ask(ctx, "draft.title", {
      text: input.url ? t.gift.scrapeFailed : t.gift.askPhotoTitle,
      back: "dr:cancel",
      // The "🔎 Дивлюся…" card is still on screen; this question takes its place.
      replace: Boolean(input.url),
    });
    return;
  }

  await renderDraft(ctx, { replace: Boolean(input.url) });
}

/** Commits the draft. This is the only moment a gift starts existing. */
async function saveDraft(ctx: MyContext) {
  const user = await currentUser(ctx);
  const draft = await getDraft(user.id);
  if (!draft) {
    await renderHome(ctx, 0);
    return;
  }
  if (!draft.wishlistId) {
    await renderListChoice(ctx);
    return;
  }
  if (!draft.title) {
    await ask(ctx, "draft.title", { text: t.gift.askTitle, back: "dr:show" });
    return;
  }

  const access = await requireList(ctx, draft.wishlistId);
  if (!access) {
    await dropDraft(user.id);
    return;
  }

  const maxSort = await prisma.wishlistItem.aggregate({
    where: { wishlistId: draft.wishlistId },
    _max: { sortOrder: true },
  });
  await prisma.wishlistItem.create({
    data: {
      wishlistId: draft.wishlistId,
      title: truncate(draft.title, MAX_TITLE_LENGTH),
      url: draft.url,
      imageUrl: draft.imageUrl,
      price: draft.price,
      store: draft.store,
      comment: draft.comment,
      quantity: draft.quantity,
      priority: draft.priority,
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
    },
  });

  await dropDraft(user.id);
  await clearPending(ctx, user.id);

  const total = await prisma.wishlistItem.count({
    where: { wishlistId: draft.wishlistId, status: "ACTIVE" },
  });

  // Followers hear about new gifts from the hourly digest instead of here:
  // filling a list in one sitting used to fire a notification per gift.
  const title = escapeHtml(truncate(draft.title, 60));
  const listTitle = escapeHtml(truncate(access.wishlist.title, 40));

  const kb = new InlineKeyboard();
  if (total >= READY_TO_SHARE_AT) {
    kb.text(t.buttons.share, `wl:share:${draft.wishlistId}`).row();
    kb.text(t.buttons.oneMore, `it:add:${draft.wishlistId}`).row();
  } else {
    kb.text(t.buttons.oneMore, `it:add:${draft.wishlistId}`).row();
    kb.text(t.buttons.share, `wl:share:${draft.wishlistId}`).row();
  }
  kb.text(t.buttons.toList, `wl:open:${draft.wishlistId}:0`);

  await renderScreen(ctx, {
    keyboard: kb,
    text:
      total === 1
        ? t.gift.addedFirst(title, listTitle)
        : total >= READY_TO_SHARE_AT
          ? t.gift.addedReadyToShare(title, listTitle)
          : t.gift.added(title, listTitle),
  });
}

// ── Відповіді на запитання про подарунок ───────────────────────────────────

function priorityKeyboard(prefix: string, back: string): InlineKeyboard {
  return new InlineKeyboard()
    .text(t.buttons.priorityHigh, `${prefix}:HIGH`)
    .row()
    .text(t.buttons.priorityNormal, `${prefix}:NORMAL`)
    .row()
    .text(t.buttons.priorityLow, `${prefix}:LOW`)
    .row()
    .text(t.buttons.back, back);
}

function parseQuantity(text: string): number | null {
  const value = Number(text.trim().replace(",", "."));
  return Number.isInteger(value) ? value : null;
}

/** Applies a text or photo answer that belongs to a gift or a draft. */
export async function applyGiftAnswer(ctx: MyContext, pending: Pending): Promise<boolean> {
  const user = await currentUser(ctx);
  const text = ctx.message?.text?.trim() || ctx.message?.caption?.trim();
  const photoFileId = ctx.message?.photo?.at(-1)?.file_id;

  // ── чернетка ────────────────────────────────────────────────────────────
  if (pending.action === "draft.photo") {
    if (!photoFileId) {
      await renderDraft(ctx, { notice: t.gift.photoPlease });
      return true;
    }
    const saved = await updateDraft(user.id, { imageUrl: photoFileId });
    await clearPending(ctx, user.id);
    await renderDraft(ctx, { notice: saved ? t.gift.updated : t.common.draftGone });
    return true;
  }

  if (pending.action.startsWith("draft.")) {
    const field = pending.action.slice("draft.".length) as GiftField;
    if (!text) {
      await renderDraft(ctx, { notice: t.common.textPlease });
      return true;
    }
    if (text.length > MAX_ANSWER_LENGTH) {
      await renderDraft(ctx, { notice: t.common.tooLong(MAX_ANSWER_LENGTH) });
      return true;
    }

    let saved: Draft | null;
    if (field === "quantity") {
      const quantity = parseQuantity(text);
      if (quantity === null) {
        await renderDraft(ctx, { notice: t.common.numberPlease });
        return true;
      }
      if (quantity < 1) {
        await renderDraft(ctx, { notice: t.gift.quantityMinOne });
        return true;
      }
      saved = await updateDraft(user.id, { quantity });
    } else {
      saved = await updateDraft(user.id, { [field]: truncate(text, MAX_TITLE_LENGTH) } as DraftFields);
    }

    await clearPending(ctx, user.id);
    await renderDraft(ctx, { notice: saved ? t.gift.updated : t.common.draftGone });
    return true;
  }

  // ── збережений подарунок ────────────────────────────────────────────────
  if (!pending.action.startsWith("gift.") || !pending.id) return false;
  const giftId = pending.id;
  const field = pending.action.slice("gift.".length) as GiftField;

  const gift = await prisma.wishlistItem.findUnique({ where: { id: giftId } });
  if (!gift || gift.status !== "ACTIVE") {
    await clearPending(ctx, user.id);
    await renderHome(ctx, 0, { notice: t.common.giftGone });
    return true;
  }
  if (!(await requireList(ctx, gift.wishlistId))) {
    await clearPending(ctx, user.id);
    return true;
  }

  if (field === "photo") {
    if (!photoFileId) {
      await renderGift(ctx, giftId, 0, { notice: t.gift.photoPlease });
      return true;
    }
    await prisma.wishlistItem.update({ where: { id: giftId }, data: { imageUrl: photoFileId } });
    await clearPending(ctx, user.id);
    await renderGift(ctx, giftId, 0, { notice: t.gift.updated });
    return true;
  }

  if (!text) {
    await renderGift(ctx, giftId, 0, { notice: t.common.textPlease });
    return true;
  }
  if (text.length > MAX_ANSWER_LENGTH) {
    await renderGift(ctx, giftId, 0, { notice: t.common.tooLong(MAX_ANSWER_LENGTH) });
    return true;
  }

  if (field === "quantity") {
    const quantity = parseQuantity(text);
    if (quantity === null) {
      await renderGift(ctx, giftId, 0, { notice: t.common.numberPlease });
      return true;
    }
    // The owner must not be able to shrink a gift below what friends already
    // promised, or someone's promise would silently become invalid.
    const promised = await prisma.reservation.aggregate({
      where: { itemId: giftId, ...holdingReservations },
      _sum: { quantity: true },
    });
    const floor = Math.max(promised._sum.quantity ?? 0, 1);
    if (quantity < floor) {
      await renderGift(ctx, giftId, 0, {
        notice:
          floor > 1 ? t.gift.quantityBelowPromised(floor) : t.gift.quantityMinOne,
      });
      return true;
    }
    await prisma.wishlistItem.update({ where: { id: giftId }, data: { quantity } });
    await clearPending(ctx, user.id);
    await renderGift(ctx, giftId, 0, { notice: t.gift.quantityUpdated(quantity) });
    return true;
  }

  await prisma.wishlistItem.update({
    where: { id: giftId },
    data: { [field]: truncate(text, MAX_TITLE_LENGTH) },
  });
  await clearPending(ctx, user.id);
  await renderGift(ctx, giftId, 0, { notice: t.gift.updated });
  return true;
}

/** F3/R2 — an abandoned draft is offered back rather than silently dropped. */
export async function offerDraftResume(ctx: MyContext, draft: Draft): Promise<void> {
  await renderScreen(ctx, {
    text: t.gift.smartDraftPending(draft.title ? escapeHtml(truncate(draft.title, 40)) : null),
    keyboard: new InlineKeyboard()
      .text(t.buttons.continueDraft, "dr:show")
      .row()
      .text(t.buttons.dropDraft, "dr:restart"),
  });
}

export function registerGifts(bot: Bot<MyContext>) {
  bot.callbackQuery(/^it:open:([^:]+):(\d+)$/, async (ctx) => {
    await renderGift(ctx, ctx.match[1], Number(ctx.match[2]));
  });

  bot.callbackQuery(/^it:add:([^:]+)$/, async (ctx) => {
    const access = await requireList(ctx, ctx.match[1]);
    if (!access) return;
    const user = await currentUser(ctx);
    await startDraft(user.id, { wishlistId: ctx.match[1] });
    await ask(ctx, "draft.input", {
      text: t.gift.askInput,
      back: `wl:open:${ctx.match[1]}:0`,
    });
  });

  bot.callbackQuery("dr:show", async (ctx) => {
    await renderDraft(ctx);
  });

  bot.callbackQuery("dr:restart", async (ctx) => {
    const user = await currentUser(ctx);
    const draft = await getDraft(user.id);
    await dropDraft(user.id);
    await clearPending(ctx, user.id);
    if (draft?.wishlistId) {
      await startDraft(user.id, { wishlistId: draft.wishlistId });
      await ask(ctx, "draft.input", {
        text: t.gift.askInput,
        back: `wl:open:${draft.wishlistId}:0`,
      });
      return;
    }
    await renderHome(ctx, 0, { notice: t.gift.draftDropped });
  });

  bot.callbackQuery("dr:cancel", async (ctx) => {
    const user = await currentUser(ctx);
    const draft = await getDraft(user.id);
    await dropDraft(user.id);
    await clearPending(ctx, user.id);
    if (draft?.wishlistId) await renderList(ctx, draft.wishlistId, 0, { notice: t.common.cancelled });
    else await renderHome(ctx, 0, { notice: t.common.cancelled });
  });

  bot.callbackQuery(/^dr:to:([^:]+)$/, async (ctx) => {
    const access = await requireList(ctx, ctx.match[1]);
    if (!access) return;
    const user = await currentUser(ctx);
    await updateDraft(user.id, { wishlistId: ctx.match[1] });
    await renderDraft(ctx);
  });

  bot.callbackQuery("dr:save", async (ctx) => {
    await saveDraft(ctx);
  });

  bot.callbackQuery("dr:edit", async (ctx) => {
    const user = await currentUser(ctx);
    const draft = await getDraft(user.id);
    if (!draft) {
      await renderHome(ctx, 0);
      return;
    }
    await renderScreen(ctx, {
      text: t.gift.askWhatToEdit,
      keyboard: editMenu((f) => `dr:f:${f}`, "dr:show", {
        removePhoto: draft.imageUrl ? "dr:nophoto" : null,
      }),
    });
  });

  bot.callbackQuery(/^dr:f:(title|price|url|store|comment|photo|quantity)$/, async (ctx) => {
    const field = ctx.match[1] as GiftField;
    await ask(ctx, `draft.${field}` as `draft.${GiftField}`, {
      text: FIELD_PROMPT[field],
      back: "dr:edit",
      // Clearing is offered only where empty is a meaningful value: a gift
      // needs a name, and "0 штук" is not a thing anyone means.
      skip: CLEARABLE.has(field) ? `dr:clear:${field}` : undefined,
    });
  });

  bot.callbackQuery("dr:f:priority", async (ctx) => {
    await renderScreen(ctx, {
      text: t.gift.askPriority,
      keyboard: priorityKeyboard("dr:prio", "dr:edit"),
    });
  });

  bot.callbackQuery(/^dr:prio:(HIGH|NORMAL|LOW)$/, async (ctx) => {
    const user = await currentUser(ctx);
    const priority = ctx.match[1] as Priority;
    const saved = await updateDraft(user.id, { priority });
    await renderDraft(ctx, { notice: saved ? t.gift.priorityUpdated(PRIORITY_NAME[priority]) : t.common.draftGone });
  });

  bot.callbackQuery(/^dr:clear:(price|url|store|comment)$/, async (ctx) => {
    const user = await currentUser(ctx);
    await clearPending(ctx, user.id);
    const saved = await updateDraft(user.id, { [ctx.match[1]]: null } as DraftFields);
    await renderDraft(ctx, { notice: saved ? t.gift.updated : t.common.draftGone });
  });

  bot.callbackQuery("dr:nophoto", async (ctx) => {
    const user = await currentUser(ctx);
    await clearPending(ctx, user.id);
    const saved = await updateDraft(user.id, { imageUrl: null });
    await renderDraft(ctx, { notice: saved ? t.gift.photoRemoved : t.common.draftGone });
  });

  // ── Редагування збереженого подарунка ────────────────────────────────────

  bot.callbackQuery(/^it:edit:([^:]+)$/, async (ctx) => {
    const gift = await prisma.wishlistItem.findUnique({ where: { id: ctx.match[1] } });
    if (!gift || gift.status !== "ACTIVE") {
      await renderHome(ctx, 0, { notice: t.common.giftGone });
      return;
    }
    if (!(await requireList(ctx, gift.wishlistId))) return;
    await renderScreen(ctx, {
      text: t.gift.askWhatToEdit,
      keyboard: editMenu((f) => `it:f:${f}:${gift.id}`, `it:open:${gift.id}:0`, {
        removePhoto: gift.imageUrl ? `it:clear:photo:${gift.id}` : null,
      }),
    });
  });

  bot.callbackQuery(/^it:f:(title|price|url|store|comment|photo|quantity):([^:]+)$/, async (ctx) => {
    const field = ctx.match[1] as GiftField;
    await ask(ctx, `gift.${field}` as `gift.${GiftField}`, {
      text: FIELD_PROMPT[field],
      back: `it:edit:${ctx.match[2]}`,
      skip: CLEARABLE.has(field) ? `it:clear:${field}:${ctx.match[2]}` : undefined,
      id: ctx.match[2],
    });
  });

  bot.callbackQuery(/^it:clear:(price|url|store|comment|photo):([^:]+)$/, async (ctx) => {
    const [, field, giftId] = ctx.match;
    const gift = await prisma.wishlistItem.findUnique({ where: { id: giftId } });
    if (!gift || !(await requireList(ctx, gift.wishlistId))) return;
    const user = await currentUser(ctx);
    await clearPending(ctx, user.id);
    await prisma.wishlistItem.update({
      where: { id: giftId },
      data: { [field === "photo" ? "imageUrl" : field]: null },
    });
    await renderGift(ctx, giftId, 0, {
      notice: field === "photo" ? t.gift.photoRemoved : t.gift.updated,
    });
  });

  bot.callbackQuery(/^it:f:priority:([^:]+)$/, async (ctx) => {
    await renderScreen(ctx, {
      text: t.gift.askPriority,
      keyboard: priorityKeyboard(`it:prio:${ctx.match[1]}`, `it:edit:${ctx.match[1]}`),
    });
  });

  bot.callbackQuery(/^it:prio:([^:]+):(HIGH|NORMAL|LOW)$/, async (ctx) => {
    const [, giftId, value] = ctx.match;
    const gift = await prisma.wishlistItem.findUnique({ where: { id: giftId } });
    if (!gift || !(await requireList(ctx, gift.wishlistId))) return;
    const priority = value as Priority;
    await prisma.wishlistItem.update({ where: { id: giftId }, data: { priority } });
    await renderGift(ctx, giftId, 0, { notice: t.gift.priorityUpdated(PRIORITY_NAME[priority]) });
  });

  // ── Порядок (toast is allowed here — instantly visible, instantly undone) ─

  bot.callbackQuery(/^it:(up|down):([^:]+):(\d+)$/, async (ctx) => {
    const direction = ctx.match[1] as "up" | "down";
    const giftId = ctx.match[2];
    const gift = await prisma.wishlistItem.findUnique({ where: { id: giftId } });
    if (!gift || gift.status !== "ACTIVE" || !(await requireList(ctx, gift.wishlistId))) return;

    const neighbour = await prisma.wishlistItem.findFirst({
      where: {
        wishlistId: gift.wishlistId,
        status: "ACTIVE",
        sortOrder: direction === "up" ? { lt: gift.sortOrder } : { gt: gift.sortOrder },
      },
      orderBy: { sortOrder: direction === "up" ? "desc" : "asc" },
    });
    if (neighbour) {
      await prisma.$transaction([
        prisma.wishlistItem.update({ where: { id: gift.id }, data: { sortOrder: neighbour.sortOrder } }),
        prisma.wishlistItem.update({ where: { id: neighbour.id }, data: { sortOrder: gift.sortOrder } }),
      ]);
    }
    await ack(ctx, direction === "up" ? t.gift.movedUp : t.gift.movedDown);
    await renderGift(ctx, giftId, Number(ctx.match[3]));
  });

  bot.callbackQuery(/^it:top:([^:]+):(\d+)$/, async (ctx) => {
    const giftId = ctx.match[1];
    const gift = await prisma.wishlistItem.findUnique({ where: { id: giftId } });
    if (!gift || gift.status !== "ACTIVE" || !(await requireList(ctx, gift.wishlistId))) return;

    const first = await prisma.wishlistItem.aggregate({
      where: { wishlistId: gift.wishlistId, status: "ACTIVE" },
      _min: { sortOrder: true },
    });
    await prisma.wishlistItem.update({
      where: { id: giftId },
      data: { sortOrder: (first._min.sortOrder ?? 0) - 1 },
    });
    await ack(ctx, t.gift.movedTop);
    await renderGift(ctx, giftId, Number(ctx.match[2]));
  });

  // ── Видалення: undo, а підтвердження — лише коли зачіпає інших ───────────

  bot.callbackQuery(/^it:del:([^:]+):(\d+)$/, async (ctx) => {
    const giftId = ctx.match[1];
    const page = Number(ctx.match[2]);
    const gift = await prisma.wishlistItem.findUnique({ where: { id: giftId } });
    if (!gift || gift.status !== "ACTIVE") {
      await renderHome(ctx, 0, { notice: t.common.giftGone });
      return;
    }
    if (!(await requireList(ctx, gift.wishlistId))) return;

    const promised = await prisma.reservation.findMany({
      where: { itemId: giftId, ...holdingReservations },
      distinct: ["guestId"],
      select: { guestId: true },
    });

    // Nobody else is affected, so this is reversible rather than confirmed.
    if (promised.length === 0) {
      await removeGift(ctx, giftId, page);
      return;
    }
    await renderScreen(ctx, {
      text: t.gift.confirmDelete(escapeHtml(gift.title), promised.length),
      keyboard: new InlineKeyboard()
        .text(t.buttons.confirmDeleteGift, `it:delgo:${giftId}:${page}`)
        .row()
        .text(t.buttons.no, `it:open:${giftId}:${page}`),
    });
  });

  bot.callbackQuery(/^it:delgo:([^:]+):(\d+)$/, async (ctx) => {
    await removeGift(ctx, ctx.match[1], Number(ctx.match[2]));
  });

  bot.callbackQuery(/^it:undel:([^:]+)$/, async (ctx) => {
    await restoreGift(ctx, ctx.match[1]);
  });
}

/**
 * Soft delete. A hard `delete` cascaded into Reservation, so a guest who had
 * already bought the gift lost every trace of it — including the reminder that
 * they had bought it at all. PURCHASED promises are left alone for the same
 * reason: the owner tidying their list does not un-buy someone's present.
 */
async function removeGift(ctx: MyContext, giftId: string, page: number) {
  const gift = await prisma.wishlistItem.findUnique({
    where: { id: giftId },
    include: { wishlist: true },
  });
  if (!gift || gift.status !== "ACTIVE") {
    await renderHome(ctx, 0, { notice: t.common.giftGone });
    return;
  }
  if (!(await requireList(ctx, gift.wishlistId))) return;
  await ack(ctx);

  const affected = await prisma.reservation.findMany({
    where: { itemId: giftId, ...holdingReservations },
    include: { guest: true },
  });

  const now = new Date();
  await prisma.$transaction([
    prisma.wishlistItem.update({
      where: { id: giftId },
      data: { status: "DELETED", deletedAt: now },
    }),
    prisma.reservation.updateMany({
      where: { itemId: giftId, status: "ACTIVE" },
      data: { status: "CANCELLED", autoCancelledAt: now },
    }),
  ]);

  for (const r of affected) {
    await notifyGuestGiftRemoved(ctx.api, {
      guestTelegramId: r.guest.telegramId,
      wishlistTitle: gift.wishlist.title,
      giftTitle: gift.title,
      alreadyBought: r.status === "PURCHASED",
    });
  }

  await renderList(ctx, gift.wishlistId, page, {
    notice: block(t.gift.deleted(escapeHtml(truncate(gift.title, 60))), t.gift.deletedUndoHint),
    undo: `it:undel:${giftId}`,
  });
}

/** R9 — five minutes to change your mind, promises and all. */
async function restoreGift(ctx: MyContext, giftId: string) {
  const gift = await prisma.wishlistItem.findUnique({
    where: { id: giftId },
    include: { wishlist: true },
  });
  if (!gift || !(await requireList(ctx, gift.wishlistId))) return;

  if (gift.status !== "DELETED" || !gift.deletedAt || Date.now() - gift.deletedAt.getTime() > UNDO_WINDOW_MS) {
    await renderList(ctx, gift.wishlistId, 0, { notice: t.gift.restoreTooLate });
    return;
  }

  const restored = await prisma.reservation.findMany({
    where: { itemId: giftId, status: "CANCELLED", autoCancelledAt: { not: null } },
    include: { guest: true },
  });

  await prisma.$transaction([
    prisma.wishlistItem.update({
      where: { id: giftId },
      data: { status: "ACTIVE", deletedAt: null },
    }),
    prisma.reservation.updateMany({
      where: { itemId: giftId, status: "CANCELLED", autoCancelledAt: { not: null } },
      data: { status: "ACTIVE", autoCancelledAt: null },
    }),
  ]);

  for (const r of restored) {
    await notifyGuestGiftRestored(ctx.api, {
      guestTelegramId: r.guest.telegramId,
      wishlistTitle: gift.wishlist.title,
      giftTitle: gift.title,
    });
  }

  await renderList(ctx, gift.wishlistId, 0, {
    notice: t.gift.restored(escapeHtml(truncate(gift.title, 60))),
  });
}
