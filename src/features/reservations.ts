import { InlineKeyboard, Keyboard, type Bot } from "grammy";
import type { MyContext, MyConversation } from "../context.js";
import { prisma } from "../db.js";
import { upsertUserFromCtx } from "../lib/users.js";
import { computeAvailability, holdingReservations, HOLDING_STATUSES } from "../lib/availability.js";
import { escapeHtml, formatGuestName, RESERVATION_STATUS_LABEL } from "../lib/format.js";
import { mainMenuKeyboard } from "../lib/keyboards.js";
import {
  notifyOwnerNewReservation,
  notifyOwnerPurchased,
  notifyOwnerReservationCancelled,
} from "../lib/notify.js";
import { notifyItemAvailableAgainToSubscribers } from "./subscriptions.js";
import { ack, addIndexButtons, addPagerRow, paginate, renderScreen, truncate } from "../lib/ui.js";
import { askInt, waitForAction } from "../lib/convo.js";
import { t } from "../text.js";

const RESERVATIONS_PER_PAGE = 8;

/**
 * Asks for the guest's contact once, ever. The native `request_contact`
 * button proves the sender owns the account, so it works as a spam gate
 * without turning into a registration step.
 *
 * The `user_id` check is what makes it a gate at all: `message.contact` is
 * also what arrives when someone forwards a card from their address book, so
 * without it the whole step was cleared by attaching any stranger's contact.
 */
async function collectContact(conversation: MyConversation, ctx: MyContext) {
  await ctx.reply(t.reservation.askContact, {
    reply_markup: new Keyboard().requestContact(t.buttons.shareContact).resized().oneTime(),
  });

  for (;;) {
    const update = await conversation.wait();
    const contact = update.message?.contact;
    if (contact) {
      if (contact.user_id !== undefined && contact.user_id === update.from?.id) return contact;
      await ctx.reply(t.reservation.contactNotYours);
      continue;
    }

    if (update.callbackQuery) {
      await update.answerCallbackQuery({ text: t.common.finishStepFirst, show_alert: true });
      continue;
    }
    if (update.message?.text?.trim().startsWith("/")) {
      // Restore the menu before leaving, or the contact button would stay put.
      await ctx.reply(t.common.cancelled, { reply_markup: mainMenuKeyboard() });
      await conversation.halt({ next: true });
    }
    await ctx.reply(t.reservation.askContactRetry);
  }
}

