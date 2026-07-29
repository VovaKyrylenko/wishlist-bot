// Half-finished gifts.
//
// A gift is assembled in a Draft row and only becomes a WishlistItem when the
// user taps "Додати". Two things fall out of that:
//
//   * the preview card is fully editable before anything is saved — name,
//     price, photo, quantity — instead of "save it now, fix it after";
//   * walking away costs nothing. The draft outlives the session, so the next
//     contact can offer "Ти не закінчив додавати «…». Продовжити?" instead of
//     silently losing what the person had already pasted.

import { prisma } from "../db.js";
import type { Draft } from "../../generated/prisma/client.js";

/** Matches the pending-question lifetime: a day-old draft is not a plan. */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export function isFresh(draft: Draft): boolean {
  return Date.now() - draft.updatedAt.getTime() <= DRAFT_TTL_MS;
}

/** The user's open draft, or null when there is none or it has gone stale. */
export async function getDraft(userId: string): Promise<Draft | null> {
  const draft = await prisma.draft.findUnique({ where: { userId } });
  if (!draft) return null;
  if (!isFresh(draft)) {
    await dropDraft(userId);
    return null;
  }
  return draft;
}

/** True once the draft holds enough to be worth offering to resume. */
export function hasContent(draft: Draft): boolean {
  return Boolean(draft.title || draft.url || draft.imageUrl);
}

export type DraftFields = Partial<
  Pick<
    Draft,
    "wishlistId" | "title" | "url" | "imageUrl" | "price" | "store" | "comment" | "quantity" | "priority"
  >
>;

/**
 * One draft per person, replaced wholesale. Starting a new gift while an old
 * draft is open means the old one was abandoned — keeping both would only
 * raise the question of which one "Продовжити" meant.
 */
export async function startDraft(userId: string, fields: DraftFields): Promise<Draft> {
  return prisma.draft.upsert({
    where: { userId },
    create: { userId, kind: "GIFT", ...fields },
    update: {
      kind: "GIFT",
      title: null,
      url: null,
      imageUrl: null,
      price: null,
      store: null,
      comment: null,
      quantity: 1,
      priority: "NORMAL",
      ...fields,
    },
  });
}

export async function updateDraft(userId: string, fields: DraftFields): Promise<Draft | null> {
  return prisma.draft.update({ where: { userId }, data: fields }).catch(() => null);
}

export async function dropDraft(userId: string): Promise<void> {
  await prisma.draft.deleteMany({ where: { userId } });
}
