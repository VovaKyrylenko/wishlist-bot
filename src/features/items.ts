import { InlineKeyboard, type Bot } from "grammy";
import type { MyContext, MyConversation } from "../context.js";
import { prisma } from "../db.js";
import { checkWishlistAccess } from "../lib/access.js";
import { fetchLinkPreview } from "../lib/scrape.js";
import { computeAvailability } from "../lib/availability.js";
import { escapeHtml, formatDate, PRIORITY_ICON } from "../lib/format.js";
import { notifyGuestItemRemoved } from "../lib/notify.js";
import { notifyNewItemToSubscribers } from "./subscriptions.js";
import type { Priority } from "../../generated/prisma/enums.js";
import { t } from "../text.js";

function parseSkippable(raw: string): string | null {
  const v = raw.trim();
  return v === t.common.skip || v.length === 0 ? null : v;
}

function priorityKeyboard(prefix = "priority"): InlineKeyboard {
  return new InlineKeyboard()
    .text(t.buttons.priorityHigh, `${prefix}:HIGH`)
    .row()
    .text(t.buttons.priorityNormal, `${prefix}:NORMAL`)
    .row()
    .text(t.buttons.priorityLow, `${prefix}:LOW`);
}

export async function renderWishlistManagement(ctx: MyContext, wishlistId: string) {
  const access = await checkWishlistAccess(ctx, wishlistId, false);
  if (!access) return;
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();
  const { wishlist } = access;

  const items = await prisma.wishlistItem.findMany({
    where: { wishlistId, status: "ACTIVE" },
    orderBy: { sortOrder: "asc" },
    include: { reservations: { where: { status: "ACTIVE" } } },
  });

  const header = [
    `${wishlist.status === "ARCHIVED" ? "📦" : "🎁"} <b>${escapeHtml(wishlist.title)}</b>`,
    wishlist.description ? escapeHtml(wishlist.description) : null,
    wishlist.eventDate ? `📅 ${formatDate(wishlist.eventDate)}` : null,
    t.item.itemsHeader(items.length),
  ]
    .filter((l) => l !== null)
    .join("\n");

  const headerKb = new InlineKeyboard();
  if (wishlist.status === "ACTIVE") {
    headerKb.text(t.buttons.addItem, `item:add:${wishlistId}`).row();
  }
  headerKb.text(t.buttons.settings, `wl:settings:${wishlistId}`).text(t.buttons.menuMyLists, "wl:list");

  await ctx.reply(header, { parse_mode: "HTML", reply_markup: headerKb });

  for (const [index, item] of items.entries()) {
    const a = computeAvailability(item.quantity, item.reservations);
    const statusLine = a.isFull
      ? t.item.fullyReserved
      : a.reserved > 0
        ? t.item.availabilityDetail(item.quantity, a.reserved, a.available)
        : t.item.availableStatus(item.quantity);

    const lines = [
      `${PRIORITY_ICON[item.priority]} <b>${escapeHtml(item.title)}</b>`,
      [item.price, item.store].filter((v): v is string => v !== null).map(escapeHtml).join(" · ") || null,
      statusLine,
      item.comment ? escapeHtml(item.comment) : null,
    ].filter((l) => l !== null);

    const kb = new InlineKeyboard();
    if (item.url) kb.url(t.buttons.openLink, item.url).row();
    kb.text(t.buttons.editItem, `item:edit:${item.id}`)
      .text(t.buttons.priority, `item:priority:${item.id}`)
      .row()
      .text(t.buttons.quantity, `item:qty:${item.id}`);
    if (index > 0) kb.text(t.buttons.moveUp, `item:up:${item.id}`);
    if (index < items.length - 1) kb.text(t.buttons.moveDown, `item:down:${item.id}`);
    kb.row().text(t.buttons.deleteItem, `item:delete:${item.id}`);

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML", reply_markup: kb });
  }
}

