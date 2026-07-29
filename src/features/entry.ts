// Everything that arrives as a message rather than a tap: commands, deep
// links, and — the reason this file exists — ordinary text and photos.
//
// The old bot had no `bot.on("message")` at all. Write "айфон 16" to it, paste
// a link, send a screenshot: silence. That is problem #3 in the audit and the
// single rule that fixes it is that input is always valid. A link is a gift. A
// photo is a gift. A short phrase is probably a gift, and the bot asks. A
// question is a question, and gets Головна. Silence is never an option.

import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
import type { MyContext } from "../context.js";
import { prisma } from "../db.js";
import { currentUser } from "../lib/users.js";
import { readPending } from "../lib/pending.js";
import { getDraft, hasContent, startDraft } from "../lib/drafts.js";
import { isAnchor } from "../lib/keyboards.js";
import { parseStartPayload } from "../lib/deeplink.js";
import { escapeHtml } from "../lib/format.js";
import { renderScreen, truncate } from "../lib/screen.js";
import { goHome, greetAfterPause, renderHome } from "./home.js";
import { applyListAnswer, renderInvite } from "./lists.js";
import { applyGiftAnswer, offerDraftResume, startGiftFromInput } from "./gifts.js";
import { openShowcaseBySlug } from "./showcase.js";
import { renderPromises } from "./promises.js";
import { t } from "../text.js";

/**
 * Longer than this and it reads as a sentence, not a gift name. The threshold
 * is deliberately generous on the "ask" side: a wrong guess costs one tap on
 * "Ні", while staying silent costs the whole interaction.
 */
const GIFT_NAME_MAX = 60;

/**
 * Politeness, not requests. Without this the bot answers "дякую" with
 * «Додати "дякую" як подарунок?», which is the classic way a smart-input
 * feature makes itself look stupid (§21.1).
 */
const COURTESIES = new Set([
  "привіт", "привет", "вітаю", "hi", "hello", "hey", "start",
  "дякую", "спасибі", "спасибо", "дяк", "thanks", "thank you", "ty",
  "ок", "окей", "ok", "okay", "добре", "гаразд", "ага", "угу", "так", "ні",
  "бувай", "па", "пока", "до побачення", "будь ласка", "нема за що",
  "супер", "класно", "круто", "🙂", "👍", "❤️", "💜",
]);

const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/i;

/** True when the whole message is a greeting or a thank-you. */
function isCourtesy(text: string): boolean {
  const normalized = text.toLowerCase().replace(/[!.,?)(]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return true;
  if (COURTESIES.has(normalized)) return true;
  // "дякую!!" / "ок 👍" — a courtesy plus decoration is still a courtesy.
  const words = normalized.split(" ").filter(Boolean);
  return words.length <= 2 && words.every((word) => COURTESIES.has(word));
}

/** Active lists this person may add to, newest first. */
async function editableLists(userId: string) {
  return prisma.wishlist.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ ownerId: userId }, { editors: { some: { userId } } }],
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * F3 — a link or a photo lands wherever it makes sense: straight into the only
 * list, into a chosen one, or into the first list this person ever makes.
 */
async function routeGiftInput(
  ctx: MyContext,
  input: { url?: string; photoFileId?: string; text?: string },
) {
  const user = await currentUser(ctx);
  const lists = await editableLists(user.id);

  if (lists.length === 0) {
    // Keep what they sent — it becomes the first gift the moment a list exists.
    await startDraft(user.id, {
      wishlistId: null,
      url: input.url ?? null,
      imageUrl: input.photoFileId ?? null,
      title: input.url ? null : (input.text ?? null),
    });
    await renderScreen(ctx, {
      text: t.gift.smartNoLists,
      keyboard: new InlineKeyboard().text(t.buttons.createList, "wl:new"),
    });
    return;
  }

  await startGiftFromInput(ctx, input, lists.length === 1 ? lists[0].id : null);
}

