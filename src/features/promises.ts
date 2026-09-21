// 🎗 Я дарую — everything this person has promised, grouped by whose list it
// is on.
//
// The scenario this screen exists for is a person standing in a shop trying to
// remember what they agreed to buy. The old "Мої бронювання" was a flat list
// named after a hotel booking; grouping by list and saying "обіцяно / куплено"
// answers the actual question in one glance.

import { InlineKeyboard, type Bot } from "grammy";
import type { MyContext } from "../context.js";
import { prisma } from "../db.js";
import { currentUser } from "../lib/users.js";
import { computeAvailability, holdingReservations, HOLDING_STATUSES } from "../lib/availability.js";
import { escapeHtml, formatDate, formatGuestName, isHttpUrl } from "../lib/format.js";
import {
  notifyOwnerBoughtUndone,
  notifyOwnerGiftBought,
  notifyOwnerPromiseReleased,
  notifyWatchersGiftFreeAgain,
} from "../lib/notify.js";
import {
  ack,
  addIndexButtons,
  addPagerRow,
  block,
  blocks,
  paginate,
  renderScreen,
  truncate,
} from "../lib/screen.js";
import { type ScreenOptions } from "./home.js";
import { t } from "../text.js";

const PROMISES_PER_PAGE = 8;

// ── S8 · Я дарую ───────────────────────────────────────────────────────────

export async function renderPromises(ctx: MyContext, page = 0, options: ScreenOptions = {}) {
  const user = await currentUser(ctx);

  const promises = await prisma.reservation.findMany({
    where: { guestId: user.id, status: { in: HOLDING_STATUSES } },
    include: { item: { include: { wishlist: { include: { owner: true } } } } },
  });

  if (promises.length === 0) {
    await renderScreen(ctx, {
      text: blocks(options.notice ?? null, t.promise.empty),
      keyboard: new InlineKeyboard()
        .text(t.buttons.friendLists, "subs:list:0")
        .row()
        .text(t.buttons.backHome, "home"),
    });
    return;
  }

  // Grouped by list, soonest event first: the thing a person needs to buy next
  // should be the thing at the top.
  promises.sort((a, b) => {
    const dateA = a.item.wishlist.eventDate?.getTime() ?? Number.POSITIVE_INFINITY;
    const dateB = b.item.wishlist.eventDate?.getTime() ?? Number.POSITIVE_INFINITY;
    if (dateA !== dateB) return dateA - dateB;
    if (a.item.wishlistId !== b.item.wishlistId) {
      return a.item.wishlistId < b.item.wishlistId ? -1 : 1;
    }
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const paged = paginate(promises, page, PROMISES_PER_PAGE);

  const rows: string[] = [];
  let currentList: string | null = null;
  paged.slice.forEach((promise, i) => {
    if (promise.item.wishlistId !== currentList) {
      currentList = promise.item.wishlistId;
      if (rows.length > 0) rows.push("");
      rows.push(
        t.promise.groupHeader(
          escapeHtml(truncate(promise.item.wishlist.title, 40)),
          promise.item.wishlist.eventDate ? formatDate(promise.item.wishlist.eventDate) : null,
        ),
      );
    }
    rows.push(
      t.promise.row(
        paged.offset + i + 1,
        escapeHtml(truncate(promise.item.title, 50)),
        t.labels.promiseStatus[promise.status],
      ),
    );
  });

  const kb = new InlineKeyboard();
  addIndexButtons(kb, paged, (p) => `res:open:${p.id}`);
  addPagerRow(kb, paged, (p) => `res:list:${p}`);
  kb.row().text(t.buttons.backHome, "home");

  await renderScreen(ctx, {
    keyboard: kb,
    text: blocks(
      options.notice ?? null,
      t.promise.header(promises.length),
      block(...rows),
      t.promise.tapHint,
    ),
  });
}

/** Loads a promise and confirms it belongs to the sender. */
async function loadOwnPromise(ctx: MyContext, reservationId: string) {
  const user = await currentUser(ctx);
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { item: { include: { wishlist: { include: { owner: true } } } } },
  });
  if (!reservation || reservation.guestId !== user.id) {
    await renderPromises(ctx, 0);
    return null;
  }
  return reservation;
}

