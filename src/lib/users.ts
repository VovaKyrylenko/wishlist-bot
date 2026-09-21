import type { Context } from "grammy";
import { prisma } from "../db.js";
import type { User } from "../../generated/prisma/client.js";

/**
 * How long the bot may go without touching `lastSeenAt`. Writing it on every
 * single update would cost a row update per keystroke; an hour of slack is
 * invisible to the "повернувся після паузи" digest, which measures in days.
 */
const SEEN_REFRESH_MS = 60 * 60 * 1000;

export interface CurrentUser extends User {
  /**
   * When this person was last here *before* the current visit. The digest on
   * Головна is built from it, so it has to be read before it is overwritten.
   */
  previousSeenAt: Date;
}

// One update touches the user row from half a dozen places (access checks,
// screen rendering, the feature handler itself). Resolving it once per update
// keeps that to a single round trip.
const perUpdate = new WeakMap<Context, Promise<CurrentUser>>();

async function resolve(ctx: Context): Promise<CurrentUser> {
  const from = ctx.from;
  if (!from) throw new Error("currentUser called without ctx.from");

  const telegramId = String(from.id);
  const profile = {
    username: from.username ?? null,
    firstName: from.first_name ?? null,
    lastName: from.last_name ?? null,
  };

  const existing = await prisma.user.findUnique({ where: { telegramId } });
  if (!existing) {
    // Upsert, not create: two first-ever messages can race each other through
    // the webhook, and the loser of a plain create would crash on the unique
    // telegramId instead of just becoming the same user.
    const created = await prisma.user.upsert({
      where: { telegramId },
      create: { telegramId, ...profile },
      update: { ...profile },
    });
    return { ...created, previousSeenAt: created.lastSeenAt };
  }

  const previousSeenAt = existing.lastSeenAt;
  const now = new Date();
  const stale = now.getTime() - previousSeenAt.getTime() > SEEN_REFRESH_MS;
  const renamed =
    existing.username !== profile.username ||
    existing.firstName !== profile.firstName ||
    existing.lastName !== profile.lastName;

  if (!stale && !renamed) return { ...existing, previousSeenAt };

  const updated = await prisma.user.update({
    where: { id: existing.id },
    data: { ...profile, lastSeenAt: now },
  });
  return { ...updated, previousSeenAt };
}

/** The sender's `User` row, created on first contact. There is no sign-up. */
export function currentUser(ctx: Context): Promise<CurrentUser> {
  let pending = perUpdate.get(ctx);
  if (!pending) {
    pending = resolve(ctx);
    perUpdate.set(ctx, pending);
  }
  return pending;
}

/** Forgets the memoised row after a write that changed it. */
export function invalidateUser(ctx: Context): void {
  perUpdate.delete(ctx);
}
