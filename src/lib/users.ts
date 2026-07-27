import type { Context } from "grammy";
import { prisma } from "../db.js";

/** Ensures a User row exists for the sender and keeps their profile fresh. */
export async function upsertUserFromCtx(ctx: Context) {
  const from = ctx.from;
  if (!from) throw new Error("upsertUserFromCtx called without ctx.from");

  return prisma.user.upsert({
    where: { telegramId: String(from.id) },
    create: {
      telegramId: String(from.id),
      username: from.username ?? null,
      firstName: from.first_name ?? null,
      lastName: from.last_name ?? null,
    },
    update: {
      username: from.username ?? null,
      firstName: from.first_name ?? null,
      lastName: from.last_name ?? null,
    },
  });
}
