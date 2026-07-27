import { InlineKeyboard, Keyboard, type Bot } from "grammy";
import type { MyContext, MyConversation } from "../context.js";
import { prisma } from "../db.js";
import { upsertUserFromCtx } from "../lib/users.js";
import { computeAvailability } from "../lib/availability.js";
import { formatGuestName, RESERVATION_STATUS_LABEL } from "../lib/format.js";
import { notifyOwnerNewReservation, notifyOwnerReservationCancelled } from "../lib/notify.js";
import { notifyItemAvailableAgainToSubscribers } from "./subscriptions.js";
import { t } from "../text.js";

export async function reserveConversation(conversation: MyConversation, ctx: MyContext, itemId: string) {
  const item = await conversation.external(() =>
    prisma.wishlistItem.findUnique({
      where: { id: itemId },
      include: {
        wishlist: { include: { owner: true } },
        reservations: { where: { status: "ACTIVE" } },
      },
    }),
  );

  if (!item) {
    await ctx.reply(t.reservation.itemGone);
    return;
  }
  if (item.wishlist.status === "ARCHIVED") {
    await ctx.reply(t.reservation.listClosed);
    return;
  }

  const availability = computeAvailability(item.quantity, item.reservations);
  if (availability.available <= 0) {
    await ctx.reply(t.reservation.alreadyFull);
    return;
  }

  let quantity = 1;
  if (availability.available > 1) {
    const options = [1, 2, 3].filter((n) => n <= availability.available);
    const kb = new InlineKeyboard();
    for (const n of options) kb.text(String(n), `resqty:${n}`);
    kb.row().text(t.reservation.allAvailable(availability.available), "resqty:all");

    await ctx.reply(t.reservation.askQuantity, { reply_markup: kb });
    const qtyCtx = await conversation.waitForCallbackQuery([
      ...options.map((n) => `resqty:${n}`),
      "resqty:all",
    ]);
    await qtyCtx.answerCallbackQuery();
    quantity =
      qtyCtx.callbackQuery.data === "resqty:all"
        ? availability.available
        : Number(qtyCtx.callbackQuery.data.split(":")[1]);
  }

  const user = await conversation.external((c) => upsertUserFromCtx(c));
  let contactPhone = user.contactPhone;
  let contactName = formatGuestName(user);

  if (!contactPhone) {
    await ctx.reply(t.reservation.askContact, {
      reply_markup: new Keyboard().requestContact(t.buttons.shareContact).resized().oneTime(),
    });
    const contact = await conversation.form.contact({
      otherwise: (c) => c.reply(t.reservation.askContactRetry),
    });
    contactPhone = contact.phone_number;
    contactName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contactName;
    await conversation.external(() =>
      prisma.user.update({ where: { id: user.id }, data: { contactPhone } }),
    );
    await ctx.reply(t.reservation.contactThanks, { reply_markup: { remove_keyboard: true } });
  }

  const contactSnapshot = [contactName, user.username ? `@${user.username}` : null, contactPhone]
    .filter(Boolean)
    .join(", ");

  await ctx.reply(t.reservation.summary(item.title, quantity, contactSnapshot), {
    reply_markup: new InlineKeyboard()
      .text(t.buttons.confirmReservation, "resconfirm")
      .row()
      .text(t.buttons.back, "resback"),
  });

  const decision = await conversation.waitForCallbackQuery(["resconfirm", "resback"]);
  await decision.answerCallbackQuery();
  if (decision.callbackQuery.data === "resback") {
    await ctx.reply(t.common.cancelled);
    return;
  }

  const result = await conversation.external(() =>
    prisma.$transaction(async (tx) => {
      const fresh = await tx.wishlistItem.findUnique({
        where: { id: itemId },
        include: { reservations: { where: { status: "ACTIVE" } }, wishlist: true },
      });
      if (!fresh || fresh.wishlist.status === "ARCHIVED") {
        return { ok: false as const, reason: "gone" as const };
      }
      const freshAvailability = computeAvailability(fresh.quantity, fresh.reservations);
      if (quantity > freshAvailability.available) {
        return { ok: false as const, reason: "race" as const };
      }
      const reservation = await tx.reservation.create({
        data: { itemId, guestId: user.id, quantity, contactSnapshot },
      });
      return { ok: true as const, reservation };
    }),
  );

  if (!result.ok) {
    await ctx.reply(result.reason === "gone" ? t.reservation.itemGoneAtConfirm : t.reservation.raceLost);
    return;
  }

  await ctx.reply(t.reservation.confirmed, {
    reply_markup: new InlineKeyboard()
      .text(t.buttons.viewMyReservations, "myres:list")
      .row()
      .text(t.buttons.cancelReservation, `myres:cancel:${result.reservation.id}`),
  });

  await conversation.external((c) =>
    notifyOwnerNewReservation(c.api, {
      ownerTelegramId: item.wishlist.owner.telegramId,
      wishlistTitle: item.wishlist.title,
      itemTitle: item.title,
      privacyMode: item.wishlist.privacyMode,
      reservedQuantity: quantity,
      guestName: contactName,
    }),
  );
}

