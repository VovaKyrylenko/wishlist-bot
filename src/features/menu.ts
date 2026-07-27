import type { Bot } from "grammy";
import type { MyContext } from "../context.js";
import { upsertUserFromCtx } from "../lib/users.js";
import { parseStartPayload } from "../lib/deeplink.js";
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
import { showMyReservations } from "./reservations.js";
import { showMySubscriptions } from "./subscriptions.js";
import { t } from "../text.js";

export function registerMenu(bot: Bot<MyContext>) {
  bot.command("start", async (ctx) => {
    await upsertUserFromCtx(ctx);

    const payload = parseStartPayload(ctx.match?.toString());
    if (payload.type === "list") {
      await openWishlistForGuest(ctx, payload.slug);
      return;
    }

    await ctx.reply(t.menu.welcome, { reply_markup: mainMenuKeyboard() });
  });

  bot.hears(MENU_CREATE, async (ctx) => {
    await upsertUserFromCtx(ctx);
    await ctx.conversation.enter("createWishlist");
  });

  bot.hears(MENU_LISTS, async (ctx) => {
    await upsertUserFromCtx(ctx);
    await showMyWishlists(ctx);
  });

  bot.hears(MENU_RESERVATIONS, async (ctx) => {
    await upsertUserFromCtx(ctx);
    await showMyReservations(ctx);
  });

  bot.hears(MENU_SUBSCRIPTIONS, async (ctx) => {
    await upsertUserFromCtx(ctx);
    await showMySubscriptions(ctx);
  });

  bot.hears(MENU_SETTINGS, async (ctx) => {
    const user = await upsertUserFromCtx(ctx);
    await ctx.reply(
      [
        t.menu.settingsHeader,
        "",
        t.menu.settingsTelegramId(user.telegramId),
        user.username ? t.menu.settingsUsername(user.username) : null,
        "",
        t.menu.settingsHint,
      ]
        .filter((line) => line !== null)
        .join("\n"),
    );
  });

  bot.command("menu", async (ctx) => {
    await ctx.reply(t.menu.mainMenu, { reply_markup: mainMenuKeyboard() });
  });
}