export async function reserveConversation(conversation: MyConversation, ctx: MyContext, itemId: string) {
  const item = await conversation.external(() =>
    prisma.wishlistItem.findUnique({
      where: { id: itemId },
      include: {
        wishlist: { include: { owner: true } },
        reservations: { where: holdingReservations },
      },
    }),
  );

  if (!item || item.status !== "ACTIVE") {
    await ctx.reply(t.reservation.itemGone);
    return;
  }
  if (item.wishlist.status === "ARCHIVED") {
    await ctx.reply(t.reservation.listClosed);
    return;
  }

  const user = await conversation.external((c) => upsertUserFromCtx(c));
  // Reserving a gift on your own list only ever creates a phantom booking
  // that hides the item from everyone else.
  if (item.wishlist.ownerId === user.id) {
    await ctx.reply(t.reservation.selfReserveAlert);
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
    if (!options.includes(availability.available)) {
      kb.row().text(t.reservation.allAvailable(availability.available), "resqty:all");
    }
    kb.row().text(t.buttons.cancel, "resqty:cancel");

    await ctx.reply(t.reservation.askQuantity, { reply_markup: kb });
    const picked = await waitForAction(conversation, [
      ...options.map((n) => `resqty:${n}`),
      "resqty:all",
      "resqty:cancel",
    ]);
    if (picked === "resqty:cancel") {
      await ctx.reply(t.common.cancelled);
      return;
    }
    quantity = picked === "resqty:all" ? availability.available : Number(picked.split(":")[1]);
  }

  let contactPhone = user.contactPhone;
  let contactName = formatGuestName(user);

  if (!contactPhone) {
    const contact = await collectContact(conversation, ctx);
    contactPhone = contact.phone_number;
    contactName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contactName;
    await conversation.external(() =>
      prisma.user.update({ where: { id: user.id }, data: { contactPhone } }),
    );
    await ctx.reply(t.reservation.contactThanks, { reply_markup: mainMenuKeyboard() });
  }

  const contactSnapshot = [contactName, user.username ? `@${user.username}` : null, contactPhone]
    .filter(Boolean)
    .join(", ");

  await ctx.reply(t.reservation.summary(escapeHtml(item.title), quantity, escapeHtml(contactSnapshot)), {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard()
      .text(t.buttons.confirmReservation, "resgo")
      .text(t.buttons.cancel, "resback"),
  });

  if ((await waitForAction(conversation, ["resgo", "resback"])) === "resback") {
    await ctx.reply(t.common.cancelled);
    return;
  }

  // Re-check inside a transaction: someone else may have taken the last one
  // while this guest was sharing their contact. Serializable because the
  // read-then-write on availability is exactly the pattern read-committed
  // lets two concurrent guests both win, overbooking the item.
  const result = await conversation.external(() =>
    prisma.$transaction(
      async (tx) => {
        const fresh = await tx.wishlistItem.findUnique({
          where: { id: itemId },
          include: { reservations: { where: holdingReservations }, wishlist: true },
        });
        if (!fresh || fresh.status !== "ACTIVE" || fresh.wishlist.status === "ARCHIVED") {
          return { ok: false as const, reason: "gone" as const };
        }
        if (quantity > computeAvailability(fresh.quantity, fresh.reservations).available) {
          return { ok: false as const, reason: "race" as const };
        }

        // Booking the same gift twice produced two rows and two confusing
        // entries in "Мої бронювання"; topping up the existing one is what
        // the guest actually meant.
        const existing = await tx.reservation.findFirst({
          where: { itemId, guestId: user.id, ...holdingReservations },
        });
        if (existing) {
          const merged = await tx.reservation.update({
            where: { id: existing.id },
            data: { quantity: existing.quantity + quantity, contactSnapshot },
          });
          return { ok: true as const, reservation: merged, merged: true as const };
        }

        const reservation = await tx.reservation.create({
          data: { itemId, guestId: user.id, quantity, contactSnapshot },
        });
        return { ok: true as const, reservation, merged: false as const };
      },
      { isolationLevel: "Serializable" },
    ),
  );

  if (!result.ok) {
    await ctx.reply(result.reason === "gone" ? t.reservation.itemGoneAtConfirm : t.reservation.raceLost);
    return;
  }

  const confirmation = result.merged
    ? t.reservation.mergedIntoExisting(result.reservation.quantity)
    : t.reservation.confirmed(escapeHtml(item.title));

  await ctx.reply(confirmation, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard()
      .text(t.buttons.menuMyReservations, "res:list:0")
      .row()
      .text(t.buttons.backToList, `g:open:${item.wishlistId}:a:0`),
  });

  if (!item.wishlist.notifyOwner) return;
  await conversation.external((c) =>
    notifyOwnerNewReservation(c.api, {
      ownerTelegramId: item.wishlist.owner.telegramId,
      wishlistTitle: item.wishlist.title,
      itemTitle: item.title,
      privacyMode: item.wishlist.privacyMode,
      reservedQuantity: quantity,
      guestName: contactName,
      // Promised to the guest on the confirmation screen ("твій контакт для
      // власника") but never actually delivered anywhere until now.
      guestContact: contactSnapshot,
    }),
  );
}

export async function showMyReservations(ctx: MyContext, page = 0) {
  const user = await upsertUserFromCtx(ctx);

  const reservations = await prisma.reservation.findMany({
    where: { guestId: user.id, status: { in: HOLDING_STATUSES } },
    include: { item: { include: { wishlist: true } } },
    orderBy: { createdAt: "desc" },
  });

  if (reservations.length === 0) {
    await renderScreen(ctx, { text: t.reservation.noneYet });
    return;
  }

  const paged = paginate(reservations, page, RESERVATIONS_PER_PAGE);
  const rows = paged.slice.flatMap((r, i) => [
    t.reservation.reservationRow(paged.offset + i + 1, escapeHtml(truncate(r.item.title, 60))),
    t.reservation.reservationRowMeta([
      t.reservation.fromList(escapeHtml(truncate(r.item.wishlist.title, 40))),
      t.reservation.quantityShort(r.quantity),
      RESERVATION_STATUS_LABEL[r.status],
    ]),
  ]);

  const kb = new InlineKeyboard();
  addIndexButtons(kb, paged, (r) => `res:open:${r.id}`);
  addPagerRow(kb, paged, (p) => `res:list:${p}`);

  await renderScreen(ctx, {
    text: [t.reservation.yourReservations(reservations.length), "", ...rows, "", t.common.tapNumberHint].join("\n"),
    keyboard: kb,
  });
}

