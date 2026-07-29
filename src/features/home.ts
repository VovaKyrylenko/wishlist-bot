// 🏠 Головна — the hub, and the only thing the user has to be able to find.
//
// Everything a person has in the bot is reachable from here in at most two
// taps: their own lists, what they have promised to give, the lists friends
// shared with them, and the finished ones tucked away. The old product spread
// this across five reply-keyboard sections named after mechanics ("Мої
// бронювання", "Чужі списки"); this screen answers "що в мене тут є?" instead.

import { InlineKeyboard, type Bot } from "grammy";
import type { MyContext } from "../context.js";
import { prisma } from "../db.js";
import { currentUser } from "../lib/users.js";
import { clearPending } from "../lib/pending.js";
import { dropDraft } from "../lib/drafts.js";
import { holdingReservations } from "../lib/availability.js";
import { escapeHtml, formatDate, formatGuestName, formatRelativeDate } from "../lib/format.js";
import { daysUntil } from "../lib/dates.js";
import {
  ack,
  addIndexButtons,
  addPagerRow,
  block,
  blocks,
  paginate,
  renderScreen,
  sendAside,
  truncate,
} from "../lib/screen.js";
import { t } from "../text.js";

const LISTS_PER_PAGE = 8;
const FRIEND_LISTS_PER_PAGE = 8;

/** A quiet stretch after which the bot opens with news rather than a menu. */
const PAUSE_DAYS = 7;
/** How far ahead an event has to be to still be worth mentioning in a digest. */
const DIGEST_EVENT_HORIZON_DAYS = 14;

export interface ScreenOptions {
  /** The result of whatever the user just did, shown as the first line. */
  notice?: string;
  /**
   * Callback data for "↩️ Повернути". Undo lives in the screen that reports
   * the action, at the top of its keyboard, so it cannot scroll away — which
   * is the whole reason it can replace a confirmation dialog (§9.7).
   */
  undo?: string;
}

/** Prepends the undo button, when there is one, to a screen's keyboard. */
export function withUndo(kb: InlineKeyboard, options: ScreenOptions): InlineKeyboard {
  if (!options.undo) return kb;
  const merged = new InlineKeyboard().text(t.buttons.undoDelete, options.undo).row();
  for (const row of kb.inline_keyboard) merged.row(...row);
  return merged;
}

/**
 * Lists carrying their own emoji keep several lists visually distinct, which
 * is the whole problem "Організатор" has; the generic 🎁 is for the rest.
 */
export function listIcon(title: string, finished = false): string {
  if (finished) return "🏁";
  return /^\p{Extended_Pictographic}/u.test(title.trim()) ? "" : "🎁";
}

export function listHeading(title: string, finished = false): string {
  const icon = listIcon(title, finished);
  return icon ? `${icon} ${title}` : title;
}

/** Soonest event first, undated lists after them, newest of those first. */
function byEventThenNewest<T extends { eventDate: Date | null; createdAt: Date }>(a: T, b: T): number {
  if (a.eventDate && b.eventDate) return a.eventDate.getTime() - b.eventDate.getTime();
  if (a.eventDate) return -1;
  if (b.eventDate) return 1;
  return b.createdAt.getTime() - a.createdAt.getTime();
}

interface HomeData {
  active: {
    id: string;
    title: string;
    eventDate: Date | null;
    createdAt: Date;
    giftCount: number;
  }[];
  finishedCount: number;
  promiseCount: number;
  friendCount: number;
}

