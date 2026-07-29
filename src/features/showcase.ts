// The guest's view of someone else's list, and the single most important
// interaction in the product: promising a gift.
//
// A guest arrives from a link, has never seen the bot, and owes it nothing.
// So: no registration, no phone number, no quantity picker, no summary screen,
// no confirmation. Tap the gift, tap "Я подарую це", done — with "↩️ Передумав"
// sitting right there in case it was a mistake. The old flow asked for a phone
// number at exactly this moment, which is the most expensive question in the
// whole funnel and bought nothing that a Telegram account does not already
// prove.

import { InlineKeyboard, type Bot } from "grammy";
import type { MyContext, TakenFilter } from "../context.js";
import { prisma } from "../db.js";
import { currentUser } from "../lib/users.js";
import { computeAvailability, holdingReservations } from "../lib/availability.js";
import {
  escapeHtml,
  formatDate,
  formatGuestName,
  formatOwnerName,
  formatRelativeDate,
  PRIORITY_ICON,
  PRIORITY_ORDER,
} from "../lib/format.js";
import { buildListDeepLink } from "../lib/deeplink.js";
import { notifyOwnerNewPromise } from "../lib/notify.js";
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
import { listIcon, renderHome, type ScreenOptions } from "./home.js";
import { t } from "../text.js";

const GIFTS_PER_PAGE = 8;
/** Above this many gifts a wall of taken ones gets in the way (§15.9). */
const AUTO_HIDE_TAKEN_AT = 15;

/** Single letters keep the callback data well under Telegram's 64-byte cap. */
const FILTER_CODE: Record<TakenFilter, string> = { all: "a", free: "v" };
// "r" was the old "Заброньовані" filter; the redesign dropped it, but links in
// old chats still carry it and must land somewhere sensible.
const FILTER_BY_CODE: Record<string, TakenFilter> = { a: "all", v: "free", r: "all" };

/**
 * Guests who followed a share link had no route back to it — the list existed
 * only in whatever chat the link arrived in, unless they happened to promise
 * something. Recording the visit puts it on their Головна.
 */
async function rememberVisit(wishlistId: string, ownerId: string, userId: string) {
  if (userId === ownerId) return; // Owners reach their lists from Головна already.
  await prisma.wishlistVisit
    .upsert({
      where: { wishlistId_userId: { wishlistId, userId } },
      create: { wishlistId, userId },
      update: { lastSeenAt: new Date() },
    })
    .catch(() => undefined);
}

export async function openShowcaseBySlug(ctx: MyContext, slug: string) {
  const wishlist = await prisma.wishlist.findUnique({ where: { slug } });
  if (!wishlist) {
    await renderHome(ctx, 0, { notice: t.common.linkDead });
    return;
  }
  // Always open showing everything. The filter used to live in the session, so
  // picking "Доступні" on one friend's list silently hid gifts on the next.
  await renderShowcase(ctx, wishlist.id, "all");
}

// ── S5 · Вітрина ───────────────────────────────────────────────────────────

