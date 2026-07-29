// Outbound DMs.
//
// Every message an owner receives passes the surprise contract (§8.4): while
// the surprise is on they learn that their list is alive and nothing else —
// not which gift, not who, not how many. A notification is the easiest place
// in the whole product to break that promise by accident, so the privacy
// branch lives here rather than at each call site.

import { GrammyError, InlineKeyboard, type Bot } from "grammy";
import type { MyContext } from "../context.js";
import { prisma } from "../db.js";
import { escapeHtml } from "./format.js";
import { truncateHtml } from "./screen.js";
import { t } from "../text.js";

type BotApi = Bot<MyContext>["api"];
type PrivacyMode = "SURPRISE" | "OPEN";

const TEXT_LIMIT = 4096;

/**
 * Telegram caps outgoing messages at roughly 30/s across all chats. Fan-outs
 * here (a digest to every follower, "список видалено" to every guest) used to
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
 * digest wastes a request on them forever. Their lists and promises stay
 * untouched — only the push channels are dropped.
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

// ── Власнику ───────────────────────────────────────────────────────────────

export async function notifyOwnerNewPromise(
  api: BotApi,
  opts: {
    ownerTelegramId: string;
    wishlistTitle: string;
    giftTitle: string;
    privacyMode: PrivacyMode;
    quantity: number;
    guestName: string;
  },
) {
  const list = escapeHtml(opts.wishlistTitle);
  if (opts.privacyMode === "SURPRISE") {
    await safeSend(api, opts.ownerTelegramId, t.notify.ownerPromiseSurprise(list));
    return;
  }
  await safeSend(
    api,
    opts.ownerTelegramId,
    t.notify.ownerPromiseOpen(
      list,
      escapeHtml(opts.giftTitle),
      escapeHtml(opts.guestName),
      opts.quantity,
    ),
  );
}

export async function notifyOwnerPromiseReleased(
  api: BotApi,
  opts: { ownerTelegramId: string; wishlistTitle: string; giftTitle: string; privacyMode: PrivacyMode },
) {
  const list = escapeHtml(opts.wishlistTitle);
  await safeSend(
    api,
    opts.ownerTelegramId,
    opts.privacyMode === "SURPRISE"
      ? t.notify.ownerReleasedSurprise(list)
      : t.notify.ownerReleasedOpen(list, escapeHtml(opts.giftTitle)),
  );
}

/**
 * A gift actually being bought is the event an owner most wants to hear about.
 * Still surprise-safe: that *something* was bought is fine, naming it is not.
 */
export async function notifyOwnerGiftBought(
  api: BotApi,
  opts: {
    ownerTelegramId: string;
    wishlistTitle: string;
    giftTitle: string;
    privacyMode: PrivacyMode;
    guestName: string;
  },
) {
  const list = escapeHtml(opts.wishlistTitle);
  await safeSend(
    api,
    opts.ownerTelegramId,
    opts.privacyMode === "SURPRISE"
      ? t.notify.ownerBoughtSurprise(list)
      : t.notify.ownerBoughtOpen(list, escapeHtml(opts.giftTitle), escapeHtml(opts.guestName)),
  );
}

export async function notifyOwnerCoAuthorJoined(
  api: BotApi,
  opts: { ownerTelegramId: string; wishlistTitle: string; name: string },
) {
  await safeSend(
    api,
    opts.ownerTelegramId,
    t.notify.ownerCoAuthorJoined(escapeHtml(opts.wishlistTitle), escapeHtml(opts.name)),
  );
}

// ── Гостю: усе, що ламає його обіцянку ─────────────────────────────────────

export async function notifyGuestGiftRemoved(
  api: BotApi,
  opts: { guestTelegramId: string; wishlistTitle: string; giftTitle: string; alreadyBought: boolean },
) {
  const list = escapeHtml(opts.wishlistTitle);
  const gift = escapeHtml(opts.giftTitle);
  await safeSend(
    api,
    opts.guestTelegramId,
    opts.alreadyBought
      ? t.notify.guestGiftRemovedBought(list, gift)
      : t.notify.guestGiftRemoved(list, gift),
  );
}

export async function notifyGuestGiftRestored(
  api: BotApi,
  opts: { guestTelegramId: string; wishlistTitle: string; giftTitle: string },
) {
  await safeSend(
    api,
    opts.guestTelegramId,
    t.notify.guestGiftRestored(escapeHtml(opts.wishlistTitle), escapeHtml(opts.giftTitle)),
  );
}

export async function notifyGuestListDeleted(
  api: BotApi,
  opts: { guestTelegramId: string; wishlistTitle: string },
) {
  await safeSend(api, opts.guestTelegramId, t.notify.guestListDeleted(escapeHtml(opts.wishlistTitle)));
}

export async function notifyGuestListFinished(
  api: BotApi,
  opts: { guestTelegramId: string; wishlistTitle: string },
) {
  await safeSend(api, opts.guestTelegramId, t.notify.guestListFinished(escapeHtml(opts.wishlistTitle)));
}

// ── Тим, хто стежить ───────────────────────────────────────────────────────

export async function notifyWatchers(
  api: BotApi,
  telegramIds: string[],
  text: string,
  keyboard?: InlineKeyboard,
) {
  for (const id of telegramIds) {
    await safeSend(api, id, text, keyboard);
  }
}

/**
 * Still immediate, unlike new-gift announcements: a gift becoming free again
 * is rare, time-sensitive, and exactly what following a list is for.
 */
export async function notifyWatchersGiftFreeAgain(
  api: BotApi,
  wishlistId: string,
  wishlistTitle: string,
  giftTitle: string,
) {
  const watchers = await prisma.subscription.findMany({
    where: { wishlistId },
    include: { user: { select: { telegramId: true } } },
  });
  if (watchers.length === 0) return;

  await notifyWatchers(
    api,
    watchers.map((w) => w.user.telegramId),
    t.notify.giftFreeAgain(escapeHtml(wishlistTitle), escapeHtml(giftTitle)),
    new InlineKeyboard().text(t.buttons.view, `g:open:${wishlistId}:a:0`),
  );
}
