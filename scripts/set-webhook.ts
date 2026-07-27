import "dotenv/config";
import { getBot } from "../src/bot.js";

async function main() {
  const url = process.env.WEBHOOK_URL;
  if (!url) {
    throw new Error(
      "Set WEBHOOK_URL to your deployed endpoint, e.g. https://your-app.vercel.app/api/webhook",
    );
  }
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("Set WEBHOOK_SECRET to a random string (also set as an env var on Vercel).");
  }

  const bot = getBot();
  await bot.api.setWebhook(url, { secret_token: secret });
  const info = await bot.api.getWebhookInfo();
  console.log("✅ Webhook set:", info);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