async function loadHome(userId: string): Promise<HomeData> {
  const [wishlists, promiseCount, visits, subscriptions] = await Promise.all([
    prisma.wishlist.findMany({
      where: { OR: [{ ownerId: userId }, { editors: { some: { userId } } }] },
      include: { _count: { select: { items: { where: { status: "ACTIVE" } } } } },
    }),
    prisma.reservation.count({ where: { guestId: userId, ...holdingReservations } }),
    prisma.wishlistVisit.findMany({ where: { userId }, select: { wishlistId: true } }),
    prisma.subscription.findMany({ where: { userId }, select: { wishlistId: true } }),
  ]);

  const mine = new Set(wishlists.map((w) => w.id));
  const friendIds = new Set<string>();
  for (const v of visits) if (!mine.has(v.wishlistId)) friendIds.add(v.wishlistId);
  for (const s of subscriptions) if (!mine.has(s.wishlistId)) friendIds.add(s.wishlistId);

  return {
    active: wishlists
      .filter((w) => w.status === "ACTIVE")
      .sort(byEventThenNewest)
      .map((w) => ({
        id: w.id,
        title: w.title,
        eventDate: w.eventDate,
        createdAt: w.createdAt,
        giftCount: w._count.items,
      })),
    finishedCount: wishlists.filter((w) => w.status === "ARCHIVED").length,
    promiseCount,
    friendCount: friendIds.size,
  };
}

/** S1 — one sentence of value, one button, nothing to learn. */
async function renderOnboarding(ctx: MyContext) {
  await renderScreen(ctx, {
    text: t.home.onboarding,
    keyboard: new InlineKeyboard().text(t.buttons.createList, "wl:new"),
  });
}

/** S2. The one screen every path leads back to. */
export async function renderHome(ctx: MyContext, page = 0, options: ScreenOptions = {}) {
  const user = await currentUser(ctx);
  const data = await loadHome(user.id);

  const brandNew =
    !options.notice && data.active.length === 0 && data.finishedCount === 0 && data.promiseCount === 0 && data.friendCount === 0;
  if (brandNew) {
    await renderOnboarding(ctx);
    return;
  }

  const paged = paginate(data.active, page, LISTS_PER_PAGE);
  const kb = new InlineKeyboard();

  let body: string;
  if (data.active.length === 0) {
    body = data.promiseCount > 0 || data.friendCount > 0 ? t.home.emptyGuestOnly : t.home.empty;
  } else {
    const rows = paged.slice.flatMap((wl, i) => {
      const meta = [
        wl.eventDate
          ? [formatDate(wl.eventDate), formatRelativeDate(wl.eventDate)].filter(Boolean).join(" · ")
          : null,
        t.plural.gifts(wl.giftCount),
      ].filter((v): v is string => v !== null);
      return [
        t.home.listRow(paged.offset + i + 1, listIcon(wl.title), escapeHtml(truncate(wl.title, 60))),
        t.home.listRowMeta(meta),
      ];
    });
    body = block(t.home.myListsHeader, "", ...rows);
    addIndexButtons(kb, paged, (wl) => `wl:open:${wl.id}:0`);
    addPagerRow(kb, paged, (p) => `home:${p}`);
  }

  // Only the sections that actually hold something get a line and a button —
  // an empty "Списки друзів" is a door into an empty room.
  const summary = block(
    data.promiseCount > 0 ? t.home.givingLine(data.promiseCount) : null,
    data.friendCount > 0 ? t.home.friendListsLine(data.friendCount) : null,
  );

  kb.row().text(data.active.length === 0 ? t.buttons.createList : t.buttons.newList, "wl:new");
  const secondary = kb.row();
  secondary.text(t.buttons.imGifting, "res:list:0");
  if (data.friendCount > 0) secondary.text(t.buttons.friendLists, "subs:list:0");
  if (data.finishedCount > 0) {
    kb.row().text(t.buttons.finishedLists(data.finishedCount), "home:done:0");
  }
  kb.row().text(t.buttons.aboutMe, "me");

  await renderScreen(ctx, {
    text: blocks(
      options.notice ?? null,
      t.home.header,
      body,
      summary,
      data.active.length > 0 ? t.home.tapListHint : null,
    ),
    keyboard: kb,
  });
}