export async function renderShowcase(
  ctx: MyContext,
  wishlistId: string,
  filter: TakenFilter,
  page = 0,
  options: ScreenOptions = {},
) {
  const wishlist = await prisma.wishlist.findUnique({
    where: { id: wishlistId },
    include: { owner: true },
  });
  if (!wishlist) {
    await renderHome(ctx, 0, { notice: t.common.linkDead });
    return;
  }

  const user = await currentUser(ctx);
  await rememberVisit(wishlistId, wishlist.ownerId, user.id);

  const [gifts, watching] = await Promise.all([
    prisma.wishlistItem.findMany({
      where: { wishlistId, status: "ACTIVE" },
      include: { reservations: { where: holdingReservations } },
    }),
    prisma.subscription.findUnique({
      where: { wishlistId_userId: { wishlistId, userId: user.id } },
    }),
  ]);

  const withAvailability = gifts.map((gift) => ({
    gift,
    availability: computeAvailability(gift.quantity, gift.reservations),
  }));

  // Free gifts lead — a guest is here to pick something they can actually
  // take — and inside that, the ones the owner wants most.
  withAvailability.sort((a, b) => {
    const takenDiff = Number(a.availability.isFull) - Number(b.availability.isFull);
    if (takenDiff !== 0) return takenDiff;
    return PRIORITY_ORDER[a.gift.priority] - PRIORITY_ORDER[b.gift.priority];
  });

  const takenCount = withAvailability.filter((g) => g.availability.isFull).length;
  const effectiveFilter: TakenFilter =
    filter === "all" && gifts.length > AUTO_HIDE_TAKEN_AT && takenCount > 0 ? "free" : filter;
  const visible =
    effectiveFilter === "free" ? withAvailability.filter((g) => !g.availability.isFull) : withAvailability;

  const owner = escapeHtml(formatOwnerName(wishlist.owner));
  const finished = wishlist.status === "ARCHIVED";
  const paged = paginate(visible, page, GIFTS_PER_PAGE);
  const code = FILTER_CODE[effectiveFilter];

  const header = block(
    t.showcase.header(listIcon(wishlist.title), escapeHtml(wishlist.title)),
    t.showcase.ownerLine(owner),
    wishlist.eventDate
      ? t.showcase.dateLine(formatDate(wishlist.eventDate), formatRelativeDate(wishlist.eventDate) ?? "")
      : null,
    wishlist.description ? escapeHtml(wishlist.description) : null,
  );

  const promise = finished
    ? t.showcase.finishedNotice
    : wishlist.privacyMode === "SURPRISE"
      ? t.showcase.surprisePromise(owner)
      : t.showcase.openPromise(owner);

  const body =
    gifts.length === 0
      ? t.showcase.empty(owner)
      : takenCount === gifts.length
        ? t.showcase.allTaken
        : block(
            ...paged.slice.flatMap(({ gift, availability }, i) => {
              const rows = [
                t.list.giftRow(
                  paged.offset + i + 1,
                  PRIORITY_ICON[gift.priority],
                  escapeHtml(truncate(gift.title, 60)),
                ),
              ];
              const meta = [
                gift.price ? escapeHtml(gift.price) : null,
                availability.isFull
                  ? t.labels.taken
                  : availability.reserved > 0
                    ? t.labels.partly(availability.available, availability.needed)
                    : null,
              ].filter((v): v is string => Boolean(v));
              if (meta.length > 0) rows.push(t.list.giftRowMeta(meta));
              return rows;
            }),
          );

  const kb = new InlineKeyboard();
  addIndexButtons(kb, paged, ({ gift }) => `g:item:${gift.id}:${code}:${paged.page}`);
  addPagerRow(kb, paged, (p) => `g:open:${wishlistId}:${code}:${p}`);

  if (takenCount > 0 && gifts.length > takenCount) {
    kb.row().text(
      effectiveFilter === "free" ? t.buttons.showAll : t.buttons.hideTaken,
      `g:open:${wishlistId}:${effectiveFilter === "free" ? "a" : "v"}:0`,
    );
  }
  kb.row()
    .text(watching ? t.buttons.unwatch : t.buttons.watch, `${watching ? "unsub" : "sub"}:${wishlistId}:${code}:${paged.page}`)
    .switchInline(
      t.buttons.share,
      t.list.shareMessage(wishlist.title, buildListDeepLink(ctx.me.username, wishlist.slug)),
    );
  kb.row().text(t.buttons.backHome, "home");

  await renderScreen(ctx, {
    keyboard: kb,
    text: blocks(
      options.notice ?? null,
      header,
      promise,
      body,
      block(
        gifts.length > 0 ? t.showcase.freeCount(gifts.length - takenCount, gifts.length) : null,
        effectiveFilter === "free" && takenCount > 0 ? t.showcase.hiddenTakenNote(takenCount) : null,
        watching ? t.showcase.watchingHint : null,
      ),
      paged.slice.length > 0 ? t.showcase.tapGiftHint : null,
    ),
  });
}

// ── S5a · Подарунок гостя ──────────────────────────────────────────────────

