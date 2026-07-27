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

const SKIP = "-";

function parseSkippable(raw: string): string | null {
  const t = raw.trim();
  return t === SKIP || t.length === 0 ? null : t;
}

function priorityKeyboard(prefix = "priority"): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔥 Дуже хочу", `${prefix}:HIGH`)
    .row()
    .text("⭐ Хочу", `${prefix}:NORMAL`)
    .row()
    .text("💭 Було б приємно", `${prefix}:LOW`);
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
    `${items.length} бажань`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  const headerKb = new InlineKeyboard();
  if (wishlist.status === "ACTIVE") {
    headerKb.text("➕ Додати бажання", `item:add:${wishlistId}`).row();
  }
  headerKb.text("⚙️ Налаштування", `wl:settings:${wishlistId}`).text("📋 Мої вішлісти", "wl:list");

  await ctx.reply(header, { parse_mode: "HTML", reply_markup: headerKb });

  for (const [index, item] of items.entries()) {
    const a = computeAvailability(item.quantity, item.reservations);
    const statusLine = a.isFull
      ? "✅ Уже заброньовано"
      : a.reserved > 0
        ? `Потрібно: ${item.quantity}\nЗаброньовано: ${a.reserved}\nЗалишилось: ${a.available}`
        : `Потрібно: ${item.quantity}\nСтатус: доступно`;

    const lines = [
      `${PRIORITY_ICON[item.priority]} <b>${escapeHtml(item.title)}</b>`,
      [item.price, item.store].filter((v): v is string => v !== null).map(escapeHtml).join(" · ") || null,
      statusLine,
      item.comment ? escapeHtml(item.comment) : null,
    ].filter((l) => l !== null);

    const kb = new InlineKeyboard();
    if (item.url) kb.url("🔗 Відкрити посилання", item.url).row();
    kb.text("✏️ Редагувати", `item:edit:${item.id}`)
      .text("📌 Пріоритет", `item:priority:${item.id}`)
      .row()
      .text("🔢 Кількість", `item:qty:${item.id}`);
    if (index > 0) kb.text("⬆️", `item:up:${item.id}`);
    if (index < items.length - 1) kb.text("⬇️", `item:down:${item.id}`);
    kb.row().text("🗑 Видалити", `item:delete:${item.id}`);

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML", reply_markup: kb });
  }
}