export async function addItemConversation(conversation: MyConversation, ctx: MyContext, wishlistId: string) {
  const access = await conversation.external((c) => checkWishlistAccess(c, wishlistId, false));
  if (!access) return;

  await ctx.reply(t.item.askLinkOrManual, {
    reply_markup: new InlineKeyboard().text(t.buttons.manualEntry, "manual"),
  });

  const first = await conversation.wait();

  let title: string | undefined;
  let url: string | null = null;
  let imageUrl: string | null = null;
  let price: string | null = null;
  let store: string | null = null;

  if (first.callbackQuery?.data === "manual") {
    await first.answerCallbackQuery();
    await ctx.reply(t.item.askTitleManual);
    title = await conversation.form.text();
  } else if (first.message?.text && /^https?:\/\//i.test(first.message.text.trim())) {
    url = first.message.text.trim();
    await ctx.reply(t.item.lookingUpLink);
    const preview = await conversation.external(() => fetchLinkPreview(url as string));

    if (preview?.title || preview?.price) {
      const previewTitle = preview.title ?? t.item.untitledFallback;
      const lines = [
        `<b>${escapeHtml(previewTitle)}</b>`,
        preview.price ? t.item.previewPrice(escapeHtml(preview.price)) : null,
        preview.store ? t.item.previewStore(escapeHtml(preview.store)) : null,
      ]
        .filter((l): l is string => l !== null)
        .join("\n");

      await ctx.reply(lines, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard()
          .text(t.buttons.add, "add")
          .text(t.buttons.edit, "edit")
          .row()
          .text(t.buttons.cancel, "cancel"),
      });

      const decision = await conversation.waitForCallbackQuery(["add", "edit", "cancel"]);
      await decision.answerCallbackQuery();

      if (decision.callbackQuery.data === "cancel") {
        await ctx.reply(t.common.cancelled);
        return;
      }
      if (decision.callbackQuery.data === "edit") {
        await ctx.reply(t.item.askCorrectTitle);
        title = await conversation.form.text();
      } else {
        title = previewTitle;
      }
      imageUrl = preview.imageUrl;
      price = preview.price;
      store = preview.store;
    } else {
      await ctx.reply(t.item.previewNotFound);
      title = await conversation.form.text();
    }
  } else if (first.message?.text) {
    title = first.message.text.trim();
  } else {
    await ctx.reply(t.item.askTitleAsText);
    title = await conversation.form.text();
  }

  if (!title) {
    await ctx.reply(t.item.askTitleAsText);
    title = await conversation.form.text();
  }

  if (!url) {
    await ctx.reply(t.item.askUrlOptional);
    url = parseSkippable(await conversation.form.text());
  }
  if (!price) {
    await ctx.reply(t.item.askPriceOptional);
    price = parseSkippable(await conversation.form.text());
  }
  if (!store) {
    await ctx.reply(t.item.askStoreOptional);
    store = parseSkippable(await conversation.form.text());
  }

  await ctx.reply(t.item.askQuantity);
  let quantity = 1;
  while (true) {
    const q = await conversation.form.int({
      otherwise: (c) => c.reply(t.item.askQuantityInteger),
    });
    if (q >= 1) {
      quantity = q;
      break;
    }
    await ctx.reply(t.item.quantityTooLow);
  }

  await ctx.reply(t.item.askCommentOptional);
  const comment = parseSkippable(await conversation.form.text());

  await ctx.reply(t.item.askPriorityForNewItem, { reply_markup: priorityKeyboard() });
  const pr = await conversation.waitForCallbackQuery(["priority:HIGH", "priority:NORMAL", "priority:LOW"]);
  await pr.answerCallbackQuery();
  const priority = pr.callbackQuery.data.split(":")[1] as Priority;

  const item = await conversation.external(async () => {
    const maxSort = await prisma.wishlistItem.aggregate({
      where: { wishlistId },
      _max: { sortOrder: true },
    });
    return prisma.wishlistItem.create({
      data: {
        wishlistId,
        title: title as string,
        url,
        imageUrl,
        price,
        store,
        comment,
        priority,
        quantity,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    });
  });

  await ctx.reply(t.item.added(title));

  await conversation.external((c) =>
    notifyNewItemToSubscribers(c.api, wishlistId, access.wishlist.title, item.title),
  );

  await renderWishlistManagement(ctx, wishlistId);
}

