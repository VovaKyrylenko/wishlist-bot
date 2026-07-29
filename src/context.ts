import type { Context } from "grammy";

// There is deliberately no session and no conversation plugin.
//
// The session's one job — remembering the guest's last-used filter — leaked
// across wishlists, so a filter chosen on one friend's list quietly hid gifts
// on the next. Navigation state now travels in the callback data of the screen
// it belongs to.
//
// Conversations went the same way, for a bigger reason: a conversation owns
// the next update, which is exactly what made every dialog a trap ("Спершу
// заверши цей крок"). What the bot is waiting for now lives on the user as
// `pendingAction` (see lib/pending.ts): a plain message answers the open
// question, every button still does what it says, and the anchor always exits.
export type MyContext = Context;

/** Whether the showcase is currently hiding gifts that are already taken. */
export type TakenFilter = "all" | "free";
