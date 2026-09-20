import "dotenv/config";
import { getBot, syncBotCommands } from "../src/bot.js";

async function main() {
  const bot = getBot();

  // Long polling and webhooks cannot be active for the same bot at once.
  await bot.api.deleteWebhook({ drop_pending_updates: false });
  await syncBotCommands(bot);

  await bot.start({
    onStart: (info) => console.log(`✅ @${info.username} is running (long polling)`),
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