/** Loads a reservation and confirms it belongs to the sender. */
async function loadOwnReservation(ctx: MyContext, reservationId: string) {
  const user = await upsertUserFromCtx(ctx);
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { item: { include: { wishlist: true } } },
  });
  if (!reservation || reservation.guestId !== user.id) {
    await ack(ctx, t.reservation.notFoundAlert);
    return null;
  }
  return reservation;
}

async function renderReservationScreen(ctx: MyContext, reservationId: string) {
  const reservation = await loadOwnReservation(ctx, reservationId);
  if (!reservation) return;

  const lines = [
    `🎁 <b>${escapeHtml(reservation.item.title)}</b>`,
    "",
    t.reservation.fromList(escapeHtml(reservation.item.wishlist.title)),
    "",
    t.reservation.quantityLine(reservation.quantity),
    t.reservation.statusLine(RESERVATION_STATUS_LABEL[reservation.status]),
  ];

  const kb = new InlineKeyboard();
  if (reservation.item.url) kb.url(t.buttons.openProduct, reservation.item.url).row();
  if (reservation.status === "ACTIVE") {
    kb.text(t.buttons.changeQuantity, `res:qty:${reservation.id}`)
      .text(t.buttons.markPurchased, `res:bought:${reservation.id}`)
      .row()
      .text(t.buttons.cancelReservation, `res:cancel:${reservation.id}`)
      .row();
  } else if (reservation.status === "PURCHASED" && reservation.item.status === "ACTIVE") {
    // A mistaken tap on "Уже придбав" used to be final: only the ACTIVE
    // branch had buttons, so the screen offered no way back at all. Skipped
    // once the gift itself is gone — there is nothing to go back to.
    kb.text(t.buttons.undoPurchased, `res:unbought:${reservation.id}`)
      .row()
      .text(t.buttons.cancelReservation, `res:cancel:${reservation.id}`)
      .row();
  }
  kb.text(t.buttons.backToReservations, "res:list:0");

  await renderScreen(ctx, { text: lines.join("\n"), keyboard: kb, photo: reservation.item.imageUrl });
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
      where: { itemId: reservation.itemId, ...holdingReservations, id: { not: reservationId } },
      _sum: { quantity: true },
    });
    return agg._sum.quantity ?? 0;
  });
  const maxQuantity = reservation.item.quantity - otherReserved;

  const quantity = await askInt(conversation, ctx, t.reservation.askNewQuantity(maxQuantity), {
    min: 1,
    max: maxQuantity,
    tooLow: t.reservation.quantityMinOne,
    tooHigh: t.reservation.quantityExceedsMax(maxQuantity),
  });

  await conversation.external(() =>
    prisma.reservation.update({ where: { id: reservationId }, data: { quantity } }),
  );
  await ctx.reply(t.reservation.quantityUpdated);
  await renderReservationScreen(ctx, reservationId);
}

