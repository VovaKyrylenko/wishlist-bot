import type { MyContext } from "../context.js";
import { prisma } from "../db.js";
import { currentUser, type CurrentUser } from "./users.js";
import type { Wishlist, WishlistEditor } from "../../generated/prisma/client.js";

export type ListRole = "owner" | "coAuthor" | "guest";

export interface ListAccess {
  wishlist: Wishlist & { editors: WishlistEditor[] };
  user: CurrentUser;
  role: ListRole;
  isOwner: boolean;
  /** Owner or co-author: may add, edit, reorder and remove gifts. */
  canEditGifts: boolean;
}

export type ListLookup =
  | { ok: true; access: ListAccess }
  | { ok: false; reason: "gone" | "denied" };

/**
 * Loads a list together with the sender's role in it.
 *
 * Nothing is rendered here on failure. A missing or forbidden list is not an
 * error popup any more — the caller shows Головна with a line explaining what
 * happened, because "Це не для тебе — доступу нема 🙅" left the user staring
 * at a screen they could not leave.
 */
export async function lookupList(ctx: MyContext, wishlistId: string): Promise<ListLookup> {
  const user = await currentUser(ctx);
  const wishlist = await prisma.wishlist.findUnique({
    where: { id: wishlistId },
    include: { editors: true },
  });
  if (!wishlist) return { ok: false, reason: "gone" };

  const isOwner = wishlist.ownerId === user.id;
  const isCoAuthor = wishlist.editors.some((e) => e.userId === user.id);
  if (!isOwner && !isCoAuthor) return { ok: false, reason: "denied" };

  return {
    ok: true,
    access: {
      wishlist,
      user,
      role: isOwner ? "owner" : "coAuthor",
      isOwner,
      canEditGifts: true,
    },
  };
}
