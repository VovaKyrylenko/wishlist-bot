import type { MyContext } from "../context.js";
import { prisma } from "../db.js";
import { upsertUserFromCtx } from "./users.js";

/**
 * Loads a wishlist and verifies the sender may act on it, answering the
 * callback query with an error alert (and returning null) when access is
 * denied. `requireOwner: true` excludes shared editors (used for
 * list-level settings); `false` allows owner or editor (used for items).
 */
export async function checkWishlistAccess(ctx: MyContext, wishlistId: string, requireOwner: boolean) {
  const user = await upsertUserFromCtx(ctx);
  const wishlist = await prisma.wishlist.findUnique({
    where: { id: wishlistId },
    include: { editors: true },
  });
  if (!wishlist) {
    await ctx.answerCallbackQuery({ text: "Список не знайдено", show_alert: true });
    return null;
  }
  const isOwner = wishlist.ownerId === user.id;
  const isEditor = wishlist.editors.some((e) => e.userId === user.id);
  if (requireOwner ? !isOwner : !isOwner && !isEditor) {
    await ctx.answerCallbackQuery({ text: "Немає доступу", show_alert: true });
    return null;
  }
  return { wishlist, user, isOwner, isEditor };
}