export async function addItemConversation(conversation: MyConversation, ctx: MyContext, wishlistId: string) {
  const access = await conversation.external((c) => checkWishlistAccess(c, wishlistId, false));
  if (!access) return;

  await ctx.reply(
    "Надішліть посилання на товар — спробую сам витягнути назву, фото та ціну.\n\nАбо натисніть кнопку і введіть все вручну.",
    { reply_markup: new InlineKeyboard().text("✍️ Ввести вручну", "manual") },
  );

  const first = await conversation.wait();

  let title: string | undefined;
  let url: string | null = null;
  let imageUrl: string | null = null;
  let price: string | null = null;
  let store: string | null = null;

  if (first.callbackQuery?.data === "manual") {
    await first.answerCallbackQuery();
    await ctx.reply("Введіть назву товару:");
    title = await conversation.form.text();
  } else if (first.message?.text && /^https?:\/\//i.test(first.message.text.trim())) {
    url = first.message.text.trim();
    await ctx.reply("🔎 Дивлюся, що там...");
    const preview = await conversation.external(() => fetchLinkPreview(url as string));

    if (preview?.title || preview?.price) {
      const previewTitle = preview.title ?? "Без назви";
      const lines = [
        `<b>${escapeHtml(previewTitle)}</b>`,
        preview.price ? `Ціна: ${escapeHtml(preview.price)}` : null,
        preview.store ? `Магазин: ${escapeHtml(preview.store)}` : null,
      ]
        .filter((l): l is string => l !== null)
        .join("\n");

      await ctx.reply(lines, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard()
          .text("Додати", "add")
          .text("Редагувати", "edit")
          .row()
          .text("Скасувати", "cancel"),
      });

      const decision = await conversation.waitForCallbackQuery(["add", "edit", "cancel"]);
      await decision.answerCallbackQuery();

      if (decision.callbackQuery.data === "cancel") {
        await ctx.reply("Скасовано.");
        return;
      }
      if (decision.callbackQuery.data === "edit") {
        await ctx.reply("Введіть правильну назву:");
        title = await conversation.form.text();
      } else {
        title = previewTitle;
      }
      imageUrl = preview.imageUrl;
      price = preview.price;
      store = preview.store;
    } else {
      await ctx.reply("Не вдалося автоматично розпізнати товар за посиланням. Введіть назву вручну:");
      title = await conversation.form.text();
    }
  } else if (first.message?.text) {
    title = first.message.text.trim();
  } else {
    await ctx.reply("Введіть назву товару текстом:");
    title = await conversation.form.text();
  }

  if (!title) {
    await ctx.reply("Введіть назву товару текстом:");
    title = await conversation.form.text();
  }

  if (!url) {
    await ctx.reply("Посилання на товар (необов'язково). Надішліть «-», щоб пропустити.");
    url = parseSkippable(await conversation.form.text());
  }
  if (!price) {
    await ctx.reply("Ціна (необов'язково). Надішліть «-», щоб пропустити.");
    price = parseSkippable(await conversation.form.text());
  }
  if (!store) {
    await ctx.reply("Магазин (необов'язково). Надішліть «-», щоб пропустити.");
    store = parseSkippable(await conversation.form.text());
  }

  await ctx.reply("Скільки одиниць потрібно? Введіть число (наприклад, 1).");
  let quantity = 1;
  while (true) {
    const q = await conversation.form.int({
      otherwise: (c) => c.reply("Будь ласка, надішліть ціле число, наприклад 1."),
    });
    if (q >= 1) {
      quantity = q;
      break;
    }
    await ctx.reply("Кількість має бути щонайменше 1, спробуйте ще раз.");
  }

  await ctx.reply(
    "Додайте коментар (необов'язково, наприклад бажаний колір чи розмір). Надішліть «-», щоб пропустити.",
  );
  const comment = parseSkippable(await conversation.form.text());

  await ctx.reply("Наскільки сильно хочете цей подарунок?", { reply_markup: priorityKeyboard() });
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

  await ctx.reply(`✅ Додано «${title}» до списку.`);

  await conversation.external((c) =>
    notifyNewItemToSubscribers(c.api, wishlistId, access.wishlist.title, item.title),
  );

  await renderWishlistManagement(ctx, wishlistId);
}

const EDIT_FIELDS = ["title", "url", "price", "store", "comment", "quantity"] as const;
type EditField = (typeof EDIT_FIELDS)[number];

const EDIT_FIELD_PROMPT: Record<EditField, string> = {
  title: "Введіть нову назву:",
  url: "Введіть нове посилання. Надішліть «-», щоб прибрати посилання.",
  price: "Введіть нову ціну. Надішліть «-», щоб прибрати ціну.",
  store: "Введіть новий магазин. Надішліть «-», щоб прибрати магазин.",
  comment: "Введіть новий коментар. Надішліть «-», щоб прибрати коментар.",
  quantity: "Скільки одиниць потрібно? Введіть ціле число.",
};

