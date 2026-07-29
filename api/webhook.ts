import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBot } from "../src/bot.js";
import { prisma } from "../src/db.js";

// Fluid Compute reuses warm instances across invocations, so this memoizes
// bot.init() (which fetches botInfo via getMe) instead of calling it per request.
let initialized: Promise<void> | null = null;

/**
 * Telegram retries an update when the webhook is slow to answer, and this
 * handler can legitimately be slow: scraping a product page alone is allowed
 * eight seconds. Every retry used to be processed from scratch, which added
 * the same gift twice or booked the same present twice over.
 *
 * Claiming the update_id first makes the whole handler idempotent — the
 * insert fails on the primary key for a replay, and we simply ack it.
 */
async function claimUpdate(updateId: number): Promise<boolean> {
  try {
    await prisma.processedUpdate.create({ data: { updateId } });
    return true;
  } catch {
    // Unique violation — this update has already been handled.
    return false;
  }
}

/**
 * Undoes a claim when handling blew up before it could do anything useful.
 * Without this the claim turns a crash into permanent data loss: the update
 * counts as processed, Telegram's retry is answered "duplicate", and the
 * user's message is gone. Exactly what a missing BOT_TOKEN caused in prod.
 */
async function releaseUpdate(updateId: number): Promise<void> {
  try {
    await prisma.processedUpdate.delete({ where: { updateId } });
  } catch (err) {
    console.error(`webhook: failed to release update ${updateId}:`, err);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const secret = process.env.WEBHOOK_SECRET;
  if (secret && req.headers["x-telegram-bot-api-secret-token"] !== secret) {
    res.status(401).send("Unauthorized");
    return;
  }

  const updateId = req.body?.update_id;
  if (typeof updateId !== "number") {
    res.status(400).json({ ok: false });
    return;
  }

  if (!(await claimUpdate(updateId))) {
    console.warn(`webhook: duplicate update ${updateId} ignored`);
    res.status(200).json({ ok: true, duplicate: true });
    return;
  }

  try {
    const bot = getBot();
    if (!initialized) {
      // A rejected promise would otherwise stay memoized for the lifetime of
      // the warm instance, so one bad init poisons every later request.
      initialized = bot.init().catch((err) => {
        initialized = null;
        throw err;
      });
    }
    await initialized;
    await bot.handleUpdate(req.body);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Error handling Telegram update:", err);
    await releaseUpdate(updateId);
    // 500 asks Telegram to redeliver — now that the claim is released, the
    // retry will actually be processed instead of dismissed as a duplicate.
    res.status(500).json({ ok: false });
  }
}
