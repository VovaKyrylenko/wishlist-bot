// Guarded prompts for conversations.
//
// A raw `conversation.form.text()` swallows everything the user sends, which
// meant tapping "📋 Мої вішлісти" while naming a list produced a list actually
// called "📋 Мої вішлісти", with no way out. Every prompt here recognises the
// menu buttons and commands and hands the update back to the outside
// middleware via `halt({ next: true })`, so those taps do what they look like
// they do.

import { InlineKeyboard } from "grammy";
import type { MyContext, MyConversation } from "../context.js";
import { MENU_LABELS } from "./keyboards.js";
import { t } from "../text.js";

const SKIP_DATA = "convo:skip";
const CANCEL_DATA = "convo:cancel";

/** True for taps on the persistent reply keyboard and for any /command. */
function escapesConversation(text: string | undefined): boolean {
  if (!text) return false;
  return MENU_LABELS.has(text.trim()) || text.trim().startsWith("/");
}

/** Drops the Skip/Cancel buttons off a prompt once it has been answered. */
async function clearPromptKeyboard(ctx: MyContext, chatId: number, messageId: number) {
  try {
    await ctx.api.editMessageReplyMarkup(chatId, messageId);
  } catch {
    // Prompt already edited or deleted — nothing to clean up.
  }
}

/**
 * Long enough for any real gift name or note, short enough that a pasted wall
 * of text cannot push a screen past Telegram's message limit on its own.
 */
export const DEFAULT_MAX_LENGTH = 400;

export interface AskTextOptions {
  /** Adds a "Пропустити" button; the prompt then resolves to null. */
  skippable?: boolean;
  /** Rejects longer answers instead of storing them. Defaults to {@link DEFAULT_MAX_LENGTH}. */
  maxLength?: number;
}

/**
 * Asks a question and returns the answer, `null` if skipped. Never returns if
 * the user cancels or escapes to the menu — the conversation halts instead.
 */
export async function askText(
  conversation: MyConversation,
  ctx: MyContext,
  prompt: string,
): Promise<string>;
export async function askText(
  conversation: MyConversation,
  ctx: MyContext,
  prompt: string,
  options: { skippable: true; maxLength?: number },
): Promise<string | null>;
export async function askText(
  conversation: MyConversation,
  ctx: MyContext,
  prompt: string,
  options: { skippable?: false; maxLength?: number },
): Promise<string>;
export async function askText(
  conversation: MyConversation,
  ctx: MyContext,
  prompt: string,
  options: AskTextOptions = {},
): Promise<string | null> {
  const kb = new InlineKeyboard();
  if (options.skippable) kb.text(t.buttons.skip, SKIP_DATA);
  kb.text(t.buttons.cancel, CANCEL_DATA);

  const sent = await ctx.reply(prompt, { reply_markup: kb });

  for (;;) {
    const update = await conversation.wait();

    const data = update.callbackQuery?.data;
    if (data === SKIP_DATA || data === CANCEL_DATA) {
      await update.answerCallbackQuery();
      await clearPromptKeyboard(ctx, sent.chat.id, sent.message_id);
      if (data === SKIP_DATA) return null;
      await ctx.reply(t.common.cancelled);
      await conversation.halt();
    }

    if (data) {
      // A tap on some older screen while a prompt is open. Nudge instead of
      // leaving the client spinning.
      await update.answerCallbackQuery({ text: t.common.finishStepFirst, show_alert: true });
      continue;
    }

    const text = update.message?.text;
    if (escapesConversation(text)) {
      await clearPromptKeyboard(ctx, sent.chat.id, sent.message_id);
      await conversation.halt({ next: true });
    }

    const answer = text?.trim();
    if (answer) {
      const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
      if (answer.length > maxLength) {
        await ctx.reply(t.common.tooLong(maxLength));
        continue;
      }
      await clearPromptKeyboard(ctx, sent.chat.id, sent.message_id);
      return answer;
    }

    await ctx.reply(t.common.textPlease);
  }
}

/** Like {@link askText} but keeps asking until the answer is a whole number ≥ min. */
export async function askInt(
  conversation: MyConversation,
  ctx: MyContext,
  prompt: string,
  bounds: { min: number; max?: number; tooLow: string; tooHigh?: string },
): Promise<number> {
  let question = prompt;
  for (;;) {
    const raw = await askText(conversation, ctx, question);
    const value = Number(raw.replace(",", "."));
    if (!Number.isInteger(value)) {
      question = t.common.integerPlease;
      continue;
    }
    if (value < bounds.min) {
      question = bounds.tooLow;
      continue;
    }
    if (bounds.max !== undefined && value > bounds.max) {
      question = bounds.tooHigh ?? bounds.tooLow;
      continue;
    }
    return value;
  }
}

/**
 * Waits for one of `actions` to be tapped. Menu buttons and commands still
 * escape the conversation; anything else is politely ignored.
 */
export async function waitForAction<A extends string>(
  conversation: MyConversation,
  actions: readonly A[],
): Promise<A> {
  for (;;) {
    const update = await conversation.wait();

    const data = update.callbackQuery?.data;
    if (data && (actions as readonly string[]).includes(data)) {
      await update.answerCallbackQuery();
      return data as A;
    }
    if (data) {
      await update.answerCallbackQuery({ text: t.common.finishStepFirst, show_alert: true });
      continue;
    }

    if (escapesConversation(update.message?.text)) {
      await conversation.halt({ next: true });
    }
  }
}