/** Finished lists live behind one button, not in a parallel "archive" world. */
async function renderFinished(ctx: MyContext, page = 0, options: ScreenOptions = {}) {
  const user = await currentUser(ctx);
  const wishlists = await prisma.wishlist.findMany({
    where: {
      status: "ARCHIVED",
      OR: [{ ownerId: user.id }, { editors: { some: { userId: user.id } } }],
    },
    include: { _count: { select: { items: { where: { status: "ACTIVE" } } } } },
  });
  wishlists.sort(byEventThenNewest);

  const paged = paginate(wishlists, page, LISTS_PER_PAGE);
  const kb = new InlineKeyboard();
  addIndexButtons(kb, paged, (wl) => `wl:open:${wl.id}:0`);
  addPagerRow(kb, paged, (p) => `home:done:${p}`);
  kb.row().text(t.buttons.backHome, "home");

  const rows = paged.slice.flatMap((wl, i) => [
    t.home.listRow(paged.offset + i + 1, "🏁", escapeHtml(truncate(wl.title, 60))),
    t.home.listRowMeta(
      [
        wl.eventDate ? formatDate(wl.eventDate) : null,
        t.plural.gifts(wl._count.items),
      ].filter((v): v is string => v !== null),
    ),
  ]);

  await renderScreen(ctx, {
    text: blocks(
      options.notice ?? null,
      t.home.finishedHeader,
      wishlists.length === 0 ? t.home.finishedEmpty : block(...rows),
      wishlists.length === 0 ? null : block(t.home.finishedHint, t.home.tapListHint),
    ),
    keyboard: kb,
  });
}

/**
 * Every list this person has opened, not just the ones they follow. A guest
 * who tapped a share link, browsed and closed Telegram had no way back — the
 * link lived only in whatever chat it arrived in.
 */
async function renderFriendLists(ctx: MyContext, page = 0, options: ScreenOptions = {}) {
  const user = await currentUser(ctx);

  const [visits, subscriptions, mine] = await Promise.all([
    prisma.wishlistVisit.findMany({
      where: { userId: user.id },
      include: { wishlist: true },
      orderBy: { lastSeenAt: "desc" },
    }),
    prisma.subscription.findMany({ where: { userId: user.id }, include: { wishlist: true } }),
    prisma.wishlist.findMany({
      where: { OR: [{ ownerId: user.id }, { editors: { some: { userId: user.id } } }] },
      select: { id: true },
    }),
  ]);

  const ownIds = new Set(mine.map((w) => w.id));
  const watching = new Set(subscriptions.map((s) => s.wishlistId));

  // Subscriptions predate visit tracking, so a long-standing follower may have
  // no visit row at all — union rather than plain visits.
  const merged = new Map<string, { id: string; title: string; finished: boolean; sortKey: number }>();
  const remember = (id: string, title: string, finished: boolean, sortKey: number) => {
    if (ownIds.has(id)) return;
    const existing = merged.get(id);
    merged.set(id, { id, title, finished, sortKey: Math.max(sortKey, existing?.sortKey ?? 0) });
  };
  for (const s of subscriptions) {
    remember(s.wishlistId, s.wishlist.title, s.wishlist.status === "ARCHIVED", s.createdAt.getTime());
  }
  for (const v of visits) {
    remember(v.wishlistId, v.wishlist.title, v.wishlist.status === "ARCHIVED", v.lastSeenAt.getTime());
  }

  const all = [...merged.values()].sort((a, b) => b.sortKey - a.sortKey);

  if (all.length === 0) {
    await renderScreen(ctx, {
      text: blocks(options.notice ?? null, t.home.friendsEmpty),
      keyboard: new InlineKeyboard().text(t.buttons.backHome, "home"),
    });
    return;
  }

  const paged = paginate(all, page, FRIEND_LISTS_PER_PAGE);
  const kb = new InlineKeyboard();
  addIndexButtons(kb, paged, (l) => `g:open:${l.id}:a:0`);
  addPagerRow(kb, paged, (p) => `subs:list:${p}`);
  kb.row().text(t.buttons.backHome, "home");

  const rows = paged.slice.map((l, i) =>
    t.home.friendRow(
      paged.offset + i + 1,
      escapeHtml(truncate(l.title, 60)),
      [l.finished ? t.home.friendRowFinished : "", watching.has(l.id) ? t.home.friendRowWatching : ""].join(""),
    ),
  );

  await renderScreen(ctx, {
    text: blocks(
      options.notice ?? null,
      t.home.friendsHeader(all.length),
      block(...rows),
      block(t.home.friendsHint, t.common.tapNumber),
    ),
    keyboard: kb,
  });
}

