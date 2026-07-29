// Single-message screen rendering.
//
// The bot used to answer every tap with a fresh burst of messages — one per
// wishlist, one per item — so reordering a ten-item list buried the chat under
// dozens of duplicates. Instead every view is now a "screen": one message that
// gets edited in place as the user navigates. `renderScreen` figures out
// whether it can edit the message the tap came from, and only falls back to
// sending a new one when it truly has to.

import { GrammyError, InlineKeyboard } from "grammy";
import type { MyContext } from "../context.js";

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
 * A plain `slice()` here was a real outage: a long comment pushed an item
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

async function sendScreen(ctx: MyContext, screen: Screen): Promise<void> {
  if (screen.photo) {
    try {
      await ctx.replyWithPhoto(screen.photo, {
        caption: truncateHtml(screen.text, CAPTION_LIMIT),
        parse_mode: "HTML",
        reply_markup: screen.keyboard,
      });
      return;
    } catch {
      // Scraped og:image URLs go stale or point at something Telegram refuses
      // to fetch; the screen still has to show up, just without the picture.
    }
  }
  await ctx.reply(truncateHtml(screen.text, TEXT_LIMIT), {
    parse_mode: "HTML",
    reply_markup: screen.keyboard,
    link_preview_options: { is_disabled: true },
  });
}

/**
 * Renders `screen` into the message the current callback query came from,
 * falling back to a new message when there is nothing to edit. Telegram cannot
 * turn a photo message into a text one (or back), so those transitions delete
 * the old message first.
 */
export async function renderScreen(ctx: MyContext, screen: Screen): Promise<void> {
  await ack(ctx);

  const current = ctx.callbackQuery?.message;
  if (!current) {
    await sendScreen(ctx, screen);
    return;
  }

  const hasPhotoNow = "photo" in current && Array.isArray(current.photo);
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
          { reply_markup: screen.keyboard },
        );
      } else {
        await ctx.editMessageText(truncateHtml(screen.text, TEXT_LIMIT), {
          parse_mode: "HTML",
          reply_markup: screen.keyboard,
          link_preview_options: { is_disabled: true },
        });
      }
      return;
    } catch (err) {
      // Re-tapping the button that is already open is a no-op, not an error.
      if (isNotModified(err)) return;
    }
  }

  try {
    await ctx.deleteMessage();
  } catch {
    // Messages older than 48h cannot be deleted — leaving one stale card
    // behind beats not rendering the screen at all.
  }
  await sendScreen(ctx, screen);
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
 * lines of a screen's text, so a list of any length stays one message.
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
