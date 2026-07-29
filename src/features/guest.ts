import { InlineKeyboard, type Bot } from "grammy";
import type { GuestFilter, MyContext } from "../context.js";
import { prisma } from "../db.js";
import { upsertUserFromCtx } from "../lib/users.js";
import { computeAvailability, holdingReservations } from "../lib/availability.js";
import { escapeHtml, formatDate, PRIORITY_ICON, PRIORITY_ORDER } from "../lib/format.js";
import { buildListDeepLink } from "../lib/deeplink.js";
import { ack, addIndexButtons, addPagerRow, paginate, renderScreen } from "../lib/ui.js";
import { renderItemRows } from "./items.js";
import { t } from "../text.js";

const ITEMS_PER_PAGE = 8;

/** Single letters keep the callback data well under Telegram's 64-byte cap. */
const FILTER_CODE: Record<GuestFilter, string> = { all: "a", available: "v", reserved: "r" };
const FILTER_BY_CODE: Record<string, GuestFilter> = { a: "all", v: "available", r: "reserved" };

function availabilityRank(isFull: boolean, isPartial: boolean): number {
  if (isFull) return 2;
  if (isPartial) return 1;
  return 0;
}

/**
 * Guests who followed a share link had no route back to it — the list existed
 * only in whatever chat the link arrived in, unless they happened to reserve
 * or subscribe. Recording the visit surfaces it under "👀 Чужі списки".
 */
async function rememberVisit(ctx: MyContext, wishlistId: string, ownerId: string, userId: string) {
  if (userId === ownerId) return; // Owners already reach their lists from the menu.
  await prisma.wishlistVisit.upsert({
    where: { wishlistId_userId: { wishlistId, userId } },
    create: { wishlistId, userId },
    update: { lastSeenAt: new Date() },
  });
}

export async function openWishlistForGuest(ctx: MyContext, slug: string) {
  const wishlist = await prisma.wishlist.findUnique({ where: { slug } });
  if (!wishlist) {
    await ctx.reply(t.guest.listNotFound);
    return;
  }
  // Always open on the full list. The filter used to live in the session, so
  // picking "Доступні" on one friend's list silently hid gifts on the next
  // one a guest opened, with nothing on screen explaining why.
  await renderGuestList(ctx, wishlist.id, "all");
}

/**
 * The whole guest view — header, gifts, filters, subscribe and share — is one
 * message. Following a share link used to cost two messages before the guest
 * saw a single gift, plus one message per gift after that.
 */