// ── S8a · Моя обіцянка ─────────────────────────────────────────────────────

async function renderPromise(ctx: MyContext, reservationId: string, options: ScreenOptions = {}) {
  const promise = await loadOwnPromise(ctx, reservationId);
  if (!promise) return;

  const { item } = promise;
  const bought = promise.status === "PURCHASED";
  const giftGone = item.status !== "ACTIVE";

  const kb = new InlineKeyboard();
  if (item.url && isHttpUrl(item.url)) kb.url(t.buttons.whereToBuy, item.url).row();
  if (!giftGone) {
    kb.text(bought ? t.buttons.undoBought : t.buttons.markBought, `res:${bought ? "unbought" : "bought"}:${promise.id}`).row();
    kb.text(t.buttons.release, `res:free:${promise.id}`).row();
  }
  kb.text(t.buttons.back, "res:list:0");

  await renderScreen(ctx, {
    photo: item.imageUrl,
    keyboard: kb,
    text: blocks(
      options.notice ?? null,
      t.gift.path(escapeHtml(truncate(item.wishlist.title, 40)), escapeHtml(item.title)),
      block(
        [item.price, item.store].filter((v): v is string => v !== null).map(escapeHtml).join(" · ") || null,
        item.comment ? t.gift.commentLine(escapeHtml(item.comment)) : null,
      ),
      block(
        t.promise.statusLine(t.labels.promiseStatus[promise.status]),
        promise.quantity > 1 ? t.promise.quantityLine(promise.quantity) : null,
      ),
      giftGone ? t.promise.giftGoneNote : null,
    ),
  });
}

/**
 * Letting a gift go frees a unit, so anyone watching the list is told — that
 * moment is exactly what they signed up to catch.
 */
async function releasePromise(ctx: MyContext, reservationId: string) {
  const promise = await loadOwnPromise(ctx, reservationId);
  if (!promise) return;
  await ack(ctx);

  const item = await prisma.wishlistItem.findUnique({
    where: { id: promise.itemId },
    include: { wishlist: { include: { owner: true } }, reservations: { where: holdingReservations } },
  });

  await prisma.reservation.update({ where: { id: promise.id }, data: { status: "CANCELLED" } });

  if (item) {
    const wasFull = computeAvailability(item.quantity, item.reservations).available === 0;
    if (item.wishlist.notifyOwner) {
      await notifyOwnerPromiseReleased(ctx.api, {
        ownerTelegramId: item.wishlist.owner.telegramId,
        wishlistTitle: item.wishlist.title,
        giftTitle: item.title,
        privacyMode: item.wishlist.privacyMode,
      });
    }
    if (wasFull && item.status === "ACTIVE" && item.wishlist.status === "ACTIVE") {
      await notifyWatchersGiftFreeAgain(ctx.api, item.wishlistId, item.wishlist.title, item.title);
    }
  }

  await renderPromises(ctx, 0, {
    notice: t.promise.released(escapeHtml(truncate(promise.item.title, 60))),
  });
}