export async function editItemFieldConversation(
  conversation: MyConversation,
  ctx: MyContext,
  itemId: string,
  field: EditField,
) {
  const item = await conversation.external(() => prisma.wishlistItem.findUnique({ where: { id: itemId } }));
  if (!item) {
    await ctx.reply("Товар не знайдено.");
    return;
  }
  const access = await conversation.external((c) => checkWishlistAccess(c, item.wishlistId, false));
  if (!access) return;

  await ctx.reply(EDIT_FIELD_PROMPT[field]);

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
        otherwise: (c) => c.reply("Будь ласка, надішліть ціле число."),
      });
      if (q < reserved) {
        await ctx.reply(`Уже заброньовано ${reserved} од. Кількість не може бути меншою.`);
        continue;
      }
      if (q < 1) {
        await ctx.reply("Кількість має бути щонайменше 1.");
        continue;
      }
      quantity = q;
      break;
    }
    await conversation.external(() => prisma.wishlistItem.update({ where: { id: itemId }, data: { quantity } }));
    await ctx.reply("✅ Кількість оновлено.");
  } else {
    const raw = await conversation.form.text();
    const value = field === "title" ? raw.trim() : parseSkippable(raw);
    await conversation.external(() =>
      prisma.wishlistItem.update({ where: { id: itemId }, data: { [field]: value } }),
    );
    await ctx.reply("✅ Оновлено.");
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
      await ctx.answerCallbackQuery({ text: "Товар не знайдено", show_alert: true });
      return;
    }
    const access = await checkWishlistAccess(ctx, item.wishlistId, false);
    if (!access) return;
    await ctx.answerCallbackQuery();
    await ctx.reply("Що саме змінити?", {
      reply_markup: new InlineKeyboard()
        .text("Назву", `item:field:title:${item.id}`)
        .text("Посилання", `item:field:url:${item.id}`)
        .row()
        .text("Ціну", `item:field:price:${item.id}`)
        .text("Магазин", `item:field:store:${item.id}`)
        .row()
        .text("Коментар", `item:field:comment:${item.id}`),
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
      await ctx.answerCallbackQuery({ text: "Товар не знайдено", show_alert: true });
      return;
    }
    const access = await checkWishlistAccess(ctx, item.wishlistId, false);
    if (!access) return;
    await ctx.answerCallbackQuery();
    await ctx.reply("Наскільки сильно хочете цей подарунок?", {
      reply_markup: priorityKeyboard(`item:priority:set:${item.id}`),
    });
  });

  bot.callbackQuery(/^item:priority:set:([^:]+):(HIGH|NORMAL|LOW)$/, async (ctx) => {
    const itemId = ctx.match[1];
    const priority = ctx.match[2] as Priority;
    const item = await prisma.wishlistItem.findUnique({ where: { id: itemId } });
    if (!item) {
      await ctx.answerCallbackQuery({ text: "Товар не знайдено", show_alert: true });
      return;
    }
    const access = await checkWishlistAccess(ctx, item.wishlistId, false);
    if (!access) return;
    await ctx.answerCallbackQuery();
    await prisma.wishlistItem.update({ where: { id: itemId }, data: { priority } });
    await ctx.reply("✅ Пріоритет оновлено.");
    await renderWishlistManagement(ctx, item.wishlistId);
  });

  bot.callbackQuery(/^item:(up|down):([^:]+)$/, async (ctx) => {
    const direction = ctx.match[1] as "up" | "down";
    const itemId = ctx.match[2];
    const item = await prisma.wishlistItem.findUnique({ where: { id: itemId } });
    if (!item) {
      await ctx.answerCallbackQuery({ text: "Товар не знайдено", show_alert: true });
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
      await ctx.answerCallbackQuery({ text: "Товар не знайдено", show_alert: true });
      return;
    }
    const access = await checkWishlistAccess(ctx, item.wishlistId, false);
    if (!access) return;
    await ctx.answerCallbackQuery();

    const activeReservationsCount = await prisma.reservation.count({
      where: { itemId: item.id, status: "ACTIVE" },
    });
    const warning =
      activeReservationsCount > 0
        ? `\n\nЦей подарунок уже забронювали (${activeReservationsCount}). Після видалення вони отримають сповіщення.`
        : "";

    await ctx.reply(`Видалити «${item.title}»?${warning}`, {
      reply_markup: new InlineKeyboard()
        .text("Все одно видалити", `item:delete:confirm:${item.id}`)
        .text("Скасувати", `item:back:${item.wishlistId}`),
    });
  });

  bot.callbackQuery(/^item:delete:confirm:([^:]+)$/, async (ctx) => {
    const item = await prisma.wishlistItem.findUnique({ where: { id: ctx.match[1] } });
    if (!item) {
      await ctx.answerCallbackQuery({ text: "Товар не знайдено", show_alert: true });
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

    await ctx.reply(`🗑 «${item.title}» видалено.`);
    await renderWishlistManagement(ctx, item.wishlistId);
  });

  bot.callbackQuery(/^item:back:([^:]+)$/, async (ctx) => {
    await renderWishlistManagement(ctx, ctx.match[1]);
  });
}
