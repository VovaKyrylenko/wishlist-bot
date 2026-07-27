import { InlineKeyboard, type Bot } from "grammy";
import type { MyContext } from "../context.js";
import { prisma } from "../db.js";
import { upsertUserFromCtx } from "../lib/users.js";
import { computeAvailability } from "../lib/availability.js";
import { escapeHtml, formatDate, PRIORITY_ICON, PRIORITY_ORDER } from "../lib/format.js";
import { buildListDeepLink } from "../lib/deeplink.js";

type GuestFilter = "all" | "available" | "reserved";

function availabilityRank(isFull: boolean, isPartial: boolean): number {
  if (isFull) return 2;
  if (isPartial) return 1;
  return 0;
}

export async function openWishlistForGuest(ctx: MyContext, slug: string) {
  const wishlist = await prisma.wishlist.findUnique({ where: { slug } });
  if (!wishlist) {
    await ctx.reply("Список не знайдено. Можливо, посилання застаріло.");
    return;
  }
  await showWishlistIntro(ctx, wishlist.id);
}

async function showWishlistIntro(ctx: MyContext, wishlistId: string) {
  const wishlist = await prisma.wishlist.findUnique({
    where: { id: wishlistId },
    include: { items: { where: { status: "ACTIVE" } } },
  });
  if (!wishlist) {
    await ctx.reply("Список не знайдено.");
    return;
  }

  const user = await upsertUserFromCtx(ctx);
  const subscription = await prisma.subscription.findUnique({
    where: { wishlistId_userId: { wishlistId, userId: user.id } },
  });

  const lines = [
    `🎁 <b>${escapeHtml(wishlist.title)}</b>`,
    wishlist.description ? escapeHtml(wishlist.description) : null,
    wishlist.eventDate ? `📅 ${formatDate(wishlist.eventDate)}` : null,
    "",
    `${wishlist.items.length} бажань`,
    wishlist.status === "ARCHIVED" ? "\n📦 Список закрито власником — нові бронювання не приймаються." : null,
  ].filter((l) => l !== null);

  const kb = new InlineKeyboard().text("🎁 Переглянути подарунки", `g:items:${wishlistId}:all`).row();
  if (subscription) {
    kb.text("🔕 Відписатися", `unsub:${wishlistId}`);
  } else {
    kb.text("🔔 Підписатися на оновлення", `sub:${wishlistId}`);
  }

  await ctx.reply(lines.join("\n"), { parse_mode: "HTML", reply_markup: kb });

  const me = await ctx.api.getMe();
  const link = buildListDeepLink(me.username, wishlist.slug);
  const shareText = `🎁 Вішліст «${wishlist.title}»\n\n${link}`;
  await ctx.reply("Поділитися цим списком:", {
    reply_markup: new InlineKeyboard().switchInline("📤 Поділитися списком", shareText),
  });
}

async function showItems(ctx: MyContext, wishlistId: string, filter: GuestFilter) {
  const wishlist = await prisma.wishlist.findUnique({ where: { id: wishlistId } });
  if (!wishlist) {
    await ctx.answerCallbackQuery({ text: "Список не знайдено", show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery();

  const items = await prisma.wishlistItem.findMany({
    where: { wishlistId, status: "ACTIVE" },
    include: { reservations: { where: { status: "ACTIVE" } } },
  });

  const withAvailability = items.map((item) => ({
    item,
    availability: computeAvailability(item.quantity, item.reservations),
  }));

  const filtered = withAvailability.filter(({ availability }) => {
    if (filter === "available") return availability.available > 0;
    if (filter === "reserved") return availability.reserved > 0;
    return true;
  });

  filtered.sort((a, b) => {
    const p = PRIORITY_ORDER[a.item.priority] - PRIORITY_ORDER[b.item.priority];
    if (p !== 0) return p;
    return (
      availabilityRank(a.availability.isFull, a.availability.isPartial) -
      availabilityRank(b.availability.isFull, b.availability.isPartial)
    );
  });

  const filterKb = new InlineKeyboard()
    .text(filter === "all" ? "• Усі" : "Усі", `g:items:${wishlistId}:all`)
    .text(filter === "available" ? "• Доступні" : "Доступні", `g:items:${wishlistId}:available`)
    .text(filter === "reserved" ? "• Заброньовані" : "Заброньовані", `g:items:${wishlistId}:reserved`);

  await ctx.reply(`🎁 ${wishlist.title} — ${filtered.length} бажань`, { reply_markup: filterKb });

  if (filtered.length === 0) {
    await ctx.reply("Тут поки що порожньо.");
    return;
  }

  for (const { item, availability: a } of filtered) {
    const lines = [
      `${PRIORITY_ICON[item.priority]} <b>${escapeHtml(item.title)}</b>`,
      "",
      item.price ? escapeHtml(item.price) : null,
      item.store ? escapeHtml(item.store) : null,
      a.isFull
        ? "✅ Уже заброньовано"
        : a.reserved > 0
          ? `Потрібно: ${item.quantity}\nЗаброньовано: ${a.reserved}\nЗалишилось: ${a.available}`
          : `Потрібно: ${item.quantity}\nСтатус: доступно`,
      item.comment ? `\n${escapeHtml(item.comment)}` : null,
    ].filter((l) => l !== null);

    const kb = new InlineKeyboard();
    if (item.url) kb.url("🔗 Відкрити посилання", item.url).row();
    if (wishlist.status === "ACTIVE" && !a.isFull) {
      kb.text("🎁 Забронювати", `g:reserve:${item.id}`);
    }

    await ctx.reply(lines.join("\n"), {
      parse_mode: "HTML",
      reply_markup: kb.inline_keyboard.length > 0 ? kb : undefined,
    });
  }
}

export function registerGuest(bot: Bot<MyContext>) {
  bot.callbackQuery(/^g:items:([^:]+):(all|available|reserved)$/, async (ctx) => {
    await showItems(ctx, ctx.match[1], ctx.match[2] as GuestFilter);
  });

  bot.callbackQuery(/^g:reserve:([^:]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter("reserve", ctx.match[1]);
  });
}
