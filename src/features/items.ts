import { InlineKeyboard, type Bot } from "grammy";
import type { MyContext, MyConversation } from "../context.js";
import { prisma } from "../db.js";
import { checkWishlistAccess } from "../lib/access.js";
import { fetchLinkPreview } from "../lib/scrape.js";
import { computeAvailability, holdingReservations } from "../lib/availability.js";
import {
  escapeHtml,
  formatDate,
  formatGuestName,
  PRIORITY_ICON,
  RESERVATION_STATUS_LABEL,
} from "../lib/format.js";
import { notifyGuestItemRemoved } from "../lib/notify.js";
import { ack, addIndexButtons, addPagerRow, paginate, renderScreen, truncate } from "../lib/ui.js";
import { askInt, askText, waitForAction } from "../lib/convo.js";
import type { Priority } from "../../generated/prisma/enums.js";
import { t } from "../text.js";

/** Two lines per item, so a page still fits comfortably on a phone screen. */
const ITEMS_PER_PAGE = 8;

function priorityKeyboard(prefix: string): InlineKeyboard {
  return new InlineKeyboard()
    .text(t.buttons.priorityHigh, `${prefix}:HIGH`)
    .row()
    .text(t.buttons.priorityNormal, `${prefix}:NORMAL`)
    .row()
    .text(t.buttons.priorityLow, `${prefix}:LOW`);
}

/** The short status shown next to an item in a list — full detail lives on the item screen. */
export function shortAvailability(quantity: number, reservations: { quantity: number }[]): string {
  const a = computeAvailability(quantity, reservations);
  if (a.isFull) return t.item.shortFullyReserved;
  if (a.reserved > 0) return t.item.shortPartial(a.reserved, a.needed);
  return quantity > 1 ? t.item.shortNeeded(quantity) : "";
}

/**
 * `1. 🔥 <b>Sony WH-1000XM6</b>` plus an indented meta line.
 *
 * `hideAvailability` is what makes SURPRISE actually a surprise: the owner
 * gets the same list as everyone else, minus every hint of what has already
 * been taken.
 */
export function renderItemRows(
  items: { title: string; price: string | null; priority: Priority; quantity: number; reservations: { quantity: number }[] }[],
  offset: number,
  hideAvailability = false,
): string[] {
  return items.flatMap((item, i) => {
    const rows = [t.item.itemRow(offset + i + 1, PRIORITY_ICON[item.priority], escapeHtml(truncate(item.title, 60)))];
    const meta = [
      item.price ? escapeHtml(item.price) : null,
      hideAvailability ? null : shortAvailability(item.quantity, item.reservations),
    ].filter((v): v is string => Boolean(v));
    if (meta.length > 0) rows.push(t.item.itemRowMeta(meta));
    return rows;
  });
}

export async function renderWishlistManagement(ctx: MyContext, wishlistId: string, page = 0) {
  const access = await checkWishlistAccess(ctx, wishlistId, false);
  if (!access) return;
  const { wishlist } = access;

  const items = await prisma.wishlistItem.findMany({
    where: { wishlistId, status: "ACTIVE" },
    orderBy: { sortOrder: "asc" },
    include: { reservations: { where: holdingReservations } },
  });

  const hideAvailability = wishlist.privacyMode === "SURPRISE";
  const reservedCount = items.filter((i) => computeAvailability(i.quantity, i.reservations).reserved > 0).length;
  const paged = paginate(items, page, ITEMS_PER_PAGE);

  const header = [
    `${wishlist.status === "ARCHIVED" ? "📦" : "🎁"} <b>${escapeHtml(wishlist.title)}</b>`,
    wishlist.description ? escapeHtml(wishlist.description) : null,
    wishlist.eventDate ? `📅 ${formatDate(wishlist.eventDate)}` : null,
    wishlist.status === "ARCHIVED" ? t.guest.archivedNotice : null,
    "",
    [
      t.wishlist.itemCount(items.length),
      !hideAvailability && reservedCount > 0 ? t.wishlist.reservedCount(reservedCount) : null,
    ]
      .filter((v): v is string => v !== null)
      .join(" · "),
    hideAvailability ? t.item.surpriseHidden : null,
  ].filter((l) => l !== null);

  const body =
    items.length === 0
      ? ["", t.item.empty]
      : ["", ...renderItemRows(paged.slice, paged.offset, hideAvailability), "", t.item.tapNumberHint];

  const kb = new InlineKeyboard();
  addIndexButtons(kb, paged, (item) => `it:open:${item.id}:${paged.page}`);
  addPagerRow(kb, paged, (p) => `wl:open:${wishlistId}:${p}`);
  if (wishlist.status === "ACTIVE") kb.row().text(t.buttons.addItem, `it:add:${wishlistId}`);
  kb.row().text(t.buttons.share, `wl:share:${wishlistId}`).text(t.buttons.settings, `wl:set:${wishlistId}`);
  kb.row().text(t.buttons.backToLists, "wl:list:0");

  await renderScreen(ctx, { text: [...header, ...body].join("\n"), keyboard: kb });
}

