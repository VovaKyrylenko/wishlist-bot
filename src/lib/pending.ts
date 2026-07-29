// What the bot is currently waiting for, in one string on the user row.
//
// This is the whole replacement for the conversations plugin. A conversation
// owned the next update, which is what produced "Спершу заверши цей крок 🙂"
// — the bot refusing to do the thing the user just tapped because it was
// still holding a question open. Here the question is only a note to self:
// the next plain message answers it, every button keeps working normally, and
// the anchor clears it. No input is ever rejected for arriving at a bad time.

import { prisma } from "../db.js";
import { invalidateUser } from "./users.js";
import type { Context } from "grammy";
import type { User } from "../../generated/prisma/client.js";

/**
 * A question nobody answered within a day is not a question any more — the
 * text that finally arrives is much more likely to be a new gift than a very
 * late answer. Matches the draft lifetime (docs/UX-REDESIGN.md §7.3).
 */
export const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

/** `<domain>.<field>` — the argument, when there is one, is an entity id. */
export type PendingAction =
  | "list.title"
  | "wl.title"
  | "wl.description"
  | "wl.date"
  /** Anything at all: a link, a photo or a name — see gifts.ts. */
  | "draft.input"
  | "draft.title"
  | "draft.price"
  | "draft.url"
  | "draft.store"
  | "draft.comment"
  | "draft.photo"
  | "draft.quantity"
  | "gift.title"
  | "gift.price"
  | "gift.url"
  | "gift.store"
  | "gift.comment"
  | "gift.photo"
  | "gift.quantity";

export interface Pending {
  action: PendingAction;
  /** Wishlist or gift id, depending on the domain. Absent for drafts. */
  id?: string;
}

/** Reads the open question, treating an expired one as no question at all. */
export function readPending(user: User): Pending | null {
  if (!user.pendingAction || !user.pendingAt) return null;
  if (Date.now() - user.pendingAt.getTime() > PENDING_TTL_MS) return null;
  const [action, id] = user.pendingAction.split(":");
  return { action: action as PendingAction, id: id || undefined };
}

export async function setPending(
  ctx: Context,
  userId: string,
  action: PendingAction,
  id?: string,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { pendingAction: id ? `${action}:${id}` : action, pendingAt: new Date() },
  });
  invalidateUser(ctx);
}

export async function clearPending(ctx: Context, userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { pendingAction: null, pendingAt: null },
  });
  invalidateUser(ctx);
}
