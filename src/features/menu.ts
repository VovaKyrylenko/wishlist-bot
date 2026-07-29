import { InlineKeyboard, type Bot } from "grammy";
import type { MyContext } from "../context.js";
import { prisma } from "../db.js";
import { upsertUserFromCtx } from "../lib/users.js";
import { parseStartPayload } from "../lib/deeplink.js";
import { HOLDING_STATUSES, holdingReservations } from "../lib/availability.js";
import { formatGuestName } from "../lib/format.js";
import { notifyOwnerEditorJoined, notifyOwnerReservationCancelled } from "../lib/notify.js";
import {
  mainMenuKeyboard,
  MENU_CREATE,
  MENU_LISTS,
  MENU_RESERVATIONS,
  MENU_SUBSCRIPTIONS,
  MENU_SETTINGS,
} from "../lib/keyboards.js";
import { openWishlistForGuest } from "./guest.js";
import { showMyWishlists } from "./wishlists.js";
import { renderWishlistManagement } from "./items.js";
import { showMyReservations } from "./reservations.js";
import { showMySubscriptions } from "./subscriptions.js";
import { ack, renderScreen } from "../lib/ui.js";
import { t } from "../text.js";

async function showSettings(ctx: MyContext) {
  const user = await upsertUserFromCtx(ctx);
  const [lists, reservations] = await Promise.all([
    prisma.wishlist.count({ where: { ownerId: user.id } }),
    prisma.reservation.count({ where: { guestId: user.id, status: { in: HOLDING_STATUSES } } }),
  ]);

  await renderScreen(ctx, {
    text: [
      t.menu.settingsHeader,
      "",
      t.menu.settingsTelegramId(user.telegramId),
      user.username ? t.menu.settingsUsername(user.username) : null,
      t.menu.settingsStats(lists, reservations),
      t.menu.settingsDataNote(Boolean(user.contactPhone)),
      "",
      t.menu.settingsHint,
    ]
      .filter((line) => line !== null)
      .join("\n"),
    // The screen used to render with no buttons at all, which left the user
    // staring at a dead end.
    keyboard: new InlineKeyboard()
      .text(t.buttons.howItWorks, "menu:help")
      .row()
      .text(t.buttons.deleteMyData, "menu:wipe"),
  });
}

/**
 * Accepting an editor invite. The invite is single-use: the token is cleared
 * the moment it is redeemed, so a forwarded link cannot keep letting people in.
 */
async function acceptEditorInvite(ctx: MyContext, token: string) {
  const user = await upsertUserFromCtx(ctx);
  const wishlist = await prisma.wishlist.findUnique({
    where: { editorInviteToken: token },
    include: { owner: true },
  });

  if (!wishlist) {
    await ctx.reply(t.menu.editorInviteInvalid);
    return;
  }
  if (wishlist.ownerId === user.id) {
    await ctx.reply(t.menu.editorInviteOwn);
    return;
  }

  await prisma.$transaction([
    prisma.wishlistEditor.upsert({
      where: { wishlistId_userId: { wishlistId: wishlist.id, userId: user.id } },
      create: { wishlistId: wishlist.id, userId: user.id },
      update: {},
    }),
    prisma.wishlist.update({ where: { id: wishlist.id }, data: { editorInviteToken: null } }),
  ]);

  await ctx.reply(t.menu.editorInviteAccepted(wishlist.title), { reply_markup: mainMenuKeyboard() });
  await notifyOwnerEditorJoined(ctx.api, {
    ownerTelegramId: wishlist.owner.telegramId,
    wishlistTitle: wishlist.title,
    editorName: formatGuestName(user),
  });
  await renderWishlistManagement(ctx, wishlist.id);
}

/**
 * Deleting everything on request. Owners of lists this person had booked
 * gifts on are told first — otherwise a gift would silently become available
 * again with nobody knowing why.
 */
async function wipeMyData(ctx: MyContext) {
  const user = await upsertUserFromCtx(ctx);

  const held = await prisma.reservation.findMany({
    where: { guestId: user.id, ...holdingReservations },
    include: { item: { include: { wishlist: { include: { owner: true } } } } },
  });

  await prisma.user.delete({ where: { id: user.id } });

  for (const r of held) {
    if (!r.item.wishlist.notifyOwner) continue;
    await notifyOwnerReservationCancelled(ctx.api, {
      ownerTelegramId: r.item.wishlist.owner.telegramId,
      wishlistTitle: r.item.wishlist.title,
      itemTitle: r.item.title,
      privacyMode: r.item.wishlist.privacyMode,
    });
  }

  await ctx.reply(t.menu.dataDeleted, { reply_markup: { remove_keyboard: true } });
}

export function registerMenu(bot: Bot<MyContext>) {
  bot.command("start", async (ctx) => {
    await upsertUserFromCtx(ctx);

    const payload = parseStartPayload(ctx.match?.toString());
    if (payload.type === "list") {
      await openWishlistForGuest(ctx, payload.slug);
      return;
    }
    if (payload.type === "reservation") {
      await showMyReservations(ctx);
      return;
    }
    if (payload.type === "editor") {
      await acceptEditorInvite(ctx, payload.token);
      return;
    }

    await ctx.reply(t.menu.welcome, { reply_markup: mainMenuKeyboard() });
    await renderScreen(ctx, {
      text: t.menu.mainMenu,
      keyboard: new InlineKeyboard()
        .text(t.buttons.menuCreate, "wl:new")
        .row()
        .text(t.buttons.menuMyLists, "wl:list:0"),
    });
  });

  bot.command("menu", async (ctx) => {
    await ctx.reply(t.menu.mainMenu, { reply_markup: mainMenuKeyboard() });
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(t.menu.help, {
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard(),
      link_preview_options: { is_disabled: true },
    });
  });

  // Reached only outside a conversation — inside one, src/lib/convo.ts
  // intercepts /cancel and stops the dialog before it gets here.
  bot.command("cancel", async (ctx) => {
    await ctx.reply(t.common.nothingToCancel, { reply_markup: mainMenuKeyboard() });
  });

  bot.callbackQuery("menu:help", async (ctx) => {
    await ack(ctx);
    await ctx.reply(t.menu.help, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  });

  bot.callbackQuery("menu:wipe", async (ctx) => {
    await renderScreen(ctx, {
      text: t.menu.confirmDeleteMyData,
      keyboard: new InlineKeyboard()
        .text(t.buttons.confirmDeleteMyData, "menu:wipego")
        .row()
        .text(t.buttons.cancel, "menu:settings"),
    });
  });

  bot.callbackQuery("menu:wipego", async (ctx) => {
    await ack(ctx);
    await wipeMyData(ctx);
  });

  bot.callbackQuery("menu:settings", async (ctx) => {
    await showSettings(ctx);
  });

  bot.hears(MENU_CREATE, async (ctx) => {
    await upsertUserFromCtx(ctx);
    await ctx.conversation.enter("createWishlist");
  });

  bot.hears(MENU_LISTS, async (ctx) => {
    await showMyWishlists(ctx);
  });

  bot.hears(MENU_RESERVATIONS, async (ctx) => {
    await showMyReservations(ctx);
  });

  bot.hears(MENU_SUBSCRIPTIONS, async (ctx) => {
    await showMySubscriptions(ctx);
  });

  bot.hears(MENU_SETTINGS, async (ctx) => {
    await showSettings(ctx);
  });
}
