import { InlineKeyboard, type Bot } from "grammy";
import type { MyContext } from "../context.js";
import { prisma } from "../db.js";
import { upsertUserFromCtx } from "../lib/users.js";
import { notifySubscribers } from "../lib/notify.js";
import { t } from "../text.js";

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
  const text = t.notify.newItem(wishlistTitle, itemTitle);
  const kb = new InlineKeyboard().text(t.buttons.view, `g:items:${wishlistId}:all`);
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
  const text = t.notify.itemAvailableAgain(wishlistTitle, itemTitle);
  const kb = new InlineKeyboard().text(t.buttons.view, `g:items:${wishlistId}:all`);
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
    await ctx.reply(t.subscription.noneYet);
    return;
  }

  await ctx.reply(t.subscription.yourSubscriptions(subs.length));
  for (const s of subs) {
    const kb = new InlineKeyboard()
      .text(t.buttons.view, `g:items:${s.wishlist.id}:all`)
      .text(t.buttons.unsubscribe, `unsub:${s.wishlist.id}`);
    await ctx.reply(`🎁 ${s.wishlist.title}${s.wishlist.status === "ARCHIVED" ? t.subscription.archivedSuffix : ""}`, {
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
      await ctx.answerCallbackQuery({ text: t.common.notFoundAlert, show_alert: true });
      return;
    }
    await prisma.subscription.upsert({
      where: { wishlistId_userId: { wishlistId, userId: user.id } },
      create: { wishlistId, userId: user.id },
      update: {},
    });
    await ctx.answerCallbackQuery({ text: t.subscription.subscribedToast });
    await ctx.reply(t.subscription.subscribedMessage(wishlist.title));
  });

  bot.callbackQuery(/^unsub:([^:]+)$/, async (ctx) => {
    const user = await upsertUserFromCtx(ctx);
    const wishlistId = ctx.match[1];
    await prisma.subscription.deleteMany({ where: { wishlistId, userId: user.id } });
    await ctx.answerCallbackQuery({ text: t.subscription.unsubscribedToast });
    await ctx.reply(t.subscription.unsubscribedMessage);
  });
}