/** A short phrase: probably a gift, so ask rather than assume. */
async function offerTextAsGift(ctx: MyContext, text: string) {
  const user = await currentUser(ctx);
  const lists = await editableLists(user.id);

  if (lists.length === 0) {
    await startDraft(user.id, { wishlistId: null, title: text });
    await renderScreen(ctx, {
      text: t.gift.smartNoLists,
      keyboard: new InlineKeyboard().text(t.buttons.createList, "wl:new"),
    });
    return;
  }

  await startDraft(user.id, {
    wishlistId: lists.length === 1 ? lists[0].id : null,
    title: text,
  });

  await renderScreen(ctx, {
    text: t.gift.smartAskAddText(escapeHtml(truncate(text, GIFT_NAME_MAX))),
    keyboard: new InlineKeyboard()
      .text(
        lists.length === 1
          ? t.buttons.addToList(truncate(lists[0].title, 24))
          : t.buttons.addAsGiftShort,
        "dr:show",
      )
      .row()
      .text(t.buttons.notAGift, "dr:cancel"),
  });
}

/** Never a dead end: say what the bot is for, then show Головна. */
async function fallback(ctx: MyContext) {
  await renderHome(ctx, 0, { notice: t.gift.smartFallback });
}

async function handleMessage(ctx: MyContext) {
  const text = (ctx.message?.text ?? ctx.message?.caption ?? "").trim();
  const photoFileId = ctx.message?.photo?.at(-1)?.file_id;

  // The anchor is the one text that is never input.
  if (isAnchor(text)) {
    await goHome(ctx);
    return;
  }

  const user = await currentUser(ctx);
  const pending = readPending(user);

  // An open question takes precedence — but only because the bot asked it, and
  // only until it goes stale.
  if (pending) {
    if (pending.action === "draft.input") {
      const draft = await getDraft(user.id);
      const url = URL_PATTERN.exec(text)?.[1];
      await startGiftFromInput(
        ctx,
        { url, photoFileId, text: url ? undefined : text || undefined },
        draft?.wishlistId ?? null,
      );
      return;
    }
    if (text && (await applyListAnswer(ctx, pending, text))) return;
    if (await applyGiftAnswer(ctx, pending)) return;
  }

  await greetAfterPause(ctx);

  const url = URL_PATTERN.exec(text)?.[1];
  if (url) {
    await routeGiftInput(ctx, { url });
    return;
  }
  if (photoFileId) {
    await routeGiftInput(ctx, { photoFileId, text: text || undefined });
    return;
  }

  // R2 — an abandoned draft is offered back before anything ambiguous is
  // guessed at, so nothing the user already typed quietly disappears.
  const draft = await getDraft(user.id);
  if (draft && hasContent(draft)) {
    await offerDraftResume(ctx, draft);
    return;
  }

  // A command this bot does not have still looks like a command to the person
  // who typed it. Offering «Додати "/gift" як подарунок?» would be the exact
  // kind of confident nonsense smart input has to avoid.
  if (!text || text.startsWith("/") || isCourtesy(text) || text.length > GIFT_NAME_MAX) {
    await fallback(ctx);
    return;
  }

  await offerTextAsGift(ctx, text);
}

export function registerEntry(bot: Bot<MyContext>) {
  bot.command("start", async (ctx) => {
    const payload = parseStartPayload(ctx.match?.toString());

    if (payload.type === "list") {
      await openShowcaseBySlug(ctx, payload.slug);
      return;
    }
    if (payload.type === "editor") {
      await renderInvite(ctx, payload.token);
      return;
    }
    if (payload.type === "reservation") {
      await renderPromises(ctx, 0);
      return;
    }

    await greetAfterPause(ctx);

    const user = await currentUser(ctx);
    const draft = await getDraft(user.id);
    if (draft && hasContent(draft)) {
      await offerDraftResume(ctx, draft);
      return;
    }
    await renderHome(ctx);
  });

  bot.command(["home", "menu"], async (ctx) => {
    await goHome(ctx);
  });

  bot.command("help", async (ctx) => {
    await renderScreen(ctx, {
      text: t.home.help,
      keyboard: new InlineKeyboard().text(t.buttons.backHome, "home"),
    });
  });

  // /cancel used to be the only way out of a dialog. There are no dialogs any
  // more, so it is just another way of saying "Головна".
  bot.command("cancel", async (ctx) => {
    await goHome(ctx);
  });

  bot.on("message", async (ctx) => {
    await handleMessage(ctx);
  });
}
