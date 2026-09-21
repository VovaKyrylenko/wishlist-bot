import type { VercelRequest, VercelResponse } from "@vercel/node";
import { InlineKeyboard } from "grammy";
import { getBot } from "../src/bot.js";
import { prisma } from "../src/db.js";
import { safeSend } from "../src/lib/notify.js";
import { buildListDeepLink } from "../src/lib/deeplink.js";
import { daysUntil, todayUtc } from "../src/lib/dates.js";
import { escapeHtml } from "../src/lib/format.js";
import { t } from "../src/text.js";

/** How far ahead of the event the reminder goes out. */
const REMINDER_LEAD_DAYS = 3;
/** Processed-update rows only need to outlive Telegram's retry window. */
const PROCESSED_UPDATE_TTL_MS = 24 * 60 * 60 * 1000;
/** Drafts and open questions expire after a day — see lib/drafts.ts. */
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

let initialized: Promise<void> | null = null;

/**
 * `eventDate` was collected, displayed, and then never used for anything —
 * no reminder, no nudge — even though a wishlist is a fundamentally
 * date-driven product. This is that missing half.
 */
async function sendEventReminders(api: Awaited<ReturnType<typeof getBot>>["api"], botUsername: string) {
  const horizon = new Date(todayUtc().getTime() + REMINDER_LEAD_DAYS * 86_400_000);

  const wishlists = await prisma.wishlist.findMany({
    where: {
      status: "ACTIVE",
      reminderSentAt: null,
      eventDate: { gte: todayUtc(), lte: horizon },
    },
    include: {
      owner: true,
      subscriptions: { include: { user: true } },
      visits: { include: { user: true } },
      _count: { select: { items: { where: { status: "ACTIVE" } } } },
    },
  });

  let sent = 0;
  for (const wishlist of wishlists) {
    if (!wishlist.eventDate) continue;
    // Nothing to remind anyone about on an empty list.
    if (wishlist._count.items === 0) continue;

    const days = daysUntil(wishlist.eventDate);
    const link = buildListDeepLink(botUsername, wishlist.slug);
    const keyboard = new InlineKeyboard().text(t.buttons.view, `g:open:${wishlist.id}:a:0`);

    // Subscribers and anyone who merely looked — both are people who might
    // still be meaning to pick something.
    const recipients = new Map<string, string>();
    for (const s of wishlist.subscriptions) recipients.set(s.user.id, s.user.telegramId);
    for (const v of wishlist.visits) recipients.set(v.user.id, v.user.telegramId);
    recipients.delete(wishlist.ownerId);

    for (const telegramId of recipients.values()) {
      await safeSend(api, telegramId, t.notify.eventReminderGuest(escapeHtml(wishlist.title), days, link), keyboard);
      sent++;
    }

    if (wishlist.notifyOwner) {
      await safeSend(api, wishlist.owner.telegramId, t.notify.eventReminderOwner(escapeHtml(wishlist.title), days));
      sent++;
    }

    await prisma.wishlist.update({ where: { id: wishlist.id }, data: { reminderSentAt: new Date() } });
  }

  return sent;
}

/**
 * One message per list per run, instead of one per gift at the moment it was
 * added. Filling a fresh list in a single sitting used to fire a separate
 * notification for every single gift at everyone subscribed.
 */
async function sendNewItemDigests(api: Awaited<ReturnType<typeof getBot>>["api"]) {
  const subscriptions = await prisma.subscription.findMany({
    include: { user: true, wishlist: true },
  });
  if (subscriptions.length === 0) return 0;

  const oldestWatermark = subscriptions.reduce(
    (min, s) => (s.lastNotifiedAt < min ? s.lastNotifiedAt : min),
    subscriptions[0].lastNotifiedAt,
  );

  // One query for every candidate item, then counted per subscriber in
  // memory — a count() per subscription would be a query per subscriber.
  const recentItems = await prisma.wishlistItem.findMany({
    where: {
      status: "ACTIVE",
      createdAt: { gt: oldestWatermark },
      wishlistId: { in: [...new Set(subscriptions.map((s) => s.wishlistId))] },
    },
    select: { wishlistId: true, createdAt: true },
  });

  const byWishlist = new Map<string, Date[]>();
  for (const item of recentItems) {
    const list = byWishlist.get(item.wishlistId) ?? [];
    list.push(item.createdAt);
    byWishlist.set(item.wishlistId, list);
  }

  const now = new Date();
  let sent = 0;

  for (const sub of subscriptions) {
    if (sub.wishlist.status !== "ACTIVE") continue;

    const added = (byWishlist.get(sub.wishlistId) ?? []).filter((at) => at > sub.lastNotifiedAt).length;
    if (added === 0) continue;

    const keyboard = new InlineKeyboard().text(t.buttons.view, `g:open:${sub.wishlistId}:a:0`);
    const result = await safeSend(
      api,
      sub.user.telegramId,
      t.notify.newGiftsDigest(escapeHtml(sub.wishlist.title), added),
      keyboard,
    );
    if (result === "delivered") sent++;

    // A transient failure (timeout, 429) keeps the watermark, so the next run
    // retries this digest instead of losing it forever. "unreachable" advances
    // it like a delivery — safeSend has already dropped that follower.
    if (result !== "failed") {
      await prisma.subscription
        .update({ where: { id: sub.id }, data: { lastNotifiedAt: now } })
        .catch(() => undefined);
    }
  }

  return sent;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Fail closed in production: a missing secret must not quietly turn this
  // into an open endpoint anyone can use to spam every subscriber we have.
  // Locally (no VERCEL_ENV) it stays open so the job can be poked by hand.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.VERCEL_ENV) {
      console.error("cron: CRON_SECRET is not set — refusing to run");
      res.status(500).json({ ok: false });
      return;
    }
  } else if (req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).send("Unauthorized");
    return;
  }

  const bot = getBot();
  if (!initialized) initialized = bot.init();
  await initialized;

  try {
    const reminders = await sendEventReminders(bot.api, bot.botInfo.username);
    const digests = await sendNewItemDigests(bot.api);
    const { count: purged } = await prisma.processedUpdate.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - PROCESSED_UPDATE_TTL_MS) } },
    });

    // A day-old draft is not a plan any more, and a day-old question is not a
    // question — expiry is enforced on read, this just stops the rows piling up.
    const staleBefore = new Date(Date.now() - DRAFT_TTL_MS);
    const { count: drafts } = await prisma.draft.deleteMany({
      where: { updatedAt: { lt: staleBefore } },
    });
    await prisma.user.updateMany({
      where: { pendingAt: { lt: staleBefore } },
      data: { pendingAction: null, pendingAt: null },
    });

    res.status(200).json({ ok: true, reminders, digests, purged, drafts });
  } catch (err) {
    console.error("cron: failed", err);
    res.status(500).json({ ok: false });
  }
}
