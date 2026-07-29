// Asking a question without taking the user hostage.
//
// A prompt is an ordinary screen: it says what it wants, shows an example of a
// valid answer (§15.11), and offers a way out that is a real button rather
// than a magic word. Setting `pendingAction` alongside it is what makes the
// next plain message count as the answer — and because it is only a note, the
// user can ignore the question entirely and tap something else instead.

import { InlineKeyboard } from "grammy";
import type { MyContext } from "../context.js";
import { setPending, type PendingAction } from "./pending.js";
import { currentUser } from "./users.js";
import { renderScreen, replaceLiveScreen } from "./screen.js";
import { t } from "../text.js";

export interface AskOptions {
  /** The question, examples included. */
  text: string;
  /** Callback data for `⬅️ Назад` — always the screen the user came from. */
  back: string;
  /** Callback data for `Пропустити`, when leaving the field empty is allowed. */
  skip?: string;
  /** Entity the answer belongs to; omitted for draft fields. */
  id?: string;
  /**
   * Rewrite the live screen instead of adding one below. Used when the screen
   * already on display is a placeholder this question replaces — the "🔎
   * Дивлюся…" card, for instance.
   */
  replace?: boolean;
}

export async function ask(ctx: MyContext, action: PendingAction, options: AskOptions): Promise<void> {
  const user = await currentUser(ctx);
  await setPending(ctx, user.id, action, options.id);

  const kb = new InlineKeyboard();
  if (options.skip) kb.text(t.buttons.skip, options.skip).row();
  kb.text(t.buttons.back, options.back);

  const screen = { text: options.text, keyboard: kb };
  if (options.replace) await replaceLiveScreen(ctx, screen);
  else await renderScreen(ctx, screen);
}

/** Long enough for any real gift name or note, short enough to fit a screen. */
export const MAX_ANSWER_LENGTH = 400;
