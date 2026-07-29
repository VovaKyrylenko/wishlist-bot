import { Bot } from "grammy";
import { type MyContext } from "./context.js";

import { registerHome, renderHome } from "./features/home.js";
import { registerLists } from "./features/lists.js";
import { registerGifts } from "./features/gifts.js";
import { registerShowcase } from "./features/showcase.js";
import { registerPromises } from "./features/promises.js";
import { registerEntry } from "./features/entry.js";
import { ack } from "./lib/screen.js";
import { currentUser } from "./lib/users.js";
import { clearPending } from "./lib/pending.js";
import { t } from "./text.js";

let bot: Bot<MyContext> | undefined;

export function getBot(): Bot<MyContext> {
  if (bot) return bot;

  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error("BOT_TOKEN is not set");

  bot = new Bot<MyContext>(token);

  /**
   * A tap means the user moved on.
   *
   * Questions live in `pendingAction` so that a plain message can answer them,
   * but nothing was retiring one when the user simply walked away — tapped
   * "⬅️ Назад", opened another screen, went to Головна. The question stayed
   * armed, and the next unrelated thing they typed got swallowed as its
   * answer, hours or screens later. That is the same trap the conversation
   * plugin used to set, just quieter.
   *
   * Clearing it here and letting `ask()` re-arm it afterwards means a question
   * only ever survives while it is the thing on screen.
   */
  bot.on("callback_query", async (ctx, next) => {
    const user = await currentUser(ctx);
    if (user.pendingAction) await clearPending(ctx, user.id);
    await next();
  });

  // The page counter in a pager row is a label, not a button.
  bot.callbackQuery("noop", (ctx) => ack(ctx));

  registerHome(bot);
  registerLists(bot);
  registerGifts(bot);
  registerShowcase(bot);
  registerPromises(bot);
  // Last: its `bot.on("message")` is the catch-all for anything not claimed by
  // a command above it.
  registerEntry(bot);

  /**
   * A button from a deploy that no longer knows this callback. The old bot
   * answered "Ця кнопка вже застаріла 🙂 Відкрий розділ заново через меню",
   * which told the user off for something the deploy did. Rendering Головна
   * without comment is both more useful and more honest — the tap becomes a
   * shortcut back into the product rather than a scolding.
   */
  bot.on("callback_query:data", async (ctx) => {
    console.warn("Unhandled callback data:", ctx.callbackQuery.data);
    await renderHome(ctx);
  });

  bot.catch(async (err) => {
    console.error("Unhandled bot error:", err.error, "\nupdate:", JSON.stringify(err.ctx.update));
    // Never leave a tap spinning, and never leave the user without a next
    // step: say it broke on our side and that their data is intact.
    try {
      await ack(err.ctx);
      await err.ctx.reply(t.common.internalError);
    } catch {
      // The chat is unreachable; the log above is all we can do.
    }
  });

  return bot;
}

/** Populates the "/" menu in Telegram clients. Safe to call on every deploy. */
export async function syncBotCommands(bot: Bot<MyContext>) {
  await bot.api.setMyCommands([
    { command: "start", description: t.home.commandStart },
    { command: "home", description: t.home.commandHome },
    { command: "help", description: t.home.commandHelp },
  ]);
}