export function registerPromises(bot: Bot<MyContext>) {
  bot.callbackQuery(/^res:list:(\d+)$/, async (ctx) => {
    await renderPromises(ctx, Number(ctx.match[1]));
  });

  bot.callbackQuery(/^res:open:([^:]+)$/, async (ctx) => {
    await renderPromise(ctx, ctx.match[1]);
  });

  // Marking a gift bought is a promise to yourself, not to anyone else, so it
  // happens instantly and says how to take it back.
  bot.callbackQuery(/^res:bought:([^:]+)$/, async (ctx) => {
    const promise = await loadOwnPromise(ctx, ctx.match[1]);
    if (!promise) return;
    if (promise.status !== "ACTIVE") {
      await renderPromise(ctx, promise.id);
      return;
    }

    await prisma.reservation.update({ where: { id: promise.id }, data: { status: "PURCHASED" } });

    if (promise.item.wishlist.notifyOwner) {
      const user = await currentUser(ctx);
      await notifyOwnerGiftBought(ctx.api, {
        ownerTelegramId: promise.item.wishlist.owner.telegramId,
        wishlistTitle: promise.item.wishlist.title,
        giftTitle: promise.item.title,
        privacyMode: promise.item.wishlist.privacyMode,
        guestName: formatGuestName(user),
      });
    }

    await renderPromise(ctx, promise.id, {
      notice: t.promise.marked(escapeHtml(truncate(promise.item.title, 60))),
    });
  });

  // Undoing it, on the other hand, changes what the owner was already told, so
  // it asks — and says plainly what the gift goes back to being.
  bot.callbackQuery(/^res:unbought:([^:]+)$/, async (ctx) => {
    const promise = await loadOwnPromise(ctx, ctx.match[1]);
    if (!promise) return;
    await renderScreen(ctx, {
      text: t.promise.confirmUnbought(escapeHtml(truncate(promise.item.title, 60))),
      keyboard: new InlineKeyboard()
        .text(t.buttons.confirmUndoBought, `res:unboughtgo:${promise.id}`)
        .row()
        .text(t.buttons.no, `res:open:${promise.id}`),
    });
  });

  bot.callbackQuery(/^res:unboughtgo:([^:]+)$/, async (ctx) => {
    const promise = await loadOwnPromise(ctx, ctx.match[1]);
    if (!promise) return;
    if (promise.status === "PURCHASED") {
      await prisma.reservation.update({ where: { id: promise.id }, data: { status: "ACTIVE" } });

      // The confirmation warned that the owner had already been told «куплено»
      // — so the owner is told it is undone, or their picture stays wrong.
      if (promise.item.wishlist.notifyOwner && promise.item.status === "ACTIVE") {
        const user = await currentUser(ctx);
        await notifyOwnerBoughtUndone(ctx.api, {
          ownerTelegramId: promise.item.wishlist.owner.telegramId,
          wishlistTitle: promise.item.wishlist.title,
          giftTitle: promise.item.title,
          privacyMode: promise.item.wishlist.privacyMode,
          guestName: formatGuestName(user),
        });
      }
    }
    await renderPromise(ctx, promise.id, {
      notice: t.promise.unbought(escapeHtml(truncate(promise.item.title, 60))),
    });
  });

  // Releasing affects other people — someone else can now take it — so this is
  // the branch that confirms, and confirms harder if it was already bought.
  bot.callbackQuery(/^res:free:([^:]+)$/, async (ctx) => {
    const promise = await loadOwnPromise(ctx, ctx.match[1]);
    if (!promise) return;
    const title = escapeHtml(truncate(promise.item.title, 60));
    await renderScreen(ctx, {
      text:
        promise.status === "PURCHASED"
          ? t.promise.confirmReleaseBought(title)
          : t.promise.confirmRelease(title),
      keyboard: new InlineKeyboard()
        .text(t.buttons.confirmRelease, `res:freego:${promise.id}`)
        .row()
        .text(t.buttons.no, `res:open:${promise.id}`),
    });
  });

  bot.callbackQuery(/^res:freego:([^:]+)$/, async (ctx) => {
    await releasePromise(ctx, ctx.match[1]);
  });

  // The old quantity dialog is gone: "+1 ще" on the gift itself does the job
  // without a numeric prompt. Old buttons land on the promise instead.
  bot.callbackQuery(/^res:(qty|cancel|cancelgo|boughtgo):([^:]+)$/, async (ctx) => {
    await renderPromise(ctx, ctx.match[2]);
  });
}