export async function renderGuestList(
  ctx: MyContext,
  wishlistId: string,
  filter: GuestFilter,
  page = 0,
) {
  const wishlist = await prisma.wishlist.findUnique({ where: { id: wishlistId } });
  if (!wishlist) {
    await ack(ctx, t.common.notFoundAlert);
    return;
  }

  const user = await upsertUserFromCtx(ctx);
  await rememberVisit(ctx, wishlistId, wishlist.ownerId, user.id);

  const subscription = await prisma.subscription.findUnique({
    where: { wishlistId_userId: { wishlistId, userId: user.id } },
  });

  const items = await prisma.wishlistItem.findMany({
    where: { wishlistId, status: "ACTIVE" },
    include: { reservations: { where: holdingReservations } },
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

  // Most-wanted first, and within a priority the still-available gifts lead —
  // a guest is here to pick something they can actually take.
  filtered.sort((a, b) => {
    const p = PRIORITY_ORDER[a.item.priority] - PRIORITY_ORDER[b.item.priority];
    if (p !== 0) return p;
    return (
      availabilityRank(a.availability.isFull, a.availability.isPartial) -
      availabilityRank(b.availability.isFull, b.availability.isPartial)
    );
  });

  const paged = paginate(
    filtered.map((f) => f.item),
    page,
    ITEMS_PER_PAGE,
  );

  const header = [
    `🎁 <b>${escapeHtml(wishlist.title)}</b>`,
    wishlist.description ? escapeHtml(wishlist.description) : null,
    wishlist.eventDate ? `📅 ${formatDate(wishlist.eventDate)}` : null,
    wishlist.status === "ARCHIVED" ? t.guest.archivedNotice : null,
    "",
    t.wishlist.itemCount(filtered.length),
    subscription ? t.guest.subscribedHint : null,
  ].filter((l) => l !== null);

  const body =
    paged.slice.length === 0
      ? ["", items.length === 0 ? t.guest.empty : t.guest.emptyForFilter]
      : ["", ...renderItemRows(paged.slice, paged.offset), "", t.guest.tapNumberHint];

  const code = FILTER_CODE[filter];
  const kb = new InlineKeyboard();
  addIndexButtons(kb, paged, (item) => `g:item:${item.id}:${code}:${paged.page}`);
  addPagerRow(kb, paged, (p) => `g:open:${wishlistId}:${code}:${p}`);

  const mark = (value: GuestFilter, label: string) => (filter === value ? `• ${label}` : label);
  kb.row()
    .text(mark("all", t.buttons.filterAll), `g:open:${wishlistId}:a:0`)
    .text(mark("available", t.buttons.filterAvailable), `g:open:${wishlistId}:v:0`)
    .text(mark("reserved", t.buttons.filterReserved), `g:open:${wishlistId}:r:0`);

  // `ctx.me` is filled in by bot.init(); getMe() here cost an extra Telegram
  // round trip on every single screen render.
  const shareText = t.wishlist.shareMessage(wishlist.title, buildListDeepLink(ctx.me.username, wishlist.slug));
  kb.row()
    .text(
      subscription ? t.buttons.unsubscribe : t.buttons.subscribe,
      `${subscription ? "unsub" : "sub"}:${wishlistId}:${code}:${paged.page}`,
    )
    .switchInline(t.buttons.share, shareText);

  await renderScreen(ctx, { text: [...header, ...body].join("\n"), keyboard: kb });
}

async function renderGuestItem(ctx: MyContext, itemId: string, filter: GuestFilter, page: number) {
  const item = await prisma.wishlistItem.findUnique({
    where: { id: itemId },
    include: { wishlist: true, reservations: { where: holdingReservations } },
  });
  if (!item || item.status !== "ACTIVE") {
    await ack(ctx, t.item.notFoundAlert);
    return;
  }

  const a = computeAvailability(item.quantity, item.reservations);
  const lines = [
    `${PRIORITY_ICON[item.priority]} <b>${escapeHtml(item.title)}</b>`,
    "",
    [item.price, item.store].filter((v): v is string => v !== null).map(escapeHtml).join(" · ") || null,
    item.comment ? `💬 ${escapeHtml(item.comment)}` : null,
    "",
    a.isFull
      ? t.item.fullyReserved
      : a.reserved > 0
        ? t.item.availabilityDetail(item.quantity, a.reserved, a.available)
        : t.item.availableStatus(item.quantity),
  ].filter((l) => l !== null);

  const kb = new InlineKeyboard();
  if (item.url) kb.url(t.buttons.openLink, item.url).row();
  if (item.wishlist.status === "ACTIVE" && !a.isFull) {
    kb.text(t.buttons.reserve, `g:res:${item.id}`).row();
  }
  kb.text(t.buttons.back, `g:open:${item.wishlistId}:${FILTER_CODE[filter]}:${page}`);

  await renderScreen(ctx, { text: lines.join("\n"), keyboard: kb, photo: item.imageUrl });
}

export function registerGuest(bot: Bot<MyContext>) {
  bot.callbackQuery(/^g:open:([^:]+):([avr]):(\d+)$/, async (ctx) => {
    await renderGuestList(ctx, ctx.match[1], FILTER_BY_CODE[ctx.match[2]], Number(ctx.match[3]));
  });

  bot.callbackQuery(/^g:item:([^:]+):([avr]):(\d+)$/, async (ctx) => {
    await renderGuestItem(ctx, ctx.match[1], FILTER_BY_CODE[ctx.match[2]], Number(ctx.match[3]));
  });

  bot.callbackQuery(/^g:res:([^:]+)$/, async (ctx) => {
    await ack(ctx);
    await ctx.conversation.enter("reserve", ctx.match[1]);
  });

  // Subscribing lives here rather than in features/subscriptions.ts because
  // both toggles re-render the guest list they were tapped from. Filter and
  // page ride along in the callback data so the guest lands back where they
  // were instead of at the top of an unfiltered list.
  bot.callbackQuery(/^sub:([^:]+):([avr]):(\d+)$/, async (ctx) => {
    const user = await upsertUserFromCtx(ctx);
    const wishlistId = ctx.match[1];
    const wishlist = await prisma.wishlist.findUnique({ where: { id: wishlistId } });
    if (!wishlist) {
      await ack(ctx, t.common.notFoundAlert);
      return;
    }
    await prisma.subscription.upsert({
      where: { wishlistId_userId: { wishlistId, userId: user.id } },
      create: { wishlistId, userId: user.id },
      update: {},
    });
    await ack(ctx, t.subscription.subscribedToast);
    await renderGuestList(ctx, wishlistId, FILTER_BY_CODE[ctx.match[2]], Number(ctx.match[3]));
  });

  bot.callbackQuery(/^unsub:([^:]+):([avr]):(\d+)$/, async (ctx) => {
    const user = await upsertUserFromCtx(ctx);
    const wishlistId = ctx.match[1];
    await prisma.subscription.deleteMany({ where: { wishlistId, userId: user.id } });
    await ack(ctx, t.subscription.unsubscribedToast);
    await renderGuestList(ctx, wishlistId, FILTER_BY_CODE[ctx.match[2]], Number(ctx.match[3]));
  });
}
