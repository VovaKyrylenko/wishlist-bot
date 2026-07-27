import "dotenv/config";
import { getBot } from "../src/bot.js";

async function main() {
  const bot = getBot();
  await bot.api.deleteWebhook({ drop_pending_updates: false });
  console.log("✅ Webhook deleted (switch back to `npm run dev` for local polling).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
