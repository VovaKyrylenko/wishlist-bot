// The live screen.
//
// The product is one message at the bottom of the chat that always shows where
// you are. Two rules produce that:
//
//   1. A tap that arrives *from* the live screen edits it in place. Navigating
//      never grows the chat.
//   2. A tap that arrives from anything older — a card from last week, the
//      share message a friend sent, a notification from this morning — renders
//      a fresh screen at the bottom instead. The old message is left alone and
//      keeps working. This is why "Ця кнопка вже застаріла" no longer exists:
//      an old button is not stale, it is a shortcut back into the product.
//
// Everything the user needs to see after an action — success, undo, errors —
// arrives as a `notice` line on the screen that results from it, so a
// confirmation can never scroll away or vanish after two seconds.

import { GrammyError, InlineKeyboard } from "grammy";
import type { Message } from "grammy/types";
import type { MyContext } from "../context.js";
import { prisma } from "../db.js";
import { currentUser, invalidateUser } from "./users.js";
import { anchorKeyboard } from "./keyboards.js";
import { t } from "../text.js";

/** Telegram hard limits. */
const CAPTION_LIMIT = 1024;
const TEXT_LIMIT = 4096;

export interface Screen {
  text: string;
  keyboard?: InlineKeyboard;
  /** When set, the screen renders as a photo and `text` becomes its caption. */
  photo?: string | null;
}

function isNotModified(err: unknown): boolean {
  return err instanceof GrammyError && err.description.includes("message is not modified");
}

/**
 * Drops empty button rows before a keyboard goes out.
 *
 * `new InlineKeyboard()` already contains one empty row, so any screen that
 * starts by calling `.row()` — every list screen, whenever the list happens to
 * be empty and the index buttons add nothing — shipped a blank row to
 * Telegram. Screens assemble their keyboards conditionally all over this
 * codebase, so the tidy-up belongs here rather than at each call site.
 */
function compact(keyboard: InlineKeyboard | undefined): InlineKeyboard | undefined {
  if (!keyboard) return undefined;
  const rows = keyboard.inline_keyboard.filter((row) => row.length > 0);
  if (rows.length === keyboard.inline_keyboard.length) return keyboard;
  return InlineKeyboard.from(rows);
}

/** Callback queries must be answered or the client shows a spinner forever. */
export async function ack(ctx: MyContext, text?: string): Promise<void> {
  if (!ctx.callbackQuery) return;
  try {
    await ctx.answerCallbackQuery(text ? { text } : undefined);
  } catch {
    // Already answered, or the query expired — neither is worth surfacing.
  }
}

/**
 * Shortens a value for use *inside* a line — a title in a button label or a
 * list row — collapsing any newlines it may contain.
 */
export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Shortens already-assembled markup to Telegram's limit without ever cutting
 * inside a tag or an entity, re-closing whatever was still open.
 *
 * A plain `slice()` here was a real outage: a long comment pushed a gift
 * screen past 1024 characters, the cut landed inside `<b>`, Telegram answered
 * "can't parse entities", and the screen failed to render at all rather than
 * rendering slightly short.
 */
export function truncateHtml(html: string, max: number): string {
  if (html.length <= max) return html;

  const ELLIPSIS = "…";
  const open: string[] = [];
  // Room that must stay free for the `</b>`-style tags we still owe.
  const closingCost = () => open.reduce((n, tag) => n + tag.length + 3, 0);

  let out = "";
  let i = 0;

  while (i < html.length) {
    let chunk: string;
    let tagName: string | null = null;
    let isClosingTag = false;

    if (html[i] === "<") {
      const end = html.indexOf(">", i);
      if (end === -1) break; // Malformed tail — safer to drop it than to emit it.
      chunk = html.slice(i, end + 1);
      const match = /^<(\/?)\s*([a-zA-Z0-9]+)/.exec(chunk);
      isClosingTag = match?.[1] === "/";
      tagName = match?.[2]?.toLowerCase() ?? null;
    } else if (html[i] === "&") {
      // Entities like `&amp;` are atomic; splitting one also breaks parsing.
      const end = html.indexOf(";", i);
      chunk = end !== -1 && end - i <= 10 ? html.slice(i, end + 1) : html[i];
    } else {
      chunk = html[i];
    }

    // Closing tags are already reserved for by `closingCost`, so they are free.
    const cost = isClosingTag ? 0 : chunk.length;
    if (out.length + cost + closingCost() + ELLIPSIS.length > max) break;

    out += chunk;
    if (tagName) {
      if (isClosingTag) {
        const at = open.lastIndexOf(tagName);
        if (at !== -1) open.splice(at, 1);
      } else if (!chunk.endsWith("/>")) {
        open.push(tagName);
      }
    }
    i += chunk.length;
  }

  out = out.trimEnd() + ELLIPSIS;
  for (let k = open.length - 1; k >= 0; k--) out += `</${open[k]}>`;
  return out;
}

