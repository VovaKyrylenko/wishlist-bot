import { GrammyError, type Bot, type InlineKeyboard } from "grammy";
import type { MyContext } from "../context.js";
import { prisma } from "../db.js";
import { escapeHtml } from "./format.js";
import { truncateHtml } from "./ui.js";
import { t } from "../text.js";

type BotApi = Bot<MyContext>["api"];

const TEXT_LIMIT = 4096;

/**
 * Telegram caps outgoing messages at roughly 30/s across all chats. Fan-outs
 * here (a digest to every subscriber, "list deleted" to every guest) used to
 * fire as fast as the loop could go and got throttled — or 429'd — as soon as
 * a list had a real audience. One shared gate paces every send.
 */
const MIN_SEND_GAP_MS = 40;
let nextSendAt = 0;

async function pace(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextSendAt - now);
  nextSendAt = Math.max(now, nextSendAt) + MIN_SEND_GAP_MS;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

/** True when Telegram says this chat can never be written to again. */
function isPermanentlyUnreachable(err: unknown): boolean {
  if (!(err instanceof GrammyError)) return false;
  if (err.error_code === 403) return true; // bot blocked / kicked / user deactivated
  return err.error_code === 400 && /chat not found/i.test(err.description);
}

/**
 * Someone who blocked the bot must stop receiving fan-outs, or every future
 * digest wastes a request on them forever. Their wishlists and reservations
 * stay untouched — only the push channels are dropped.
 */
async function forgetUnreachable(telegramId: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { telegramId }, select: { id: true } });
    if (!user) return;
    await prisma.$transaction([
      prisma.subscription.deleteMany({ where: { userId: user.id } }),
      prisma.wishlistVisit.deleteMany({ where: { userId: user.id } }),
    ]);
  } catch (err) {
    console.error(`notify: failed to prune unreachable user ${telegramId}:`, err);
  }
}

/** Best-effort DM. Returns false when the message could not be delivered. */
export async function safeSend(
  api: BotApi,
  telegramId: string,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<boolean> {
  await pace();
  try {
    await api.sendMessage(Number(telegramId), truncateHtml(text, TEXT_LIMIT), {
      parse_mode: "HTML",
      reply_markup: keyboard,
      link_preview_options: { is_disabled: true },
    });
    return true;
  } catch (err) {
    if (isPermanentlyUnreachable(err)) {
      await forgetUnreachable(telegramId);
      return false;
    }
    console.error(`notify: failed to message ${telegramId}:`, err);
    return false;
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
    guestContact: string | null;
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
      opts.guestContact ? escapeHtml(opts.guestContact) : null,
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

/**
 * A gift actually being bought is the one event an owner most wants to know
 * about, and until now nobody told them. Still respects SURPRISE: the fact
 * that *something* was bought is safe, naming it is not.
 */
export async function notifyOwnerPurchased(
  api: BotApi,
  opts: {
    ownerTelegramId: string;
    wishlistTitle: string;
    itemTitle: string;
    privacyMode: "SURPRISE" | "OPEN";
    guestName: string;
  },
) {
  const list = escapeHtml(opts.wishlistTitle);
  if (opts.privacyMode === "SURPRISE") {
    await safeSend(api, opts.ownerTelegramId, t.notify.ownerPurchasedSurprise(list));
    return;
  }
  await safeSend(
    api,
    opts.ownerTelegramId,
    t.notify.ownerPurchasedOpen(list, escapeHtml(opts.itemTitle), escapeHtml(opts.guestName)),
  );
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
  opts: { guestTelegramId: string; wishlistTitle: string; itemTitle: string; alreadyPurchased: boolean },
) {
  const list = escapeHtml(opts.wishlistTitle);
  const item = escapeHtml(opts.itemTitle);
  await safeSend(
    api,
    opts.guestTelegramId,
    opts.alreadyPurchased ? t.notify.itemRemovedPurchased(list, item) : t.notify.itemRemoved(list, item),
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

/** Tells the owner that someone accepted their editor invite. */
export async function notifyOwnerEditorJoined(
  api: BotApi,
  opts: { ownerTelegramId: string; wishlistTitle: string; editorName: string },
) {
  await safeSend(
    api,
    opts.ownerTelegramId,
    t.notify.editorJoined(escapeHtml(opts.wishlistTitle), escapeHtml(opts.editorName)),
  );
}