export async function showMyReservations(ctx: MyContext) {
  const user = await upsertUserFromCtx(ctx);
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  const reservations = await prisma.reservation.findMany({
    where: { guestId: user.id, status: { in: ["ACTIVE", "PURCHASED"] } },
    include: { item: { include: { wishlist: true } } },
    orderBy: { createdAt: "desc" },
  });

  if (reservations.length === 0) {
    await ctx.reply(t.reservation.noneYet);
    return;
  }

  await ctx.reply(t.reservation.yourReservations(reservations.length));
  for (const r of reservations) {
    const lines = [
      r.item.wishlist.title,
      "",
      r.item.title,
      t.reservation.quantityLine(r.quantity),
      t.reservation.statusLine(RESERVATION_STATUS_LABEL[r.status]),
    ];

    const kb = new InlineKeyboard();
    if (r.item.url) kb.url(t.buttons.openProduct, r.item.url).row();
    if (r.status === "ACTIVE") {
      kb.text(t.buttons.changeQuantity, `myres:qty:${r.id}`).row();
      kb.text(t.buttons.cancelReservation, `myres:cancel:${r.id}`).row();
      kb.text(t.buttons.markPurchased, `myres:purchased:${r.id}`);
    }

    await ctx.reply(lines.join("\n"), { reply_markup: kb.inline_keyboard.length > 0 ? kb : undefined });
  }
}

export async function changeReservationQtyConversation(
  conversation: MyConversation,
  ctx: MyContext,
  reservationId: string,
) {
  const user = await conversation.external((c) => upsertUserFromCtx(c));
  const reservation = await conversation.external(() =>
    prisma.reservation.findUnique({ where: { id: reservationId }, include: { item: true } }),
  );
  if (!reservation || reservation.status !== "ACTIVE" || reservation.guestId !== user.id) {
    await ctx.reply(t.reservation.noLongerActive);
    return;
  }

  const otherReserved = await conversation.external(async () => {
    const agg = await prisma.reservation.aggregate({
      where: { itemId: reservation.itemId, status: "ACTIVE", id: { not: reservationId } },
      _sum: { quantity: true },
    });
    return agg._sum.quantity ?? 0;
  });
  const maxQuantity = reservation.item.quantity - otherReserved;

  await ctx.reply(t.reservation.askNewQuantity(maxQuantity));
  let quantity: number;
  while (true) {
    const q = await conversation.form.int({
      otherwise: (c) => c.reply(t.reservation.askQuantityIntegerOnly),
    });
    if (q < 1) {
      await ctx.reply(t.reservation.quantityMinOne);
      continue;
    }
    if (q > maxQuantity) {
      await ctx.reply(t.reservation.quantityExceedsMax(maxQuantity));
      continue;
    }
    quantity = q;
    break;
  }

  await conversation.external(() =>
    prisma.reservation.update({ where: { id: reservationId }, data: { quantity } }),
  );
  await ctx.reply(t.reservation.quantityUpdated);
  await showMyReservations(ctx);
}

export function registerReservations(bot: Bot<MyContext>) {
  bot.callbackQuery("myres:list", showMyReservations);

  bot.callbackQuery(/^myres:qty:([^:]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter("changeReservationQty", ctx.match[1]);
  });

  bot.callbackQuery(/^myres:cancel:([^:]+)$/, async (ctx) => {
    const user = await upsertUserFromCtx(ctx);
    const reservation = await prisma.reservation.findUnique({
      where: { id: ctx.match[1] },
      include: { item: true },
    });
    if (!reservation || reservation.guestId !== user.id) {
      await ctx.answerCallbackQuery({ text: t.reservation.notFoundAlert, show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery();
    await ctx.reply(t.reservation.confirmCancel(reservation.item.title), {
      reply_markup: new InlineKeyboard()
        .text(t.buttons.confirmCancel, `myres:cancel:confirm:${reservation.id}`)
        .text(t.buttons.no, "myres:list"),
    });
  });

  bot.callbackQuery(/^myres:cancel:confirm:([^:]+)$/, async (ctx) => {
    const user = await upsertUserFromCtx(ctx);
    const reservation = await prisma.reservation.findUnique({
      where: { id: ctx.match[1] },
      include: { item: { include: { wishlist: { include: { owner: true } }, reservations: { where: { status: "ACTIVE" } } } } },
    });
    if (!reservation || reservation.status !== "ACTIVE" || reservation.guestId !== user.id) {
      await ctx.answerCallbackQuery({ text: t.reservation.notActiveAlert, show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery();

    const wasFull = computeAvailability(reservation.item.quantity, reservation.item.reservations).available === 0;

    await prisma.reservation.update({ where: { id: reservation.id }, data: { status: "CANCELLED" } });

    await notifyOwnerReservationCancelled(ctx.api, {
      ownerTelegramId: reservation.item.wishlist.owner.telegramId,
      wishlistTitle: reservation.item.wishlist.title,
      itemTitle: reservation.item.title,
      privacyMode: reservation.item.wishlist.privacyMode,
    });

    if (wasFull) {
      await notifyItemAvailableAgainToSubscribers(
        ctx.api,
        reservation.item.wishlistId,
        reservation.item.wishlist.title,
        reservation.item.title,
      );
    }

    await ctx.reply(t.reservation.cancelled);
    await showMyReservations(ctx);
  });

  bot.callbackQuery(/^myres:purchased:([^:]+)$/, async (ctx) => {
    const user = await upsertUserFromCtx(ctx);
    const reservation = await prisma.reservation.findUnique({ where: { id: ctx.match[1] } });
    if (!reservation || reservation.guestId !== user.id) {
      await ctx.answerCallbackQuery({ text: t.reservation.notFoundAlert, show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery();
    await prisma.reservation.update({ where: { id: reservation.id }, data: { status: "PURCHASED" } });
    await ctx.reply(t.reservation.markedPurchased);
    await showMyReservations(ctx);
  });
}