const EDIT_FIELDS = ["title", "url", "price", "store", "comment", "quantity"] as const;
type EditField = (typeof EDIT_FIELDS)[number];

export async function editItemFieldConversation(
  conversation: MyConversation,
  ctx: MyContext,
  itemId: string,
  field: EditField,
) {
  const item = await conversation.external(() => prisma.wishlistItem.findUnique({ where: { id: itemId } }));
  if (!item) {
    await ctx.reply(t.item.notFound);
    return;
  }
  const access = await conversation.external((c) => checkWishlistAccess(c, item.wishlistId, false));
  if (!access) return;

  await ctx.reply(t.item.fieldPrompt[field]);

  if (field === "quantity") {
    const reservedCount = await conversation.external(() =>
      prisma.reservation.aggregate({
        where: { itemId, status: "ACTIVE" },
        _sum: { quantity: true },
      }),
    );
    const reserved = reservedCount._sum.quantity ?? 0;

    let quantity: number;
    while (true) {
      const q = await conversation.form.int({
        otherwise: (c) => c.reply(t.item.askQuantityIntegerOnly),
      });
      if (q < reserved) {
        await ctx.reply(t.item.quantityAlreadyReserved(reserved));
        continue;
      }
      if (q < 1) {
        await ctx.reply(t.item.quantityMinOne);
        continue;
      }
      quantity = q;
      break;
    }
    await conversation.external(() => prisma.wishlistItem.update({ where: { id: itemId }, data: { quantity } }));
    await ctx.reply(t.item.quantityUpdated);
  } else {
    const raw = await conversation.form.text();
    const value = field === "title" ? raw.trim() : parseSkippable(raw);
    await conversation.external(() =>
      prisma.wishlistItem.update({ where: { id: itemId }, data: { [field]: value } }),
    );
    await ctx.reply(t.item.updated);
  }

  await renderWishlistManagement(ctx, item.wishlistId);
}

