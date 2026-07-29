import { Keyboard } from "grammy";
import { t } from "../text.js";

export const ANCHOR = t.common.home;

/**
 * The anchor, and nothing else.
 *
 * The old reply keyboard carried five section buttons, which put a second
 * navigation model next to the inline screens and turned a tap in the middle
 * of a dialog into a teleport with no explanation. One button cannot conflict
 * with anything: it means "take me home", it works from every screen including
 * mid-action, and it never changes its name.
 */
export function anchorKeyboard(): Keyboard {
  return new Keyboard().text(ANCHOR).resized().persistent();
}

/** True for a tap on the anchor — the one text the bot never reads as input. */
export function isAnchor(text: string | undefined): boolean {
  return text?.trim() === ANCHOR;
}
