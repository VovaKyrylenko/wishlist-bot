import { InlineKeyboard, Keyboard, type Bot } from "grammy";
import type { MyContext, MyConversation } from "../context.js";
import { prisma } from "../db.js";
import { upsertUserFromCtx } from "../lib/users.js";
import { computeAvailability } from "../lib/availability.js";
import { formatGuestName, RESERVATION_STATUS_LABEL } from "../lib/format.js";
import { notifyOwnerNewReservation, notifyOwnerReservationCancelled } from "../lib/notify.js";
import { notifyItemAvailableAgainToSubscribers } from "./subscriptions.js";

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
    await ctx.reply("Цей подарунок більше не існує.");
    return;
  }
  if (item.wishlist.status === "ARCHIVED") {
    await ctx.reply("Цей список закрито власником — бронювання недоступне.");
    return;
  }

  const availability = computeAvailability(item.quantity, item.reservations);
  if (availability.available <= 0) {
    await ctx.reply("На жаль, цей подарунок уже повністю заброньовано.");
    return;
  }

  let quantity = 1;
  if (availability.available > 1) {
    const options = [1, 2, 3].filter((n) => n <= availability.available);
    const kb = new InlineKeyboard();
    for (const n of options) kb.text(String(n), `resqty:${n}`);
    kb.row().text(`Усю доступну кількість (${availability.available})`, "resqty:all");

    await ctx.reply("Скільки одиниць ви хочете забронювати?", { reply_markup: kb });
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
    await ctx.reply(
      "Щоб захистити список від спаму, поділіться, будь ласка, своїм контактом Telegram (це не реєстрація — лише одноразова перевірка, яка більше не знадобиться для наступних бронювань).",
      { reply_markup: new Keyboard().requestContact("📱 Поділитися контактом").resized().oneTime() },
    );
    const contact = await conversation.form.contact({
      otherwise: (c) => c.reply("Будь ласка, натисніть кнопку «📱 Поділитися контактом», щоб продовжити."),
    });
    contactPhone = contact.phone_number;
    contactName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contactName;
    await conversation.external(() =>
      prisma.user.update({ where: { id: user.id }, data: { contactPhone } }),
    );
    await ctx.reply("Дякую! Наступні бронювання проходитимуть без цього кроку.", {
      reply_markup: { remove_keyboard: true },
    });
  }

  const contactSnapshot = [contactName, user.username ? `@${user.username}` : null, contactPhone]
    .filter(Boolean)
    .join(", ");

  await ctx.reply(
    ["Ви бронюєте:", "", item.title, `Кількість: ${quantity}`, `Контакт: ${contactSnapshot}`].join("\n"),
    {
      reply_markup: new InlineKeyboard()
        .text("✅ Підтвердити бронювання", "resconfirm")
        .row()
        .text("Назад", "resback"),
    },
  );

  const decision = await conversation.waitForCallbackQuery(["resconfirm", "resback"]);
  await decision.answerCallbackQuery();
  if (decision.callbackQuery.data === "resback") {
    await ctx.reply("Скасовано.");
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
    await ctx.reply(
      result.reason === "gone"
        ? "Цей подарунок більше недоступний."
        : "На жаль, цю кількість вже встигли забронювати. Спробуйте ще раз із меншою кількістю.",
    );
    return;
  }

  await ctx.reply("✅ Подарунок заброньовано.", {
    reply_markup: new InlineKeyboard()
      .text("Переглянути мої бронювання", "myres:list")
      .row()
      .text("Скасувати бронювання", `myres:cancel:${result.reservation.id}`),
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
    await ctx.reply("У вас поки немає активних бронювань.");
    return;
  }

  await ctx.reply(`🎁 Ваші бронювання (${reservations.length})`);
  for (const r of reservations) {
    const lines = [
      r.item.wishlist.title,
      "",
      r.item.title,
      `Кількість: ${r.quantity}`,
      `Статус: ${RESERVATION_STATUS_LABEL[r.status]}`,
    ];

    const kb = new InlineKeyboard();
    if (r.item.url) kb.url("Відкрити товар", r.item.url).row();
    if (r.status === "ACTIVE") {
      kb.text("Змінити кількість", `myres:qty:${r.id}`).row();
      kb.text("Скасувати бронювання", `myres:cancel:${r.id}`).row();
      kb.text("Позначити як придбано", `myres:purchased:${r.id}`);
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
    await ctx.reply("Це бронювання більше не активне.");
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

  await ctx.reply(`Скільки одиниць забронювати? (максимум ${maxQuantity})`);
  let quantity: number;
  while (true) {
    const q = await conversation.form.int({
      otherwise: (c) => c.reply("Будь ласка, надішліть ціле число."),
    });
    if (q < 1) {
      await ctx.reply("Кількість має бути щонайменше 1.");
      continue;
    }
    if (q > maxQuantity) {
      await ctx.reply(`Максимум доступно ${maxQuantity}. Спробуйте ще раз.`);
      continue;
    }
    quantity = q;
    break;
  }

  await conversation.external(() =>
    prisma.reservation.update({ where: { id: reservationId }, data: { quantity } }),
  );
  await ctx.reply("✅ Кількість оновлено.");
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
      await ctx.answerCallbackQuery({ text: "Бронювання не знайдено", show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery();
    await ctx.reply(`Скасувати бронювання «${reservation.item.title}»?`, {
      reply_markup: new InlineKeyboard()
        .text("Так, скасувати", `myres:cancel:confirm:${reservation.id}`)
        .text("Ні", "myres:list"),
    });
  });

  bot.callbackQuery(/^myres:cancel:confirm:([^:]+)$/, async (ctx) => {
    const user = await upsertUserFromCtx(ctx);
    const reservation = await prisma.reservation.findUnique({
      where: { id: ctx.match[1] },
      include: { item: { include: { wishlist: { include: { owner: true } }, reservations: { where: { status: "ACTIVE" } } } } },
    });
    if (!reservation || reservation.status !== "ACTIVE" || reservation.guestId !== user.id) {
      await ctx.answerCallbackQuery({ text: "Бронювання вже неактивне", show_alert: true });
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

    await ctx.reply("↩️ Бронювання скасовано.");
    await showMyReservations(ctx);
  });

  bot.callbackQuery(/^myres:purchased:([^:]+)$/, async (ctx) => {
    const user = await upsertUserFromCtx(ctx);
    const reservation = await prisma.reservation.findUnique({ where: { id: ctx.match[1] } });
    if (!reservation || reservation.guestId !== user.id) {
      await ctx.answerCallbackQuery({ text: "Бронювання не знайдено", show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery();
    await prisma.reservation.update({ where: { id: reservation.id }, data: { status: "PURCHASED" } });
    await ctx.reply("✅ Позначено як придбано.");
    await showMyReservations(ctx);
  });
}