// ── ⚙️ Про мене ─────────────────────────────────────────────────────────────

async function renderAboutMe(ctx: MyContext, options: ScreenOptions = {}) {
  const user = await currentUser(ctx);
  const [listCount, promiseCount] = await Promise.all([
    prisma.wishlist.count({ where: { ownerId: user.id } }),
    prisma.reservation.count({ where: { guestId: user.id, ...holdingReservations } }),
  ]);

  const kb = new InlineKeyboard().text(t.buttons.howItWorks, "me:help").row();
  if (user.contactPhone) kb.text(t.buttons.deletePhone, "me:phone").row();
  kb.text(t.buttons.deleteMyData, "me:wipe").row();
  kb.text(t.buttons.backHome, "home");

  await renderScreen(ctx, {
    text: blocks(
      options.notice ?? null,
      t.home.aboutMeHeader,
      block(
        t.home.aboutMeWho(escapeHtml(formatGuestName(user))),
        t.home.aboutMeStats(listCount, promiseCount),
      ),
      block(t.home.aboutMePrivacyHeader, t.home.aboutMePrivacy),
      user.contactPhone ? t.home.aboutMePhoneSaved : null,
    ),
    keyboard: kb,
  });
}

/**
 * Deleting everything on request. Owners of lists this person had promised
 * gifts on hear about it first — otherwise a gift silently becomes available
 * again with nobody knowing why.
 */
async function wipeMyData(ctx: MyContext) {
  const { notifyOwnerPromiseReleased } = await import("../lib/notify.js");
  const user = await currentUser(ctx);

  const held = await prisma.reservation.findMany({
    where: { guestId: user.id, ...holdingReservations },
    include: { item: { include: { wishlist: { include: { owner: true } } } } },
  });

  await prisma.user.delete({ where: { id: user.id } });

  for (const r of held) {
    if (!r.item.wishlist.notifyOwner) continue;
    await notifyOwnerPromiseReleased(ctx.api, {
      ownerTelegramId: r.item.wishlist.owner.telegramId,
      wishlistTitle: r.item.wishlist.title,
      giftTitle: r.item.title,
      privacyMode: r.item.wishlist.privacyMode,
    });
  }

  await ack(ctx);
  await ctx.reply(t.home.dataDeleted, { reply_markup: { remove_keyboard: true } });
}

// ── Повернення після паузи ─────────────────────────────────────────────────

/**
 * F6. After a quiet week the bot opens with what changed rather than with a
 * cold menu — which is the difference between "що тут взагалі є?" and "а, до
 * дня народження п'ять днів".
 */