export async function renderItemScreen(ctx: MyContext, itemId: string, page = 0) {
  const item = await prisma.wishlistItem.findUnique({
    where: { id: itemId },
    include: {
      wishlist: true,
      reservations: { where: holdingReservations, include: { guest: true } },
    },
  });
  if (!item || item.status !== "ACTIVE") {
    await ack(ctx, t.item.notFoundAlert);
    return;
  }
  const access = await checkWishlistAccess(ctx, item.wishlistId, false);
  if (!access) return;

  const a = computeAvailability(item.quantity, item.reservations);
  // In SURPRISE mode the whole point is that the owner stays in the dark —
  // and that has to cover the counts, not just the guests' names. Showing
  // "заброньовано 1 з 1" gave the surprise away just as thoroughly.
  const surprise = item.wishlist.privacyMode === "SURPRISE";

  // Built as blocks joined by blank lines so an item with no price or comment
  // does not render with a gap where those would have been.
  const blocks = [
    `${PRIORITY_ICON[item.priority]} <b>${escapeHtml(item.title)}</b>`,
    [
      [item.price, item.store].filter((v): v is string => v !== null).map(escapeHtml).join(" · "),
      item.comment ? `💬 ${escapeHtml(item.comment)}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    surprise
      ? `${t.item.availableStatus(item.quantity)}\n${t.item.surpriseHidden}`
      : a.reserved > 0
        ? t.item.availabilityDetail(item.quantity, a.reserved, a.available)
        : t.item.availableStatus(item.quantity),
    !surprise && item.reservations.length > 0
      ? [
          t.item.reservedByHeader,
          ...item.reservations.flatMap((r) => {
            const row = t.item.reservedByRow(
              escapeHtml(formatGuestName(r.guest)),
              r.quantity,
              RESERVATION_STATUS_LABEL[r.status],
            );
            // The guest was told this contact goes to the owner — this is the
            // only place it was ever supposed to surface.
            return r.contactSnapshot
              ? [row, t.item.reservedByContact(escapeHtml(r.contactSnapshot))]
              : [row];
          }),
        ].join("\n")
      : "",
  ].filter(Boolean);

  const siblings = await prisma.wishlistItem.findMany({
    where: { wishlistId: item.wishlistId, status: "ACTIVE" },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  const index = siblings.findIndex((s) => s.id === item.id);

  const kb = new InlineKeyboard();
  if (item.url) kb.url(t.buttons.openLink, item.url).row();
  if (item.wishlist.status === "ACTIVE") {
    kb.text(t.buttons.editItem, `it:edit:${item.id}`).text(t.buttons.priority, `it:prio:${item.id}`).row();
    kb.text(t.buttons.quantity, `it:qty:${item.id}`).text(t.buttons.deleteItem, `it:del:${item.id}`).row();
    if (index > 0) kb.text(t.buttons.moveUp, `it:up:${item.id}`);
    if (index >= 0 && index < siblings.length - 1) kb.text(t.buttons.moveDown, `it:down:${item.id}`);
    // Nudging a gift up one slot at a time meant nineteen taps to promote the
    // twentieth item, so the common case gets its own button.
    if (index > 1) kb.row().text(t.buttons.moveTop, `it:top:${item.id}`);
  }
  kb.row().text(t.buttons.backToList, `wl:open:${item.wishlistId}:${page}`);

  await renderScreen(ctx, { text: blocks.join("\n\n"), keyboard: kb, photo: item.imageUrl });
}

const DEFAULT_QUANTITY = 1;
const DEFAULT_PRIORITY: Priority = "NORMAL";
const MAX_TITLE_LENGTH = 200;

/**
 * Adding a gift is one message and at most one tap: paste a link (or type a
 * name) and it is saved with sensible defaults. Quantity, priority, comment
 * and the rest are all editable afterwards on the item screen, which beats
 * marching the user through six prompts before they see anything.
 */
export async function addItemConversation(conversation: MyConversation, ctx: MyContext, wishlistId: string) {
  const access = await conversation.external((c) => checkWishlistAccess(c, wishlistId, false));
  if (!access) return;

  const answer = await askText(conversation, ctx, t.item.askLinkOrTitle);

  let title = answer;
  let url: string | null = null;
  let imageUrl: string | null = null;
  let price: string | null = null;
  let store: string | null = null;

  if (/^https?:\/\//i.test(answer)) {
    url = answer;
    await ctx.reply(t.item.lookingUpLink);
    const preview = await conversation.external(() => fetchLinkPreview(url as string));

    if (preview?.title) {
      imageUrl = preview.imageUrl;
      price = preview.price;
      store = preview.store;

      const card = [
        t.item.previewFound,
        "",
        `<b>${escapeHtml(preview.title)}</b>`,
        preview.price ? t.item.previewPrice(escapeHtml(preview.price)) : null,
        preview.store ? t.item.previewStore(escapeHtml(preview.store)) : null,
        "",
        t.item.previewHint,
      ]
        .filter((l): l is string => l !== null)
        .join("\n");

      const kb = new InlineKeyboard()
        .text(t.buttons.saveItem, "prev:save")
        .text(t.buttons.editTitle, "prev:title")
        .row()
        .text(t.buttons.cancel, "prev:cancel");

      await sendPreviewCard(ctx, card, imageUrl, kb);

      const decision = await waitForAction(conversation, ["prev:save", "prev:title", "prev:cancel"] as const);
      if (decision === "prev:cancel") {
        await ctx.reply(t.common.cancelled);
        return;
      }
      title = decision === "prev:title" ? await askText(conversation, ctx, t.item.fieldPrompt.title) : preview.title;
    } else {
      title = await askText(conversation, ctx, t.item.previewNotFound);
    }
  }

  const item = await conversation.external(async () => {
    const maxSort = await prisma.wishlistItem.aggregate({ where: { wishlistId }, _max: { sortOrder: true } });
    return prisma.wishlistItem.create({
      data: {
        wishlistId,
        // A scraped <title> can run to hundreds of characters; typed answers
        // are already capped by askText.
        title: truncate(title, MAX_TITLE_LENGTH),
        url,
        imageUrl,
        price,
        store,
        priority: DEFAULT_PRIORITY,
        quantity: DEFAULT_QUANTITY,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    });
  });

  // Subscribers are told by the hourly digest instead of here: announcing
  // every gift as it landed meant filling a list in one sitting fired a
  // separate notification per gift at everyone watching.
  await ctx.reply(t.item.added(escapeHtml(truncate(title, MAX_TITLE_LENGTH))), { parse_mode: "HTML" });
  await renderItemScreen(ctx, item.id);
}

/** Preview cards are sent, not edited, so they need their own photo fallback. */
async function sendPreviewCard(ctx: MyContext, text: string, photo: string | null, kb: InlineKeyboard) {
  if (photo) {
    try {
      await ctx.replyWithPhoto(photo, { caption: text, parse_mode: "HTML", reply_markup: kb });
      return;
    } catch {
      // og:image Telegram cannot fetch — show the card without it.
    }
  }
  await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb, link_preview_options: { is_disabled: true } });
}

type EditField = "title" | "url" | "price" | "store" | "comment";

export async function editItemFieldConversation(
  conversation: MyConversation,
  ctx: MyContext,
  itemId: string,
  field: EditField,
) {
  const item = await conversation.external(() => prisma.wishlistItem.findUnique({ where: { id: itemId } }));
  if (!item) {
    await ctx.reply(t.item.notFoundAlert);
    return;
  }
  const access = await conversation.external((c) => checkWishlistAccess(c, item.wishlistId, false));
  if (!access) return;

  const value =
    field === "title"
      ? await askText(conversation, ctx, t.item.fieldPrompt.title)
      : await askText(conversation, ctx, t.item.fieldPrompt[field], { skippable: true });

  await conversation.external(() =>
    prisma.wishlistItem.update({ where: { id: itemId }, data: { [field]: value } }),
  );
  await ctx.reply(t.item.updated);
  await renderItemScreen(ctx, itemId);
}

export async function editItemQuantityConversation(
  conversation: MyConversation,
  ctx: MyContext,
  itemId: string,
) {
  const item = await conversation.external(() => prisma.wishlistItem.findUnique({ where: { id: itemId } }));
  if (!item) {
    await ctx.reply(t.item.notFoundAlert);
    return;
  }
  const access = await conversation.external((c) => checkWishlistAccess(c, item.wishlistId, false));
  if (!access) return;

  // The owner must not be able to shrink an item below what guests already
  // reserved, or someone's booking would silently become invalid.
  const reserved = await conversation.external(async () => {
    const agg = await prisma.reservation.aggregate({
      where: { itemId, ...holdingReservations },
      _sum: { quantity: true },
    });
    return agg._sum.quantity ?? 0;
  });

  const quantity = await askInt(conversation, ctx, t.item.askQuantity, {
    min: Math.max(reserved, 1),
    tooLow: reserved > 0 ? t.item.quantityAlreadyReserved(reserved) : t.item.quantityMinOne,
  });

  await conversation.external(() => prisma.wishlistItem.update({ where: { id: itemId }, data: { quantity } }));
  await ctx.reply(t.item.quantityUpdated);
  await renderItemScreen(ctx, itemId);
}

/** Loads an item and verifies the sender may edit its wishlist. */
async function loadEditableItem(ctx: MyContext, itemId: string) {
  const item = await prisma.wishlistItem.findUnique({ where: { id: itemId } });
  if (!item || item.status !== "ACTIVE") {
    await ack(ctx, t.item.notFoundAlert);
    return null;
  }
  const access = await checkWishlistAccess(ctx, item.wishlistId, false);
  if (!access) return null;
  return { item, access };
}

export function registerItems(bot: Bot<MyContext>) {
  bot.callbackQuery(/^it:open:([^:]+):(\d+)$/, async (ctx) => {
    await renderItemScreen(ctx, ctx.match[1], Number(ctx.match[2]));
  });

  bot.callbackQuery(/^it:add:([^:]+)$/, async (ctx) => {
    await ack(ctx);
    await ctx.conversation.enter("addItem", ctx.match[1]);
  });

  bot.callbackQuery(/^it:edit:([^:]+)$/, async (ctx) => {
    const loaded = await loadEditableItem(ctx, ctx.match[1]);
    if (!loaded) return;
    const kb = new InlineKeyboard()
      .text(t.buttons.fieldTitle, `it:field:title:${loaded.item.id}`)
      .text(t.buttons.fieldUrl, `it:field:url:${loaded.item.id}`)
      .row()
      .text(t.buttons.fieldPrice, `it:field:price:${loaded.item.id}`)
      .text(t.buttons.fieldStore, `it:field:store:${loaded.item.id}`)
      .row()
      .text(t.buttons.fieldComment, `it:field:comment:${loaded.item.id}`)
      .row()
      .text(t.buttons.back, `it:open:${loaded.item.id}:0`);
    await renderScreen(ctx, { text: t.item.askWhatToEdit, keyboard: kb });
  });

  bot.callbackQuery(/^it:field:(title|url|price|store|comment):([^:]+)$/, async (ctx) => {
    await ack(ctx);
    await ctx.conversation.enter("editItemField", ctx.match[2], ctx.match[1] as EditField);
  });

  bot.callbackQuery(/^it:qty:([^:]+)$/, async (ctx) => {
    await ack(ctx);
    await ctx.conversation.enter("editItemQuantity", ctx.match[1]);
  });

  bot.callbackQuery(/^it:prio:([^:]+)$/, async (ctx) => {
    const loaded = await loadEditableItem(ctx, ctx.match[1]);
    if (!loaded) return;
    const kb = priorityKeyboard(`it:prioset:${loaded.item.id}`);
    kb.row().text(t.buttons.back, `it:open:${loaded.item.id}:0`);
    await renderScreen(ctx, { text: t.item.askPriority, keyboard: kb });
  });

  bot.callbackQuery(/^it:prioset:([^:]+):(HIGH|NORMAL|LOW)$/, async (ctx) => {
    const loaded = await loadEditableItem(ctx, ctx.match[1]);
    if (!loaded) return;
    await prisma.wishlistItem.update({
      where: { id: loaded.item.id },
      data: { priority: ctx.match[2] as Priority },
    });
    await ack(ctx, t.item.priorityUpdated);
    await renderItemScreen(ctx, loaded.item.id);
  });

  bot.callbackQuery(/^it:(up|down):([^:]+)$/, async (ctx) => {
    const direction = ctx.match[1] as "up" | "down";
    const loaded = await loadEditableItem(ctx, ctx.match[2]);
    if (!loaded) return;
    const { item } = loaded;

    const neighbor = await prisma.wishlistItem.findFirst({
      where: {
        wishlistId: item.wishlistId,
        status: "ACTIVE",
        sortOrder: direction === "up" ? { lt: item.sortOrder } : { gt: item.sortOrder },
      },
      orderBy: { sortOrder: direction === "up" ? "desc" : "asc" },
    });

    if (neighbor) {
      await prisma.$transaction([
        prisma.wishlistItem.update({ where: { id: item.id }, data: { sortOrder: neighbor.sortOrder } }),
        prisma.wishlistItem.update({ where: { id: neighbor.id }, data: { sortOrder: item.sortOrder } }),
      ]);
    }
    await renderItemScreen(ctx, item.id);
  });

  bot.callbackQuery(/^it:top:([^:]+)$/, async (ctx) => {
    const loaded = await loadEditableItem(ctx, ctx.match[1]);
    if (!loaded) return;
    const { item } = loaded;

    const first = await prisma.wishlistItem.aggregate({
      where: { wishlistId: item.wishlistId, status: "ACTIVE" },
      _min: { sortOrder: true },
    });

    await prisma.wishlistItem.update({
      where: { id: item.id },
      data: { sortOrder: (first._min.sortOrder ?? 0) - 1 },
    });
    await ack(ctx, t.item.movedToTop);
    await renderItemScreen(ctx, item.id);
  });

  bot.callbackQuery(/^it:del:([^:]+)$/, async (ctx) => {
    const loaded = await loadEditableItem(ctx, ctx.match[1]);
    if (!loaded) return;
    const { item } = loaded;

    const reservedCount = await prisma.reservation.count({
      where: { itemId: item.id, ...holdingReservations },
    });
    const warning = reservedCount > 0 ? t.item.deleteReservedWarning(reservedCount) : "";

    await renderScreen(ctx, {
      text: t.item.confirmDelete(escapeHtml(item.title), warning),
      keyboard: new InlineKeyboard()
        .text(t.buttons.confirmDelete, `it:delgo:${item.id}`)
        .text(t.buttons.cancel, `it:open:${item.id}:0`),
    });
  });

  bot.callbackQuery(/^it:delgo:([^:]+)$/, async (ctx) => {
    const loaded = await loadEditableItem(ctx, ctx.match[1]);
    if (!loaded) return;
    const { item, access } = loaded;
    // Answered up front: the notification fan-out below can take a while and
    // an unanswered callback query spins in the client the whole time.
    await ack(ctx, t.item.deleted);

    const affected = await prisma.reservation.findMany({
      where: { itemId: item.id, ...holdingReservations },
      include: { guest: true },
    });

    // Soft delete. A hard `delete` cascaded into Reservation, so a guest who
    // had already bought the gift lost every trace of it from "Мої
    // бронювання" — including the reminder that they had bought it at all.
    //
    // PURCHASED rows are deliberately left alone for the same reason: the
    // owner tidying their list does not un-buy someone's present.
    await prisma.$transaction([
      prisma.wishlistItem.update({ where: { id: item.id }, data: { status: "DELETED" } }),
      prisma.reservation.updateMany({
        where: { itemId: item.id, status: "ACTIVE" },
        data: { status: "CANCELLED" },
      }),
    ]);

    for (const r of affected) {
      await notifyGuestItemRemoved(ctx.api, {
        guestTelegramId: r.guest.telegramId,
        wishlistTitle: access.wishlist.title,
        itemTitle: item.title,
        alreadyPurchased: r.status === "PURCHASED",
      });
    }

    await renderWishlistManagement(ctx, item.wishlistId);
  });
}