async function sendScreen(ctx: MyContext, screen: Screen): Promise<Message | null> {
  if (screen.photo) {
    try {
      return await ctx.replyWithPhoto(screen.photo, {
        caption: truncateHtml(screen.text, CAPTION_LIMIT),
        parse_mode: "HTML",
        reply_markup: compact(screen.keyboard),
      });
    } catch {
      // Scraped og:image URLs go stale or point at something Telegram refuses
      // to fetch; the screen still has to show up, just without the picture.
    }
  }
  try {
    return await ctx.reply(truncateHtml(screen.text, TEXT_LIMIT), {
      parse_mode: "HTML",
      reply_markup: compact(screen.keyboard),
      link_preview_options: { is_disabled: true },
    });
  } catch (err) {
    console.error("screen: failed to send", err);
    return null;
  }
}

async function rememberLiveScreen(ctx: MyContext, userId: string, messageId: number | null) {
  await prisma.user
    .update({ where: { id: userId }, data: { screenMessageId: messageId } })
    .catch(() => undefined);
  invalidateUser(ctx);
}

/**
 * Teaches the anchor exactly once per person, before their first screen, so it
 * is already sitting under the chat when they need a way out. Recognising "no
 * screen has ever been rendered" is enough — there is no separate flag to keep
 * in sync.
 */
async function ensureAnchor(ctx: MyContext, hasScreen: boolean): Promise<void> {
  if (hasScreen) return;
  try {
    await ctx.reply(t.common.anchorHint, { reply_markup: anchorKeyboard() });
  } catch {
    // Not worth failing a screen over.
  }
}

/**
 * Renders `screen` as this chat's live screen: edited in place when the tap
 * came from it, sent fresh at the bottom otherwise.
 */
export async function renderScreen(ctx: MyContext, screen: Screen): Promise<void> {
  await ack(ctx);

  const user = await currentUser(ctx);
  const tapped = ctx.callbackQuery?.message;
  const isLive = Boolean(tapped) && user.screenMessageId === tapped?.message_id;

  if (isLive && tapped) {
    const hasPhotoNow = "photo" in tapped && Array.isArray(tapped.photo);
    const wantsPhoto = Boolean(screen.photo);

    if (hasPhotoNow === wantsPhoto) {
      try {
        if (wantsPhoto) {
          await ctx.editMessageMedia(
            {
              type: "photo",
              media: screen.photo as string,
              caption: truncateHtml(screen.text, CAPTION_LIMIT),
              parse_mode: "HTML",
            },
            { reply_markup: compact(screen.keyboard) },
          );
        } else {
          await ctx.editMessageText(truncateHtml(screen.text, TEXT_LIMIT), {
            parse_mode: "HTML",
            reply_markup: compact(screen.keyboard),
            link_preview_options: { is_disabled: true },
          });
        }
        return;
      } catch (err) {
        // Re-tapping the button that is already open is a no-op, not an error.
        if (isNotModified(err)) return;
      }
    }

    // Telegram cannot turn a photo message into a text one or back, so the
    // live screen has to be replaced rather than edited.
    try {
      await ctx.deleteMessage();
    } catch {
      // Messages older than 48h cannot be deleted — one stale card left
      // behind beats not rendering the screen at all.
    }
  }

  await ensureAnchor(ctx, user.screenMessageId !== null);
  const sent = await sendScreen(ctx, screen);
  await rememberLiveScreen(ctx, user.id, sent?.message_id ?? null);
}

/**
 * Rewrites the live screen in place even though this update is not a tap on
 * it. Used by the only genuinely slow flow in the product: "🔎 Дивлюся, що
 * там…" becomes the preview card in the same message rather than stacking
 * three messages on top of each other while a shop loads.
 */
