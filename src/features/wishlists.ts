import { InlineKeyboard, type Bot } from "grammy";
import type { MyContext, MyConversation } from "../context.js";
import { prisma } from "../db.js";
import { upsertUserFromCtx } from "../lib/users.js";
import { generateSlug } from "../lib/ids.js";
import { buildListDeepLink } from "../lib/deeplink.js";
import { escapeHtml, formatDate, PRIVACY_LABEL } from "../lib/format.js";
import { computeAvailability } from "../lib/availability.js";
import { notifyGuestListArchived, notifyGuestListDeleted } from "../lib/notify.js";
import { checkWishlistAccess } from "../lib/access.js";
import { renderWishlistManagement } from "./items.js";

const SKIP = "-";

function parseSkippable(raw: string): string | null {
  const t = raw.trim();
  return t === SKIP || t.length === 0 ? null : t;
}

function parseUaDate(raw: string): Date | null {
  const m = raw.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/** Used only inside createWishlistConversation, where no wishlist id exists yet. */
function privacyKeyboardForCreate(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🎁 Сюрприз", "privacy:SURPRISE")
    .row()
    .text("👀 Відкритий", "privacy:OPEN");
}

function privacyKeyboardForEdit(wishlistId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("🎁 Сюрприз", `wl:privacy:set:${wishlistId}:SURPRISE`)
    .row()
    .text("👀 Відкритий", `wl:privacy:set:${wishlistId}:OPEN`);
}

const assertAccess = checkWishlistAccess;

export async function showMyWishlists(ctx: MyContext) {
  const user = await upsertUserFromCtx(ctx);
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  const wishlists = await prisma.wishlist.findMany({
    where: { OR: [{ ownerId: user.id }, { editors: { some: { userId: user.id } } }] },
    include: {
      items: {
        where: { status: "ACTIVE" },
        include: { reservations: { where: { status: "ACTIVE" } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (wishlists.length === 0) {
    await ctx.reply("У вас ще немає жодного вішліста. Натисніть «➕ Створити вішліст», щоб почати.");
    return;
  }

  await ctx.reply(`📋 Ваші вішлісти (${wishlists.length})`);

  for (const wl of wishlists) {
    let full = 0;
    let partial = 0;
    for (const item of wl.items) {
      const a = computeAvailability(item.quantity, item.reservations);
      if (a.isFull) full++;
      else if (a.isPartial) partial++;
    }

    const lines = [
      `${wl.status === "ARCHIVED" ? "📦" : "🎁"} <b>${escapeHtml(wl.title)}</b>`,
      wl.eventDate ? `📅 ${formatDate(wl.eventDate)}` : null,
      `${wl.items.length} бажань`,
      full > 0 ? `${full} повністю заброньовано` : null,
      partial > 0 ? `${partial} частково заброньовано` : null,
      wl.status === "ARCHIVED" ? "Список в архіві" : null,
    ].filter((l) => l !== null);

    const kb = new InlineKeyboard().text("Відкрити", `wl:open:${wl.id}`);
    if (wl.status === "ACTIVE") kb.text("Поділитися", `wl:share:${wl.id}`);
    kb.row().text("⚙️ Налаштування", `wl:settings:${wl.id}`);

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML", reply_markup: kb });
  }
}

export async function createWishlistConversation(conversation: MyConversation, ctx: MyContext) {
  await ctx.reply("Введіть назву списку (наприклад: «День народження Володимира»):");
  const title = await conversation.form.text();

  await ctx.reply("Додайте короткий опис (необов'язково). Надішліть «-», щоб пропустити.");
  const description = parseSkippable(await conversation.form.text());

  await ctx.reply(
    "Вкажіть дату події у форматі ДД.ММ.РРРР (необов'язково). Надішліть «-», щоб пропустити.",
  );
  let eventDate: Date | null = null;
  const dateRaw = parseSkippable(await conversation.form.text());
  if (dateRaw) {
    eventDate = parseUaDate(dateRaw);
    if (!eventDate) await ctx.reply("Не вдалося розпізнати дату — продовжую без неї.");
  }

  await ctx.reply(
    "Чи бачитимете ви деталі бронювань? У режимі «Сюрприз» ви не побачите, хто і що саме забронював.",
    { reply_markup: privacyKeyboardForCreate() },
  );
  const privacyCtx = await conversation.waitForCallbackQuery(["privacy:SURPRISE", "privacy:OPEN"]);
  await privacyCtx.answerCallbackQuery();
  const privacyMode = privacyCtx.callbackQuery.data === "privacy:OPEN" ? "OPEN" : "SURPRISE";

  const user = await conversation.external((c) => upsertUserFromCtx(c));
  const slug = await conversation.external(() => generateSlug());
  const wishlist = await conversation.external(() =>
    prisma.wishlist.create({
      data: { title, description, eventDate, privacyMode, slug, ownerId: user.id },
    }),
  );
  const me = await conversation.external((c) => c.api.getMe());
  const link = buildListDeepLink(me.username, wishlist.slug);

  await ctx.reply(
    `✅ Список «${escapeHtml(title)}» створено!\n\nПосилання для друзів:\n${link}\n\nНадішліть його друзям або одразу додайте перше бажання.`,
    {
      reply_markup: new InlineKeyboard()
        .text("➕ Додати бажання", `item:add:${wishlist.id}`)
        .row()
        .text("📋 Мої вішлісти", "wl:list"),
    },
  );
}

async function showSettings(ctx: MyContext, wishlistId: string) {
  const access = await assertAccess(ctx, wishlistId, true);
  if (!access) return;
  const { wishlist } = access;
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  const lines = [
    `⚙️ Налаштування «${escapeHtml(wishlist.title)}»`,
    "",
    wishlist.description ? escapeHtml(wishlist.description) : "(без опису)",
    wishlist.eventDate ? `📅 ${formatDate(wishlist.eventDate)}` : "(дата не вказана)",
    PRIVACY_LABEL[wishlist.privacyMode],
  ];

  const kb = new InlineKeyboard()
    .text("✏️ Змінити назву", `wl:field:title:${wishlist.id}`)
    .text("📝 Змінити опис", `wl:field:description:${wishlist.id}`)
    .row()
    .text("📅 Змінити дату", `wl:field:eventDate:${wishlist.id}`)
    .text("🔒 Приватність", `wl:privacy:${wishlist.id}`)
    .row()
    .text("👥 Додати редактора", `wl:addeditor:${wishlist.id}`)
    .row();

  if (wishlist.status === "ACTIVE") {
    kb.text("📦 Архівувати", `wl:archive:${wishlist.id}`).text("📄 Копія", `wl:duplicate:${wishlist.id}`);
  } else {
    kb.text("♻️ Розархівувати", `wl:unarchive:${wishlist.id}`).text("📄 Копія", `wl:duplicate:${wishlist.id}`);
  }
  kb.row().text("🗑 Видалити список", `wl:delete:${wishlist.id}`);
  kb.row().text("⬅️ Назад до списку", `wl:open:${wishlist.id}`);

  await ctx.reply(lines.join("\n"), { parse_mode: "HTML", reply_markup: kb });
}

export async function editWishlistFieldConversation(
  conversation: MyConversation,
  ctx: MyContext,
  wishlistId: string,
  field: "title" | "description" | "eventDate",
) {
  const access = await conversation.external((c) => assertAccess(c, wishlistId, true));
  if (!access) return;

  if (field === "title") {
    await ctx.reply("Введіть нову назву списку:");
    const title = await conversation.form.text();
    await conversation.external(() => prisma.wishlist.update({ where: { id: wishlistId }, data: { title } }));
    await ctx.reply("✅ Назву оновлено.");
  } else if (field === "description") {
    await ctx.reply("Введіть новий опис. Надішліть «-», щоб прибрати опис.");
    const description = parseSkippable(await conversation.form.text());
    await conversation.external(() =>
      prisma.wishlist.update({ where: { id: wishlistId }, data: { description } }),
    );
    await ctx.reply("✅ Опис оновлено.");
  } else {
    await ctx.reply("Введіть нову дату у форматі ДД.ММ.РРРР. Надішліть «-», щоб прибрати дату.");
    const raw = parseSkippable(await conversation.form.text());
    let eventDate: Date | null = null;
    if (raw) {
      eventDate = parseUaDate(raw);
      if (!eventDate) {
        await ctx.reply("Не вдалося розпізнати дату, спробуйте ще раз у форматі ДД.ММ.РРРР.");
        return;
      }
    }
    await conversation.external(() => prisma.wishlist.update({ where: { id: wishlistId }, data: { eventDate } }));
    await ctx.reply("✅ Дату оновлено.");
  }

  await showSettings(ctx, wishlistId);
}

export async function addEditorConversation(conversation: MyConversation, ctx: MyContext, wishlistId: string) {
  const access = await conversation.external((c) => assertAccess(c, wishlistId, true));
  if (!access) return;

  await ctx.reply(
    "Надішліть юзернейм редактора у форматі @username (людина повинна мати публічний юзернейм у Telegram).",
  );
  const raw = await conversation.form.text();
  const username = raw.trim().replace(/^@/, "");

  const chat = await conversation.external(async (c) => {
    try {
      return await c.api.getChat(`@${username}`);
    } catch {
      return null;
    }
  });

  if (!chat || !("id" in chat)) {
    await ctx.reply("Не вдалося знайти цього користувача. Перевірте юзернейм і спробуйте ще раз.");
    return;
  }

  const editorUser = await conversation.external(() =>
    prisma.user.upsert({
      where: { telegramId: String(chat.id) },
      create: {
        telegramId: String(chat.id),
        username: "username" in chat ? (chat.username ?? null) : null,
        firstName: "first_name" in chat ? (chat.first_name ?? null) : null,
        lastName: "last_name" in chat ? (chat.last_name ?? null) : null,
      },
      update: {},
    }),
  );

  await conversation.external(() =>
    prisma.wishlistEditor.upsert({
      where: { wishlistId_userId: { wishlistId, userId: editorUser.id } },
      create: { wishlistId, userId: editorUser.id },
      update: {},
    }),
  );

  await ctx.reply(`✅ @${username} тепер може редагувати цей список.`);
  await showSettings(ctx, wishlistId);
}

export function registerWishlists(bot: Bot<MyContext>) {
  bot.callbackQuery("wl:list", showMyWishlists);

  bot.callbackQuery(/^wl:settings:([^:]+)$/, async (ctx) => {
    await showSettings(ctx, ctx.match[1]);
  });

  bot.callbackQuery(/^wl:open:([^:]+)$/, async (ctx) => {
    await renderWishlistManagement(ctx, ctx.match[1]);
  });

  bot.callbackQuery(/^wl:share:([^:]+)$/, async (ctx) => {
    const access = await assertAccess(ctx, ctx.match[1], false);
    if (!access) return;
    await ctx.answerCallbackQuery();
    const me = await ctx.api.getMe();
    const link = buildListDeepLink(me.username, access.wishlist.slug);
    const text = [
      `🎁 Мій вішліст «${access.wishlist.title}»`,
      "",
      "Тут можна переглянути побажання та забронювати подарунок, щоб уникнути повторів:",
      "",
      link,
    ].join("\n");
    await ctx.reply(text, {
      reply_markup: new InlineKeyboard().switchInline("Надіслати другу", text),
    });
  });

  bot.callbackQuery(/^wl:field:(title|description|eventDate):([^:]+)$/, async (ctx) => {
    const field = ctx.match[1] as "title" | "description" | "eventDate";
    const wishlistId = ctx.match[2];
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter("editWishlistField", wishlistId, field);
  });

  bot.callbackQuery(/^wl:privacy:([^:]+)$/, async (ctx) => {
    const access = await assertAccess(ctx, ctx.match[1], true);
    if (!access) return;
    await ctx.answerCallbackQuery();
    await ctx.reply("Оберіть режим приватності бронювань:", {
      reply_markup: privacyKeyboardForEdit(access.wishlist.id),
    });
  });

  bot.callbackQuery(/^wl:privacy:set:([^:]+):(SURPRISE|OPEN)$/, async (ctx) => {
    const wishlistId = ctx.match[1];
    const mode = ctx.match[2] as "SURPRISE" | "OPEN";
    const access = await assertAccess(ctx, wishlistId, true);
    if (!access) return;
    await ctx.answerCallbackQuery();
    await prisma.wishlist.update({ where: { id: wishlistId }, data: { privacyMode: mode } });
    await ctx.reply(`✅ ${PRIVACY_LABEL[mode]}`);
    await showSettings(ctx, wishlistId);
  });

  bot.callbackQuery(/^wl:addeditor:([^:]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter("addEditor", ctx.match[1]);
  });

  bot.callbackQuery(/^wl:archive:([^:]+)$/, async (ctx) => {
    const access = await assertAccess(ctx, ctx.match[1], true);
    if (!access) return;
    await ctx.answerCallbackQuery();
    await ctx.reply(
      `Архівувати «${access.wishlist.title}»? Список більше не прийматиме бронювань і сповіщень.`,
      {
        reply_markup: new InlineKeyboard()
          .text("Так, архівувати", `wl:archive:confirm:${access.wishlist.id}`)
          .text("Скасувати", `wl:settings:${access.wishlist.id}`),
      },
    );
  });

  bot.callbackQuery(/^wl:archive:confirm:([^:]+)$/, async (ctx) => {
    const access = await assertAccess(ctx, ctx.match[1], true);
    if (!access) return;
    await ctx.answerCallbackQuery();

    const wishlist = await prisma.wishlist.update({
      where: { id: access.wishlist.id },
      data: { status: "ARCHIVED" },
    });

    const activeReservations = await prisma.reservation.findMany({
      where: { status: "ACTIVE", item: { wishlistId: wishlist.id } },
      include: { guest: true },
      distinct: ["guestId"],
    });
    for (const r of activeReservations) {
      await notifyGuestListArchived(ctx.api, {
        guestTelegramId: r.guest.telegramId,
        wishlistTitle: wishlist.title,
      });
    }

    await ctx.reply("📦 Список переміщено в архів.");
    await showSettings(ctx, wishlist.id);
  });

  bot.callbackQuery(/^wl:unarchive:([^:]+)$/, async (ctx) => {
    const access = await assertAccess(ctx, ctx.match[1], true);
    if (!access) return;
    await ctx.answerCallbackQuery();
    await prisma.wishlist.update({ where: { id: access.wishlist.id }, data: { status: "ACTIVE" } });
    await ctx.reply("♻️ Список знову активний.");
    await showSettings(ctx, access.wishlist.id);
  });

  bot.callbackQuery(/^wl:duplicate:([^:]+)$/, async (ctx) => {
    const access = await assertAccess(ctx, ctx.match[1], true);
    if (!access) return;
    await ctx.answerCallbackQuery();

    const items = await prisma.wishlistItem.findMany({
      where: { wishlistId: access.wishlist.id, status: "ACTIVE" },
      orderBy: { sortOrder: "asc" },
    });

    const slug = generateSlug();
    const copy = await prisma.wishlist.create({
      data: {
        title: `${access.wishlist.title} (копія)`,
        description: access.wishlist.description,
        eventDate: null,
        privacyMode: access.wishlist.privacyMode,
        slug,
        ownerId: access.wishlist.ownerId,
        items: {
          create: items.map((i) => ({
            title: i.title,
            url: i.url,
            imageUrl: i.imageUrl,
            price: i.price,
            store: i.store,
            comment: i.comment,
            priority: i.priority,
            quantity: i.quantity,
            sortOrder: i.sortOrder,
          })),
        },
      },
    });

    const me = await ctx.api.getMe();
    const link = buildListDeepLink(me.username, copy.slug);
    await ctx.reply(
      `📄 Створено копію «${copy.title}» (${items.length} бажань, без бронювань і підписників).\n\n${link}`,
      {
        reply_markup: new InlineKeyboard().text("⚙️ Налаштування", `wl:settings:${copy.id}`),
      },
    );
  });

  bot.callbackQuery(/^wl:delete:([^:]+)$/, async (ctx) => {
    const access = await assertAccess(ctx, ctx.match[1], true);
    if (!access) return;
    await ctx.answerCallbackQuery();

    const activeReservationsCount = await prisma.reservation.count({
      where: { status: "ACTIVE", item: { wishlistId: access.wishlist.id } },
    });

    const warning =
      activeReservationsCount > 0
        ? `\n\n⚠️ У цьому списку є ${activeReservationsCount} активних бронювань. Після видалення гості отримають сповіщення.`
        : "";

    await ctx.reply(`Видалити список «${access.wishlist.title}» назавжди?${warning}`, {
      reply_markup: new InlineKeyboard()
        .text("Все одно видалити", `wl:delete:confirm:${access.wishlist.id}`)
        .text("Скасувати", `wl:settings:${access.wishlist.id}`),
    });
  });

  bot.callbackQuery(/^wl:delete:confirm:([^:]+)$/, async (ctx) => {
    const access = await assertAccess(ctx, ctx.match[1], true);
    if (!access) return;
    await ctx.answerCallbackQuery();

    const activeReservations = await prisma.reservation.findMany({
      where: { status: "ACTIVE", item: { wishlistId: access.wishlist.id } },
      include: { guest: true, item: true },
      distinct: ["guestId"],
    });

    const title = access.wishlist.title;
    await prisma.wishlist.delete({ where: { id: access.wishlist.id } });

    for (const r of activeReservations) {
      await notifyGuestListDeleted(ctx.api, {
        guestTelegramId: r.guest.telegramId,
        wishlistTitle: title,
      });
    }

    await ctx.reply(`🗑 Список «${title}» видалено.`);
  });
}