export function registerReservations(bot: Bot<MyContext>) {
  bot.callbackQuery(/^res:list:(\d+)$/, async (ctx) => {
    await showMyReservations(ctx, Number(ctx.match[1]));
  });

  bot.callbackQuery(/^res:open:([^:]+)$/, async (ctx) => {
    await renderReservationScreen(ctx, ctx.match[1]);
  });

  bot.callbackQuery(/^res:qty:([^:]+)$/, async (ctx) => {
    await ack(ctx);
    await ctx.conversation.enter("changeReservationQty", ctx.match[1]);
  });

  bot.callbackQuery(/^res:cancel:([^:]+)$/, async (ctx) => {
    const reservation = await loadOwnReservation(ctx, ctx.match[1]);
    if (!reservation) return;
    await renderScreen(ctx, {
      text: t.reservation.confirmCancel(escapeHtml(reservation.item.title)),
      keyboard: new InlineKeyboard()
        .text(t.buttons.confirmCancel, `res:cancelgo:${reservation.id}`)
        .text(t.buttons.no, `res:open:${reservation.id}`),
    });
  });

  bot.callbackQuery(/^res:cancelgo:([^:]+)$/, async (ctx) => {
    const reservation = await loadOwnReservation(ctx, ctx.match[1]);
    if (!reservation) return;
    if (!HOLDING_STATUSES.includes(reservation.status)) {
      await ack(ctx, t.reservation.notActiveAlert);
      return;
    }
    await ack(ctx, t.reservation.cancelled);

    const item = await prisma.wishlistItem.findUnique({
      where: { id: reservation.itemId },
      include: { wishlist: { include: { owner: true } }, reservations: { where: holdingReservations } },
    });

    await prisma.reservation.update({ where: { id: reservation.id }, data: { status: "CANCELLED" } });

    if (item) {
      const wasFull = computeAvailability(item.quantity, item.reservations).available === 0;
      if (item.wishlist.notifyOwner) {
        await notifyOwnerReservationCancelled(ctx.api, {
          ownerTelegramId: item.wishlist.owner.telegramId,
          wishlistTitle: item.wishlist.title,
          itemTitle: item.title,
          privacyMode: item.wishlist.privacyMode,
        });
      }
      // Freeing up the last unit is exactly what subscribers asked to hear about.
      if (wasFull) {
        await notifyItemAvailableAgainToSubscribers(ctx.api, item.wishlistId, item.wishlist.title, item.title);
      }
    }

    await showMyReservations(ctx);
  });

  // Marking a gift bought is irreversible-ish and reaches the owner, so it
  // gets the same confirm step as cancelling does.
  bot.callbackQuery(/^res:bought:([^:]+)$/, async (ctx) => {
    const reservation = await loadOwnReservation(ctx, ctx.match[1]);
    if (!reservation) return;
    await renderScreen(ctx, {
      text: t.reservation.confirmPurchased(escapeHtml(reservation.item.title)),
      keyboard: new InlineKeyboard()
        .text(t.buttons.confirmPurchased, `res:boughtgo:${reservation.id}`)
        .text(t.buttons.no, `res:open:${reservation.id}`),
    });
  });

  bot.callbackQuery(/^res:boughtgo:([^:]+)$/, async (ctx) => {
    const reservation = await loadOwnReservation(ctx, ctx.match[1]);
    if (!reservation) return;
    if (reservation.status !== "ACTIVE") {
      await ack(ctx, t.reservation.notActiveAlert);
      return;
    }

    await prisma.reservation.update({ where: { id: reservation.id }, data: { status: "PURCHASED" } });
    await ack(ctx, t.reservation.markedPurchased);

    const owner = await prisma.user.findUnique({
      where: { id: reservation.item.wishlist.ownerId },
      select: { telegramId: true },
    });
    if (owner && reservation.item.wishlist.notifyOwner) {
      await notifyOwnerPurchased(ctx.api, {
        ownerTelegramId: owner.telegramId,
        wishlistTitle: reservation.item.wishlist.title,
        itemTitle: reservation.item.title,
        privacyMode: reservation.item.wishlist.privacyMode,
        guestName: formatGuestName(await upsertUserFromCtx(ctx)),
      });
    }

    await renderReservationScreen(ctx, reservation.id);
  });

  bot.callbackQuery(/^res:unbought:([^:]+)$/, async (ctx) => {
    const reservation = await loadOwnReservation(ctx, ctx.match[1]);
    if (!reservation) return;
    if (reservation.status !== "PURCHASED") {
      await ack(ctx, t.reservation.notActiveAlert);
      return;
    }
    await prisma.reservation.update({ where: { id: reservation.id }, data: { status: "ACTIVE" } });
    await ack(ctx, t.reservation.purchasedUndone);
    await renderReservationScreen(ctx, reservation.id);
  });
}