export async function replaceLiveScreen(ctx: MyContext, screen: Screen): Promise<void> {
  await ack(ctx);
  const user = await currentUser(ctx);
  const chatId = ctx.chat?.id;
  const messageId = user.screenMessageId;

  if (chatId !== undefined && messageId !== null) {
    try {
      if (screen.photo) {
        await ctx.api.editMessageMedia(
          chatId,
          messageId,
          {
            type: "photo",
            media: screen.photo,
            caption: truncateHtml(screen.text, CAPTION_LIMIT),
            parse_mode: "HTML",
          },
          { reply_markup: compact(screen.keyboard) },
        );
      } else {
        await ctx.api.editMessageText(chatId, messageId, truncateHtml(screen.text, TEXT_LIMIT), {
          parse_mode: "HTML",
          reply_markup: compact(screen.keyboard),
          link_preview_options: { is_disabled: true },
        });
      }
      return;
    } catch (err) {
      // Either nothing changed, or the message is the wrong kind (text vs
      // photo) and has to be replaced instead of edited.
      if (isNotModified(err)) return;
    }
    await ctx.api.deleteMessage(chatId, messageId).catch(() => undefined);
  }

  const sent = await sendScreen(ctx, screen);
  await rememberLiveScreen(ctx, user.id, sent?.message_id ?? null);
}

/**
 * A best-effort nudge on the live screen's text — for progress only. Failing
 * to reassure someone that a slow site is still loading is not worth an error.
 */
export async function nudgeLiveScreen(ctx: MyContext, text: string): Promise<void> {
  const user = await currentUser(ctx);
  const chatId = ctx.chat?.id;
  if (chatId === undefined || user.screenMessageId === null) return;
  await ctx.api
    .editMessageText(chatId, user.screenMessageId, truncateHtml(text, TEXT_LIMIT), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    })
    .catch(() => undefined);
}

/**
 * Sends something that is explicitly *not* a screen and must not steal the
 * live pointer — currently only the greeting that precedes a digest.
 */
export async function sendAside(ctx: MyContext, text: string): Promise<void> {
  try {
    await ctx.reply(truncateHtml(text, TEXT_LIMIT), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  } catch (err) {
    console.error("screen: failed to send aside", err);
  }
}

export interface Paged<T> {
  slice: T[];
  page: number;
  pages: number;
  /** Index of the first element of `slice` within the full list. */
  offset: number;
}

export function paginate<T>(all: T[], page: number, perPage: number): Paged<T> {
  const pages = Math.max(1, Math.ceil(all.length / perPage));
  const current = Math.min(Math.max(page, 0), pages - 1);
  const offset = current * perPage;
  return { slice: all.slice(offset, offset + perPage), page: current, pages, offset };
}

/**
 * Appends a `‹ 2/5 ›` row when there is more than one page. `callback` builds
 * the callback data for a given page; the counter itself is inert.
 */
export function addPagerRow<T>(
  kb: InlineKeyboard,
  paged: Paged<T>,
  callback: (page: number) => string,
): InlineKeyboard {
  if (paged.pages <= 1) return kb;
  kb.row()
    .text("‹", callback(paged.page > 0 ? paged.page - 1 : paged.pages - 1))
    .text(`${paged.page + 1}/${paged.pages}`, "noop")
    .text("›", callback(paged.page < paged.pages - 1 ? paged.page + 1 : 0));
  return kb;
}

/**
 * Lays out compact index buttons (`1 2 3 4 5`) that map onto the numbered
 * lines of a screen's text. Rule 12 of §9: a numbered button only ever exists
 * next to a visible numbered line in the same message.
 */
export function addIndexButtons<T>(
  kb: InlineKeyboard,
  paged: Paged<T>,
  callback: (item: T, index: number) => string,
  perRow = 5,
): InlineKeyboard {
  paged.slice.forEach((item, i) => {
    if (i % perRow === 0) kb.row();
    kb.text(String(paged.offset + i + 1), callback(item, paged.offset + i));
  });
  return kb;
}

/**
 * Joins a screen out of blocks, dropping the empty ones so an item with no
 * price or comment does not render with a hole where they would have been.
 */
export function block(...lines: (string | null | false | undefined)[]): string {
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

export function blocks(...parts: (string | null | false | undefined)[]): string {
  return parts.filter((part): part is string => Boolean(part)).join("\n\n");
}
