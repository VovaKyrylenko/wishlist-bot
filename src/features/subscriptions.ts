import { InlineKeyboard, type Bot } from "grammy";
import type { MyContext } from "../context.js";
import { prisma } from "../db.js";
import { upsertUserFromCtx } from "../lib/users.js";
import { notifySubscribers } from "../lib/notify.js";
import { escapeHtml } from "../lib/format.js";
import { addIndexButtons, addPagerRow, paginate, renderScreen, truncate } from "../lib/ui.js";
import { t } from "../text.js";

type BotApi = Bot<MyContext>["api"];

const LISTS_PER_PAGE = 10;

export async function getSubscriberTelegramIds(wishlistId: string): Promise<string[]> {
  const subs = await prisma.subscription.findMany({
    where: { wishlistId },
    include: { user: true },
  });
  return subs.map((s) => s.user.telegramId);
}

/**
 * Still immediate, unlike new-item announcements: a gift becoming free again
 * is rare, time-sensitive, and the thing subscribers signed up to catch.
 */
export async function notifyItemAvailableAgainToSubscribers(
  api: BotApi,
  wishlistId: string,
  wishlistTitle: string,
  itemTitle: string,
) {
  const telegramIds = await getSubscriberTelegramIds(wishlistId);
  if (telegramIds.length === 0) return;
  const kb = new InlineKeyboard().text(t.buttons.view, `g:open:${wishlistId}:a:0`);
  await notifySubscribers(api, telegramIds, t.notify.itemAvailableAgain(wishlistTitle, itemTitle), kb);
}

/**
 * Every list this person has opened, not just the ones they subscribed to.
 * A guest who followed a share link, browsed, and closed Telegram had no way
 * back to it — the link lived only in whatever chat it arrived in.
 */
export async function showMySubscriptions(ctx: MyContext, page = 0) {
  const user = await upsertUserFromCtx(ctx);

  const [visits, subscriptions] = await Promise.all([
    prisma.wishlistVisit.findMany({
      where: { userId: user.id },
      include: { wishlist: true },
      orderBy: { lastSeenAt: "desc" },
    }),
    prisma.subscription.findMany({ where: { userId: user.id }, include: { wishlist: true } }),
  ]);

  const subscribedIds = new Set(subscriptions.map((s) => s.wishlistId));

  // Subscriptions predate visit tracking, so a long-standing subscriber may
  // have no visit row at all — union rather than plain visits.
  const merged = new Map<string, { wishlistId: string; title: string; archived: boolean; sortKey: number }>();
  for (const s of subscriptions) {
    merged.set(s.wishlistId, {
      wishlistId: s.wishlistId,
      title: s.wishlist.title,
      archived: s.wishlist.status === "ARCHIVED",
      sortKey: s.createdAt.getTime(),
    });
  }
  for (const v of visits) {
    const existing = merged.get(v.wishlistId);
    merged.set(v.wishlistId, {
      wishlistId: v.wishlistId,
      title: v.wishlist.title,
      archived: v.wishlist.status === "ARCHIVED",
      sortKey: Math.max(v.lastSeenAt.getTime(), existing?.sortKey ?? 0),
    });
  }

  const lists = [...merged.values()].sort((a, b) => b.sortKey - a.sortKey);

  if (lists.length === 0) {
    await renderScreen(ctx, { text: t.subscription.noneYet });
    return;
  }

  const paged = paginate(lists, page, LISTS_PER_PAGE);
  const rows = paged.slice.map((l, i) =>
    t.subscription.subscriptionRow(
      paged.offset + i + 1,
      escapeHtml(truncate(l.title, 60)),
      [
        l.archived ? t.subscription.archivedSuffix : "",
        subscribedIds.has(l.wishlistId) ? t.subscription.subscribedSuffix : "",
      ].join(""),
    ),
  );

  const kb = new InlineKeyboard();
  addIndexButtons(kb, paged, (l) => `g:open:${l.wishlistId}:a:0`);
  addPagerRow(kb, paged, (p) => `subs:list:${p}`);

  await renderScreen(ctx, {
    text: [
      t.subscription.yourSubscriptions(lists.length),
      "",
      ...rows,
      "",
      t.subscription.listHint,
      t.common.tapNumberHint,
    ].join("\n"),
    keyboard: kb,
  });
}

export function registerSubscriptions(bot: Bot<MyContext>) {
  bot.callbackQuery(/^subs:list:(\d+)$/, async (ctx) => {
    await showMySubscriptions(ctx, Number(ctx.match[1]));
  });
}
