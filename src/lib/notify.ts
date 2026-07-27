import type { Bot, InlineKeyboard } from "grammy";
import type { MyContext } from "../context.js";
import { escapeHtml } from "./format.js";
import { t } from "../text.js";

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
    await safeSend(api, opts.ownerTelegramId, t.notify.ownerNewReservationSurprise(list));
    return;
  }
  await safeSend(
    api,
    opts.ownerTelegramId,
    t.notify.ownerNewReservationOpen(
      list,
      escapeHtml(opts.itemTitle),
      opts.reservedQuantity,
      escapeHtml(opts.guestName),
    ),
  );
}

export async function notifyOwnerReservationCancelled(
  api: BotApi,
  opts: { ownerTelegramId: string; wishlistTitle: string; itemTitle: string; privacyMode: "SURPRISE" | "OPEN" },
) {
  const list = escapeHtml(opts.wishlistTitle);
  if (opts.privacyMode === "SURPRISE") {
    await safeSend(api, opts.ownerTelegramId, t.notify.ownerCancelledSurprise(list));
    return;
  }
  await safeSend(api, opts.ownerTelegramId, t.notify.ownerCancelledOpen(list, escapeHtml(opts.itemTitle)));
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
    t.notify.itemRemoved(escapeHtml(opts.wishlistTitle), escapeHtml(opts.itemTitle)),
  );
}

export async function notifyGuestListDeleted(
  api: BotApi,
  opts: { guestTelegramId: string; wishlistTitle: string },
) {
  await safeSend(api, opts.guestTelegramId, t.notify.listDeleted(escapeHtml(opts.wishlistTitle)));
}

export async function notifyGuestListArchived(
  api: BotApi,
  opts: { guestTelegramId: string; wishlistTitle: string },
) {
  await safeSend(api, opts.guestTelegramId, t.notify.listArchived(escapeHtml(opts.wishlistTitle)));
}
