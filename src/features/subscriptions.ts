import { InlineKeyboard, type Bot } from "grammy";
import type { MyContext } from "../context.js";
import { prisma } from "../db.js";
import { upsertUserFromCtx } from "../lib/users.js";
import { escapeHtml } from "../lib/format.js";
import { notifySubscribers } from "../lib/notify.js";

type BotApi = Bot<MyContext>["api"];

export async function getSubscriberTelegramIds(wishlistId: string): Promise<string[]> {
  const subs = await prisma.subscription.findMany({
    where: { wishlistId },
    include: { user: true },
  });
  return subs.map((s) => s.user.telegramId);
}

export async function notifyNewItemToSubscribers(
  api: BotApi,
  wishlistId: string,
  wishlistTitle: string,
  itemTitle: string,
) {
  const telegramIds = await getSubscriberTelegramIds(wishlistId);
  if (telegramIds.length === 0) return;
  const text = `🔔 У вішлісті «${escapeHtml(wishlistTitle)}» з'явилося нове бажання:\n\n${escapeHtml(itemTitle)}`;
  const kb = new InlineKeyboard().text("Переглянути", `g:items:${wishlistId}:all`);
  await notifySubscribers(api, telegramIds, text, kb);
}

export async function notifyItemAvailableAgainToSubscribers(
  api: BotApi,
  wishlistId: string,
  wishlistTitle: string,
  itemTitle: string,
) {
  const telegramIds = await getSubscriberTelegramIds(wishlistId);
  if (telegramIds.length === 0) return;
  const text = `🔔 У вішлісті «${escapeHtml(wishlistTitle)}» знову доступний подарунок:\n\n${escapeHtml(itemTitle)}`;
  const kb = new InlineKeyboard().text("Переглянути", `g:items:${wishlistId}:all`);
  await notifySubscribers(api, telegramIds, text, kb);
}

export async function showMySubscriptions(ctx: MyContext) {
  const user = await upsertUserFromCtx(ctx);
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  const subs = await prisma.subscription.findMany({
    where: { userId: user.id },
    include: { wishlist: true },
    orderBy: { createdAt: "desc" },
  });

  if (subs.length === 0) {
    await ctx.reply("Ви поки не підписані на жодний вішліст. Відкрийте список за посиланням і натисніть «🔔 Підписатися».");
    return;
  }

  await ctx.reply(`🔔 Ваші підписки (${subs.length})`);
  for (const s of subs) {
    const kb = new InlineKeyboard()
      .text("Переглянути", `g:items:${s.wishlist.id}:all`)
      .text("🔕 Відписатися", `unsub:${s.wishlist.id}`);
    await ctx.reply(`🎁 ${s.wishlist.title}${s.wishlist.status === "ARCHIVED" ? " (архів)" : ""}`, {
      reply_markup: kb,
    });
  }
}

export function registerSubscriptions(bot: Bot<MyContext>) {
  bot.callbackQuery(/^sub:([^:]+)$/, async (ctx) => {
    const user = await upsertUserFromCtx(ctx);
    const wishlistId = ctx.match[1];
    const wishlist = await prisma.wishlist.findUnique({ where: { id: wishlistId } });
    if (!wishlist) {
      await ctx.answerCallbackQuery({ text: "Список не знайдено", show_alert: true });
      return;
    }
    await prisma.subscription.upsert({
      where: { wishlistId_userId: { wishlistId, userId: user.id } },
      create: { wishlistId, userId: user.id },
      update: {},
    });
    await ctx.answerCallbackQuery({ text: "Підписано на оновлення" });
    await ctx.reply(`🔔 Ви підписалися на оновлення списку «${wishlist.title}».`);
  });

  bot.callbackQuery(/^unsub:([^:]+)$/, async (ctx) => {
    const user = await upsertUserFromCtx(ctx);
    const wishlistId = ctx.match[1];
    await prisma.subscription.deleteMany({ where: { wishlistId, userId: user.id } });
    await ctx.answerCallbackQuery({ text: "Відписано" });
    await ctx.reply("🔕 Ви відписалися від оновлень цього списку.");
  });
}
