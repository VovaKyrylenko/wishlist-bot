import type { Bot, InlineKeyboard } from "grammy";
import type { MyContext } from "../context.js";
import { escapeHtml } from "./format.js";

type BotApi = Bot<MyContext>["api"];

/** Best-effort DM — swallows errors (user blocked the bot, chat not found, etc). */
async function safeSend(
  api: BotApi,
  telegramId: string,
  text: string,
  keyboard?: InlineKeyboard,
) {
  try {
    await api.sendMessage(Number(telegramId), text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
      link_preview_options: { is_disabled: true },
    });
  } catch (err) {
    console.error(`notify: failed to message ${telegramId}:`, err);
  }
}

export async function notifyOwnerNewReservation(
  api: BotApi,
  opts: {
    ownerTelegramId: string;
    wishlistTitle: string;
    itemTitle: string;
    privacyMode: "SURPRISE" | "OPEN";
    reservedQuantity: number;
    guestName: string;
  },
) {
  const list = escapeHtml(opts.wishlistTitle);
  if (opts.privacyMode === "SURPRISE") {
    await safeSend(
      api,
      opts.ownerTelegramId,
      `✅ У вашому вішлісті «${list}» з'явилося нове бронювання.`,
    );
    return;
  }
  const item = escapeHtml(opts.itemTitle);
  const guest = escapeHtml(opts.guestName);
  await safeSend(
    api,
    opts.ownerTelegramId,
    `✅ Нове бронювання у «${list}»\n\n🎁 ${item}\nКількість: ${opts.reservedQuantity}\nЗабронював(ла): ${guest}`,
  );
}

export async function notifyOwnerReservationCancelled(
  api: BotApi,
  opts: { ownerTelegramId: string; wishlistTitle: string; itemTitle: string; privacyMode: "SURPRISE" | "OPEN" },
) {
  const list = escapeHtml(opts.wishlistTitle);
  if (opts.privacyMode === "SURPRISE") {
    await safeSend(api, opts.ownerTelegramId, `↩️ У вішлісті «${list}» хтось скасував бронювання.`);
    return;
  }
  const item = escapeHtml(opts.itemTitle);
  await safeSend(api, opts.ownerTelegramId, `↩️ Скасовано бронювання у «${list}»\n\n🎁 ${item}`);
}

export async function notifySubscribers(
  api: BotApi,
  subscriberTelegramIds: string[],
  text: string,
  keyboard?: InlineKeyboard,
) {
  for (const id of subscriberTelegramIds) {
    await safeSend(api, id, text, keyboard);
  }
}

export async function notifyGuestItemRemoved(
  api: BotApi,
  opts: { guestTelegramId: string; wishlistTitle: string; itemTitle: string },
) {
  await safeSend(
    api,
    opts.guestTelegramId,
    `⚠️ Власник видалив подарунок «${escapeHtml(opts.itemTitle)}» зі списку «${escapeHtml(
      opts.wishlistTitle,
    )}», який ви бронювали. Ваше бронювання скасовано.`,
  );
}

export async function notifyGuestListDeleted(
  api: BotApi,
  opts: { guestTelegramId: string; wishlistTitle: string },
) {
  await safeSend(
    api,
    opts.guestTelegramId,
    `🗑 Власник видалив список «${escapeHtml(opts.wishlistTitle)}». Ваше бронювання в ньому більше не активне.`,
  );
}

export async function notifyGuestListArchived(
  api: BotApi,
  opts: { guestTelegramId: string; wishlistTitle: string },
) {
  await safeSend(
    api,
    opts.guestTelegramId,
    `📦 Список «${escapeHtml(opts.wishlistTitle)}» закрито власником. Нові бронювання більше не приймаються.`,
  );
}
