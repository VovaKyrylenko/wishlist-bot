import { Bot } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import { PrismaAdapter } from "@grammyjs/storage-prisma";
import { prisma } from "./db.js";
import { type MyContext } from "./context.js";

import { registerMenu } from "./features/menu.js";
import {
  registerWishlists,
  createWishlistConversation,
  editWishlistFieldConversation,
} from "./features/wishlists.js";
import {
  registerItems,
  addItemConversation,
  editItemFieldConversation,
  editItemQuantityConversation,
} from "./features/items.js";
import { registerGuest } from "./features/guest.js";
import {
  registerReservations,
  reserveConversation,
  changeReservationQtyConversation,
} from "./features/reservations.js";
import { registerSubscriptions } from "./features/subscriptions.js";
import { ack } from "./lib/ui.js";
import { t } from "./text.js";

let bot: Bot<MyContext> | undefined;

export function getBot(): Bot<MyContext> {
  if (bot) return bot;

  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error("BOT_TOKEN is not set");

  bot = new Bot<MyContext>(token);

  bot.use(
    conversations({
      storage: {
        type: "key",
        adapter: new PrismaAdapter(prisma.botSession),
        prefix: "convo:",
      },
    }),
  );

  bot.use(createConversation(createWishlistConversation, "createWishlist"));
  bot.use(createConversation(editWishlistFieldConversation, "editWishlistField"));
  bot.use(createConversation(addItemConversation, "addItem"));
  bot.use(createConversation(editItemFieldConversation, "editItemField"));
  bot.use(createConversation(editItemQuantityConversation, "editItemQuantity"));
  bot.use(createConversation(reserveConversation, "reserve"));
  bot.use(createConversation(changeReservationQtyConversation, "changeReservationQty"));

  // The page counter in a pager row is a label, not a button.
  bot.callbackQuery("noop", (ctx) => ack(ctx));

  registerMenu(bot);
  registerWishlists(bot);
  registerItems(bot);
  registerGuest(bot);
  registerReservations(bot);
  registerSubscriptions(bot);

  // Buttons on screens from an older deploy would otherwise spin forever.
  bot.on("callback_query:data", async (ctx) => {
    console.warn("Unhandled callback data:", ctx.callbackQuery.data);
    await ack(ctx, t.common.buttonExpired);
  });

  bot.catch((err) => {
    console.error("Unhandled bot error:", err.error, "\nupdate:", JSON.stringify(err.ctx.update));
  });

  return bot;
}

/** Populates the "/" menu in Telegram clients. Safe to call on every deploy. */
export async function syncBotCommands(bot: Bot<MyContext>) {
  await bot.api.setMyCommands([
    { command: "menu", description: t.menu.commandMenu },
    { command: "help", description: t.menu.commandHelp },
    { command: "cancel", description: t.menu.commandCancel },
    { command: "start", description: t.menu.commandStart },
  ]);
}
