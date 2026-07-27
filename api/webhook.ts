import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBot } from "../src/bot.js";

// Fluid Compute reuses warm instances across invocations, so this memoizes
// bot.init() (which fetches botInfo via getMe) instead of calling it per request.
let initialized: Promise<void> | null = null;

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

  const bot = getBot();
  if (!initialized) initialized = bot.init();
  await initialized;

  try {
    await bot.handleUpdate(req.body);
  } catch (err) {
    console.error("Error handling Telegram update:", err);
  }

  res.status(200).json({ ok: true });
}