export async function greetAfterPause(ctx: MyContext): Promise<void> {
  const user = await currentUser(ctx);
  const since = user.previousSeenAt;
  if (Date.now() - since.getTime() < PAUSE_DAYS * 86_400_000) return;

  const horizon = new Date(Date.now() + DIGEST_EVENT_HORIZON_DAYS * 86_400_000);
  const [ownLists, myPromises] = await Promise.all([
    prisma.wishlist.findMany({
      where: { status: "ACTIVE", OR: [{ ownerId: user.id }, { editors: { some: { userId: user.id } } }] },
      include: {
        items: { where: { status: "ACTIVE" }, include: { reservations: { where: holdingReservations } } },
      },
    }),
    prisma.reservation.findMany({
      where: { guestId: user.id, status: "ACTIVE" },
      include: { item: { include: { wishlist: true } } },
    }),
  ]);

  const lines: string[] = [];

  for (const wl of ownLists) {
    // The surprise contract: a count is only safe once there are enough gifts
    // that it cannot be read as "they took the one you were hoping for".
    const fresh = wl.items.filter((i) => i.reservations.some((r) => r.createdAt > since)).length;
    if (fresh > 0 && (wl.privacyMode !== "SURPRISE" || wl.items.length >= 4)) {
      lines.push(t.home.digestChosen(escapeHtml(truncate(wl.title, 40)), fresh));
    }
  }

  for (const wl of ownLists) {
    if (!wl.eventDate || wl.eventDate > horizon || daysUntil(wl.eventDate) < 0) continue;
    lines.push(t.home.digestEventSoon(escapeHtml(truncate(wl.title, 40)), daysUntil(wl.eventDate)));
  }

  const promisedLists = new Set<string>();
  for (const r of myPromises) {
    if (r.item.wishlist.status !== "ACTIVE") continue;
    if (promisedLists.has(r.item.wishlistId)) continue;
    promisedLists.add(r.item.wishlistId);
    lines.push(t.home.digestGuestPromise(escapeHtml(truncate(r.item.wishlist.title, 40))));
  }

  if (lines.length === 0) return;
  await sendAside(ctx, block(t.home.digestHeader, "", ...lines.slice(0, 4)));
}

/**
 * The anchor. Mid-action it is a safe exit: whatever was half-done is dropped,
 * and the screen says so instead of silently teleporting the user.
 */
export async function goHome(ctx: MyContext): Promise<void> {
  const user = await currentUser(ctx);
  const hadWork = Boolean(user.pendingAction);
  if (hadWork) await clearPending(ctx, user.id);
  await dropDraft(user.id);
  await renderHome(ctx, 0, hadWork ? { notice: t.common.stepDropped } : {});
}

export function registerHome(bot: Bot<MyContext>) {
  bot.callbackQuery("home", async (ctx) => {
    await renderHome(ctx);
  });

  bot.callbackQuery(/^home:(\d+)$/, async (ctx) => {
    await renderHome(ctx, Number(ctx.match[1]));
  });

  bot.callbackQuery(/^home:done:(\d+)$/, async (ctx) => {
    await renderFinished(ctx, Number(ctx.match[1]));
  });

  // Kept from the old callback namespace so buttons in messages sent before
  // the redesign keep working instead of answering "ця кнопка застаріла".
  bot.callbackQuery(/^subs:list:(\d+)$/, async (ctx) => {
    await renderFriendLists(ctx, Number(ctx.match[1]));
  });
  bot.callbackQuery(/^wl:list:(\d+)$/, async (ctx) => {
    await renderHome(ctx, Number(ctx.match[1]));
  });

  bot.callbackQuery(["me", "menu:settings"], async (ctx) => {
    await renderAboutMe(ctx);
  });

  bot.callbackQuery(["me:help", "menu:help"], async (ctx) => {
    await renderScreen(ctx, {
      text: t.home.help,
      keyboard: new InlineKeyboard().text(t.buttons.back, "me"),
    });
  });

  bot.callbackQuery("me:phone", async (ctx) => {
    const user = await currentUser(ctx);
    await prisma.user.update({ where: { id: user.id }, data: { contactPhone: null } });
    await renderAboutMe(ctx, { notice: t.home.phoneDeleted });
  });

  bot.callbackQuery(["me:wipe", "menu:wipe"], async (ctx) => {
    await renderScreen(ctx, {
      text: t.home.confirmDeleteMyData,
      keyboard: new InlineKeyboard()
        .text(t.buttons.confirmDeleteMyData, "me:wipego")
        .row()
        .text(t.buttons.no, "me"),
    });
  });

  bot.callbackQuery(["me:wipego", "menu:wipego"], async (ctx) => {
    await wipeMyData(ctx);
  });
}