export function registerItems(bot: Bot<MyContext>) {
  bot.callbackQuery(/^item:add:([^:]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter("addItem", ctx.match[1]);
  });

  bot.callbackQuery(/^item:edit:([^:]+)$/, async (ctx) => {
    const item = await prisma.wishlistItem.findUnique({ where: { id: ctx.match[1] } });
    if (!item) {
      await ctx.answerCallbackQuery({ text: t.item.notFoundAlert, show_alert: true });
      return;
    }
    const access = await checkWishlistAccess(ctx, item.wishlistId, false);
    if (!access) return;
    await ctx.answerCallbackQuery();
    await ctx.reply(t.item.askWhatToEdit, {
      reply_markup: new InlineKeyboard()
        .text(t.buttons.fieldTitle, `item:field:title:${item.id}`)
        .text(t.buttons.fieldUrl, `item:field:url:${item.id}`)
        .row()
        .text(t.buttons.fieldPrice, `item:field:price:${item.id}`)
        .text(t.buttons.fieldStore, `item:field:store:${item.id}`)
        .row()
        .text(t.buttons.fieldComment, `item:field:comment:${item.id}`),
    });
  });

  bot.callbackQuery(/^item:field:(title|url|price|store|comment):([^:]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter("editItemField", ctx.match[2], ctx.match[1] as EditField);
  });

  bot.callbackQuery(/^item:qty:([^:]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter("editItemField", ctx.match[1], "quantity" as EditField);
  });

  bot.callbackQuery(/^item:priority:([^:]+)$/, async (ctx) => {
    const item = await prisma.wishlistItem.findUnique({ where: { id: ctx.match[1] } });
    if (!item) {
      await ctx.answerCallbackQuery({ text: t.item.notFoundAlert, show_alert: true });
      return;
    }
    const access = await checkWishlistAccess(ctx, item.wishlistId, false);
    if (!access) return;
    await ctx.answerCallbackQuery();
    await ctx.reply(t.item.askPriorityChange, {
      reply_markup: priorityKeyboard(`item:priority:set:${item.id}`),
    });
  });

  bot.callbackQuery(/^item:priority:set:([^:]+):(HIGH|NORMAL|LOW)$/, async (ctx) => {
    const itemId = ctx.match[1];
    const priority = ctx.match[2] as Priority;
    const item = await prisma.wishlistItem.findUnique({ where: { id: itemId } });
    if (!item) {
      await ctx.answerCallbackQuery({ text: t.item.notFoundAlert, show_alert: true });
      return;
    }
    const access = await checkWishlistAccess(ctx, item.wishlistId, false);
    if (!access) return;
    await ctx.answerCallbackQuery();
    await prisma.wishlistItem.update({ where: { id: itemId }, data: { priority } });
    await ctx.reply(t.item.priorityUpdated);
    await renderWishlistManagement(ctx, item.wishlistId);
  });

  bot.callbackQuery(/^item:(up|down):([^:]+)$/, async (ctx) => {
    const direction = ctx.match[1] as "up" | "down";
    const itemId = ctx.match[2];
    const item = await prisma.wishlistItem.findUnique({ where: { id: itemId } });
    if (!item) {
      await ctx.answerCallbackQuery({ text: t.item.notFoundAlert, show_alert: true });
      return;
    }
    const access = await checkWishlistAccess(ctx, item.wishlistId, false);
    if (!access) return;

    const neighbor = await prisma.wishlistItem.findFirst({
      where: {
        wishlistId: item.wishlistId,
        status: "ACTIVE",
        sortOrder: direction === "up" ? { lt: item.sortOrder } : { gt: item.sortOrder },
      },
      orderBy: { sortOrder: direction === "up" ? "desc" : "asc" },
    });

    await ctx.answerCallbackQuery();
    if (!neighbor) {
      await renderWishlistManagement(ctx, item.wishlistId);
      return;
    }

    await prisma.$transaction([
      prisma.wishlistItem.update({ where: { id: item.id }, data: { sortOrder: neighbor.sortOrder } }),
      prisma.wishlistItem.update({ where: { id: neighbor.id }, data: { sortOrder: item.sortOrder } }),
    ]);

    await renderWishlistManagement(ctx, item.wishlistId);
  });

  bot.callbackQuery(/^item:delete:([^:]+)$/, async (ctx) => {
    const item = await prisma.wishlistItem.findUnique({ where: { id: ctx.match[1] } });
    if (!item) {
      await ctx.answerCallbackQuery({ text: t.item.notFoundAlert, show_alert: true });
      return;
    }
    const access = await checkWishlistAccess(ctx, item.wishlistId, false);
    if (!access) return;
    await ctx.answerCallbackQuery();

    const activeReservationsCount = await prisma.reservation.count({
      where: { itemId: item.id, status: "ACTIVE" },
    });
    const warning =
      activeReservationsCount > 0 ? t.item.deleteReservedWarning(activeReservationsCount) : "";

    await ctx.reply(t.item.confirmDelete(item.title, warning), {
      reply_markup: new InlineKeyboard()
        .text(t.buttons.confirmDelete, `item:delete:confirm:${item.id}`)
        .text(t.buttons.cancel, `item:back:${item.wishlistId}`),
    });
  });

  bot.callbackQuery(/^item:delete:confirm:([^:]+)$/, async (ctx) => {
    const item = await prisma.wishlistItem.findUnique({ where: { id: ctx.match[1] } });
    if (!item) {
      await ctx.answerCallbackQuery({ text: t.item.notFoundAlert, show_alert: true });
      return;
    }
    const access = await checkWishlistAccess(ctx, item.wishlistId, false);
    if (!access) return;
    await ctx.answerCallbackQuery();

    const activeReservations = await prisma.reservation.findMany({
      where: { itemId: item.id, status: "ACTIVE" },
      include: { guest: true },
    });

    await prisma.wishlistItem.delete({ where: { id: item.id } });

    for (const r of activeReservations) {
      await notifyGuestItemRemoved(ctx.api, {
        guestTelegramId: r.guest.telegramId,
        wishlistTitle: access.wishlist.title,
        itemTitle: item.title,
      });
    }

    await ctx.reply(t.item.deleted(item.title));
    await renderWishlistManagement(ctx, item.wishlistId);
  });

  bot.callbackQuery(/^item:back:([^:]+)$/, async (ctx) => {
    await renderWishlistManagement(ctx, ctx.match[1]);
  });
}