async function renderShowcaseGift(
  ctx: MyContext,
  giftId: string,
  filter: TakenFilter,
  page: number,
  options: ScreenOptions = {},
) {
  const user = await currentUser(ctx);
  const gift = await prisma.wishlistItem.findUnique({
    where: { id: giftId },
    include: {
      wishlist: { include: { owner: true } },
      reservations: { where: holdingReservations },
    },
  });
  if (!gift || gift.status !== "ACTIVE") {
    await renderHome(ctx, 0, { notice: t.common.giftGone });
    return;
  }

  const availability = computeAvailability(gift.quantity, gift.reservations);
  const mine = gift.reservations.find((r) => r.guestId === user.id);
  const finished = gift.wishlist.status === "ARCHIVED";
  const back = `g:open:${gift.wishlistId}:${FILTER_CODE[filter]}:${page}`;

  const kb = new InlineKeyboard();
  if (gift.url) kb.url(t.buttons.whereToBuy, gift.url).row();

  if (mine) {
    kb.text(t.buttons.imGifting, `res:open:${mine.id}`).row();
    if (!finished && availability.available > 0) {
      kb.text(t.buttons.promiseOneMore, `g:take:${gift.id}:${FILTER_CODE[filter]}:${page}`).row();
    }
  } else if (finished) {
    // No button at all rather than one that refuses (§9.10).
  } else if (availability.available > 0) {
    kb.text(
      gift.quantity > 1
        ? t.buttons.promiseSome(availability.available, availability.needed)
        : t.buttons.promise,
      `g:take:${gift.id}:${FILTER_CODE[filter]}:${page}`,
    ).row();
  } else {
    kb.text(t.buttons.watchIfFree, `sub:${gift.wishlistId}:${FILTER_CODE[filter]}:${page}`).row();
  }
  kb.text(t.buttons.back, back);

  const status = mine
    ? t.showcase.statusMine(t.labels.promiseStatus[mine.status])
    : availability.isFull
      ? block(t.showcase.statusTaken, t.showcase.takenHint)
      : availability.reserved > 0
        ? t.showcase.statusPartly(availability.available, availability.needed)
        : t.showcase.statusFree;

  await renderScreen(ctx, {
    photo: gift.imageUrl,
    keyboard: kb,
    text: blocks(
      options.notice ?? null,
      t.gift.path(escapeHtml(truncate(gift.wishlist.title, 40)), escapeHtml(gift.title)),
      block(
        [gift.price, gift.store].filter((v): v is string => v !== null).map(escapeHtml).join(" · ") || null,
        gift.comment ? t.gift.commentLine(escapeHtml(gift.comment)) : null,
      ),
      finished ? t.showcase.finishedNotice : null,
      status,
    ),
  });
}

// ── G3 · Обіцянка в один тап ───────────────────────────────────────────────

async function promiseGift(ctx: MyContext, giftId: string, filter: TakenFilter, page: number) {
  const user = await currentUser(ctx);
  const gift = await prisma.wishlistItem.findUnique({
    where: { id: giftId },
    include: { wishlist: { include: { owner: true } } },
  });
  if (!gift || gift.status !== "ACTIVE") {
    await renderHome(ctx, 0, { notice: t.common.giftGone });
    return;
  }
  if (gift.wishlist.ownerId === user.id) {
    await renderShowcase(ctx, gift.wishlistId, filter, page, { notice: t.showcase.promiseOwnList });
    return;
  }
  if (gift.wishlist.status === "ARCHIVED") {
    await renderShowcase(ctx, gift.wishlistId, filter, page, { notice: t.showcase.promiseListFinished });
    return;
  }

  // Name and @username only — the guest was never asked for anything else,
  // and this is shown to the owner only with the surprise switched off.
  const contactSnapshot = [formatGuestName(user), user.username ? `@${user.username}` : null]
    .filter(Boolean)
    .join(", ");

  // Serializable because the read-then-write on availability is exactly the
  // pattern read-committed lets two concurrent guests both win, overbooking
  // the gift this bot exists to keep unique.
  const result = await prisma.$transaction(
    async (tx) => {
      const fresh = await tx.wishlistItem.findUnique({
        where: { id: giftId },
        include: { reservations: { where: holdingReservations }, wishlist: true },
      });
      if (!fresh || fresh.status !== "ACTIVE" || fresh.wishlist.status === "ARCHIVED") {
        return { ok: false as const };
      }
      if (computeAvailability(fresh.quantity, fresh.reservations).available < 1) {
        return { ok: false as const };
      }

      // Promising the same gift twice produced two rows and two confusing
      // entries in "Я дарую"; topping up the existing one is what was meant.
      const existing = await tx.reservation.findFirst({
        where: { itemId: giftId, guestId: user.id, ...holdingReservations },
      });
      if (existing) {
        const merged = await tx.reservation.update({
          where: { id: existing.id },
          data: { quantity: existing.quantity + 1, contactSnapshot },
        });
        return { ok: true as const, reservation: merged, merged: true as const };
      }
      const created = await tx.reservation.create({
        data: { itemId: giftId, guestId: user.id, quantity: 1, contactSnapshot },
      });
      return { ok: true as const, reservation: created, merged: false as const };
    },
    { isolationLevel: "Serializable" },
  );

  if (!result.ok) {
    // G7 — honest about what happened, and straight back to what is still free.
    await renderShowcase(ctx, gift.wishlistId, filter, page, { notice: t.showcase.promiseRaceLost });
    return;
  }

  const owner = escapeHtml(formatOwnerName(gift.wishlist.owner));
  const title = escapeHtml(truncate(gift.title, 60));
  const surprise = gift.wishlist.privacyMode === "SURPRISE";

  await renderScreen(ctx, {
    text: result.merged
      ? t.showcase.promisedMore(title, result.reservation.quantity)
      : surprise
        ? t.showcase.promised(title, owner)
        : t.showcase.promisedOpen(title, owner),
    keyboard: new InlineKeyboard()
      .text(t.buttons.undoPromise, `g:undo:${result.reservation.id}:${FILTER_CODE[filter]}:${page}`)
      .row()
      .text(t.buttons.toList, `g:open:${gift.wishlistId}:${FILTER_CODE[filter]}:${page}`),
  });

  if (!gift.wishlist.notifyOwner) return;
  await notifyOwnerNewPromise(ctx.api, {
    ownerTelegramId: gift.wishlist.owner.telegramId,
    wishlistTitle: gift.wishlist.title,
    giftTitle: gift.title,
    privacyMode: gift.wishlist.privacyMode,
    quantity: result.reservation.quantity,
    guestName: contactSnapshot,
  });
}

