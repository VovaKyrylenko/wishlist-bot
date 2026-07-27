import { Bot, session } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import { PrismaAdapter } from "@grammyjs/storage-prisma";
import { prisma } from "./db.js";
import { type MyContext, initialSession } from "./context.js";

import { registerMenu } from "./features/menu.js";
import {
  registerWishlists,
  createWishlistConversation,
  editWishlistFieldConversation,
  addEditorConversation,
} from "./features/wishlists.js";
import {
  registerItems,
  addItemConversation,
  editItemFieldConversation,
} from "./features/items.js";
import { registerGuest } from "./features/guest.js";
import {
  registerReservations,
  reserveConversation,
  changeReservationQtyConversation,
} from "./features/reservations.js";
import { registerSubscriptions } from "./features/subscriptions.js";

let bot: Bot<MyContext> | undefined;

export function getBot(): Bot<MyContext> {
  if (bot) return bot;

  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error("BOT_TOKEN is not set");

  bot = new Bot<MyContext>(token);

  const sessionStorage = new PrismaAdapter(prisma.botSession);

  bot.use(
    session({
      initial: initialSession,
      storage: sessionStorage,
    }),
  );
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
  bot.use(createConversation(addEditorConversation, "addEditor"));
  bot.use(createConversation(addItemConversation, "addItem"));
  bot.use(createConversation(editItemFieldConversation, "editItemField"));
  bot.use(createConversation(reserveConversation, "reserve"));
  bot.use(createConversation(changeReservationQtyConversation, "changeReservationQty"));

  registerMenu(bot);
  registerWishlists(bot);
  registerItems(bot);
  registerGuest(bot);
  registerReservations(bot);
  registerSubscriptions(bot);

  bot.catch((err) => {
    console.error("Unhandled bot error:", err.error, "\nupdate:", JSON.stringify(err.ctx.update));
  });

  return bot;
}