export function registerShowcase(bot: Bot<MyContext>) {
  bot.callbackQuery(/^g:open:([^:]+):([avr]):(\d+)$/, async (ctx) => {
    await renderShowcase(ctx, ctx.match[1], FILTER_BY_CODE[ctx.match[2]], Number(ctx.match[3]));
  });

  bot.callbackQuery(/^g:item:([^:]+):([avr]):(\d+)$/, async (ctx) => {
    await renderShowcaseGift(ctx, ctx.match[1], FILTER_BY_CODE[ctx.match[2]], Number(ctx.match[3]));
  });

  bot.callbackQuery(/^g:take:([^:]+):([avr]):(\d+)$/, async (ctx) => {
    await promiseGift(ctx, ctx.match[1], FILTER_BY_CODE[ctx.match[2]], Number(ctx.match[3]));
  });

  // Old links opened the reservation dialog; they now do the thing directly.
  bot.callbackQuery(/^g:res:([^:]+)$/, async (ctx) => {
    await promiseGift(ctx, ctx.match[1], "all", 0);
  });

  bot.callbackQuery(/^g:undo:([^:]+):([avr]):(\d+)$/, async (ctx) => {
    const user = await currentUser(ctx);
    const reservation = await prisma.reservation.findUnique({
      where: { id: ctx.match[1] },
      include: { item: true },
    });
    if (!reservation || reservation.guestId !== user.id) {
      await renderHome(ctx, 0);
      return;
    }
    await prisma.reservation.update({ where: { id: reservation.id }, data: { status: "CANCELLED" } });
    await renderShowcase(ctx, reservation.item.wishlistId, FILTER_BY_CODE[ctx.match[2]], Number(ctx.match[3]), {
      notice: t.showcase.promiseUndone(escapeHtml(truncate(reservation.item.title, 60))),
    });
  });

  // Following a list is instantly reversible, so a toast is the right weight.
  bot.callbackQuery(/^sub:([^:]+):([avr]):(\d+)$/, async (ctx) => {
    const user = await currentUser(ctx);
    const wishlistId = ctx.match[1];
    const wishlist = await prisma.wishlist.findUnique({ where: { id: wishlistId } });
    if (!wishlist) {
      await renderHome(ctx, 0, { notice: t.common.listGone });
      return;
    }
    await prisma.subscription.upsert({
      where: { wishlistId_userId: { wishlistId, userId: user.id } },
      create: { wishlistId, userId: user.id },
      update: {},
    });
    await ack(ctx, t.showcase.watchOn);
    await renderShowcase(ctx, wishlistId, FILTER_BY_CODE[ctx.match[2]], Number(ctx.match[3]));
  });

  bot.callbackQuery(/^unsub:([^:]+):([avr]):(\d+)$/, async (ctx) => {
    const user = await currentUser(ctx);
    await prisma.subscription.deleteMany({ where: { wishlistId: ctx.match[1], userId: user.id } });
    await ack(ctx, t.showcase.watchOff);
    await renderShowcase(ctx, ctx.match[1], FILTER_BY_CODE[ctx.match[2]], Number(ctx.match[3]));
  });
}
